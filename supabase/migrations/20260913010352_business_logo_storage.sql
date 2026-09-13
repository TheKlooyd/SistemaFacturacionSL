insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'business-logos',
  'business-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg'];

create or replace function public.platform_admin_can_manage_storage()
returns boolean
language sql
stable
security definer
set search_path = 'sl_private', 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from sl_private.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active = true
  );
$$;

revoke all
on function public.platform_admin_can_manage_storage()
from public, anon;

grant execute
on function public.platform_admin_can_manage_storage()
to authenticated;

drop policy if exists platform_admin_upload_business_logos
on storage.objects;

drop policy if exists platform_admin_update_business_logos
on storage.objects;

drop policy if exists platform_admin_delete_business_logos
on storage.objects;

create policy platform_admin_upload_business_logos
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-logos'
  and public.platform_admin_can_manage_storage()
);

create policy platform_admin_update_business_logos
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-logos'
  and public.platform_admin_can_manage_storage()
)
with check (
  bucket_id = 'business-logos'
  and public.platform_admin_can_manage_storage()
);

create policy platform_admin_delete_business_logos
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-logos'
  and public.platform_admin_can_manage_storage()
);