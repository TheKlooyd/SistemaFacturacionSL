# Publicar Klooyd Mobile

Destino: **Sabor Latino Database**, `lpyivecyvtivtkbppjtr`, y
**https://klooyd.com/mobile/**. Estos pasos se ejecutan desde la raíz del repositorio.
Backend ejecutado con autorización de Kenneth el 13/11/2026: migración,
secretos, funciones, Vault y programación cada minuto. Los pasos siguientes
documentan el procedimiento; no repetir la creación del job ya existente.
El frontend se publica al integrar la rama en `main`.

Las pruebas principales en Android pasaron: PIN, inventario concurrente,
recepción de stock/cierre, enlaces e importes, y pantalla bloqueada. iPhone y
revocación manual desde el teléfono siguen sin comprobarse. Los asesores de
seguridad locales no reportaron advertencias ni errores.

Los asesores de producción no reportaron errores ni hallazgos móviles nuevos.
Reportaron tres advertencias ajenas a esta migración: dos funciones existentes
`platform_admin_can_manage_storage`/`qr_set_table_active` y protección de
contraseñas filtradas deshabilitada. No se cambiaron esos componentes.

## Cuentas existentes

Sabor Latino tiene un propietario activo y suscripción vigente sin vencimiento.
Usará **su correo y contraseña actuales**, con sus datos reales del negocio.
No hay que crear otra cuenta ni copiar usuarios de la base local.

Kenneth confirmó que Don Juan Empanadas y Charly's son cuentas de prueba. Sus
fechas vencidas se conservan; no se renuevan ni se eliminan para esta publicación.
Los empleados cajero/mesero no reciben acceso móvil de propietario.

## 1. Preparar herramientas y claves

Se generaron claves VAPID **nuevas para producción**, diferentes de las pruebas.
Permanecen en archivos excluidos de Git. El generador conserva las existentes.

En este PC, si PowerShell no encuentra `node` o `npm`, habilitar la copia portátil:

```powershell
$env:PATH = (Join-Path $env:TEMP 'klooyd-mobile-tools/node-v22.23.5-win-x64') + ';' + $env:PATH
```

Si esa copia ya no existe, instalar Node.js 22 LTS. Después:

```powershell
npm.cmd ci
npm.cmd ci --prefix frontend
node.exe scripts/prepare-mobile-production.mjs
npx.cmd supabase login
```

El navegador de `supabase login` debe entrar con la cuenta administradora del
proyecto. Si el CLI solicita la contraseña de la base, usar la de ese proyecto.
No pegar contraseñas ni claves privadas en el chat, en SQL guardado o en Git.

## 2. Configurar la clave pública en GitHub

