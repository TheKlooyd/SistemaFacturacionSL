# Paso 2B: identidad de cada negocio

Base revisada: `feat/multitenant-foundation`, commit
`a682e719a7842f99743ad2b883e823b1c468e231` (Branding fix), ocho commits por delante de main.
Proyecto Supabase: `lpyivecyvtivtkbppjtr`.

## Cambios

- La cuenta en pantalla y los tickets de cuenta/factura usan nombre comercial,
  logo, NIT, dirección, teléfono e instrucciones de pago del negocio autenticado.
  Los campos vacíos se omiten; no se reutilizan los antiguos números Nequi.
- Comandas de mesa, comandas de pedidos móviles y cierres impresos identifican
  el negocio. Se conserva el cálculo existente de importes en COP.
- Si un logo de pantalla falla, se usa el de la plataforma. La impresión espera
  hasta cinco segundos a las imágenes; si fallan, imprime el nombre y el resto
  del comprobante sin la imagen. Los textos configurables se escapan como HTML.
- El QR público consulta la nueva acción `info` antes de comenzar. El backend
  obtiene el negocio a partir del hash del código válido y devuelve solamente
  nombre y logo; no acepta un negocio elegido por el navegador y no abre sesiones
  con esta consulta. La identidad pública no depende de la sesión del POS.
- La clave nueva de almacenamiento es `pos-qr-session:<token>`. Se conserva la
  lectura de la antigua para restaurar borradores; se retira solo después de
  guardar correctamente la nueva. Cambiar de QR reinicia el estado en memoria.
- El formulario de CREACIÓN de negocios muestra URL del logo e instrucciones de
  pago (máximo 500 caracteres). El backend administrativo ya admitía esos campos.
  Este bloque no añade edición de configuración para negocios existentes.

## Estado real de Supabase

`qr-order` está desplegada y activa en versión 4. Mantiene `verify_jwt = false`,
como antes, porque los clientes del QR no inician sesión en Supabase Auth: los
secretos de QR y sesión siguen siendo sus credenciales. Las dependencias de IA
se conservaron. No se modificaron esquemas, RLS, cuentas ni datos comerciales.

Se recuperaron del historial de Supabase cuatro migraciones YA APLICADAS por el
trabajo anterior y ausentes de GitHub:

- `20260912223037_legacy_frontend_tenant_defaults.sql`
- `20260912223059_legacy_frontend_tenant_defaults_uuid_fix.sql`
- `20260912223226_legacy_uuid_aggregate_rpc_fix.sql`
- `20260912223314_temporary_legacy_daily_close_compatibility.sql`

Se guardan con sus versiones y contenido histórico. No volver a ejecutarlas
manualmente en este proyecto; no son migraciones nuevas del paso 2B.

En la configuración revisada, Sabor Latino conserva su nombre/logo y Don Juan
tiene el nombre comercial `Empanadinhas` y el logo genérico. Ambos tienen las
instrucciones de pago vacías: por ello no aparecerá ningún número de pago.
Para cambiar un negocio existente, por ahora se editan sus campos en la fila
correcta de `negocio_configuracion`, identificada por `negocio_id`; no hay aún
editor en el panel. Recargar/iniciar sesión de nuevo actualiza la configuración
del POS; volver a abrir el QR carga su identidad actual.

## Verificación

Ejecutadas satisfactoriamente:

```sh
npm ci
npm run test:tenancy
npm run test:branding
npm run test:qr
npm ci --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

La suite de branding comprueba dos negocios, ausencia de datos heredados,
campos escapados, URLs de logo, migración de borradores, consultas QR limitadas
al negocio del código y espera de imágenes antes de imprimir. La suite de
tenancy existente verifica la fundación y sus políticas, no todas las migraciones
operativas posteriores. Se actualizó una expresión regular antigua de la suite
QR para aceptar los saltos de línea actuales de `App.jsx`.

Se comprobó el código desplegado contra los archivos y se probaron solicitudes
HTTP reales: código desconocido -> 200/invalid; código corto, inicio sin sesión
y JSON nulo -> 400. No se abrieron pedidos reales para hacer estas pruebas.
La compilación avisa del tamaño del bundle (>500 kB), sin errores de build.

Pendiente manual: comprobar el QR válido de cada negocio y la impresión física.
El navegador de esta sesión no permitió abrir la aplicación local; no se da por
validada visualmente la interfaz ni el flujo completo de venta en producción.

## Próximo bloque antes de escalar

Sigue vigente `cierres_diarios_date_iso_legacy_key`, un índice único global por
`date_iso` añadido como compatibilidad temporal. Impide que dos negocios guarden
cierres el mismo día. La rama ya usa `onConflict: negocio_id,date_iso`, pero hay
que coordinar la retirada del índice con la transición de las instalaciones
que sigan utilizando el frontend antiguo. También debe revisarse la propagación
de errores de `saveDailyClose`, que actualmente registra el error sin lanzarlo.

La recuperación de esa migración registra el estado existente, no recomienda
mantener esa restricción en la arquitectura final. Este bloque 2B completa la
identidad visual; no declara listo todo el sistema para producción multinegocio.
