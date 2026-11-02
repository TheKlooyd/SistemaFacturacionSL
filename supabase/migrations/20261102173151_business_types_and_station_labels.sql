-- Adds business types and configurable station labels.
alter table public.negocio_configuracion
  add column if not exists tipo_negocio text not null default 'restaurante'
    check (tipo_negocio in ('restaurante', 'taller_motos')),
  add column if not exists nombre_estacion_singular text not null default 'Mesa'
    check (char_length(btrim(nombre_estacion_singular)) between 1 and 40),
  add column if not exists nombre_estacion_plural text not null default 'Mesas'
    check (char_length(btrim(nombre_estacion_plural)) between 1 and 40);

grant update (
  nombre_estacion_singular,
  nombre_estacion_plural
) on public.negocio_configuracion to authenticated;

create policy configuracion_estaciones_para_administradores
  on public.negocio_configuracion
  for update to authenticated
  using (negocio_id in (
    select negocio_id
    from public.negocio_usuarios
    where user_id = (select auth.uid())
      and is_active
      and rol in ('propietario', 'administrador')
  ))
  with check (negocio_id in (
    select negocio_id
    from public.negocio_usuarios
    where user_id = (select auth.uid())
      and is_active
      and rol in ('propietario', 'administrador')
  ));

create or replace function public.platform_admin_create_business_configured(
  p_owner_user_id uuid,
  p_slug text,
  p_nombre text,
  p_plan_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_nombre_comercial text,
  p_logo_url text,
  p_nit text,
  p_direccion text,
  p_telefono text,
  p_payment_info text,
  p_timezone text,
  p_moneda text,
  p_reglas_pedidos text,
  p_table_count integer,
  p_qr_hashes jsonb,
  p_tipo_negocio text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_negocio_id uuid;
  v_singular text;
  v_plural text;
begin
  if p_tipo_negocio is null or p_tipo_negocio not in ('restaurante', 'taller_motos') then
    raise exception 'invalid business type';
  end if;

  v_singular := case p_tipo_negocio
    when 'taller_motos' then 'Estación'
    else 'Mesa'
  end;
  v_plural := case p_tipo_negocio
    when 'taller_motos' then 'Estaciones'
    else 'Mesas'
  end;

  v_result := public.platform_admin_create_business(
    p_owner_user_id,
    p_slug,
    p_nombre,
    p_plan_code,
    p_starts_at,
    p_ends_at,
    p_nombre_comercial,
    p_logo_url,
    p_nit,
    p_direccion,
    p_telefono,
    p_payment_info,
    p_timezone,
    p_moneda,
    p_reglas_pedidos,
    p_table_count,
    p_qr_hashes
  );

  v_negocio_id := (v_result ->> 'negocio_id')::uuid;

  update public.negocio_configuracion
  set tipo_negocio = p_tipo_negocio,
      nombre_estacion_singular = v_singular,
      nombre_estacion_plural = v_plural
  where negocio_id = v_negocio_id;

  update public.mesas
  set name = v_singular || ' ' || numero
  where negocio_id = v_negocio_id;

  return v_result || jsonb_build_object(
    'tipo_negocio', p_tipo_negocio,
    'nombre_estacion_singular', v_singular,
    'nombre_estacion_plural', v_plural
  );
end;
$function$;

revoke all on function public.platform_admin_create_business_configured(
  uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, text, text, text, text, integer, jsonb, text
) from public, anon, authenticated;

grant execute on function public.platform_admin_create_business_configured(
  uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, text, text, text, text, integer, jsonb, text
) to service_role;
