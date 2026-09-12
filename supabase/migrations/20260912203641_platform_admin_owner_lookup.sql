create or replace function public.platform_admin_owner_for_business(p_negocio_id uuid)
returns uuid
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select nu.user_id
  from public.negocio_usuarios nu
  where nu.negocio_id = p_negocio_id
    and nu.rol = 'propietario'
    and nu.is_active = true
  order by nu.created_at asc
  limit 1;
$$;

revoke all on function public.platform_admin_owner_for_business(uuid) from public, anon, authenticated;
grant execute on function public.platform_admin_owner_for_business(uuid) to service_role;