Abrir [Variables de Actions](https://github.com/TheKlooyd/SistemaFacturacionSL/settings/variables/actions).
Crear una **Repository variable**, no un secreto, con:

- Nombre: `VITE_WEB_PUSH_PUBLIC_KEY`
- Valor: el contenido de `deploy/mobile-production-public-key.local`.

El workflow `deploy.yml` ya lee esa variable y comprueba el destino Supabase,
la ausencia del proxy local y la presencia de una clave pública válida antes
de compilar. La clave privada nunca va a GitHub Pages ni al frontend.

## 3. Aplicar solo la migración móvil

Comprobar el respaldo disponible del proyecto antes de modificar el esquema.
La comparación de historial remoto confirmó las 28 migraciones anteriores.
Revisar nuevamente el plan justo antes de aplicar:

```powershell
npx.cmd supabase db push --remote=lpyivecyvtivtkbppjtr --dry-run
```

Debe proponer **solo**:
`20261113184528_klooyd_mobile_owner_workspace.sql`.
Si propone otras migraciones, detenerse y revisar el historial. No usar
`--include-all`, `--include-seed` ni la carpeta `local` para producción.

```powershell
npx.cmd supabase db push --remote=lpyivecyvtivtkbppjtr
```

Este SQL crea ocho tablas privadas, funciones con permisos explícitos y dos
triggers para auditoría/avisos. No reescribe ventas ni cierres ni cambia los
permisos de los empleados del POS. Los eventos empiezan desde su aplicación.
El análisis y la reversión están en [la entrega](KLOOYD_MOBILE_ENTREGA.md).

## 4. Configurar y desplegar las dos funciones

```powershell
npx.cmd supabase secrets set --remote=lpyivecyvtivtkbppjtr --env-file deploy/mobile-production.secrets.local
npx.cmd supabase functions deploy mobile-pin mobile-push --remote=lpyivecyvtivtkbppjtr
node.exe scripts/check-mobile-production.mjs
```

El archivo configura los cinco secretos necesarios: orígenes permitidos,
pareja VAPID, contacto VAPID y secreto de despacho. Las variables estándar de
Supabase ya se proporcionan a las funciones. `verify_jwt=false` está configurado
para estas dos funciones porque validan la identidad/secreto dentro del código.
No usar `--prune` ni desplegar todas las funciones: QR y parse-order quedan fuera.

El comprobador debe mostrar rechazo 401 sin autorización y una respuesta correcta
del dispatcher autorizado. Procesa un lote real pendiente si lo hay; no genera
ventas, productos, ajustes ni notificaciones de prueba en producción.

## 5. Activar el envío automático

En [Supabase Dashboard](https://supabase.com/dashboard/project/lpyivecyvtivtkbppjtr),
abrir Vault y crear un secreto:

- Nombre exacto: `klooyd_mobile_push_dispatch_secret`
- Valor: **solo el valor** de `MOBILE_PUSH_DISPATCH_SECRET` del archivo
  `deploy/mobile-production.secrets.local`.

Debe ser idéntico al configurado en Edge Secrets. Usar el formulario de Vault
para que el valor no quede escrito en un script SQL compartido.

En SQL Editor del **mismo proyecto**, ejecutar el contenido completo de:

```text
deploy/mobile-push-schedule.sql
```

Activa `pg_cron` y `pg_net`, comprueba que existe el secreto y crea un único job
`klooyd-mobile-push`, cada minuto. El script se validó en una transacción local
revertida. Si el job ya existe, se detiene para no duplicarlo.

Resultado esperado: un job con `schedule = '* * * * *'` y `active = true`.
Los avisos pueden tardar hasta aproximadamente un minuto en empezar a enviarse.
Esta tarea vive en Supabase: el PC y Docker no tienen que permanecer encendidos.

## 6. Guardar y publicar el código

Solo después de tener el backend listo, guardar esta rama y subirla:

```powershell
git branch --show-current
git add .github/workflows .gitignore package.json package-lock.json frontend supabase scripts docs deploy local/supabase/config.toml local/supabase/.gitignore playwright.mobile.config.mjs design-preview/mobile
git diff --cached --stat
git commit -m "feat: add owner mobile PWA with inventory PIN and push"
git push -u origin feat/klooyd-mobile
```

La rama esperada es `feat/klooyd-mobile`. Las cuentas y claves locales, las claves
privadas de producción, dependencias y compilaciones quedan excluidas por Git.
El archivo original de instrucciones no se incluye con ese comando.

En [GitHub](https://github.com/TheKlooyd/SistemaFacturacionSL), abrir el pull request
de `feat/klooyd-mobile` hacia `main`. Esperar a que terminen correctamente las
pruebas de **Test multitenant foundation** y fusionar el PR.

El push resultante a `main` ejecutará **Deploy Frontend to GitHub Pages**.
Comprobar que termina en verde en [Actions](https://github.com/TheKlooyd/SistemaFacturacionSL/actions).
El deploy publica `frontend/dist` en `gh-pages`, conservando el dominio `klooyd.com`.

## 7. Entrar desde el teléfono y verificar

1. Abrir **https://klooyd.com/mobile/** con Chrome Android.
2. Iniciar sesión con la cuenta real de propietario de Sabor Latino.
3. Comprobar ventas, inventario e historial de cierres en modo consulta.
4. En Ajustes, configurar un PIN propio verificando la contraseña actual.
5. Instalar desde ese dominio y activar notificaciones otra vez. La instalación
   de prueba de `trycloudflare.com` es distinta y puede retirarse del teléfono.
6. Las siguientes operaciones reales de stock y cierre deben crear los avisos.
   No crear ventas/cierres ficticios ni ajustar stock real solo para probar.
7. Comprobar Cron → historial del job, logs de `mobile-push` y entregas pendientes.

Después del primer envío puede consultarse, sin mostrar suscripciones ni claves:

```sql
select status, count(*) from mobile_private.push_deliveries group by status;
select jobid, jobname, schedule, active
from cron.job where jobname = 'klooyd-mobile-push';
select status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='klooyd-mobile-push')
order by start_time desc limit 10;
```

Un job SQL exitoso solo confirma que encoló la llamada HTTP; revisar también
los logs de la función y `push_deliveries`. `accepted` no equivale a leído.

Para detener el acceso temporal de pruebas:

```powershell
.\scripts\stop-klooyd-android.ps1
.\scripts\klooyd-local.ps1 stop
```

## Reversión

Si hay un problema, detener el job `klooyd-mobile-push` y seguir la reversión
documentada en la entrega. Conservar la auditoría y los ajustes ya realizados.
Revertir el frontend requiere un revert en `main` y un nuevo deploy. No borrar
tablas ni desactivar extensiones compartidas para hacer rollback.

Referencias: [programación de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions),
[Supabase Cron](https://supabase.com/docs/guides/cron/install).
