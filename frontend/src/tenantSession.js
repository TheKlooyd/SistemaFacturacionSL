import { supabase } from "./supabaseClient";

let activeTenant = null;

export function getActiveTenant() {
  return activeTenant;
}

export function requireActiveTenant() {
  if (!activeTenant?.negocio?.id) {
    throw new Error(
      "No hay un negocio activo en esta sesión."
    );
  }

  return activeTenant;
}

export function requireNegocioId() {
  return requireActiveTenant().negocio.id;
}

export function clearActiveTenant() {
  activeTenant = null;
}

export async function resolveTenantForSession(session) {
  clearActiveTenant();

  const userId = session?.user?.id;

  if (!userId) {
    throw new Error(
      "No hay una sesión válida."
    );
  }

  const {
    data: memberships,
    error: membershipError,
  } = await supabase
    .from("negocio_usuarios")
    .select("negocio_id, rol, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(2);

  if (membershipError) {
    throw membershipError;
  }

  if (
    !memberships ||
    memberships.length === 0
  ) {
    throw new Error(
      "Esta cuenta no está vinculada a ningún establecimiento."
    );
  }

  if (memberships.length > 1) {
    throw new Error(
      "Esta cuenta tiene más de un establecimiento activo. La selección de establecimientos todavía no está habilitada."
    );
  }

  const membership = memberships[0];

  const [
    {
      data: negocio,
      error: negocioError,
    },
    {
      data: suscripcion,
      error: suscripcionError,
    },
    {
      data: configuracion,
      error: configuracionError,
    },
  ] = await Promise.all([
    supabase
      .from("negocios")
      .select(
        "id, slug, nombre, estado"
      )
      .eq(
        "id",
        membership.negocio_id
      )
      .maybeSingle(),

    supabase
      .from("suscripciones")
      .select(
        "negocio_id, plan_code, estado, starts_at, ends_at"
      )
      .eq(
        "negocio_id",
        membership.negocio_id
      )
      .maybeSingle(),

    supabase
      .from("negocio_configuracion")
      .select(
        "negocio_id, nombre_comercial, logo_url, nit, direccion, telefono, payment_info, timezone, moneda, reglas_pedidos"
      )
      .eq(
        "negocio_id",
        membership.negocio_id
      )
      .maybeSingle(),
  ]);

  if (negocioError) {
    throw negocioError;
  }

  if (suscripcionError) {
    throw suscripcionError;
  }

  if (configuracionError) {
    throw configuracionError;
  }

  if (!negocio) {
    throw new Error(
      "No se encontró el establecimiento de esta cuenta."
    );
  }

  if (negocio.estado !== "activo") {
    throw new Error(
      "El establecimiento no se encuentra activo."
    );
  }

  if (
    !suscripcion ||
    suscripcion.estado !== "activa"
  ) {
    throw new Error(
      "La suscripción de este establecimiento no está activa."
    );
  }

  const now = Date.now();

  if (
    suscripcion.starts_at &&
    new Date(
      suscripcion.starts_at
    ).getTime() > now
  ) {
    throw new Error(
      "La suscripción de este establecimiento todavía no ha comenzado."
    );
  }

  if (
    suscripcion.ends_at &&
    new Date(
      suscripcion.ends_at
    ).getTime() <= now
  ) {
    throw new Error(
      "La suscripción de este establecimiento ha vencido."
    );
  }

  activeTenant = {
    user: session.user,
    negocio,
    membership,
    suscripcion,
    configuracion,
  };

  return activeTenant;
}