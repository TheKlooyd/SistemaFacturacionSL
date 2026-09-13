# Preparación final multinegocio

Base de este paquete: `23e8fde` (Publish last changes), rama
`feat/multitenant-foundation`. No incluye un merge ni despliegue del frontend.

## Cambios ya aplicados en Supabase

- Migración `20260913001347_qr_subscription_enforcement.sql` aplicada. Las seis
  funciones QR comprueban negocio activo, suscripción activa y fechas de vigencia.
  También se bloquean sesiones abiertas antes de una suspensión: no pueden tocar,
  interpretar, guardar borradores ni enviar pedidos mientras no haya acceso.
- La consulta pública de nombre/logo comprueba la misma condición. La función
  auxiliar no es ejecutable directamente por `anon` ni `authenticated`.
- Las reglas antiguas de Sabor Latino quedaron en su propia configuración, solo
  porque no había reglas configuradas. No se copiaron a Don Juan ni se sobreescriben
  reglas que ya existieran. Don Juan usa el prompt genérico y las reglas que se
  configuren desde su editor.
- `qr-order` v5: prompt genérico más reglas obtenidas por el negocio de la sesión.
- `parse-order` v11: valida la identidad y una única membresía activa; obtiene
  catálogo/reglas desde el servidor. No utiliza un catálogo ni negocio enviados
  por el cliente como fuente de autorización. Conserva el límite previo de 100
  candidatos/600 tokens de respuesta del endpoint móvil; QR conserva 40/400.
  Ambos utilizan la lógica de selección/reintento del repositorio.
- `platform-admin` v4: editar configuración y validar un manifiesto QR contra
  los hashes registrados. Todas sus acciones requieren usuario validado y acceso
  de administrador de plataforma. Una cuenta propietaria ordinaria no puede editar
  negocios a través de este endpoint.

Se comprobaron los archivos desplegados contra el código entregado. Se hicieron
pruebas HTTP sin credenciales: QR desconocido -> invalid; inicio sin sesión -> 400;
IA y administración sin autenticación -> 401. No se hicieron pedidos/cobros reales.

## Cambios del frontend incluidos

- Quitada la clave fija de Productos, Facturas y Cierre; quedan confirmaciones
  normales. La clave del navegador no era una autorización del backend. Las
  políticas de aislamiento por negocio se mantienen.
- Botón Editar negocio: nombre comercial, logo, NIT, dirección, teléfono,
  instrucciones de pago y reglas de pedidos. No permite cambiar propietario,
  membresías o estados mediante campos arbitrarios de la configuración.
- Imprimir QR inmediatamente después de crear el negocio: seis por hoja A4,
  con nombre, logo y mesa. Se puede elegir Guardar como PDF en la impresión.
- Negocios existentes: cargar su manifiesto JSON privado para imprimir. El servidor
  comprueba negocio, mesa y token. Los hashes no permiten recuperar los tokens:
  si se perdió el manifiesto, este bloque no inventa códigos ni reemplaza los
  que ya están pegados en las mesas. Haría falta una rotación explícita posterior.
- La impresión acepta la dirección de esta aplicación o su dirección conocida
  de GitHub Pages; rechaza enlaces ajenos del manifiesto. No guarda esos tokens
  nuevos en la base ni en almacenamiento local.
- La impresión conserva el nombre/logo del negocio que se acaba de crear aunque
  luego se editen los campos del formulario para crear otro negocio.

Tras editar configuración, cerrar/iniciar sesión actualiza el POS. Volver a abrir
el QR carga su identidad. Cambiar reglas no cambia los productos: cada negocio
debe tener su catálogo creado con nombres y precios correctos.

## Verificación ejecutada

34 pruebas satisfactorias, incluyendo PostgreSQL local con las migraciones reales,
política RLS real de cierres, dos negocios, sesiones activas suspendidas y todas las
variantes de fechas/estados de suscripción. Se prueban aislamiento, errores de
guardado, permiso administrativo, validación de configuración y manifiestos QR.

```sh
npm ci
npm ci --prefix frontend
npm run test:launch
npm run test:tenancy
npm run test:daily-close
npm run test:branding
npm run test:qr
npm run lint --prefix frontend
npm run build --prefix frontend
```

Lint/build satisfactorios. Sigue el aviso de bundle mayor de 500 kB. Las pruebas
de IA verifican configuración/aislamiento; no garantizan que el modelo interprete
perfectamente todos los pedidos. Probar un pedido representativo de cada catálogo.
La impresión física y la prueba visual con las cuentas reales siguen pendientes.

Los advisors de seguridad conservan los avisos conocidos: tablas exclusivamente
de servidor sin políticas de navegador, `qr_set_table_active` como SECURITY DEFINER
con validación de membresía/rol, y protección de contraseñas filtradas desactivada.
La integración no ofrece un ajuste de configuración de Auth para activar esta
última. Revisarla en el panel de Supabase, según disponibilidad del plan:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Orden de publicación

1. Copiar el paquete, hacer commit/push en la rama y verificar Actions.
2. Probar con las dos cuentas: acceso, productos, nombre/logo, cuenta, editor y
   pedidos IA. Usar una mesa de prueba acordada si se prueba enviar un QR real;
   evitar registrar cobros ficticios en el negocio en operación.
3. Publicar el frontend nuevo mediante la transición a main/GitHub Pages y esperar
   a que el despliegue termine. Recargar las pestañas con código antiguo.
4. Aplicar únicamente la migración pendiente
   `20260912234936_tenant_daily_close_uniqueness.sql` y verificar los cierres por
   negocio. Esa migración sigue SIN APLICAR: main todavía utiliza el conflicto
   global por fecha y necesita el índice temporal hasta actualizarse.

No ejecutar `supabase db push` ni todos los SQL del directorio indiscriminadamente:
la migración QR de este paquete ya está aplicada y la de cierres espera el paso 4.
No se borraron pagos, cierres, productos ni códigos QR de producción.
