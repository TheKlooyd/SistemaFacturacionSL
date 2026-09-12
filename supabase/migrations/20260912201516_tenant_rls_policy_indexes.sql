create index if not exists negocio_usuarios_user_negocio_active_idx
  on public.negocio_usuarios (user_id, negocio_id)
  where is_active = true;
