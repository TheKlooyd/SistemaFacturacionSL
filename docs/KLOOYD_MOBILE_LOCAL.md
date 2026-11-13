# Supabase local para Klooyd

Este entorno usa PostgreSQL 17, Auth, Storage, Realtime, Studio y Edge Functions
en Docker/WSL. Solo contiene datos ficticios. No se vincula a ningún proyecto
Supabase alojado y no importa usuarios, contraseñas ni ventas de producción.

## Uso en este equipo

Abrir Docker Desktop y esperar a que el motor esté listo. Desde PowerShell,
en la raíz del repositorio:

```powershell
.\scripts\klooyd-local.ps1 start
```

El primer arranque descarga las imágenes, aplica el esquema y crea dos negocios
(restaurante y taller), dos propietarios, un cajero y un mesero. Las siguientes
ejecuciones conservan los datos. Los correos y contraseñas de prueba están en
`local/state.local/accounts.json`; ese archivo está excluido de Git.

Abrir otras dos terminales y dejar estos procesos activos:

```powershell
.\scripts\klooyd-local.ps1 functions
```

```powershell
.\scripts\klooyd-local.ps1 web
```

Abrir <http://127.0.0.1:5173/mobile/> e iniciar sesión con uno de los propietarios
ficticios. En Ajustes, crear el PIN verificando su contraseña. El POS de esta
misma instancia también usa la base de pruebas.

| Servicio | Dirección |
| --- | --- |
| Aplicación | http://127.0.0.1:5173/mobile/ |
| API Supabase | http://127.0.0.1:55321 |
| PostgreSQL | 127.0.0.1:55322 |
| Studio | http://127.0.0.1:55323 |
| Correo de pruebas | http://127.0.0.1:55324 |

Para verificar o detener conservando los datos:

```powershell
.\scripts\klooyd-local.ps1 status
.\scripts\klooyd-local.ps1 test
.\scripts\klooyd-local.ps1 stop
```

Para probar el dispatcher con las suscripciones creadas desde el navegador local,
ejecutar `.\scripts\klooyd-local.ps1 push`. Procesa un lote de notificaciones
pendientes. No hay una tarea recurrente instalada en Windows; en producción el
job propuesto está documentado aparte y requiere aprobación.

La prueba integrada requiere `functions` activo. Crea un producto temporal para
probar dos ajustes simultáneos y conserva su auditoría. También cambia el PIN
del primer propietario ficticio a `123456`; no usar estas cuentas fuera de local.

## Comandos equivalentes con Node.js

Requiere Node.js 22 LTS o posterior, `npm ci` en la raíz y `npm ci --prefix frontend`.
El asistente PowerShell también detecta la copia portátil de Node preparada en
este equipo; si Windows elimina esa carpeta temporal, instalar Node.js.

```text
npm run local:prepare
npm run local:start
npm run local:functions
npm run local:web
npm run test:mobile-local
npm run local:stop
```

Con `local:web` y `local:functions` activos, `npm run test:mobile-local-ui`
comprueba desde Chromium login, ventas, configurar PIN, agregar/retirar unidades
y cerrar sesión. Solo permite peticiones a localhost y guarda capturas en
`design-preview/mobile/local-*.png`.

`local:prepare` genera un bootstrap a partir de `supabase_schema.sql` y las
migraciones canónicas, en orden. Incluye `productos.size`, columna histórica
que no está en el esquema base. No modifica los SQL de producción. Los archivos
generados, claves VAPID y credenciales permanecen excluidos de Git.

Si cambia el esquema después del primer arranque, el comando se detiene para
evitar interpretar una migración ya aplicada con contenido distinto. Para
**borrar y recrear solo los datos locales**, con Supabase iniciado:

```powershell
.\scripts\klooyd-local.ps1 reset -ConfirmLocalReset
```

O `npm run local:reset -- --confirm-local-reset`. No usar `supabase link`,
`db push --remote` ni comandos de despliegue en esta carpeta.

## Aislamiento y límites de las pruebas

- El proyecto se llama `klooyd-mobile-local` y usa puertos diferentes del estándar.
  Los scripts rechazan una referencia a un proyecto remoto y comprueban los
  hosts y puertos antes de conectar a Auth, REST o PostgreSQL.
- `local:web` fuerza las variables locales del frontend y el modo `mobile-local`.
  No cambia `frontend/.env`. El `npm run dev` habitual conserva su configuración
  previa; usar el comando local para hacer pruebas de escritura.
