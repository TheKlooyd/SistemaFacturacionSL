import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { buildBusinessPrompt } from '../supabase/functions/_shared/businessPrompt.ts';
import { validateBusinessConfig } from '../supabase/functions/_shared/businessConfig.ts';
import { resolveAiTenant } from '../supabase/functions/_shared/tenantAi.ts';

test('QR: suscripción comprobada dentro de cada RPC, incluida una sesión abierta antes de suspender', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  await db.exec(await readFile('supabase_schema.sql','utf8'));
  await db.exec('alter table productos add column size text');
  for (const file of (await readdir('supabase/migrations')).sort()) {
    if (!file.endsWith('.sql') || file.endsWith('_tenant_daily_close_uniqueness.sql')) continue;
    await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
  }
  async function createBusiness(letter) {
    const user = (await db.query('insert into auth.users(id) values(gen_random_uuid()) returning id')).rows[0].id;
    const result = await db.query(`select platform_admin_create_business($1,'fixture-'||$2,'Fixture '||$2,'manual',now(),null,'Fixture '||$2,null,null,null,null,'','America/Bogota','COP','',1,jsonb_build_array(repeat($2,64))) as b`,[user,letter]);
    return result.rows[0].b.negocio_id;
  }
  const a = await createBusiness('a'), b = await createBusiness('b');
  const call = async (sql, params=[]) => (await db.query(`select ${sql} as result`,params)).rows[0].result;
  assert.equal((await call("qr_start_session(repeat('a',64),repeat('1',64))")).state,'ok');
  assert.equal((await call("qr_start_session(repeat('b',64),repeat('2',64))")).state,'ok');
  const endpoints = [
    "qr_start_session(repeat('a',64),repeat('1',64))", "qr_session_status(repeat('1',64))",
    "qr_touch_session(repeat('1',64))", "qr_claim_preview(repeat('1',64))",
    "qr_save_preview(repeat('1',64),'pedido','[]','[]',0)", "qr_submit_order(repeat('1',64),gen_random_uuid())",
  ];
  for (const scenario of ['business','subscription','expired','future']) {
    await db.query("update negocios set estado='activo' where id=$1",[a]);
    await db.query("update suscripciones set estado='activa', starts_at=now()-interval '1 day', ends_at=null where negocio_id=$1",[a]);
    if (scenario==='business') await db.query("update negocios set estado='suspendido' where id=$1",[a]);
    if (scenario==='subscription') await db.query("update suscripciones set estado='suspendida' where negocio_id=$1",[a]);
    if (scenario==='expired') await db.query("update suscripciones set ends_at=now()-interval '1 hour' where negocio_id=$1",[a]);
    if (scenario==='future') await db.query("update suscripciones set starts_at=now()+interval '1 day' where negocio_id=$1",[a]);
    const before = (await db.query('select * from qr_sessions where negocio_id=$1',[a])).rows;
    for (const endpoint of endpoints) assert.equal((await call(endpoint)).state,'inactive',`${scenario}: ${endpoint}`);
    assert.deepEqual((await db.query('select * from qr_sessions where negocio_id=$1',[a])).rows,before);
    assert.equal((await call("qr_start_session(repeat('b',64),repeat('2',64))")).state,'ok');
  }
  assert.equal(await call('business_has_active_subscription($1)',[b]),true);
  await db.exec('set role authenticated');
  await assert.rejects(call('business_has_active_subscription($1)',[b]),e=>e.code==='42501');
  await assert.rejects(call("qr_start_session(repeat('b',64),repeat('2',64))"),e=>e.code==='42501');
  await db.exec('reset role');
});

test('IA: reglas independientes, sin menú heredado, y membresía única con suscripción activa',async () => {
  const a = buildBusinessPrompt('Vendo empanadas; tamaños mini y normal.');
  const b = buildBusinessPrompt('Vendo café; tamaños corto y largo.');
  assert.match(a,/empanadas/); assert.doesNotMatch(b,/empanadas|Sabor Latino|Gas Personal/);
  assert.match(b,/café/); assert.doesNotMatch(buildBusinessPrompt(),/empanadas|pizza|Nequi/);
  let memberships=[{negocio_id:'a'}],allowed=true;
  const admin={from:()=>({select(){return this;},eq(){return this;},then(resolve){resolve({data:memberships,error:null});}}),rpc:async(name,args)=>{assert.equal(args.p_negocio_id,'a');return {data:allowed,error:null};}};
  assert.equal(await resolveAiTenant(admin,'user'),'a');
  allowed=false;await assert.rejects(resolveAiTenant(admin,'user'),/TENANT_ACCESS_DENIED/);
  memberships=[];await assert.rejects(resolveAiTenant(admin,'user'),/TENANT_ACCESS_DENIED/);
  memberships=[{negocio_id:'a'},{negocio_id:'b'}];await assert.rejects(resolveAiTenant(admin,'user'),/TENANT_ACCESS_DENIED/);
});

