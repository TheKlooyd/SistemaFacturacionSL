import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { api, localStatus, localDatabase, root } from './mobile-local.mjs';
import { businessDate, summarizePayments, summarizeBreakdown } from '../frontend/src/paymentMath.js';

const status = await localStatus();
const [owner] = JSON.parse(await readFile(resolve(root,'local/state.local/accounts.json'),'utf8'));
const db = await localDatabase(status);
try {
  const devices = await db.query('select count(*) from mobile_private.push_subscriptions where user_id=$1 and negocio_id=$2',[owner.userId,owner.businessId]);
  if (!Number(devices.rows[0].count)) throw new Error('Activa primero las notificaciones en Android.');
  const settings = (await db.query('select timezone from public.negocio_configuracion where negocio_id=$1',[owner.businessId])).rows[0];
  const date = businessDate(new Date(),settings.timezone);
  const path = resolve(root,'local/state.local/android-close.json');
  const probe = JSON.parse(await readFile(path,'utf8').catch(()=> 'null')) || {id:randomUUID(),businessId:owner.businessId,date};
  if(probe.businessId!==owner.businessId || probe.date!==date) throw new Error('La prueba guardada corresponde a otro negocio o día.');
  const current = (await db.query('select id from public.cierres_diarios where negocio_id=$1 and date_iso=$2',[owner.businessId,date])).rows[0];
  if(current && current.id!==probe.id) throw new Error('Ya existe otro cierre local para este día; no se reemplazó.');
  await writeFile(path,JSON.stringify(probe,null,2));
  if(!current) {
    const payments = (await db.query('select * from public.pagos where negocio_id=$1 and (created_at at time zone $2)::date=$3::date order by created_at,id',[owner.businessId,settings.timezone,date])).rows.map(p=>({
      id:p.id,subtotal:p.subtotal,tipAmount:p.tip_amount,totalWithTip:p.total_with_tip,paidAmount:p.paid_amount,
      discountAmount:p.discount_amount,method:p.method,paymentSplits:p.payment_splits,items:p.items,createdAt:p.created_at,tableName:p.table_name,
    }));
    if(!payments.length) throw new Error('No hay pagos ficticios de hoy para el cierre.');
    const summary = summarizePayments(payments), breakdown = summarizeBreakdown(payments);
    const login = await api(status,'/auth/v1/token?grant_type=password',{body:{email:owner.email,password:owner.password}});
    if(!login.ok) throw new Error('No se pudo autenticar la cuenta ficticia.');
    const token = login.data.access_token;
    try {
      const result = await api(status,'/rest/v1/cierres_diarios',{token,body:{id:probe.id,negocio_id:owner.businessId,date_iso:date,data:{summary,breakdown,payments,generatedAt:new Date().toISOString(),testFixture:true}}});
      if(!result.ok) throw new Error(`No se pudo guardar el cierre ficticio: HTTP ${result.status}.`);
      console.log(JSON.stringify({date,summary,breakdown}));
    } finally {await api(status,'/auth/v1/logout?scope=local',{token});}
  }
  const dispatched = spawnSync(process.execPath,[resolve(root,'scripts/mobile-local.mjs'),'push'],{cwd:root,stdio:'inherit',windowsHide:true});
  if(dispatched.status!==0) throw new Error('Cierre guardado; falta completar el despacho local.');
  console.log('Notificación de cierre ficticio procesada. Comprobar recepción y resumen en Android.');
} finally {await db.end();}
