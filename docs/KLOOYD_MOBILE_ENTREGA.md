# Klooyd Mobile: implementación y puesta en marcha

13 de noviembre de 2026 · Rama local `feat/klooyd-mobile`.

## Estado

La primera implementación está validada en local y en Android físico.
**Backend aplicado en producción con autorización de Kenneth el 13/11/2026:**
migración `20261113184528`, funciones `mobile-pin`/`mobile-push`, secretos y
job `klooyd-mobile-push` activo cada minuto. El frontend se publica mediante
GitHub Pages al integrar esta rama en `main`.

La revisión inicial está en [KLOOYD_MOBILE_FASE_0.md](KLOOYD_MOBILE_FASE_0.md).
La guía operativa final, con claves preparadas y comandos de publicación, está
en [KLOOYD_MOBILE_PRODUCCION.md](KLOOYD_MOBILE_PRODUCCION.md).
El proyecto verificado por configuración local y conector es
`lpyivecyvtivtkbppjtr`, «Sabor Latino Database».

## Funciones y rutas

| Ruta | Implementación |
| --- | --- |
| `/mobile/` | Sesión de propietario, selector de negocios, ventas históricas/mensuales, gráfica, stock bajo, agotados y último cierre |
| `/mobile/login` | Autenticación Supabase existente por correo/contraseña; una sesión vigente abre el inicio |
| `/mobile/estadisticas` | Meses desde el primer pago, días sin venta en cero, mayor venta, selección de día y aviso de posibles duplicados |
| `/mobile/inventario` | Solo productos físicos; filtros de nombre, categoría y stock; paginación |
| `/mobile/inventario/:id` | Existencias, historial de movimientos y ajustes con motivo, confirmación y PIN |
| `/mobile/cierres`, `/mobile/cierres/:id` | Historial y detalle, propinas separadas, reconstrucción de medios desde los pagos guardados |
| `/mobile/notificaciones` | Bandeja persistente, lectura, resumen de cierre y enlaces al evento |
| `/mobile/ajustes` | Instalación, permiso push explícito, preferencias, dispositivos, PIN y cierre de sesión |
| `/mobile/pin` | Acceso a configuración/recuperación de PIN; la verificación para ajustar está dentro del formulario de inventario |

Se reutilizan React/Vite, Supabase Auth, marca, tablas de negocio, productos,
pagos y cierres. La entrada móvil tiene JS y CSS propios; no importa la interfaz
del POS ni las pantallas de pedidos QR. Estas últimas permanecen sin modificar,
pendientes de la descontinuación que Kenneth indicó que gestionará.

La interfaz tiene navegación inferior, áreas seguras, estados de carga/error/
vacío y controles accesibles. La gráfica muestra el mes completo; además de
sus barras, ofrece un selector de día de tamaño táctil.

## Decisiones confirmadas y cálculos

- **Ventas = `total_with_tip - tip_amount`.** El descuento ya está incluido.
  No se utiliza `paid_amount` como venta porque incluye dinero para cambio.
- Todos los IDs de pago distintos cuentan. Se señalan coincidencias próximas
  como posibles duplicados, sin borrar ni excluir ventas automáticamente.
- El cambio se descuenta exclusivamente del efectivo. Un importe incoherente
  se asigna íntegramente a **Por conciliar**, manteniendo su total y propina.
- Efectivo, tarjeta, transferencia y otros se separan sin duplicar pagos mixtos.
- El cálculo compartido usa centavos enteros (`BigInt`); la agregación histórica
  y diaria se hace en PostgreSQL con `numeric`, por zona horaria del negocio.
- El cierre de escritorio usa el mismo módulo monetario y la fecha del negocio.
  Los snapshots históricos no se reescriben automáticamente. Regenerar un
  cierre continúa requiriendo la confirmación explícita existente en el POS.

La revisión de datos confirmó 1.773 pagos y 96 cierres. Hay un pago cuya fórmula
subtotal/descuento no coincide con el total guardado, un cierre cuyo desglose
no suma el total, un pago con splits insuficientes y ocho con excedente mayor
que el efectivo. Se preservan; no se intentó una corrección histórica remota.

## Seguridad y alcance del PIN

Cada operación de `klooyd_mobile` valida al usuario de Supabase y su membresía
activa de propietario para el negocio, además del estado del negocio y su
suscripción. La selección de negocio de React no es una autorización.

