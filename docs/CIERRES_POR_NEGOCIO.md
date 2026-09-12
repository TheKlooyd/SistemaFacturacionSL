# Cierres diarios por negocio — transición preparada

Base: `af248880bec1112b9053b596b25ea51ec91c44f0`, rama
`feat/multitenant-foundation`.

## Problema y solución

La tabla ya tiene unicidad por `(negocio_id, date_iso)` y políticas RLS que
restringen cada cierre a una membresía activa del negocio. Sin embargo, el índice
temporal `cierres_diarios_date_iso_legacy_key` también exige una fecha única en
toda la tabla. Ese índice hace fallar el segundo negocio que cierre el mismo día.

La nueva migración `tenant_daily_close_uniqueness` conserva la unicidad por
negocio/fecha y elimina únicamente el índice temporal global. No borra filas,
no cambia RLS y no modifica importes ni históricos. Está probada pero **NO
APLICADA en Supabase**.

La aplicación ahora solicita la fila guardada a Supabase y solo confirma el
cierre cuando la recibe. Propaga los errores de escritura/lectura al reporte,
distingue una consulta fallida de un día sin cierre, bloquea guardados repetidos
y evita que una respuesta tardía de otra fecha reemplace los datos actuales.
El reporte también exige que la lectura de pagos termine sin error antes de
permitir generar/imprimir. Las demás pantallas conservan el comportamiento
anterior de `loadPayments()`.

## Orden obligatorio de transición

1. Subir estos archivos a `feat/multitenant-foundation` y comprobar Actions.
2. Probar el frontend nuevo con los negocios existentes (incluido el branding
   del bloque anterior). Mientras siga el índice global, el segundo cierre del
   mismo día todavía puede fallar: es la restricción pendiente, no un despliegue
   completo del arreglo.
3. Publicar la versión multinegocio y comprobar que terminó el despliegue. El
   workflow actual publica `gh-pages` solo después de un push a `main`.
4. Cerrar/recargar las pestañas que todavía ejecuten la versión antigua.
5. Aplicar la migración nueva en Supabase y comprobar los índices, la conservación
   de los históricos y un cierre controlado de cada negocio para la misma fecha.

**No ejecutar SQL ni `supabase db push` antes del paso 5.** El `main` revisado
todavía usa `onConflict: date_iso`; quitar el índice ahora rompería ese guardado.
El frontend nuevo usa `onConflict: negocio_id,date_iso` y funciona con el índice
temporal presente para las fechas sin conflicto entre negocios.

Este paquete no hace merge, no publica el sitio y no modifica la base activa.
Una vez que haya cierres de distintos negocios para la misma fecha, no se puede
reponer el índice global sin conflictos. Una reversión del frontend debe conservar
el guardado por negocio; no debe borrar cierres para volver al código antiguo.

## Pruebas ejecutadas

```sh
npm ci
npm run test:daily-close
npm ci --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

La prueba de PostgreSQL local reproduce primero el fallo del índice global.
Luego aplica la migración y verifica: históricos intactos, dos negocios con la
misma fecha, actualización sin duplicar el cierre, lectura aislada, escritura/
borrado cruzados bloqueados, membresía desactivada sin acceso y migración repetible.
Utiliza la política real `cierres_del_negocio` de la migración del repositorio.

La prueba del store ejecuta el módulo real con respuestas de Supabase simuladas:
negocio obtenido de la sesión, conflicto por negocio/fecha, fechas inválidas,
propagación de errores de red y rechazo de respuestas sin confirmación.

Pruebas y lint sin errores; build satisfactorio con el aviso existente de bundle
mayor de 500 kB. No se crearon cobros ni cierres de prueba en producción. La prueba
visual y la verificación posterior a la migración en producción quedan pendientes
del despliegue coordinado.
