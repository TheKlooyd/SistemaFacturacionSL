# Klooyd Mobile — instrucciones de implementación para Codex

**Versión:** 1.0 · **Fecha:** 13 de noviembre de 2026  
**Estado:** especificación de primera versión; **no se ha implementado ni modificado la base de datos**.  
**Objetivo:** desarrollar una PWA para propietarios en `https://klooyd.com/mobile/` con estadísticas, inventario editable, cierres y notificaciones, aprovechando el código y la base de datos existentes.

> **INSTRUCCIÓN PRINCIPAL PARA CODEX:** Trabaja en el repositorio actual de Klooyd. Lee primero sus archivos, componentes, rutas, servicios, autenticación, migraciones, configuración PWA y lógica de ventas/cierres/inventario. Reutiliza lo existente. Implementa una **primera versión funcional**, móvil y segura, en una rama de trabajo. **No ejecutes migraciones, cambios de permisos ni despliegues en producción sin presentar antes el plan exacto de cambios y recibir aprobación de Kenneth.** No inventes nombres de archivos ni de funciones que no existan. Si una pieza no está presente, créala siguiendo la arquitectura real. Al terminar entrega los archivos modificados, pruebas realizadas y pendientes.

---

## 1. Hallazgos verificados antes de empezar

Se inspeccionó, **solo con lecturas**, el proyecto Supabase activo llamado **«Sabor Latino Database»** (ref. `lpyivecyvtivtkbppjtr`) el 13/11/2026. **Codex debe confirmar que este es el proyecto vinculado al repositorio y entorno objetivo antes de trabajar sobre él.** También aparece otro proyecto, «Mallet Database Sabor Latino», inactivo. No se modificó ninguno.

| Elemento | Evidencia actual y consecuencia |
| --- | --- |
| Tenencia | `public.negocios` y `public.negocio_usuarios` ya manejan `negocio_id` y membresías. `negocio_usuarios.rol` admite `propietario`, `administrador`, `cajero`, `mesero`; existe `is_active`. |
| Tipos de negocio | `negocio_configuracion.tipo_negocio` admite `restaurante` y `taller_motos`, pero **los tres registros configurados actualmente son restaurante**. No asumir que existe un taller de pruebas. |
| Ventas | `public.pagos` contiene 1.773 registros históricos, con `created_at`, `subtotal`, `discount_amount`, `tip_amount`, `total_with_tip`, `paid_amount`, `method`, `payment_splits` y `negocio_id`. Primer pago visible: 26/05/2026 UTC. |
| Pagos mixtos | `pagos.method` incluye `EFECTIVO + TRANSFERENCIA`, `EFECTIVO + TARJETA`, etc. `payment_splits` es un arreglo JSON de objetos con `method`, `amount`, `amountStr`. **No** contar la venta completa en cada medio de pago. |
| Cierres | `public.cierres_diarios` existe, con `id`, `date_iso`, `data` JSONB, `created_at`, `negocio_id` (96 registros). `data.summary` contiene `subtotal`, `tip`, `total`, `tickets`; `data.breakdown` contiene objetos con `method`, `total`, `tip`, `tickets`, `uses`; `data.payments` incluye el detalle y `paymentSplits`. |
| Productos | `public.productos` existe, con `id`, `negocio_id`, `name`, `item_type`, `stock_quantity`, `price`, `purchase_price` y `category_id` (425 registros). `item_type='product'` es físico y `item_type='service'` es servicio. `stock_quantity` no puede ser negativo. |
| RLS | Las tablas inspeccionadas tienen RLS activada. **Advertencia:** las políticas de `productos`, `pagos` y `cierres_diarios` son `ALL` y comprueban membresía activa del negocio, **sin distinguir rol para escritura**. Antes de dar capacidades administrativas móviles, auditar y endurecer permisos sin romper el POS de escritorio. |
| Inventario histórico | En las tablas públicas inspeccionadas no apareció un registro específico de movimientos de inventario. Revisar funciones y código antes de decidir crear uno. |
| GitHub | La cuenta conectada reporta el usuario `TheKlooyd`, pero el conector no devolvió repositorios accesibles. **No se pudo leer el código fuente.** Por eso los nombres de componentes/rutas propuestos a continuación son orientativos, nunca evidencia de implementación actual. |

**Documentación funcional previa:** el documento «Klooyd_Inventario_Taller_Revision.pdf» describe la lógica esperada: los artículos físicos se descuentan al confirmar la venta; los servicios no afectan existencias; los alertas de inventario deben ayudar a reponer productos. **El documento describe funcionalidad prevista, no necesariamente ya programada.**

