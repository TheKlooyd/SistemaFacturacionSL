-- Evita categorías duplicadas dentro del mismo negocio, incluso por mayúsculas/espacios.

with duplicate_map as (
  select
    c.id,
    c.negocio_id,
    first_value(c.id) over (
      partition by c.negocio_id, lower(btrim(c.name))
      order by c.id
    ) as keep_id,
    row_number() over (
      partition by c.negocio_id, lower(btrim(c.name))
      order by c.id
    ) as rn
  from public.categorias c
),
duplicates as (
  select id, negocio_id, keep_id
  from duplicate_map
  where rn > 1
)
update public.productos p
set category_id = d.keep_id
from duplicates d
where p.category_id = d.id
  and p.negocio_id = d.negocio_id;

with duplicate_map as (
  select
    c.id,
    row_number() over (
      partition by c.negocio_id, lower(btrim(c.name))
      order by c.id
    ) as rn
  from public.categorias c
)
delete from public.categorias c
using duplicate_map d
where c.id = d.id
  and d.rn > 1;

create unique index if not exists categorias_negocio_name_ci_key
  on public.categorias (negocio_id, lower(btrim(name)));
