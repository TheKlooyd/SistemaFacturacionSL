import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
if (env.VITE_SUPABASE_URL !== 'https://lpyivecyvtivtkbppjtr.supabase.co')
  throw new Error('El build de producción debe usar Sabor Latino Database.');
if (!env.VITE_SUPABASE_ANON_KEY)
  throw new Error('Falta la clave pública de Supabase.');
if (env.VITE_SUPABASE_PROXY_PATH)
  throw new Error('El proxy de la prueba Android no debe estar activo en producción.');
const publicKey = env.VITE_WEB_PUSH_PUBLIC_KEY || '';
if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || Buffer.from(publicKey,'base64url')[0] !== 4)
  throw new Error('Configura la variable de GitHub Actions VITE_WEB_PUSH_PUBLIC_KEY con la clave pública VAPID de producción.');
console.log('Destino de producción y clave pública push verificados.');