El PIN personal admite 6–12 dígitos. Se guarda con bcrypt adaptativo, coste 12 y
sal generada en servidor (`pgcrypto`). Los hashes no salen al navegador. Tras
cinco errores se bloquea 1, 2, 4, 8 y hasta 15 minutos. Los fallos quedan
persistidos aun cuando la respuesta indique PIN incorrecto.

La autorización secundaria dura como máximo cinco minutos y caduca tras dos
minutos sin una operación válida. Está ligada al usuario, negocio, sesión Auth,
dispositivo y propósito `inventory_adjust`. Solo se guarda su hash en BD; el
token se mantiene en memoria cliente. La UI pide PIN al confirmar cada ajuste.
Cambiar/recuperar el PIN invalida las autorizaciones anteriores y exige verificar
la contraseña actual en `mobile-pin`. No se confía en una fecha o bandera enviada
por el navegador. Cerrar sesión revoca dispositivos y autorizaciones móviles.

Los ajustes bloquean el producto, comprueban el saldo que el usuario confirmó,
impiden stock negativo y registran actor, motivo, delta y saldos. La clave de
idempotencia está ligada al usuario/negocio y al contenido del ajuste. Un reintento
con esa clave devuelve el movimiento existente; otra operación con la misma
clave se rechaza. La UI conserva la clave al reintentar una respuesta perdida.

**Permisos del escritorio aprobados por Kenneth:** todos los empleados activos
pueden seguir ajustando inventario desde el POS. Por ello no se restringen las
políticas operativas existentes a propietarios ni se exige PIN en el RPC de
cobro de escritorio. El PIN protege el endpoint móvil; no pretende prohibir las
operaciones de escritorio que el usuario autorizó expresamente. Los triggers
auditan también los cambios de stock del POS, sin modificar su transacción de
cobro. Los servicios no generan movimientos ni alertas de stock.

## Migración exacta propuesta

Archivo: `supabase/migrations/20261113184528_klooyd_mobile_owner_workspace.sql`.
Se preparó con Supabase CLI 3.1.0 y se probó en local. **Aplicada en producción
con autorización de Kenneth.** El archivo se alineó con la versión que registró
la conexión integrada de Supabase, usada porque esta red no admite IPv6.

1. Crea el esquema no expuesto `mobile_private` y ocho tablas:
   `pins`, `pin_attempts`, `admin_sessions`, `inventory_movements`, `preferences`,
   `push_subscriptions`, `notifications` y `push_deliveries`.
2. Activa RLS en las ocho tablas y revoca el acceso directo de `PUBLIC`, `anon`
   y `authenticated`. Los clientes usan funciones que comprueban identidad y
   negocio; el esquema no debe agregarse a los esquemas expuestos del Data API.
3. Crea funciones privilegiadas en ese esquema con `search_path` vacío y
   permisos explícitos. Las cuatro entradas públicas son `SECURITY INVOKER`:
   `klooyd_mobile` para usuarios autenticados y `klooyd_mobile_pin_set`,
   `klooyd_mobile_push_claim`, `klooyd_mobile_push_finish` solo para `service_role`.
4. Añade `mobile_stock_movement` a las actualizaciones de stock de `productos`
   y `mobile_daily_close` a insert/update de `cierres_diarios`.
5. Añade índices en tablas nuevas. Reutiliza el índice existente
   `pagos_negocio_created_idx`; no crea un duplicado.

No modifica columnas, políticas ni grants operativos existentes de caja. No
reescribe pagos/cierres ni genera notificaciones históricas. La auditoría empieza
al aplicar la migración. El identificador de producto de un movimiento se
conserva aunque posteriormente el POS elimine el artículo del catálogo.

El trigger de stock genera un evento solo al cruzar de `>2` a `<=2`; subir por
encima del umbral permite otra alerta futura. El cierre se deduplica por su ID
y propietario, incluso si se repite el upsert. El envío de red está separado
de la transacción de venta/cierre: un navegador sin permiso o un proveedor push
caído no bloquea el cobro.

## Variables necesarias

