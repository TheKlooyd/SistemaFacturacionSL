# Optimización — 16 de septiembre de 2026

Base: main, commit 32de9f2 (Print button). Se conservan los cambios recientes de colores, impresión, logos y cierres. La antigua rama multitenant ya no es la base adecuada para esta entrega.

## Evidencia y alcance

- Supabase contiene 229 productos entre los negocios. La consulta de productos filtrada por negocio registra 333 llamadas, media 1,930 ms y máximo 14,323 ms en pg_stat_statements al revisar. Son tiempos de ejecución SQL acumulados, NO latencia del navegador ni mediciones de la conexión del restaurante. No prueban ausencia de problemas puntuales de infraestructura.
- TableOrder esperaba categorías, productos, clientes y cuenta en un único Promise.all. Una consulta lenta de clientes retrasaba todo el catálogo.
- El bundle inicial cargaba administración, reportes, móvil y QR sin importar qué pantalla se utilizara.
- No encontramos módulos de frontend sin referencias directas. Los tres recursos de public están en uso. El logo saborlatinologo.png ocupa aproximadamente 968 KiB; una versión de logo más ligera sería una mejora adicional para visitas sin caché. No se modificó su aspecto en esta entrega.

## Cambios incluidos

1. Clientes se cargan de forma independiente. Catálogo y cuenta se siguen esperando juntos antes de permitir operaciones, para no sobrescribir una cuenta existente mientras carga.
2. Mensajes de carga y error al abrir una mesa. Los errores de catálogo/cuenta ya no habilitan una cuenta aparentemente vacía. Resultados tardíos se ignoran después de abandonar la mesa.
3. Productos, categorías y clientes solicitan solo columnas utilizadas; se conservan filtros negocio_id y RLS.
4. Se comparten lecturas simultáneas de productos/categorías del mismo negocio. No se guardan resultados completados ni precios persistentes: cada apertura posterior consulta nuevamente al servidor. Las lecturas posteriores a cambios fuerzan una solicitud nueva.
5. Administración, reportes, facturas, clientes, productos, móvil y QR se cargan a demanda. La primera apertura de esas pantallas muestra Cargando pantalla mientras descarga su código.
6. Eliminación de dos índices redundantes, ya aplicada y verificada en Supabase. Se conservan los índices UNIQUE equivalentes y todas las filas, políticas y restricciones.

## Medidas reproducibles

Mismo lockfile y Vite 7.3.1, build antes/después:

| Medida | Antes | Después |
|---|---:|---:|
| JavaScript inicial minificado | 561,21 KB | 472,31 KB |
| JavaScript inicial gzip estimado por Vite | 161,95 KB | 135,30 KB |
| JSON agregado de filas de productos, columnas completas/seleccionadas | 50.417 bytes | 38.509 bytes |

El último valor se calculó con row_to_json sobre los 229 productos: aproxima la reducción de datos (23,6 %), no es una medición HTTP ni corresponde al catálogo de un solo negocio. Los módulos diferidos se descargan cuando hacen falta: no se ha eliminado su funcionalidad.

## Base de datos

Migración aplicada: 20260916181545_remove_verified_duplicate_indexes.sql.
Elimina mesas_negocio_numero_idx y cierres_diarios_negocio_fecha_idx.
Conserva mesas_negocio_numero_key y cierres_diarios_negocio_date_iso_key, índices únicos válidos con las mismas columnas, orden, collation y opclasses.
No volver a ejecutar manualmente en este proyecto. El archivo se entrega para sincronizar el historial del repositorio y reconstruir otros entornos.

Los avisos de índices sin uso bajaron de 9 a 7. No se eliminaron los restantes solo por tener pocas estadísticas. La limpieza reduce mantenimiento duplicado en escrituras; no se atribuye a ella una mejora de segundos en el catálogo.
Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Archivos que pueden retirarse

No hace falta borrar código de frontend. ARCHIVOS.json en la raíz es el inventario de una entrega anterior: se puede borrar opcionalmente, pero no afecta el rendimiento. No borrar package-lock.json, migraciones, tests, configuración ni imágenes en uso. node_modules y frontend/dist son generados localmente; borrarlos no acelera la aplicación publicada y exige regenerarlos. Documentación e historial de migraciones no se envían como JavaScript al navegador.

## Crecimiento a más restaurantes

Compartir base no implica que cada cliente descargue los productos de todos. Las consultas filtran negocio_id y las políticas mantienen el aislamiento. Sí comparten CPU, memoria, disco y capacidad de conexiones; suficiente tráfico concurrente puede afectar a todos.

Prioridades:
- Conservar filtros por negocio y medir consultas reales antes de añadir índices. Hay índices para negocio_id en productos y categorías; con tablas pequeñas un recorrido secuencial puede ser correcto.
- Medir latencia p50/p95 de peticiones reales, errores, CPU, memoria y conexiones durante horas de servicio. Comparar primer acceso y aperturas repetidas.
- Antes de acumular mucho historial, paginar facturas y filtrar reportes por fecha en el servidor. Actualmente loadPayments descarga historial con el límite del API; merece una revisión funcional separada para evitar truncamientos y mantener correctos los totales del cierre. No se cambió contabilidad en este paquete.
- Aumentar recursos cuando las métricas lo justifiquen. Separar bases por negocio solo para casos que requieran aislamiento de recursos o clientes grandes; no es requisito por añadir unos pocos restaurantes y aumenta administración/migraciones.
Referencia: https://supabase.com/docs/guides/database/query-optimization

## Verificación

36 pruebas existentes y de solicitudes simultáneas pasaron en conjunto; se añadió y pasó además una prueba de la migración en PostgreSQL local (PGlite), incluyendo conservación de datos, unicidad, repetición y rechazo si faltan índices sustitutos. Total: 37 pruebas. ESLint, build y git diff --check correctos. La nueva prueba está incluida en CI.
No se probó una venta real, impresora ni el navegador del restaurante. No se publicaron estos archivos en GitHub desde esta sesión.

Después del despliegue: abrir/cerrar mesas, verificar cuentas previas y precios, editar un producto y reabrirlo, probar clientes de domicilio, facturas, cierre y administración. Entrar con cada negocio y verificar su catálogo. Si persiste demora, en F12 > Network comparar duración de productos/categorias/ordenes/clientes, TTFB y descarga; no compartir tokens ni encabezados Authorization.