## 2. Alcance de esta primera versión

**Sí desarrollar ahora:**

1. `/mobile/` como experiencia móvil propia y PWA instalable, con ícono de Klooyd.
2. Inicio de sesión con la autenticación existente; acceso a datos solamente de negocios donde el usuario sea propietario activo.
3. **PIN administrativo** personal para entrar a funciones sensibles: configurar por primera vez, verificar, cambiar/recuperar con un proceso seguro, vencimiento y límites de intentos.
4. Dashboard de ventas: total histórico desde el primer pago, total del mes, evolución por día y navegación entre meses.
5. Inventario: búsqueda, filtros, existencias, productos con stock bajo (0 a 2), formulario para **sumar** unidades compradas y **retirar** unidades por ajuste con motivo obligatorio.
6. Cierres: historial y detalle de total vendido, efectivo, tarjeta, transferencia y otros, sin duplicar pagos mixtos.
7. Notificaciones: (a) productos al caer a **2 unidades o menos**, (b) cierre de caja efectuado con resumen por medio de pago. Centro de notificaciones e instalación/configuración push.
8. Seguridad, pruebas básicas, estados de carga, errores, accesibilidad y responsive real.

**Fuera de esta versión:** facturación nueva desde el teléfono, edición de precios, gestión de empleados, reportes avanzados, IA, publicación en tiendas móviles, operación offline con modificaciones pendientes, reemplazar el sistema de escritorio.

## 3. Interfaz / rutas / comportamiento

### 3.1 Rutas sugeridas

| Ruta | Funcionalidad |
| --- | --- |
| `/mobile/` | Inicio con KPIs, gráfica resumida, alertas y último cierre. |
| `/mobile/login` | Entrada con autenticación existente, solo cuando haga falta. |
| `/mobile/estadisticas` | Gráfica mensual por días; meses anterior/siguiente, día destacado, totales. |
| `/mobile/inventario` | Listado filtrable por nombre/categoría/stock; alta visibilidad del stock bajo. |
| `/mobile/inventario/:id` | Detalle de artículo físico, historial de ajustes y acciones `Agregar` / `Retirar`. |
| `/mobile/cierres` y `/mobile/cierres/:id` | Historial y desglose de cierres. |
| `/mobile/notificaciones` | Bandeja, leído/no leído, enlace al evento. |
| `/mobile/ajustes` | Activar push, dispositivos, preferencias, PIN y cierre de sesión. |
| `/mobile/pin` | Verificación secundaria antes de secciones/acciones administrativas. |

Usar un **layout móvil diferente al administrativo de escritorio**: barra inferior de navegación, tarjetas grandes, filtros simples, tipografía legible, carga ligera, botones táctiles de al menos ~44 px, soporte para áreas seguras (`safe-area-inset`) y anchos desde 320–430 px hasta tablet. No limitarse a comprimir el dashboard existente; compartir lógica/servicios, no necesariamente todas las vistas.

### 3.2 Pantalla de inicio

- Encabezado «Hola, [nombre]» y nombre del negocio; selector si tiene varios negocios como propietario.
- KPI «Ventas históricas» (desde el primer registro de pago válido) y «Ventas del mes».
- Gráfica pequeña de ventas diarias del mes seleccionado y enlace a estadísticas.
- Tarjetas «Productos con stock bajo», «Agotados» y «Último cierre».
- Resumen de notificaciones pendientes.
- Navegación inferior: **Inicio · Ventas · Inventario · Alertas**. Cierres accesibles desde Inicio/Ventas.

## 4. Estadísticas y conciliación de ventas

**Fuente principal a verificar con el código:** `public.pagos`. Filtrar siempre por `negocio_id` autorizado, agrupar por la **fecha local del negocio** (`negocio_configuracion.timezone`, normalmente `America/Bogota`), no por el día UTC. Navegación entre meses desde el primer pago hasta el presente, mostrando todos los días del mes (incluidos ceros). Marcar día de mayor venta y mostrar total mensual, número de tickets y, si es útil, promedio por ticket.

**MUY IMPORTANTE:** revisar en el POS qué representan exactamente `subtotal`, `discount_amount`, `paid_amount`, `total_with_tip` y `tip_amount`, y conciliar contra `cierres_diarios.data.summary` antes de elegir el valor «ventas». No presentar propinas como ingresos por ventas ni contar pagos duplicados. Documentar la fórmula final y usarla tanto en escritorio como en móvil, idealmente por servicio/consulta agregada compartida. Usar importes numéricos sin operaciones imprecisas de coma flotante. Evitar descargar los 1.773 pagos al navegador para agregarlos: agregar en PostgreSQL o backend con índices por `negocio_id`, `created_at` si el plan lo requiere.