- Los correos de Auth llegan al servidor de correo de pruebas, no a destinatarios reales.
- Las pruebas unitarias usan PGlite y las de interfaz interceptan HTTP. La prueba
  `test:mobile-local` usa servicios reales: Auth, Edge, bcrypt y conexiones
  independientes de PostgreSQL a través de PostgREST.
- Las claves VAPID son exclusivas de local. La aceptación y recepción de Web Push
  necesitan una suscripción real del navegador y conexión a su proveedor. No se
  considera probada la recepción en Android/iPhone por verificar solo la cola.
- El recolector opcional de logs de Studio está desactivado: en este Windows
  intentaba usar el puerto Docker TCP 2375, que está cerrado. Los servicios de la
  aplicación funcionan y sus registros se pueden consultar con `docker logs`.
- Desde un teléfono, `localhost` apunta al propio teléfono. Kenneth autorizó un
  túnel HTTPS temporal protegido para Android. Se describe abajo; no publica
  la aplicación de producción.

## Prueba Android mediante túnel autorizado

Se instaló el cliente oficial `cloudflared`. Con Supabase y `local:functions`
activos, iniciar una nueva sesión de prueba así:

```text
npm run local:android -- --public-demo
```

Kenneth pidió retirar la barrera del enlace privado tras no poder abrirlo en
Android. `--public-demo` abre la página de login a cualquier visitante, conservando
la autenticación y autorización del negocio ficticio. No requiere compartir
Wi-Fi con el PC. Omitir ese indicador conserva el modo opcional de enlace privado.

El comando compila el frontend con un proxy del mismo origen, abre un servidor
solo en `127.0.0.1:5174` y crea un túnel temporal. El enlace de prueba queda en
`local/state.local/phone-link.txt`, el QR en `android-access.png` y las cuentas
ficticias en `accounts.json`. Todos están excluidos de Git. Cada nueva sesión
cambia el hostname y la clave; no reutilizar un enlace de una sesión anterior.

En el modo privado opcional, el enlace establece una cookie `Secure`, `HttpOnly`, `SameSite=Lax` y redirige
a `/mobile/` sin conservar la clave en la URL. La aplicación y los recursos
requieren esa cookie. `--public-demo` elimina solo esa barrera adicional.
En ambos modos, el proxy solo permite Auth de usuario, el RPC móvil y
la función de PIN. No publica Studio, PostgreSQL, Auth administrativo, tablas
REST directas ni el dispatcher push. Caduca a las dos horas.

En Android: abrir el enlace de prueba en Chrome, iniciar sesión con el propietario
ficticio, instalar desde el menú y abrir desde el icono. En Ajustes, pulsar
«Activar en este dispositivo» y aceptar el permiso. Después, generar una caída
de stock con `npm run local:android-alert`: crea «Alerta Android - prueba local»,
ajusta 3 → 2 por la API autenticada del POS y despacha el evento. No se ejecuta
si aún no hay una suscripción; repetirlo no genera otro evento. También puede
usarse `npm run local:push` para procesar la cola. Bloquear el teléfono y comprobar la recepción y el enlace
de la notificación. La respuesta `accepted` del servidor no demuestra recepción.

Para cerrar antes de la caducidad, Ctrl+C en `local:android`, o:

```powershell
.\scripts\stop-klooyd-android.ps1
```

El script identifica los PID y comandos registrados antes de detenerlos.
Supabase local se conserva. No hay servicio de túnel permanente.

Verificaciones del acceso: `npm run test:mobile-gateway` comprueba cookie,
bloqueo anónimo y rutas administrativas. `scripts/mobile-phone-check.mjs`
comprueba además login real y Service Worker en el origen registrado. La prueba
del túnel inicial se ejecutó correctamente desde Internet. Kenneth confirmó
stock → producto, cierre → detalle con importes correctos, y recepción con
Klooyd cerrado y Android bloqueado. Queda pendiente la revocación manual desde
el dispositivo; su lógica de backend está cubierta por las pruebas.

`node scripts/mobile-phone-close.mjs` crea un cierre con los pagos ficticios del
día y envía su aviso. No reemplaza un cierre existente distinto y no duplica el
evento al repetir. Primera prueba: ventas $15.000, propina $1.500, total $16.500
en efectivo; aceptación del proveedor y recepción/apertura en Android comprobadas.

Referencia: [túneles temporales de Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Configuración e instalación basadas en [Supabase local](https://supabase.com/docs/guides/local-development/cli/getting-started),
[Docker para Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
y [WSL](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).
