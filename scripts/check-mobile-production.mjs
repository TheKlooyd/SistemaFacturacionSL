import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const url='https://lpyivecyvtivtkbppjtr.supabase.co/functions/v1/';
const source=await readFile(resolve(root,'deploy/mobile-production.secrets.local'),'utf8');
const env=Object.fromEntries(source.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
for(const name of ['mobile-pin','mobile-push']) {
  const result=await fetch(url+name,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
  if(result.status!==401)throw new Error(`${name}: se esperaba rechazo 401, se recibió ${result.status}.`);
  console.log(`${name}: invocación sin autorización rechazada correctamente.`);
}
// This processes a real queue batch, if any. It never creates payments or stock adjustments.
const dispatched=await fetch(url+'mobile-push',{
  method:'POST',headers:{'Content-Type':'application/json','x-mobile-push-key':env.MOBILE_PUSH_DISPATCH_SECRET},body:'{}',signal:AbortSignal.timeout(55000),
});
if(!dispatched.ok)throw new Error(`Dispatcher autorizado: HTTP ${dispatched.status}. Revisa las funciones, la migración y los secretos.`);
const data=await dispatched.json();
if(!Number.isInteger(data.claimed) || !Number.isInteger(data.accepted) || data.failed!==0)
  throw new Error('El dispatcher reportó un resultado inesperado o entregas fallidas. Revisa la cola.');
console.log('Backend de producción disponible:',JSON.stringify(data));
