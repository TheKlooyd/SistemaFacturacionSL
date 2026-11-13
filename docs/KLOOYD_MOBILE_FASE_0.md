# Klooyd Mobile: reconocimiento y decisiones

Fecha: 13 de noviembre de 2026 (America/Bogota).
Rama: `feat/klooyd-mobile`, creada desde `main` en `80eec27`.
Especificación: `Instructions/KLOOYD_MOBILE_INSTRUCCIONES_CODEX.md`.

## Estado y autorizaciones

La revisión del repositorio y de Supabase se realizó sin modificar datos,
esquemas, permisos ni funciones remotas. No hubo despliegue ni push a GitHub.
Este archivo registra el reconocimiento inicial. La implementación posterior y
su estado de validación se describen en `docs/KLOOYD_MOBILE_ENTREGA.md`.

Kenneth confirmó durante esta sesión:

- PIN adicional solo para cambios sensibles; consultar datos no requiere PIN.
- Crear, cambiar o recuperar el PIN exige verificar la contraseña actual.
- Todos los empleados activos conservan la facultad de ajustar inventario desde
  el POS de escritorio. Móvil sigue siendo exclusivo de propietarios activos.
- Ventas = `total_with_tip - tip_amount`, sin modificar históricos.
- Pedidos desde el teléfono y QR quedan fuera de este trabajo. Kenneth se
  encargará de su descontinuación; no se eliminan sus componentes aquí.

Decisiones adicionales confirmadas durante la implementación:

1. Contar cada ID de pago distinto y señalar posibles duplicados para revisión.
2. Descontar el cambio exclusivamente del efectivo en pagos mixtos.
3. PIN de 6–12 dígitos, vigencia máxima de 5 minutos, inactividad de 2 minutos,
   bloqueo tras 5 errores y espera progresiva de 1 a 15 minutos.
4. Los medios históricos inconsistentes se agrupan en «Por conciliar», conservando
   el total cobrado y las propinas; no se bloquea el cierre ni se inventa el medio.

## Proyecto confirmado

`frontend/.env` contiene la URL del proyecto `lpyivecyvtivtkbppjtr`.
El conector de Supabase confirma **Sabor Latino Database**, activo y saludable.
Esto verifica el entorno local; las variables del despliegue deberán verificarse
antes de publicar. No se copiaron claves al informe.

Hay tres configuraciones de tipo `restaurante`, todas con `America/Bogota`.
No hay evidencia de un taller remoto de pruebas. Las pruebas de taller deben
usar datos sintéticos locales.

## Existe / reutilizar / crear

| Área | Existe y evidencia | Reutilizar | Crear o adaptar |
| --- | --- | --- | --- |
| Frontend | React 19, Vite 7, JavaScript; `frontend/package.json` | Herramientas y dependencias actuales | Entrada móvil separada y CSS propio |
| Rutas | `frontend/src/App.jsx`, `frontend/src/main.jsx`; entradas raíz y admin en `frontend/vite.config.js` | Mantener POS y administración | Rutas `/mobile/` con enlaces directos y navegación inferior |
| Auth | `frontend/src/StaffAuthGate.jsx`, `supabaseClient.js`; correo y contraseña | Supabase Auth existente | Guarda móvil de propietario; no reutilizar sin cambios la guarda de personal |
| Negocios | `frontend/src/tenantSession.js`, `negocio_usuarios` | Membresías, negocio, configuración y suscripción | Selector móvil: el resolver actual rechaza más de una membresía |
| Marca | `frontend/src/branding.js`, `frontend/public/logoklooyd.png` | Logo y marca Klooyd; marca del negocio | Iconos instalables derivados del recurso existente |
| Ventas | `frontend/src/PayModal.jsx`, `TableOrder.jsx`, `paymentsStore.js` | Campos reales y fórmula aprobada | Agregación PostgreSQL, calendario por zona del negocio y meses con ceros |
| Cierres | `frontend/src/DailyReport.jsx`, `paymentsStore.js`, `cierres_diarios` | Snapshots guardados y detalle de pagos | Historial/detalle móvil y conciliación compartida |
| Stock al cobrar | `complete_table_payment`, migración `20261101213245_inventory_products_and_atomic_payment.sql` | Transacción, bloqueo por producto, rechazo de stock insuficiente, exclusión de servicios | Auditoría/eventos compatibles con esta operación |
| Inventario manual | `frontend/src/InventoryAdmin.jsx`, `productsStore.js` | Catálogo y categorías | Ajustes por delta, motivo, idempotencia y movimientos; no copiar asignación absoluta desde React |
| PIN | No se encontró implementación | Auth para reverificar contraseña | Hash privado, límites, auditoría y autorización secundaria breve validada por servidor |
| Notificaciones | Solo avisos de pedidos abiertos en navegador | Ningún mecanismo actual sustituye push | Eventos persistentes, bandeja, preferencias, suscripciones y entregas con reintentos |
| PWA | No se encontró manifest ni Service Worker | Alojamiento y logo | Manifest e instalación propios, worker limitado a `/mobile/` |
| Pruebas | `scripts/*.test.mjs`, PGlite, lint y build | Pruebas PostgreSQL locales y de stores | Casos móviles de permisos, importes, PIN, concurrencia, alertas y rutas |

