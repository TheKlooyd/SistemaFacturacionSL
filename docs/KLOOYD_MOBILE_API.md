# Contrato de Klooyd Mobile

Versión inicial; dependiente de la migración propuesta y aún no publicado.

## RPC de usuario

`POST /rest/v1/rpc/klooyd_mobile`

Headers normales de Supabase: `apikey` pública y `Authorization: Bearer <JWT>`.
No se acepta `user_id` como identidad del solicitante. El cuerpo es:

```json
{
  "p_action": "inventory",
  "p_negocio": "UUID del negocio seleccionado",
  "p_payload": {"search": "aceite", "stock": "low", "offset": 0}
}
```

Todos los accesos de negocio validan propietario activo, negocio activo y
suscripción vigente en servidor. Los importes agregados/stock se devuelven como
texto decimal para no perder precisión durante el transporte.

| Acción | Payload | Resultado |
| --- | --- | --- |
| `context` | `{}`; negocio opcional | `businesses[]` autorizados y `pinConfigured` booleano |
| `dashboard` | `month: YYYY-MM-01` | `historical`, `firstDay`, `days[{date,sales,tickets}]`, `lowStock`, `outOfStock`, `unread`, `lastClose`, `suspectedDuplicates` |
| `categories` | `{}` | Categorías del negocio `{id,name}` |
| `inventory` | `search`, `category`, `stock: all/low/empty`, `offset` | Hasta 51 filas; mostrar 50 y usar la extra para Siguiente |
| `product` | `id` | Producto físico y últimos 50 movimientos auditados |
| `closes` | `offset` | Hasta 31 cierres; mostrar 30 por página |
| `close` | `id` | ID, fecha y snapshot `data` del cierre |
| `pin_verify` | `pin`, `deviceId` UUID | `{ok,token,expiresAt}` o `{ok:false,error,retryAt?}`; un fallo conserva el contador en BD |
| `adjust` | Ver abajo | Movimiento confirmado; un reintento idéntico devuelve el mismo ID |
| `notifications` | `offset` | Hasta 51 notificaciones propias; detalle mínimo de importes para resumen de cierre |
| `mark_read` | `id` | `{ok:true}`; solo marca filas propias del negocio |
| `settings` | `{}` | Preferencias y dispositivos; nunca devuelve las claves de suscripción |
| `preferences` | `stock_enabled`, `close_enabled`, `show_details` | `{ok:true}` |
| `subscribe` | `deviceId`, `label`, `subscription` estándar Web Push | Upsert propio por negocio/dispositivo |
| `unsubscribe` | `id` de suscripción | Elimina únicamente la suscripción propia del negocio |
| `lock` | `deviceId` | Revoca autorizaciones PIN propias del negocio/dispositivo |
| `logout_device` | `deviceId`; negocio opcional | Revoca suscripciones y autorizaciones de ese usuario/dispositivo en sus negocios |

`adjust` requiere el siguiente contenido, además del JWT primario:

```json
{
  "id": "UUID del producto",
  "delta": 2,
  "expectedStock": "5.00",
  "reason": "Compra/reposición",
  "idempotencyKey": "UUID generado una sola vez para este ajuste",
  "deviceId": "UUID del dispositivo",
  "token": "autorización secundaria obtenida al verificar el PIN"
}
```

`delta` tiene hasta dos decimales, no puede ser cero y debe dar un saldo no
negativo. Se rechaza un saldo previo distinto del confirmado. El mismo
`idempotencyKey` con otro producto/delta/motivo se rechaza. No crear una clave
nueva al reintentar una respuesta perdida. No registrar PIN, contraseña ni token.

Los errores de autorización usan SQLSTATE `42501`; validaciones funcionales,
`P0001`. El cliente distingue falta de migración (`PGRST202`/`42883`) de datos
vacíos y permite reintentar fallos de conexión. El PIN incorrecto es un resultado
normal `{ok:false}`, no una excepción SQL, para que el bloqueo no se revierta.

## Configuración/recuperación del PIN

`POST /functions/v1/mobile-pin`, con JWT primario y cuerpo
`{businessId,password,pin}`. Verifica el usuario de ese JWT, comprueba membresía
y vuelve a autenticar su correo real con la contraseña. Solo si la identidad
coincide llama `klooyd_mobile_pin_set`, reservado a `service_role`.

Respuesta: `{ok:true}` al completar. Los errores no revelan cuál comprobación
de identidad/contraseña falló. Cambiar el PIN revoca todas las autorizaciones
secundarias previas de ese usuario, incluso de otros dispositivos.

## Despacho interno de push

`POST /functions/v1/mobile-push`, header `x-mobile-push-key` con el secreto del
servidor. No es un endpoint del cliente. Reclama entregas con un lease por medio
de `klooyd_mobile_push_claim` y registra el resultado con
`klooyd_mobile_push_finish`; ambos RPC son exclusivos de `service_role`.

`accepted` significa aceptación por el proveedor Web Push. Un fallo transitorio
se reintenta, 404/410 elimina la suscripción y un lease vencido se recupera.
No hay confirmación de recepción del sistema operativo. `read_at` cambia solo
cuando el usuario abre la notificación desde la bandeja.

## Evidencia de pruebas

- `scripts/mobile-database.test.mjs`: ejecuta el SQL real en PGlite con dos
  negocios y roles distintos; los sustitutos de pgcrypto están identificados.
- `scripts/mobile-math.test.mjs`: cálculos compartidos POS/móvil/dispatcher.
- `scripts/mobile-ui/mobile.spec.mjs`: contrato de respuestas sintetizado para
  ejercitar la UI real. No pretende validar Supabase Auth ni PostgREST reales.
- `scripts/mobile-local.test.mjs`: validado con Auth, Edge, PostgreSQL y bcrypt
  reales en Docker/WSL, incluyendo contención entre conexiones e idempotencia.
- `scripts/mobile-local-ui.mjs`: recorrido de navegador contra los servicios
  locales reales, sin interceptar respuestas y bloqueando destinos remotos.
- Kenneth confirmó recepción de push de stock en Android y apertura del producto.
  Confirmó también el cierre ficticio y sus importes, y otra alerta con Klooyd
  cerrado y el teléfono bloqueado. El dispatcher registró tres envíos aceptados,
  sin fallos. Guardar el mismo cierre de nuevo no duplicó su notificación.
  iPhone no fue probado.
  No hay workspace Postman ni mocks publicados. La CLI disponible no reconoce
  `postman status`; las pruebas se ejecutaron con Node, Playwright y Supabase CLI.