| Entorno | Variable | Uso |
| --- | --- | --- |
| Frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Las existentes; verificar destino del build antes de publicar |
| Frontend | `VITE_WEB_PUSH_PUBLIC_KEY` | Clave **pública** VAPID al compilar |
| Edge Functions | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Variables estándar del proyecto; la última nunca va a React |
| Edge Functions | `MOBILE_ALLOWED_ORIGINS` | Lista por comas; producción `https://klooyd.com` |
| Edge Functions | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` | Pareja VAPID; conservarla estable para los dispositivos registrados |
| Edge Functions | `WEB_PUSH_SUBJECT` | Contacto VAPID válido, por ejemplo un `mailto:` real del operador |
| Edge Functions y Vault | `MOBILE_PUSH_DISPATCH_SECRET` | Secreto aleatorio de al menos 32 caracteres para el despachador |

No se generaron ni escribieron valores secretos en este informe. La clave
privada VAPID y el secreto del despachador se configuran únicamente en servidor.

## Cola y programación de push

`mobile-push` reclama hasta 12 entregas por ejecución, con lease y bloqueo
`SKIP LOCKED`. Reintenta con espera creciente, hasta ocho intentos, elimina
suscripciones que respondan 404/410 y vuelve a comprobar rol/preferencias antes
de reclamar. El estado `accepted` significa **aceptado por el proveedor**, no
recibido en el teléfono ni leído. El ID estable de notificación sirve de `tag`
para agrupar posibles reenvíos después de un fallo de respuesta.

La bandeja es independiente del permiso push. De forma inicial la notificación
del sistema es discreta; el propietario puede activar el detalle de importes en
Ajustes. Los resúmenes usan el mismo módulo de cálculos que el POS y móvil.

El despachador está programado en producción. Se ejecutaron estos pasos:

1. Habilitar Supabase Cron (`pg_cron`) y `pg_net`, que no estaban instalados al
   revisar este proyecto. Esto es un cambio remoto adicional sujeto a aprobación.
2. Guardar el secreto de despacho en Supabase Vault con nombre
   `klooyd_mobile_push_dispatch_secret` y el mismo valor en Edge Secrets como
   `MOBILE_PUSH_DISPATCH_SECRET`.
3. Crear un único job por minuto con el siguiente cuerpo. No pegar secretos
   literales en el SQL ni en el repositorio.

```sql
select cron.schedule(
  'klooyd-mobile-push', '* * * * *',
  $job$
  select net.http_post(
    url := 'https://lpyivecyvtivtkbppjtr.supabase.co/functions/v1/mobile-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-mobile-push-key', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'klooyd_mobile_push_dispatch_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
```

La migración de la aplicación no activa extensiones ni crea este job por sí sola.
Se debe comprobar que no exista ya un job con ese nombre antes de crearlo.

## Validaciones ejecutadas y límites

- Suite Node existente y nueva: 56 pruebas aprobadas después del ajuste de
  conciliación aprobado.
- Pruebas nuevas de PostgreSQL con PGlite: propietarios/empleados/anónimos,
  separación de tenants, datos mensuales/ceros/zona, PIN/lockout/caducidad,
  ajustes/idempotencia, saldo obsoleto, servicios, eventos, leases y regresión
  del RPC real de cobro de un cajero.
- Pruebas de importes: ventas sin propina, descuentos, cambio solo en efectivo,
  centavos, duplicados por ID y clasificación por conciliar.
- Playwright: 10 pruebas aprobadas; UI a 320/390/430/768 px, acceso, rutas
  profundas, iconos, respuesta perdida después del ajuste, permiso push denegado
  y Service Worker offline limitado a `/mobile/`, sin datos privados cacheados.
  Usa fixtures de red y no se conecta a producción.
- ESLint, build Vite y `deno check` de las dos funciones Edge ejecutados.
- `pgcrypto` real comprobado mediante un `SELECT` con un PIN sintético:
  bcrypt coste 12, sal distinta y aceptación/rechazo correctos. Sin filas nuevas.
- Supabase completo local sobre Docker Desktop/WSL: 6 pruebas aprobadas con
  Auth real, contraseña actual, Edge PIN, bcrypt, aislamiento y dos solicitudes
  PostgREST simultáneas compitiendo por el mismo producto. Solo una ajustó las
  existencias; el reintento fue idempotente.
- Chromium contra servicios locales reales: login, ventas, configurar PIN,
  agregar/retirar con auditoría y logout aprobados, bloqueando toda petición
  fuera de localhost. Capturas `design-preview/mobile/local-*.png`.
- Asesores de seguridad de Supabase local: sin advertencias ni errores.
- Dispatcher local: rechaza solicitudes sin secreto y responde correctamente
  con configuración VAPID y cola vacía. No demuestra entrega a un dispositivo.
- Android real: Kenneth confirmó recepción de la alerta de stock y apertura
  del producto correcto. Un movimiento 3 → 2, una notificación y un envío
  aceptado en el primer intento. Kenneth confirmó también el cierre ficticio:
  $15.000 de ventas + $1.500 de propina = $16.500 cobrados en efectivo, con
  apertura correcta. Una segunda caída de stock 5 → 2 llegó con Klooyd cerrado
  y Android bloqueado. Tres envíos aceptados, sin errores.
  Repetir el guardado del cierre mantuvo una única notificación.
- Se comprobó detener/iniciar los contenedores conservando los datos ficticios.
- Acceso Android autorizado: túnel HTTPS temporal con cookie privada, compilación
  local y rutas API limitadas. Prueba de bloqueo anónimo/administrativo y recorrido
  real de login/Service Worker aprobados desde Internet. Recepción física en
  Android confirmada por Kenneth.
- Por solicitud posterior de Kenneth, la prueba Android usa `--public-demo`:
  URL normal sin cookie adicional, con login de Supabase obligatorio y rutas
  administrativas bloqueadas. Ambos modos y el recorrido público con rechazo de
  consultas anónimas fueron verificados.

**Límites que deben resolverse antes de publicar:**

- PGlite usa sustitutos criptográficos y serializa su conexión; esas limitaciones
  se cubrieron adicionalmente con Auth, Edge y PostgreSQL reales en Docker local.
- Recepción y enlaces de stock/cierre confirmados en Android, también con la
  aplicación cerrada y el teléfono bloqueado. La revocación se cubrió en las
  pruebas de backend; queda por verificar manualmente desde el dispositivo.
  iPhone no fue probado; Kenneth dispone de Android. Los envíos realizados usan
  exclusivamente datos ficticios del Supabase local.
- Falta probar la publicación en GitHub Pages con apertura directa de URLs y
  la carga de las variables del entorno de despliegue.
- Las comprobaciones visuales/sintéticas no verifican un login real en producción.

## Vista previa y reproducción

```sh
npm ci
npm ci --prefix frontend
npm run local:start
npm run local:functions # dejar activo en otra terminal
npm run local:web # dejar activo; abrir http://127.0.0.1:5173/mobile/

npm run test:mobile
npx playwright install chromium
npm run test:mobile-ui
npm run lint --prefix frontend
npm run build --prefix frontend
deno check --config supabase/functions/mobile-pin/deno.json supabase/functions/mobile-pin/index.ts
deno check --config supabase/functions/mobile-push/deno.json supabase/functions/mobile-push/index.ts
```

El entorno local ya está preparado con dos negocios y cuatro cuentas ficticias.
Consultar [la guía local](KLOOYD_MOBILE_LOCAL.md) para credenciales, comandos y
pruebas integradas. Las capturas no representan datos reales del negocio.

## Orden propuesto de habilitación — requiere aprobación

1. Revisar esta entrega y el SQL exacto. El entorno elegido por Kenneth fue
   Supabase completo local con Docker/WSL; ya está instalado y validado.
2. La recepción física y los enlaces de stock/cierre ya fueron confirmados por
   Kenneth en Android, incluida la pantalla bloqueada. Completar la revocación
   manual y, si se dispone de uno, la validación de iPhone. Backend, PIN y
   concurrencia están validados en el Supabase local autorizado.
3. Solo tras aprobar los resultados, autorizar expresamente la migración en
   `lpyivecyvtivtkbppjtr`, los dos despliegues Edge, las extensiones/job de Cron y
   la publicación del frontend. Un push a `main` dispara GitHub Pages.
4. Aplicar backend antes del nuevo frontend. Recargar las pestañas del POS para
   que todos los nuevos cierres usen las reglas acordadas. Los clientes antiguos
   conservan el cobro, pero su reporte todavía calcula con la lógica antigua.
5. Comprobar consultas reales solo de lectura. Cualquier venta/ajuste/cierre de
   prueba en producción necesita autorización específica; usar datos sintéticos
   en pruebas para la validación de escritura.

## Archivos de la entrega

| Área | Archivos principales |
| --- | --- |
| Móvil | `frontend/mobile/index.html`, `frontend/src/mobile/{main.jsx,MobileApp.jsx,mobileApi.js,mobile.css}` |
| PWA y rutas | `frontend/public/mobile/*`, `frontend/public/404.html`, `frontend/vite.config.js` |
| Importes compartidos y POS | `frontend/src/paymentMath.js`, `frontend/src/DailyReport.jsx` |
| Base de datos | `supabase/migrations/20261113184528_klooyd_mobile_owner_workspace.sql` |
| Edge | `supabase/functions/mobile-pin/*`, `supabase/functions/mobile-push/*`, `supabase/functions/mobile-deno.lock`, `supabase/config.toml` |
| Pruebas | `scripts/mobile-{math,database,local}.test.mjs`, `scripts/mobile-ui/mobile.spec.mjs`, `scripts/mobile-local-ui.mjs`, `playwright.mobile.config.mjs` |
| Entorno local | `local/supabase/config.toml`, `scripts/mobile-local.mjs`, `scripts/klooyd-local.ps1` |
| Android temporal | `scripts/mobile-phone*.mjs`, `scripts/stop-klooyd-android.ps1`, modo proxy opcional en `frontend/src/supabaseClient.js` |
| Herramientas y CI | `package.json`, `package-lock.json`, `.gitignore`, `.github/workflows/test-tenancy.yml`, `scripts/generate-mobile-icons.mjs` |
| Publicación | `.github/workflows/deploy.yml`, `frontend/scripts/check-production-env.mjs`, `scripts/prepare-mobile-production.mjs`, `scripts/check-mobile-production.mjs`, `deploy/mobile-push-schedule.sql`, `docs/KLOOYD_MOBILE_PRODUCCION.md` |
| Documentación y vistas | `docs/KLOOYD_MOBILE_{FASE_0,API,LOCAL,ENTREGA}.md`, `design-preview/mobile/*` |

El archivo original de instrucciones se conserva. Las credenciales, claves,
copias generadas para Docker, `node_modules` y `dist` no forman parte de la entrega.

## Reversión sin borrar auditoría

Deshabilitar el job de Cron si existe y retirar las dos funciones Edge del flujo
público. Revertir la entrada móvil del frontend, conservando los cambios de
cálculo que Kenneth ya aprobó para el POS. Para detener nuevas capturas/eventos:

```sql
begin;
drop trigger if exists mobile_stock_movement on public.productos;
drop trigger if exists mobile_daily_close on public.cierres_diarios;
revoke execute on function public.klooyd_mobile(text,uuid,jsonb) from authenticated;
revoke execute on function mobile_private.api(text,uuid,jsonb) from authenticated;
revoke execute on function public.klooyd_mobile_pin_set(uuid,uuid,text),
  public.klooyd_mobile_push_claim(),
  public.klooyd_mobile_push_finish(uuid,uuid,text,boolean) from service_role;
revoke execute on function mobile_private.pin_set(uuid,uuid,text),
  mobile_private.push_claim(),
  mobile_private.push_finish(uuid,uuid,text,boolean) from service_role;
commit;
```

No eliminar `mobile_private` ni los movimientos/notificaciones para revertir.
La retirada de triggers no restaura existencias: los ajustes confirmados son
operaciones reales y se corrigen con movimientos compensatorios autorizados.
Las políticas originales del POS nunca se alteraron por esta migración.

## Instalación por Kenneth / propietarios

- Android: abrir `https://klooyd.com/mobile/`, iniciar sesión, menú del navegador
  → Instalar aplicación. En Ajustes, activar las notificaciones explícitamente.
- iPhone/iPad: Safari → Compartir → Agregar a pantalla de inicio. Abrir desde el
  icono y activar notificaciones en Ajustes. Web Push requiere iOS/iPadOS 16.4 o
  posterior y la web app instalada.
- Si el permiso está denegado, cambiarlo en los ajustes del sistema/navegador;
  la bandeja permanece disponible con conexión. Sin conexión se muestra una
  página informativa: no hay cola de modificaciones offline.

Referencias: [Web Push en iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html),
[Web Push para Node/Deno](https://github.com/web-push-libs/web-push).
