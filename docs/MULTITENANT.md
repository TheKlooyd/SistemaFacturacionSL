# Conversión a varios negocios — etapa 1

Esta etapa agrega la estructura administrativa. **Todavía no habilita el POS
para otros restaurantes.** Las tablas operativas conservan las políticas
anteriores: cualquier usuario Auth registrado puede acceder a Sabor Latino.
No crear usuarios de restaurantes nuevos hasta terminar el aislamiento completo.

## Implementado

- `negocios`: identidad y estado de cada restaurante.
- `negocio_usuarios`: membresías y rol por restaurante. Un usuario puede pertenecer
  a varios negocios; seleccionar uno no sustituirá la validación de permisos.
- `suscripciones`: estado actual del servicio por negocio, separado de `pagos`
  (que contiene las ventas del restaurante). Solo propietarios/administradores
  activos pueden leer su suscripción.
- `negocio_configuracion`: información comercial, moneda, zona horaria y reglas
  de interpretación del catálogo. Nunca guardar claves API aquí.
- `sl_private.platform_admins`: administradores de la plataforma. El esquema no
  debe añadirse a los esquemas expuestos de la Data API.
- Todas las tablas nuevas tienen RLS. Se revocan los permisos automáticos de
  escritura para `anon` y `authenticated`; solo el backend privilegiado escribe.
- Se registra Sabor Latino y su configuración básica sin asignar usuarios,
  suscripciones, privilegios de plataforma ni copiar/modificar sus registros.

No hay altas administrativas por API todavía. El futuro endpoint debe validar
el JWT, comprobar `sl_private.platform_admins.is_active` con el backend y solo
entonces ejecutar Auth Admin y las escrituras. Tener una sesión válida no basta.
Las claves de servidor nunca se entregan al frontend.

## Semántica que deberá respetar la siguiente etapa

- La membresía se comprueba en base de datos; no se autoriza mediante datos de
  `user_metadata` que el usuario pueda editar.
- Para operar se comprobarán negocio activo, membresía activa y suscripción
  activa dentro de su período. En esta etapa esas condiciones aún no se aplican
  al POS existente. La fecha final nula permite una vigencia sin límite; cualquier
  concesión de ese tipo debe ser una decisión explícita de administración.
- Una suscripción ausente/pendiente no debe dar acceso a un nuevo negocio.
- Suspender el servicio conserva la información. La política de consulta del
  historial tras suspensión debe definirse antes de activar el control del POS.
- No se promueve la cuenta actual del restaurante a administrador de plataforma.
  Falta identificar el correo que usará el propietario de la plataforma.

## Pruebas locales sin usar producción

Desde la raíz:

```sh
npm ci
npm run test:tenancy
```

PGlite ejecuta PostgreSQL en un entorno efímero con roles y datos ficticios.
Las pruebas reconstruyen el esquema base y las dos migraciones QR, agregan la
columna `productos.size` y activan las doce mesas como en la base revisada.
Verifican conservación de datos/políticas anteriores, aislamiento de metadatos
entre dos negocios, roles, denegación de escrituras y desactivación de membresías.
No prueban Supabase Auth HTTP, Edge Functions, Realtime ni el aislamiento de
productos/ventas: esos componentes siguen pendientes.

## Diferencias verificadas antes de comenzar

- La base real tiene `productos.size`, ausente del esquema base versionado.
- Las doce mesas están activas; no reproducir el seed antiguo que inactiva 9–12.
- Están registradas `qr_ordering` y `qr_session_lifecycle`.
- La Edge Function `qr-order` desplegada no admite `touch`, aunque la función SQL
  `qr_touch_session` ya existe y el frontend de `main` intenta utilizarla.
- El archivo compartido de interpretación desplegado difiere de `main`.
- `qr_set_table_active` es `SECURITY DEFINER`, ejecutable por usuarios
  autenticados, y no comprueba negocio ni rol. Requiere autorización explícita.

## Siguientes entregas

1. Alinear el esquema reproducible y las funciones desplegadas sin perder las
   correcciones QR actuales. No ejecutar `db reset` en la base real.
2. Vincular usuarios existentes a Sabor Latino y definir su suscripción antes
   de imponer permisos nuevos sobre el POS.
3. Agregar `negocio_id` a datos operativos y relaciones compuestas; separar
   número visible de mesa de ID interno y hacer cierres únicos por negocio/fecha.
4. Adaptar consultas, escrituras, pagos, QR, IA, canales privados y estado del
   frontend. Validar pertenencia también dentro de los JSON de pedidos.
5. Sustituir las políticas globales en un despliegue coordinado y comprobar
   aislamiento con dos negocios en todos los caminos de lectura/escritura.
6. Construir administración de negocios/usuarios y conectar vigencia del servicio.

La migración de esta etapa es aditiva. No volver a pegarla manualmente si ya
está registrada en Supabase: comprobar el historial antes de desplegar.

## Estado de la entrega del 12 de septiembre de 2026

Aplicada y verificada en `Sabor Latino Database` como
`20260912175120_multitenant_foundation.sql`. El archivo usa la versión asignada
por Supabase al aplicarla, para mantener alineado el historial local/remoto.
La verificación posterior conservó 226 productos, 66 clientes, 1.105 pagos,
12 mesas activas, 12 QR y el mismo hash de políticas operativas.
Las pruebas locales completaron 10 casos (11 resultados contando el contenedor).

El asesor de seguridad conserva los avisos preexistentes. El aviso informativo
de RLS sin políticas para `sl_private.platform_admins` es intencional: ningún
rol del navegador tiene acceso al esquema/tabla y solo `service_role` administra
sus filas. No agregar una política pública para eliminar ese aviso.
Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

La integración de GitHub devolvió 403 al intentar crear la rama; esta entrega
debe incorporarse al repositorio mediante la cuenta del propietario.