## Conciliación verificada por lecturas

### Significado de los importes

`TableOrder.confirmPay` guarda el importe de los artículos en `subtotal`.
`PayModal` calcula `total_with_tip = max(subtotal - descuento, 0) + propina`.
`paid_amount` y `payment_splits` representan dinero recibido y pueden incluir
cambio. Por tanto, sumar `paid_amount` infla ventas cuando se devuelve dinero.

La fórmula aprobada es `total_with_tip - tip_amount`. No se aplicará otra vez
el descuento, ya que el total del cobro ya lo incorpora. Los agregados usarán
`numeric` en PostgreSQL; cualquier reparto en JavaScript debe operar en unidades
monetarias enteras y conservar exactamente los totales.

Resultados de consultas agregadas sobre los datos actuales:

- 1.773 pagos; primer registro UTC `2026-05-26 00:28:21.35+00`.
  En Bogotá corresponde al **25 de mayo**, importante para el primer día local.
- 43 pagos con descuento; 726 con dinero recibido superior al total del cobro.
- 5 pagos mixtos con cambio; ningún pago mixto sin `payment_splits`.
- Un pago no satisface la fórmula de subtotal/descuento/propina. Conservar los
  importes guardados y utilizar el total del cobro aprobado; no corregir el dato
  histórico de forma automática.
- 96 cierres, todos con detalle `data.payments`. Sus `summary.subtotal`,
  `summary.tip` y `summary.total` concilian con ese detalle.
- Un cierre tiene un desglose cuya suma no coincide con `summary.total`.
  El historial móvil debe detectar la inconsistencia y reconstruir el desglose
  desde los pagos cuando sea posible, sin sobrescribir el cierre guardado.

El cierre actual suma subtotal bruto y total con propina por separado. La nueva
etiqueta «Ventas» no debe confundirse con ninguno de esos dos importes.
También usa la zona del navegador, mientras móvil exige la del negocio.

### Duplicados y cambio

`DailyReport.splitProbableDuplicatePayments` compara una huella de mesa,
artículos, importes y medios, y omite coincidencias en 15 segundos. No es una
clave de idempotencia y puede ocultar un pago legítimo. Su continuidad está
reemplazada por la decisión de contar cada ID; no se eliminarán filas remotas.

`allocateAcrossSplits` distribuye proporcionalmente el total y las propinas
entre los importes recibidos. Cuando hay cambio esto puede modificar también
el importe atribuido a tarjeta/transferencia. No cambiarlo sin respuesta sobre
la regla de devolución. Kenneth confirmó posteriormente descontar solo efectivo.

## Seguridad e impacto en escritorio

