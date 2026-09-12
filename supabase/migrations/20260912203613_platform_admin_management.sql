create or replace function public.platform_admin_is_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'sl_private', 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from sl_private.platform_admins pa
    where pa.user_id = p_user_id
      and pa.is_active = true
  );
$$;

revoke all on function public.platform_admin_is_user(uuid) from public, anon, authenticated;
grant execute on function public.platform_admin_is_user(uuid) to service_role;

create or replace function public.platform_admin_create_business(
  p_owner_user_id uuid,
  p_slug text,
  p_nombre text,
  p_plan_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_nombre_comercial text,
  p_nit text,
  p_direccion text,
  p_telefono text,
  p_timezone text,
  p_moneda text,
  p_reglas_pedidos text,
  p_table_count integer,
  p_qr_hashes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_negocio public.negocios%rowtype;
  v_mesa_id integer;
  v_qr_hash text;
  v_index integer;
begin
  if p_owner_user_id is null then
    raise exception 'owner user is required';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid business slug';
  end if;

  if p_nombre is null or char_length(btrim(p_nombre)) not between 1 and 160 then
    raise exception 'invalid business name';
  end if;

  if p_table_count is null or p_table_count not between 1 and 12 then
    raise exception 'table count must be between 1 and 12';
  end if;

  if jsonb_typeof(p_qr_hashes) <> 'array'
     or jsonb_array_length(p_qr_hashes) <> p_table_count then
    raise exception 'one QR hash is required for each table';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_qr_hashes) value
    where value !~ '^[a-f0-9]{64}$'
  ) then
    raise exception 'invalid QR hash';
  end if;

  if (
    select count(distinct value)
    from jsonb_array_elements_text(p_qr_hashes) value
  ) <> p_table_count then
    raise exception 'QR hashes must be unique';
  end if;

  if p_ends_at is not null and (p_starts_at is null or p_ends_at <= p_starts_at) then
    raise exception 'invalid subscription dates';
  end if;

  insert into public.negocios(slug, nombre, estado)
  values (p_slug, btrim(p_nombre), 'activo')
  returning * into v_negocio;

  insert into public.negocio_usuarios(negocio_id, user_id, rol, is_active)
  values (v_negocio.id, p_owner_user_id, 'propietario', true);

  insert into public.suscripciones(
    negocio_id, plan_code, estado, starts_at, ends_at
  ) values (
    v_negocio.id,
    coalesce(nullif(btrim(p_plan_code), ''), 'manual'),
    'activa',
    coalesce(p_starts_at, now()),
    p_ends_at
  );

  insert into public.negocio_configuracion(
    negocio_id,
    nombre_comercial,
    nit,
    direccion,
    telefono,
    timezone,
    moneda,
    reglas_pedidos
  ) values (
    v_negocio.id,
    coalesce(nullif(btrim(p_nombre_comercial), ''), btrim(p_nombre)),
    nullif(btrim(p_nit), ''),
    nullif(btrim(p_direccion), ''),
    nullif(btrim(p_telefono), ''),
    coalesce(nullif(btrim(p_timezone), ''), 'America/Bogota'),
    coalesce(nullif(upper(btrim(p_moneda)), ''), 'COP'),
    coalesce(p_reglas_pedidos, '')
  );

  for v_index in 1..p_table_count loop
    insert into public.mesas(
      negocio_id, numero, name, status, is_active
    ) values (
      v_negocio.id, v_index, 'Mesa ' || v_index, 'FREE', true
    ) returning id into v_mesa_id;

    v_qr_hash := p_qr_hashes ->> (v_index - 1);

    insert into public.mesa_qr_codes(
      negocio_id, mesa_id, mesa_number, token_hash, is_active
    ) values (
      v_negocio.id, v_mesa_id, v_index, v_qr_hash, true
    );
  end loop;

  return jsonb_build_object(
    'negocio_id', v_negocio.id,
    'slug', v_negocio.slug,
    'nombre', v_negocio.nombre,
    'table_count', p_table_count
  );
end;
$function$;

revoke all on function public.platform_admin_create_business(
  uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, text, text, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.platform_admin_create_business(
  uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, text, text, integer, jsonb
) to service_role;
