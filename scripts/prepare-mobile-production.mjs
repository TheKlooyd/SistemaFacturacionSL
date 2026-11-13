import { createECDH, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory = resolve(root,'deploy');
const file = resolve(directory,'mobile-production.secrets.local');
await mkdir(directory,{recursive:true});
let source = await readFile(file,'utf8').catch(error => {if(error.code==='ENOENT')return null;throw error;});
if(source===null) {
  const curve=createECDH('prime256v1');curve.generateKeys();
  source=[
    'MOBILE_ALLOWED_ORIGINS=https://klooyd.com',
    'WEB_PUSH_PUBLIC_KEY='+curve.getPublicKey().toString('base64url'),
    'WEB_PUSH_PRIVATE_KEY='+curve.getPrivateKey().toString('base64url'),
    'WEB_PUSH_SUBJECT=https://klooyd.com',
    'MOBILE_PUSH_DISPATCH_SECRET='+randomBytes(32).toString('hex'),'',
  ].join('\n');
  await writeFile(file,source,{flag:'wx',mode:0o600});
}
const env=Object.fromEntries(source.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
const curve=createECDH('prime256v1');curve.setPrivateKey(Buffer.from(env.WEB_PUSH_PRIVATE_KEY,'base64url'));
if(curve.getPublicKey().toString('base64url')!==env.WEB_PUSH_PUBLIC_KEY || env.MOBILE_PUSH_DISPATCH_SECRET.length<32)
  throw new Error('Las claves guardadas no son válidas; no se reemplazaron.');
await writeFile(resolve(directory,'mobile-production-public-key.local'),env.WEB_PUSH_PUBLIC_KEY+'\n');
console.log('Claves de producción preparadas (o conservadas si ya existían).');
console.log('Edge Secrets: deploy/mobile-production.secrets.local');
console.log('Variable pública de GitHub: deploy/mobile-production-public-key.local');
console.log('No se modificó Supabase ni GitHub. Estos archivos están excluidos de Git.');
