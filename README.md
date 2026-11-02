# Sistema de Facturación Sabor Latino J&Y

Sistema de punto de venta para restaurantes y talleres de motos, con pedidos,
clientes, pagos, facturas y cierres diarios. El frontend está construido con
React y Vite; los datos se almacenan en Supabase.

Desde `https://klooyd.com/admin`, un administrador de plataforma puede crear negocios de tipo
restaurante o taller de motos. En Configuración, cada negocio puede personalizar
el nombre de sus estaciones y las preferencias visuales de la interfaz.

## Desarrollo local

1. Entra a `frontend`.
2. Instala las dependencias con `npm ci`.
3. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env`.
4. Inicia el proyecto con `npm run dev`.

## Comandos

- `npm run dev`: servidor local.
- `npm run build`: build de producción.
- `npm run lint`: análisis estático.
- `npm run preview`: vista previa del build.

El esquema de la base de datos está documentado en `supabase_schema.sql`.
Los cambios en `main` se publican automáticamente en GitHub Pages.

## Dominio de producción

- Aplicación: https://klooyd.com/
- Administración: https://klooyd.com/admin
- Sitemap: https://klooyd.com/sitemap.xml

El build usa la raíz `/` y genera `admin/index.html` para permitir la entrada
directa y la recarga de `/admin` en GitHub Pages. `frontend/public/CNAME`
conserva el dominio en cada publicación. Los accesos antiguos `#/admin`,
`#admin` y `?admin=1` se normalizan a `/admin`.

La portada incluye metadatos de Klooyd, URL canónica y datos estructurados;
el panel administrativo solicita no indexación. Tras publicar, se puede enviar
el sitemap y solicitar la indexación de la portada en Google Search Console.
La aparición en buscadores depende de su rastreo e indexación.

Los nuevos QR apuntan a `https://klooyd.com/`. El cambio del valor predeterminado
del servidor requiere publicar también la función `platform-admin` de Supabase.
Los QR ya impresos conservan su URL original; este ajuste no modifica sus tokens.

## Conversión a varios negocios

La primera etapa y sus límites están documentados en [docs/MULTITENANT.md](docs/MULTITENANT.md).
Las pruebas de permisos de las tablas nuevas se ejecutan desde la raíz con
`npm ci` y `npm run test:tenancy`.
