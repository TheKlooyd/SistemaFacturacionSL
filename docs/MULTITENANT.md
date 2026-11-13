# Conversión a varios negocios — etapa 1

La plataforma admite varios negocios y valida el negocio, la membresía y la
suscripción activa al iniciar una sesión del POS. Las altas se realizan desde
`https://klooyd.com/admin`, reservado a administradores de plataforma; no crear cuentas de negocio
por inserciones manuales ni exponer credenciales privilegiadas al navegador.

## Implementado

- `negocios`: identidad y estado de cada negocio.
- `negocio_usuarios`: membresías y rol por restaurante. Un usuario puede pertenecer
  a varios negocios; seleccionar uno no sustituirá la validación de permisos.
- `suscripciones`: estado actual del servicio por negocio, separado de `pagos`
  (que contiene las ventas del restaurante). Solo propietarios/administradores
  activos pueden leer su suscripción.
- `negocio_configuracion`: información comercial, tipo de negocio, moneda, zona
  horaria, reglas de interpretación y nombres singular/plural de las estaciones.
  Nunca guardar claves API aquí. Los restaurantes usan Mesa/Mesas por defecto y
  los talleres de motos Estación/Estaciones.
- `sl_private.platform_admins`: administradores de la plataforma. El esquema no
  debe añadirse a los esquemas expuestos de la Data API.
- Todas las tablas nuevas tienen RLS. Las escrituras administrativas pasan por
  el backend; propietario y administrador solo pueden modificar las dos columnas
  de nombre de estación permitidas.
- Se registra Sabor Latino y su configuración básica sin asignar usuarios,
  suscripciones, privilegios de plataforma ni copiar/modificar sus registros.

El endpoint administrativo valida el JWT y comprueba
`sl_private.platform_admins.is_active` antes de crear el usuario propietario y
el negocio. El formulario permite Restaurante y Taller de motos; cada tipo elige
su icono y sus nombres iniciales de estación. El POS permite cambiar los nombres
en Configuración, mientras que los colores y el tamaño de letra se guardan en el
navegador. Tener una sesión válida no basta para usar la administración.
Las claves de servidor nunca se entregan al frontend.

## Seguridad y operación

- La membresía se comprueba en base de datos; no se autoriza mediante datos de
  `user_metadata` que el usuario pueda editar.
- El POS comprueba negocio activo, membresía activa y suscripción activa dentro
  de su período. La fecha final nula permite una vigencia sin límite; cualquier
  concesión de ese tipo debe ser una decisión explícita de administración.
- Una suscripción ausente/pendiente no debe dar acceso a un nuevo negocio.
- Suspender el servicio conserva la información. La política de consulta del
  historial tras suspensión debe definirse antes de activar el control del POS.
- No se promueve la cuenta actual del restaurante a administrador de plataforma.
  Falta identificar el correo que usará el propietario de la plataforma.

Antes de habilitar los nuevos tipos en producción, aplique
`20261102173151_business_types_and_station_labels.sql` y despliegue las Edge
Functions junto con el frontend. La migración es aditiva; no la ejecute de nuevo
si ya aparece en el historial de Supabase.
El despliegue de GitHub Pages actualiza solo el frontend: publique también
`platform-admin` cuando cambie su código. Una versión antigua de esa función
ignora el tipo seleccionado y registra los negocios nuevos como restaurantes;
los negocios ya creados requieren corregir su tipo individualmente.

## Pruebas locales sin usar producción

Desde la raíz:

```sh
npm ci
npm run test:tenancy
npm run test:launch
```

PGlite ejecuta PostgreSQL en un entorno efímero con roles y datos ficticios.
`test:tenancy` verifica la fundación multinegocio y `test:launch` ejecuta la
cadena de migraciones y prueba los tipos de negocio, permisos de configuración,
QR y controles administrativos. Estas pruebas no conectan con producción.

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
6. Mantener la administración de negocios y extender su lista de tipos cuando
   se incorporen nuevas categorías.

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