**Visual esperado:** gráfica de barras por días (1–28/29/30/31), flechas «mes anterior / siguiente», texto «Noviembre 2026», toque en barra para ver día/importe, estado de mes sin ventas, sin inventar información de meses no cargados.

## 5. Inventario y ajustes desde el teléfono

Solo artículos `item_type='product'` tienen existencias. Los servicios **nunca** generan alertas ni ajustes de stock.

En detalle de producto:

- Mostrar nombre, cantidad actual y estado: **Agotado** (=0), **Bajo** (>0 y ≤2), **Disponible** (>2).
- **Agregar unidades:** ingresar cantidad positiva, motivo `Compra/reposición`, confirmación explícita de stock previo/nuevo.
- **Retirar unidades:** ingresar cantidad positiva, seleccionar motivo (`Merma`, `Pérdida`, `Corrección` u otro), confirmar; impedir resultado negativo.
- Exigir PIN administrativo vigente antes de ejecutar cambios, además de autorización de propietario en el servidor.
- Mostrar historial de movimientos con fecha local, usuario, motivo, cambio y saldo resultante.

**Regla transaccional obligatoria:** una mutación atómica en backend/bd debe validar usuario/negocio/rol/PIN, bloquear o controlar concurrencia sobre el producto, actualizar cantidad una sola vez y guardar un movimiento auditable (`negocio_id`, `producto_id`, `tipo`, `delta`, `stock_anterior`, `stock_nuevo`, `motivo`, `actor_user_id`, `created_at`, `idempotency_key`). Los reintentos no deben duplicar un ajuste. No hacer `setStock(cantidadActual + delta)` calculado solamente en React. No permitir `UPDATE productos.stock_quantity` directamente desde el cliente móvil.

Examinar antes la lógica de descuentos de caja: la venta confirmada debe seguir descontando **solo productos físicos** y compartir reglas de stock; cualquier ajuste de permisos debe conservar las operaciones actuales de caja. Si no hay una tabla de movimientos, proponer una migración pequeña para crearla, **sin aplicarla a producción hasta aprobación**.

## 6. Notificaciones y PWA

### 6.1 Eventos

| Evento | Condición exacta | Destino | Contenido mínimo |
| --- | --- | --- | --- |
| Stock bajo | **Cruce** de `stock_anterior > 2` a `stock_nuevo <= 2`, para productos físicos; también cubre saltar de 5 a 1 o 0. | Propietarios activos del mismo `negocio_id`. | Nombre del producto y unidades restantes; enlace a `/mobile/inventario/:id`. |
| Cierre realizado | Nuevo cierre **confirmado/guardado**, asociado a `cierres_diarios.id`, después de completarse la operación. | Propietarios activos del mismo `negocio_id`. | Negocio, fecha local, total de ventas, efectivo, tarjeta, transferencia, otros y propinas por separado si aplica; enlace al detalle del cierre. |

**Anti-spam:** generar el evento de bajo stock una sola vez al cruzar el umbral; no notificar cada lectura ni cada actualización que permanezca ≤2. Rearmar alerta cuando el producto vuelva a >2. Dedupe por negocio, tipo de evento y evento fuente; cerrar una vez = una notificación por propietario (aunque tenga varios dispositivos se envía a cada dispositivo registrado). No enviar notificaciones de cierre a usuarios sin rol propietario.

**Fuente de datos del cierre:** usar `cierres_diarios` y/o la lógica del cierre actual. `data.summary` y `data.breakdown` existen, pero los pagos combinados requieren conciliación correcta desde `paymentSplits` cuando haga falta. **No duplicar todo el dinero** por cada palabra contenida en `pagos.method`.

### 6.2 Implementación recomendada