test('editor: lista de campos permitidos y validaciones sin modificar acceso o propietario', () => {
  const config={nombre_comercial:'Don Juan',logo_url:'',nit:'',direccion:'',telefono:'',payment_info:'',reglas_pedidos:'',negocio_id:'other',estado:'activo',ownerPassword:'ignored'};
  const result=validateBusinessConfig(config);
  assert.equal(result.negocio_id,undefined);assert.equal(result.estado,undefined);assert.equal(result.ownerPassword,undefined);
  assert.throws(()=>validateBusinessConfig({...config,logo_url:'javascript:alert(1)'}));
  assert.throws(()=>validateBusinessConfig({...config,payment_info:'a'.repeat(501)}));
  assert.throws(()=>validateBusinessConfig({...config,nombre_comercial:''}));
  assert.equal(validateBusinessConfig({...config,reglas_pedidos:'a'.repeat(14000)}).reglas_pedidos.length,14000);
});

test('administración: un propietario autenticado no puede ejecutar edición; admin solo actualiza el negocio indicado',async t=>{
  let handler,isAdmin=false,updates=0;
  const client={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},rpc:async()=>({data:isAdmin,error:null}),from(table){assert.equal(table,'negocio_configuracion');return {update(value){updates++;assert.equal(value.nombre_comercial,'Prueba');return this;},eq(key,value){assert.equal(key,'negocio_id');assert.equal(value,'10000000-0000-4000-8000-000000000001');return this;},select(){return this;},maybeSingle:async()=>({data:{negocio_id:'id'},error:null})};}};
  globalThis.__launchAdmin=client;globalThis.Deno={env:{get:()=> 'configured'},serve(fn){handler=fn;}};
  const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='npm:@supabase/supabase-js@2')return {shortCircuit:true,url:'data:text/javascript,export const createClient=()=>globalThis.__launchAdmin;'};return next(specifier,context);}});
  t.after(()=>{hooks.deregister();delete globalThis.__launchAdmin;delete globalThis.Deno;});
  await import('../supabase/functions/platform-admin/index.ts');
  const request=()=>new Request('https://test.local',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action:'update_business',businessId:'10000000-0000-4000-8000-000000000001',config:{nombre_comercial:'Prueba',logo_url:'',nit:'',direccion:'',telefono:'',payment_info:'',reglas_pedidos:''}})});
  assert.equal((await handler(request())).status,403);assert.equal(updates,0);
  isAdmin=true;assert.equal((await handler(request())).status,200);assert.equal(updates,1);
});


test('QR imprimible: rechaza manifiestos de otro negocio, mesas duplicadas y enlaces incoherentes', async t => {
  const hooks=registerHooks({resolve(specifier,context,next){
    if(context.parentURL?.endsWith('/frontend/src/qrPrint.js') && specifier==='./platformAdminApi.js') return {shortCircuit:true,url:'data:text/javascript,export const verifyQrManifest=async()=>({ok:true});'};
    return next(specifier,context);
  }});
  t.after(()=>hooks.deregister());
  const {validateQrManifest}=await import('../frontend/src/qrPrint.js');
  const token='a'.repeat(43);
  const code={mesa:1,token,url:`https://theklooyd.github.io/SistemaFacturacionSL/?qr=${token}`};
  const manifest={business:{negocio_id:'a'},qr_codes:[code]};
  assert.equal(validateQrManifest(manifest,'a').length,1);
  assert.throws(()=>validateQrManifest(manifest,'b'),/otro negocio/);
  assert.throws(()=>validateQrManifest({...manifest,qr_codes:[code,code]},'a'),/repetido/);
  assert.throws(()=>validateQrManifest({...manifest,qr_codes:[{...code,url:'javascript:alert(1)'}]},'a'));
  assert.throws(()=>validateQrManifest({...manifest,qr_codes:[{...code,token:'b'.repeat(43)}]},'a'),/inválido/);
});
