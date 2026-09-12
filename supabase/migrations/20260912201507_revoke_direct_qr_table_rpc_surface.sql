-- Mantener las funciones QR públicas necesarias solo detrás de la Edge Function/service role.
-- qr_set_table_active permanece disponible a authenticated porque el panel la puede usar y valida tenant/rol internamente.
revoke all on function public.qr_start_session(text, text) from public, anon, authenticated;
revoke all on function public.qr_session_status(text) from public, anon, authenticated;
revoke all on function public.qr_touch_session(text) from public, anon, authenticated;
revoke all on function public.qr_claim_preview(text) from public, anon, authenticated;
revoke all on function public.qr_save_preview(text, text, jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.qr_submit_order(text, uuid) from public, anon, authenticated;

grant execute on function public.qr_start_session(text, text) to service_role;
grant execute on function public.qr_session_status(text) to service_role;
grant execute on function public.qr_touch_session(text) to service_role;
grant execute on function public.qr_claim_preview(text) to service_role;
grant execute on function public.qr_save_preview(text, text, jsonb, jsonb, numeric) to service_role;
grant execute on function public.qr_submit_order(text, uuid) to service_role;
