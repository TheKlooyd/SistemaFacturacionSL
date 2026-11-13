import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {root,localStatus,localDatabase,api} from './mobile-local.mjs';

const status=await localStatus();
const [owner]=JSON.parse(await readFile(resolve(root,'local/state.local/accounts.json'),'utf8'));
const db=await localDatabase(status);
try {
  const registered=await db.query('select count(*) from mobile_private.push_subscriptions where user_id=$1 and negocio_id=$2',[owner.userId,owner.businessId]);
  if(Number(registered.rows[0].count)===0)throw new Error('Activa primero las notificaciones desde el teléfono. No se generó una alerta.');
  const path=resolve(root,'local/state.local/android-alert.json');
  const probe=JSON.parse(await readFile(path,'utf8').catch(()=> 'null')) || {productId:randomUUID(),businessId:owner.businessId};
  if(probe.businessId!==owner.businessId)throw new Error('La alerta corresponde a otro entorno local.');
  await writeFile(path,JSON.stringify(probe,null,2));
  const login=await api(status,'/auth/v1/token?grant_type=password',{body:{email:owner.email,password:owner.password}});
  if(!login.ok)throw new Error('No se pudo autenticar la cuenta ficticia.');
  const token=login.data.access_token;
  try {
    const current=await db.query('select id from public.productos where id=$1 and negocio_id=$2',[probe.productId,owner.businessId]);
    if(!current.rowCount) {
      const created=await api(status,'/rest/v1/productos',{token,body:{id:probe.productId,negocio_id:owner.businessId,name:'Alerta Android - prueba local',item_type:'product',stock_quantity:3,price:1000,purchase_price:500}});
      if(!created.ok)throw new Error(`No se pudo crear el producto ficticio: HTTP ${created.status}.`);
    }
    // Same authenticated POS update surface: 3 -> 2 fires the backend trigger.
    // Repeating this command leaves 2 -> 2 and does not create another event.
    const adjusted=await api(status,`/rest/v1/productos?id=eq.${probe.productId}&negocio_id=eq.${owner.businessId}`,{token,method:'PATCH',body:{stock_quantity:2}});
    if(!adjusted.ok)throw new Error(`No se pudo actualizar el producto ficticio: HTTP ${adjusted.status}.`);
  } finally { await api(status,'/auth/v1/logout?scope=local',{token}); }
  const dispatched=spawnSync(process.execPath,[resolve(root,'scripts/mobile-local.mjs'),'push'],{cwd:root,stdio:'inherit',windowsHide:true});
  if(dispatched.status!==0)throw new Error('El evento quedó guardado, pero el dispatcher no terminó correctamente.');
  console.log('Alerta de stock de prueba procesada. Comprobar recepción y apertura en Android.');
} finally {await db.end();}
