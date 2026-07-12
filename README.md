# Sistema de Facturación Sabor Latino J&Y

Sistema de punto de venta para administrar mesas, pedidos, clientes, pagos,
facturas y cierres diarios. El frontend está construido con React y Vite; los
datos se almacenan en Supabase.

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