- PWA independiente para `/mobile/` con `manifest` (`name`, `short_name`, íconos 192/512, `start_url: "/mobile/"`, `scope: "/mobile/"`, `display: "standalone"`, `id` estable), HTTPS y Service Worker. Mantener el alcance del worker claro para no romper caches/rutas del escritorio.
- En iPhone (iOS ≥16.4), instruir «Agregar a pantalla de inicio»; pedir permiso de notificaciones **después de una acción explícita** desde la PWA instalada. En Android usar flujo compatible de instalación y permiso. Manejar `denied`, `unsupported`, `unsubscribed`, desconexión e interrupciones.
- Backend: evento persistente → `notifications` → Edge Function/webhook/cola con reintentos y deduplicación → Web Push compatible con navegadores. Evaluar Web Push estándar (VAPID) o proveedor; preferir no introducir una segunda base de datos ni una dependencia de pago sin necesidad. `Supabase Realtime` por sí solo **no** sustituye push en segundo plano.
- Registrar suscripciones **por dispositivo** y usuario/negocio (`push_subscriptions`), eliminar las caducadas, permitir revocación, almacenar estado de entrega sin marcar «recibido» únicamente por aceptar la petición de envío.
- Mantener bandeja persistente `notifications` con `read_at` y deep links. No incluir información sensible excesiva en la pantalla bloqueada; por ejemplo, puede mostrarse un resumen configurable.
- El disparador debe estar en el backend/evento confirmado; no depender de que un empleado tenga abierto el navegador. Cambios originados por escritorio y móvil deben producir el mismo evento.

### 6.3 Tablas nuevas posibles (solo si realmente faltan)

`owner_admin_pins` o equivalente seguro, `inventory_movements`, `notifications`, `push_subscriptions`, `notification_event_dedup`, `notification_preferences` y/o `mobile_admin_sessions`. Mantenerlas lo mínimo necesario. Todas las tablas expuestas requieren RLS y políticas reales de lectura/escritura por identidad y tenant. Preferir esquema privado para secretos y funciones privilegiadas.

## 7. Seguridad — BLOQUEANTE ANTES DE PUBLICAR

1. **Inicio de sesión ≠ PIN.** El usuario debe autenticarse por el mecanismo normal de Supabase Auth. La autorización debe consultar membresía **activa y `rol='propietario'`** para el negocio concreto. No confiar en `localStorage`, parámetros de ruta, `user_metadata`, un `isAdmin` de React ni el PIN como autorización autónoma.
2. **PIN adicional**, elegido por el propietario (mínimo 6 dígitos; permitir una longitud mayor), almacenado únicamente como hash fuerte adaptativo con sal (Argon2id o equivalente seguro) en servidor, nunca en texto plano ni en logs. No regresar el hash al navegador. Verificar por operación backend con límite de intentos, bloqueo progresivo, tiempos de espera y auditoría de intentos. PIN cortos **no** son contraseña principal ni MFA completo.
3. Tras verificar el PIN, emitir una autorización secundaria **de muy corta duración**, ligada a `auth.uid()`, negocio, dispositivo/sesión y propósito; verificarla en servidor para rutas administrativas y ajustes. Caducar por inactividad y exigir PIN nuevamente para cambios críticos. Nunca usar una simple marca `pinVerified=true` cliente.
4. Los datos y operaciones deben cumplir **aislamiento entre negocios** incluso si el cliente manipula un `negocio_id` de otro negocio. Ninguna clave `service_role` o clave secreta en React. Validar alcance de cada producto/cierre/movimiento y del propietario en cada operación.
5. **Hallazgo específico a revisar:** `productos_del_negocio`, `pagos_del_negocio` y `cierres_del_negocio` son políticas `ALL` para cualquier miembro activo de ese negocio. Es insuficiente para garantizar que solo el dueño pueda ejecutar acciones sensibles. Codex debe proponer controles efectivos para escritura y pruebas de regresión de caja **sin cambiar unilateralmente las políticas actuales en producción**.
6. Si se necesitan funciones `SECURITY DEFINER` para transacciones privilegiadas, mantenerlas en esquema no expuesto, con `search_path` seguro, permisos `EXECUTE` mínimos y verificación explícita de identidad/rol/tenant; no crear una función abierta para saltarse RLS.
7. Evitar exposición de inventario y montos en vistas públicas, fugas entre tenants, consultas masivas, xss, inyección, manipulación de montos y replay de ajuste. Auditoría obligatoria para cambios de stock.
8. Reset de PIN: flujo seguro con autenticación reciente/reverificación fuerte del propietario, sin permitir que un cajero o administrador cambie el PIN del dueño. Evaluar qué hacer con propietario sin PIN configurado al primer ingreso.

## 8. Orden de trabajo para Codex

