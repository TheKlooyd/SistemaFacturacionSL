# Pedidos QR

## Arquitectura

El QR contiene un token aleatorio de 32 bytes y abre `?qr=TOKEN`. El navegador nunca recibe un numero de mesa desde la URL ni puede elegirlo. `qr-order` calcula SHA-256 del QR y del secreto de sesion, consulta las tablas protegidas usando `SUPABASE_SERVICE_ROLE_KEY`, carga el catalogo real y ejecuta las mismas reglas de Groq exportadas por `parse-order`. La vista previa y el total se almacenan en el servidor; `submit` inserta la misma fila `ordenes` usada por el POS.

Las sesiones duran 20 minutos desde su creacion. Un indice parcial y bloqueos `FOR UPDATE` hacen que solo haya un borrador o pedido QR activo por mesa. El envio conserva una clave de idempotencia. Un trigger cierra la sesion QR cuando el POS borra la orden abierta tras un pago, por lo que el QR vuelve a estar disponible sin una segunda llamada del navegador.

`draft`, `submitted`, `closed` y `expired` son los estados implementados. `draft_elsewhere`, `occupied` e `invalid` son respuestas publicas de la funcion, no estados persistidos.

## Archivos

Nuevos: `supabase/migrations/202608310001_qr_ordering.sql`, `supabase/functions/qr-order/index.ts`, `supabase/functions/_shared/groqOrder.ts`, `supabase/config.toml`, `frontend/src/CustomerQrOrderView.jsx`, `frontend/src/StaffAuthGate.jsx`, `frontend/src/qrOrderApi.js`, `scripts/generate-qr-codes.mjs` y este documento.

Modificados: `frontend/src/App.jsx`, `frontend/src/TableOrder.jsx`, `frontend/src/tablesStore.js`, `frontend/src/App.css`, `supabase/functions/parse-order/index.ts`, `.gitignore`, `package.json` y `frontend/package.json`.

## Despliegue Manual

No ejecute estos comandos contra produccion sin revisar primero la migracion y tener una copia de seguridad.

```powershell
npx supabase login
npx supabase link --project-ref lpyivecyvtivtkbppjtr
npx supabase db push
npx supabase secrets set GROQ_API_KEY="SU_CLAVE_GROQ" --project-ref lpyivecyvtivtkbppjtr
npx supabase functions deploy parse-order --project-ref lpyivecyvtivtkbppjtr
npx supabase functions deploy qr-order --project-ref lpyivecyvtivtkbppjtr
Set-Location frontend
npm ci
npm run lint
npm run build
```

`SUPABASE_SERVICE_ROLE_KEY` es un secreto administrado por Supabase para Edge Functions. Confirme en Dashboard > Edge Functions > Secrets que existe y nunca lo coloque en `VITE_*`. El frontend solamente conserva `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Para publicar GitHub Pages, use el flujo ya configurado del repositorio despues de `npm run build`; Vite ya usa `/SistemaFacturacionSL/` como base. No incluya `qr-output/` en ese despliegue.

## Personal Y RLS

En Supabase Dashboard abra Authentication > Providers y habilite Email. En Authentication > Users cree el primer usuario con correo y contrasena. Sin `?qr`, la aplicacion solicita esa sesion. La migracion elimina las politicas `allow_all_*` y da acceso a `authenticated`; por tanto, cada usuario creado en Auth es personal autorizado. No habilite registro publico si no desea que cualquier correo pueda crear una cuenta.

## Generar E Instalar QR

Desde la raiz:

```powershell
npm install
npm run generate:qr
```

Para otra URL publica use `QR_BASE_URL`, por ejemplo: `$env:QR_BASE_URL='https://theklooyd.github.io/SistemaFacturacionSL/'; npm run generate:qr`.

El script se niega a sobrescribir `qr-output/`. Genera `mesa-01.png` a `mesa-12.png` y `register-qr-codes.sql`; estos archivos, URLs y tokens estan ignorados por Git. Imprima los PNG sin copiar el token a documentos publicos. Ejecute el SQL local generado solamente despues de aplicar la migracion. Sus hashes insertan mesas 1-8 activas y 9-12 inactivas.

Para activar o desactivar una mesa sin regenerar QR:

```sql
update public.mesa_qr_codes set is_active = true where mesa_number = 9;
update public.mesas set is_active = true where id = 9;
-- Desactive solo una mesa sin orden abierta:
update public.mesa_qr_codes q set is_active = false
where q.mesa_number = 9 and not exists (select 1 from public.ordenes o where o.table_id = q.mesa_id::text and o.status = 'OPEN');
update public.mesas set is_active = false where id = 9;
```

Para revocar un QR, genere un token nuevo fuera del repositorio, calcule SHA-256 y actualice `mesa_qr_codes.token_hash` para una sola mesa. Imprima el nuevo PNG antes de invalidar el anterior. No desactive una mesa ocupada: cobre o cierre la orden primero.

## Pruebas Y Recuperacion

Pruebe QR valido/invalido, una mesa inactiva, borrador en el mismo y otro dispositivo, vencimiento de 20 minutos, vista previa con producto inexistente, doble envio, pago desde POS y un nuevo escaneo. Verifique tambien que anon no puede consultar tablas desde SQL/API y que un usuario Auth si opera el POS. Las mesas 9-12 aparecen despues de activarlas y actualizar el POS.

Para una sesion atascada, primero confirme que no existe una `ordenes` abierta para la mesa. Luego cierre explicitamente la sesion, conservando auditoria: `update public.qr_sessions set status='closed', closed_at=now() where id='UUID' and status in ('draft','submitted');`. Para un borrador, espere 20 minutos o marque `expired`. No borre pagos, ordenes historicas ni QR para liberar una mesa.

No hay Docker/Podman en el equipo que implemento este cambio, por lo que `supabase db lint --local` y `supabase functions serve` requieren instalar Docker Desktop y ejecutar `npx supabase start` antes de la validacion local. La migracion no fue aplicada ni desplegada automaticamente.