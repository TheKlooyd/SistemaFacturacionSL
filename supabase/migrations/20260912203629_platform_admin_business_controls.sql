create or replace function public.platform_admin_set_business_access(
  p_negocio_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_business_state text;
  v_subscription_state text;
begin
  if p_negocio_id is null or p_active is null then
    raise exception 'business id and active state are required';
  end if;

  v_business_state := case when p_active then 'activo' else 'suspendido' end;
  v_subscription_state := case when p_active then 'activa' else 'suspendida' end;

  update public.negocios
  set estado = v_business_state
  where id = p_negocio_id;

  if not found then
    raise exception 'business not found';
  end if;

  update public.suscripciones
  set estado = v_subscription_state,
      starts_at = case
        when p_active then coalesce(starts_at, now())
        else starts_at
      end
  where negocio_id = p_negocio_id;

  return jsonb_build_object(
    'negocio_id', p_negocio_id,
    'estado', v_business_state,
    'suscripcion_estado', v_subscription_state
  );
end;
$function$;

revoke all on function public.platform_admin_set_business_access(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.platform_admin_set_business_access(uuid, boolean)
to service_role;
