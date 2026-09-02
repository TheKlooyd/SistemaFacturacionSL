# Pedidos por código QR

## Qué implementa

Cada QR contiene un token aleatorio de 32 bytes y abre una URL como
`?qr=TOKEN`. La mesa se resuelve en el servidor; el navegador no puede escogerla
ni enviar precios confiables.

- Mesas 1 a 8: activas inicialmente.
- Mesas 9 a 12: creadas pero inactivas.
- Borrador QR: vence a los 20 minutos.
- Pedido enviado: bloquea la mesa hasta pagar o cerrar la orden.
- Mismo dispositivo: recupera el texto y la vista previa guardada.
- Otro dispositivo: no puede apropiarse de la sesión.
- Máximo 20 interpretaciones con Groq por sesión y una cada dos segundos.
- Pago y cierre: ocurren en una sola transacción de PostgreSQL.

El POS requiere Supabase Auth. El cliente anónimo no tiene acceso directo a las
tablas; solamente puede usar la Edge Function pública `qr-order` con un QR y un
secreto de sesión válidos.

## Antes de desplegar

1. Haga una copia de seguridad de Supabase.
2. Confirme que esta migración todavía no haya sido aplicada. Si ya ejecutó la
   versión anterior de `202608310001_qr_ordering.sql`, no vuelva a ejecutarla:
   cree una migración correctiva nueva o solicite una revisión.
3. Compruebe que no existan dos órdenes abiertas para la misma mesa:

```sql
select table_id, count(*)
from public.ordenes
where status = 'OPEN'
group by table_id
having count(*) > 1;
```

La consulta debe devolver cero filas. La migración se detiene si encuentra
duplicados y nunca borra cuentas para resolverlos automáticamente.

## Crear el usuario del personal

En Supabase Dashboard abra **Authentication > Providers** y habilite Email.
Después vaya a **Authentication > Users** y cree el primer usuario con correo y
contraseña. No habilite el registro público: cualquier usuario registrado tendría
acceso de personal al POS.

## Aplicar base de datos y funciones

Desde la raíz del repositorio, en PowerShell:

```powershell
npx supabase login
npx supabase link --project-ref lpyivecyvtivtkbppjtr
npx supabase db push
```

Si `GROQ_API_KEY` ya está configurada, no necesita volver a guardarla. Si falta:

```powershell
npx supabase secrets set GROQ_API_KEY="SU_CLAVE_GROQ" --project-ref lpyivecyvtivtkbppjtr
```

Despliegue ambas funciones:

```powershell
npx supabase functions deploy parse-order --project-ref lpyivecyvtivtkbppjtr
npx supabase functions deploy qr-order --project-ref lpyivecyvtivtkbppjtr
```

`parse-order` exige un usuario autenticado. `qr-order` permite acceso público,
pero valida el token QR, el secreto de sesión, los límites de uso y todos los
precios del lado del servidor.

`SUPABASE_SERVICE_ROLE_KEY` es administrada automáticamente por Supabase para
las Edge Functions. Nunca la copie a un archivo `.env` del frontend ni a una
variable que empiece por `VITE_`.

## Generar y registrar los 12 QR

Desde la raíz:

```powershell
npm ci
npm run generate:qr
```

Para utilizar otra URL pública:

```powershell
$env:QR_BASE_URL='https://theklooyd.github.io/SistemaFacturacionSL/'
npm run generate:qr
```

Se crea una carpeta privada `qr-output/` con:

- `mesa-01.png` a `mesa-12.png`.
- `register-qr-codes.sql`.
- `qr-manifest.json`, que permite recuperar o reimprimir los QR originales.

La carpeta está ignorada por Git. Guarde una copia privada de toda la carpeta;
no suba el manifiesto, las imágenes ni los tokens al repositorio.

Después de aplicar la migración, ejecute `register-qr-codes.sql` una sola vez en
Supabase SQL Editor. El archivo se niega a reemplazar registros existentes para
evitar generar imágenes que no coincidan con los hashes de la base de datos.

## Activar o desactivar mesas

La función actualiza la mesa y su QR en una única operación:

```sql
select public.qr_set_table_active(9, true);  -- activar mesa 9
select public.qr_set_table_active(9, false); -- desactivar mesa 9
```

No permite desactivar una mesa que tenga un borrador QR, un pedido enviado o una
orden abierta. Al activar las mesas 9 a 12, sus QR originales comienzan a
funcionar y aparecen en el POS después de actualizar la página.

## Revocar un QR perdido

No genere nuevamente los doce QR. Genere un token para esa mesa, calcule su
SHA-256, imprima el nuevo QR y actualice únicamente `token_hash` en
`mesa_qr_codes`. Haga el cambio después de tener impreso el reemplazo, porque el
QR anterior deja de funcionar inmediatamente.

## Validación local

```powershell
npm ci
npm run test:qr
Set-Location frontend
npm ci
npm run lint
npm run build
```

Las pruebas crean QR temporales fuera del repositorio y los eliminan al terminar;
ya no requieren ejecutar primero `npm run generate:qr`.

Para validar PostgreSQL y las Edge Functions localmente necesita Docker Desktop:

```powershell
npx supabase start
npx supabase db reset
npx supabase functions serve
```

## Prueba manual obligatoria

1. Inicie sesión en el POS con el usuario del personal.
2. Escanee el QR de la mesa 1 y escriba un pedido.
3. Recargue antes de enviarlo y confirme que el borrador reaparece.
4. Escanee el mismo QR desde otro teléfono y confirme el bloqueo.
5. Envíe el pedido y compruebe la notificación, la mesa y la comanda.
6. Intente escanear nuevamente: debe mostrar que la mesa está en curso.
7. Registre el pago: la orden y la sesión QR deben cerrarse juntas.
8. Escanee nuevamente y confirme que permite un pedido nuevo.
9. Pruebe una mesa 9 a 12: debe indicar que no está disponible.
10. Pruebe frases como `gaseosa grande de manzana`, `coca 1.5` y
    `agua con gas` para verificar producto y nota.

## Publicar el frontend

Cuando todo lo anterior funcione, fusione la rama con `main`. El workflow de
GitHub Pages compila `frontend/` y publica únicamente los pushes a `main`.
