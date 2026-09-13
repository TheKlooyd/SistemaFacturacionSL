drop policy if exists platform_admin_select_business_logos
on storage.objects;

create policy platform_admin_select_business_logos
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-logos'
  and public.platform_admin_can_manage_storage()
);