RLS está activa en `productos`, `pagos`, `cierres_diarios` y
`negocio_usuarios`. Se confirmaron las políticas `ALL` de las primeras tres:
comprueban membresía activa, sin discriminar el rol para escribir.
`membresias_propias` solo permite leer las membresías del usuario autenticado.

La autorización aprobada para empleados significa que no procede quitarles
unilateralmente la escritura de inventario. Restringir globalmente el stock a
propietarios o requerir PIN en toda actualización rompería ese requisito y la
función de cobro actual, que usa `SECURITY INVOKER`.

El endpoint móvil de ajustes deberá exigir propietario, tenant y autorización
PIN en servidor. Esto no convierte el PIN móvil en una prohibición universal de
ajustar stock: un empleado autorizado seguirá teniendo la operación del POS.
Debe documentarse esta distinción y probar ambos accesos por separado.

Existe el esquema privado `sl_private`. No se encontraron tablas de movimientos,
PIN, notificaciones o push, ni funciones equivalentes en `public`/`sl_private`.
Los triggers de productos y cierres encontrados asignan tenant para clientes
anteriores; no generan movimientos ni notificaciones.

El índice `pagos_negocio_created_idx (negocio_id, created_at)` ya existe en remoto.
No hace falta proponer otro idéntico. Los cierres tienen unicidad por
`(negocio_id, date_iso)` y `saveDailyClose` hace upsert: los eventos deben deduplicar
también los reintentos y actualizaciones de ese mismo cierre.

## Secuencia de implementación

1. Entrada móvil independiente, autenticación existente, selección de propietarios,
   navegación, estados y PWA, sin cargar el POS o pedidos QR dentro de móvil.
2. Tras resolver duplicados y cambio, agregación y cálculo compartidos, calendario
   local, inventario de consulta, historial y detalle de cierres.
3. Backend de PIN y ajustes; migraciones locales versionadas con pruebas de rol,
   tenant, concurrencia, idempotencia y expiración. Conservar capacidades del POS.
4. Eventos de stock/cierre en backend, bandeja y envío Web Push estándar con
   suscripciones por dispositivo, deduplicación y reintentos.
5. Lint, build, pruebas y validación visual; entrega de migraciones, impacto,
   reversión, variables sin secretos e instalación Android/iPhone.

La migración exacta se preparó después del reconocimiento en
`supabase/migrations/20261113184528_klooyd_mobile_owner_workspace.sql`.
Posteriormente Kenneth autorizó el despliegue y la migración fue aplicada en
producción. El informe de entrega presenta su impacto, validaciones y reversión.

## Alojamiento y validaciones pendientes

`.github/workflows/deploy.yml` publica GitHub Pages al hacer push a `main`.
No hacer push a esa rama como parte de la preparación. Las rutas profundas
móviles necesitan un mecanismo compatible con alojamiento estático; crear
solo una condición en `App.jsx` no resuelve la apertura directa de esas URLs.
El worker no debe controlar el escritorio ni cachear respuestas autenticadas.

Al iniciar esta fase faltaban Node/npm en PATH y ambos `node_modules`. Se preparó
Node 22.23.5 en una carpeta temporal, verificado con el SHA256 oficial, y se
instalaron las dependencias fijadas. Los resultados ejecutados están en el
informe de entrega; no se cambiaron las instalaciones globales de Node.

Kenneth eligió posteriormente Supabase completo local. Se instalaron Docker
Desktop 4.99.0 y WSL 3.0.5, y se creó `klooyd-mobile-local` con datos ficticios.
Auth, Edge, PIN bcrypt y concurrencia real ya se validaron allí. La guía
`KLOOYD_MOBILE_LOCAL.md` documenta el uso y la recepción de push aún pendiente
en teléfonos físicos; después Kenneth confirmó stock/cierre y pantalla bloqueada
en Android y autorizó la publicación. Consultar el estado actualizado en la entrega.

Referencias consultadas:

- [Supabase Auth: contraseña](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Alcance del manifest PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope)