**Fase 0 — Reconocer el proyecto (obligatoria).** Encontrar repositorio, ramas, scripts, rutas, estado de Auth, rol propietario, componentes existentes, cálculo de ventas y cierre, PWA actual, políticas y migraciones. Verificar qué Supabase usa ese entorno. Preparar tabla «Existe / Reutilizar / Crear». **Si no se puede leer el repositorio o determinar el proyecto real, parar y pedir la URL/acceso antes de modificar.**

**Fase 1 — Base visual móvil.** Crear rutas `/mobile/`, layout exclusivo, navegación inferior, guardas de autenticación/rol, estados de carga/error/vacío, tema consistente con Klooyd y PWA (`manifest`, iconos, Service Worker). Mantener intacta navegación del escritorio.

**Fase 2 — Ventas y cierres.** Implementar agregación correcta por día/mes, total histórico, componente gráfico, cambio de mes, historial y detalle de cierres. Validar cifras contra resultados del POS/cierres existentes, incluyendo pagos combinados.

**Fase 3 — PIN e inventario.** Implementar PIN como verificación secundaria real, lista/búsqueda/estado de productos, ajustes seguros/atómicos, registro de movimientos y protección por rol/tenant. Preparar migraciones versionadas **sin aplicarlas en remoto sin autorización**.

**Fase 4 — Notificaciones.** Implementar bandeja, suscripciones, permiso PWA, alertas de stock y cierres después del evento confirmado, deduplicación, reintento y pruebas Android/iPhone.

**Fase 5 — Pruebas y entrega.** Ejecutar lint, build, tests y revisión de seguridad; dejar manual de instalación de PWA, configuración push y pasos de despliegue; entregar reporte de archivos, migraciones propuestas y pruebas. Si hay migraciones o credenciales pendientes, implementar de manera desacoplada y enumerar lo que falta.

## 9. Criterios de aceptación

- [ ] `/mobile/` abre una UI pensada para teléfono y se puede instalar con ícono independiente; no afecta `/dashboard`.
- [ ] Propietario activo puede entrar; cajero, mesero, usuario anónimo y propietario de otro negocio no acceden a datos ajenos.
- [ ] Toda operación administrativa requiere autenticación, rol y PIN verificados **en backend**; PIN incorrecto/expirado no permite ajuste.
- [ ] Se ve la venta total histórica y gráfica por días al navegar por meses, filtrada al negocio y zona horaria, con importes conciliados.
- [ ] El cierre muestra total y desglose efectivo/tarjeta/transferencia correcto aun con pago mixto.
- [ ] Inventario lista solo productos físicos; servicios no modifican stock; añadir/restar unidades es transaccional, auditado, no negativo y sin duplicarse al reintentar.
- [ ] Stock `3→2`, `5→1`, `3→0` dispara una alerta única; `2→1` no repite; `2→4→2` puede generar una alerta nueva.
- [ ] Cada cierre confirmado dispara una sola notificación por propietario, con resumen correcto y enlace al cierre.
- [ ] Push denegado, sin internet o dispositivo no compatible no bloquea POS ni impide consultar la bandeja posteriormente.
- [ ] `prod` no recibe cambios de estructura/permisos sin revisión y aprobación; las pruebas con datos reales son de solo lectura.
- [ ] Los dos tenants distintos no pueden leer ni alterar facturas, cierres, inventario, PIN ni suscripciones del otro.

## 10. Entrega que espero de Codex

1. Resumen inicial del repositorio (qué se reutilizó y qué se creó).
2. Lista de rutas/pantallas implementadas, con capturas o instrucciones de vista previa.
3. Scripts de migración propuestos, análisis de impacto en cajeros/escritorio y plan de reversión.
4. Pruebas: construcción, lógica de ventas/pagos mixtos, PIN, RLS multi-tenant, inventario concurrente y push.
5. Variables de entorno que habría que configurar **sin escribir valores secretos en el informe**.
6. Instrucciones para instalar en Android y iPhone y lista de pasos manuales que debe hacer Kenneth.

## 11. Fuentes técnicas para contrastar durante la implementación

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase notificaciones: https://supabase.com/docs/guides/functions/examples/push-notifications
- Supabase webhooks: https://supabase.com/docs/guides/database/webhooks
- Web App Manifest y `scope`: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope
- `start_url`: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url
- Push en iOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Seguridad de secretos y PIN: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

---

**Prioridad del producto:** que el dueño abra Klooyd desde el ícono del teléfono y, en segundos, vea cómo va su negocio; que pueda reponer o ajustar existencias con seguridad y recibir cierres/alertas sin tener que abrir la app. Construir lo necesario para esta versión **sin introducir funciones fuera del alcance ni romper el sistema existente**.
