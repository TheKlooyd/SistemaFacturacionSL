import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function cleanText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return reply({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return reply({ error: "El servicio no está configurado." }, 500);
  }

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!token) return reply({ error: "Sesión requerida." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return reply({ error: "Sesión inválida." }, 401);

  const { data: isAdmin, error: adminCheckError } = await admin.rpc(
    "platform_admin_is_user",
    { p_user_id: user.id },
  );
  if (adminCheckError) {
    console.error("platform admin check failed", adminCheckError.message);
    return reply({ error: "No fue posible validar el acceso." }, 500);
  }
  if (!isAdmin) return reply({ error: "No tienes acceso a la administración." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "status";

  try {
    if (action === "status") {
      return reply({
        ok: true,
        admin: {
          id: user.id,
          email: user.email,
        },
      });
    }

    if (action === "list_businesses") {
      const { data, error } = await admin
        .from("negocios")
        .select(`
          id,
          slug,
          nombre,
          estado,
          created_at,
          suscripciones(plan_code,estado,starts_at,ends_at),
          negocio_configuracion(nombre_comercial,logo_url,nit,direccion,telefono,payment_info,timezone,moneda,reglas_pedidos),
          negocio_usuarios(user_id,rol,is_active)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const businesses = await Promise.all((data || []).map(async (business) => {
        const memberships = Array.isArray(business.negocio_usuarios)
          ? business.negocio_usuarios
          : [];
        const ownerMembership = memberships.find(
          (membership) => membership.rol === "propietario" && membership.is_active,
        ) || null;

        let ownerEmail: string | null = null;
        if (ownerMembership?.user_id) {
          const { data: ownerData } = await admin.auth.admin.getUserById(
            ownerMembership.user_id,
          );
          ownerEmail = ownerData?.user?.email || null;
        }

        return {
          id: business.id,
          slug: business.slug,
          nombre: business.nombre,
          estado: business.estado,
          created_at: business.created_at,
          suscripcion: firstRelation(business.suscripciones),
          configuracion: firstRelation(business.negocio_configuracion),
          propietario: ownerMembership
            ? { user_id: ownerMembership.user_id, email: ownerEmail }
            : null,
        };
      }));

      return reply({ ok: true, businesses });
    }

    if (action === "create_business") {
      const payload = body.business && typeof body.business === "object"
        ? body.business as Record<string, unknown>
        : {};

      const nombre = cleanText(payload.nombre);
      const requestedSlug = cleanText(payload.slug, 120);
      const slug = slugify(requestedSlug || nombre);
      const ownerEmail = cleanText(payload.ownerEmail, 254).toLowerCase();
      const ownerPassword = typeof payload.ownerPassword === "string"
        ? payload.ownerPassword
        : "";
      const planCode = cleanText(payload.planCode, 80) || "manual";
      const tableCount = Number(payload.tableCount ?? 12);
      const endsAt = cleanText(payload.endsAt, 64) || null;
      const qrBaseUrlText = cleanText(payload.qrBaseUrl, 500)
        || "https://theklooyd.github.io/SistemaFacturacionSL/";

      if (!nombre || !slug) {
        return reply({ error: "Nombre y slug del negocio son obligatorios." }, 400);
      }
      if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) {
        return reply({ error: "El correo del propietario no es válido." }, 400);
      }
      if (ownerPassword.length < 8 || ownerPassword.length > 128) {
        return reply({ error: "La contraseña temporal debe tener entre 8 y 128 caracteres." }, 400);
      }
      if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 12) {
        return reply({ error: "La cantidad de mesas debe estar entre 1 y 12." }, 400);
      }

      let qrBaseUrl: URL;
      try {
        qrBaseUrl = new URL(qrBaseUrlText);
        if (!["http:", "https:"].includes(qrBaseUrl.protocol)) {
          throw new Error("invalid protocol");
        }
      } catch {
        return reply({ error: "La URL base para los QR no es válida." }, 400);
      }

      const { data: createdUserData, error: createUserError } =
        await admin.auth.admin.createUser({
          email: ownerEmail,
          password: ownerPassword,
          email_confirm: true,
          user_metadata: { business_name: nombre, role: "propietario" },
        });

      if (createUserError || !createdUserData.user) {
        const message = createUserError?.message || "No se pudo crear el usuario propietario.";
        const duplicate = /already|registered|exists/i.test(message);
        return reply(
          { error: duplicate ? "Ese correo ya está registrado en el sistema." : message },
          duplicate ? 409 : 400,
        );
      }

      const ownerUserId = createdUserData.user.id;
      const qrTokens: string[] = [];
      const qrHashes: string[] = [];

      for (let index = 0; index < tableCount; index += 1) {
        const qrToken = randomToken();
        qrTokens.push(qrToken);
        qrHashes.push(await sha256(qrToken));
      }

      const startsAt = new Date().toISOString();
      const { data: businessResult, error: businessError } = await admin.rpc(
        "platform_admin_create_business",
        {
          p_owner_user_id: ownerUserId,
          p_slug: slug,
          p_nombre: nombre,
          p_plan_code: planCode,
          p_starts_at: startsAt,
          p_ends_at: endsAt,
          p_nombre_comercial: cleanText(payload.nombreComercial) || nombre,
          p_logo_url: cleanText(payload.logoUrl, 500),
          p_nit: cleanText(payload.nit, 80),
          p_direccion: cleanText(payload.direccion, 240),
          p_telefono: cleanText(payload.telefono, 80),
          p_payment_info: cleanText(payload.paymentInfo, 500),
          p_timezone: cleanText(payload.timezone, 80) || "America/Bogota",
          p_moneda: (cleanText(payload.moneda, 3) || "COP").toUpperCase(),
          p_reglas_pedidos: cleanText(payload.reglasPedidos, 5000),
          p_table_count: tableCount,
          p_qr_hashes: qrHashes,
        },
      );

      if (businessError) {
        await admin.auth.admin.deleteUser(ownerUserId).catch(() => undefined);
        const duplicateSlug = /negocios_slug_key|duplicate key/i.test(businessError.message);
        return reply(
          { error: duplicateSlug ? "Ya existe un negocio con ese slug." : businessError.message },
          duplicateSlug ? 409 : 400,
        );
      }

      const qrCodes = qrTokens.map((qrToken, index) => {
        const url = new URL(qrBaseUrl.toString());
        url.searchParams.set("qr", qrToken);
        return { mesa: index + 1, token: qrToken, url: url.toString() };
      });

      return reply({
        ok: true,
        business: businessResult,
        owner: { id: ownerUserId, email: ownerEmail },
        qr_codes: qrCodes,
      }, 201);
    }

    if (action === "set_business_access") {
      const businessId = cleanText(body.businessId, 64);
      const active = body.active;
      if (!businessId || typeof active !== "boolean") {
        return reply({ error: "Datos de acceso inválidos." }, 400);
      }

      const { data, error } = await admin.rpc("platform_admin_set_business_access", {
        p_negocio_id: businessId,
        p_active: active,
      });
      if (error) throw error;
      return reply({ ok: true, business: data });
    }

    if (action === "reset_owner_password") {
      const businessId = cleanText(body.businessId, 64);
      const password = typeof body.password === "string" ? body.password : "";
      if (!businessId || password.length < 8 || password.length > 128) {
        return reply({ error: "Negocio o contraseña inválidos." }, 400);
      }

      const { data: ownerUserId, error: ownerError } = await admin.rpc(
        "platform_admin_owner_for_business",
        { p_negocio_id: businessId },
      );
      if (ownerError) throw ownerError;
      if (!ownerUserId) return reply({ error: "El negocio no tiene propietario activo." }, 404);

      const { error: passwordError } = await admin.auth.admin.updateUserById(
        ownerUserId,
        { password },
      );
      if (passwordError) throw passwordError;

      return reply({ ok: true });
    }

    return reply({ error: "Acción no válida." }, 400);
  } catch (error) {
    console.error("platform-admin failed", action, error);
    return reply({
      error: error instanceof Error
        ? error.message
        : "No fue posible completar la operación.",
    }, 500);
  }
});
