import { createClient } from "npm:@supabase/supabase-js@2.106.2";

// Only this service endpoint may set a PIN, after checking the actual password.
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  const origins = (
    Deno.env.get("MOBILE_ALLOWED_ORIGINS") ||
    "https://klooyd.com,http://localhost:5173"
  ).split(",");
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origins.includes(origin)
      ? origin
      : "https://klooyd.com",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const respond = (status: number, ok = false) =>
    new Response(JSON.stringify({ ok }), { status, headers });
  if (origin && !origins.includes(origin)) return respond(403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond(405);
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) return respond(401);
  const url = Deno.env.get("SUPABASE_URL") || "",
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verifier = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const text = await request.text();
    if (text.length > 4096) return respond(413);
    const { businessId, password, pin } = JSON.parse(text);
    if (
      typeof password !== "string" ||
      password.length > 1024 ||
      typeof pin !== "string" ||
      !/^\d{6,12}$/.test(pin) ||
      !/^[0-9a-f-]{36}$/i.test(businessId)
    )
      return respond(400);
    const {
      data: { user },
      error: identityError,
    } = await admin.auth.getUser(token);
    if (identityError || !user?.email) return respond(401);
    const { data: membership, error: membershipError } = await admin
      .from("negocio_usuarios")
      .select("negocio_id")
      .eq("user_id", user.id)
      .eq("negocio_id", businessId)
      .eq("rol", "propietario")
      .eq("is_active", true)
      .maybeSingle();
    if (membershipError || !membership) return respond(403);
    // Never accept a user ID or email supplied in the request as the identity to reset.
    const verified = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (verified.error || verified.data.user?.id !== user.id)
      return respond(403);
    const { error } = await admin.rpc("klooyd_mobile_pin_set", {
      p_user: user.id,
      p_negocio: businessId,
      p_pin: pin,
    });
    return respond(error ? 400 : 200, !error);
  } catch {
    return respond(400);
  } finally {
    await verifier.auth.signOut({ scope: "local" }).catch(() => {});
  }
});
