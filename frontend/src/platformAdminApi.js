import { supabase } from "./supabaseClient";

export async function callPlatformAdmin(
  action,
  payload = {}
) {
  const { data, error } =
    await supabase.functions.invoke(
      "platform-admin",
      {
        body: {
          action,
          ...payload,
        },
      }
    );

  if (error) {
    let message =
      error.message ||
      "No fue posible contactar la administración.";

    try {
      const body =
        await error.context
          ?.clone?.()
          .json();

      if (body?.error) {
        message = body.error;
      }
    } catch {
      // Si no viene JSON, usamos el error original.
    }

    throw new Error(message);
  }

  if (!data?.ok) {
    throw new Error(
      data?.error ||
        "La operación administrativa falló."
    );
  }

  return data;
}

export async function getPlatformAdminStatus() {
  return callPlatformAdmin("status");
}

export async function listPlatformBusinesses() {
  const data =
    await callPlatformAdmin(
      "list_businesses"
    );

  return data.businesses || [];
}

export async function uploadPlatformBusinessLogo(
  businessId,
  file
) {
  if (!businessId) {
    throw new Error(
      "No se encontró el negocio."
    );
  }

  if (!file) {
    throw new Error(
      "Selecciona una imagen."
    );
  }

  const allowedTypes = [
    "image/png",
    "image/jpeg",
  ];

  if (
    !allowedTypes.includes(file.type)
  ) {
    throw new Error(
      "Solo se permiten archivos JPG, JPEG o PNG."
    );
  }

  if (
    file.size >
    2 * 1024 * 1024
  ) {
    throw new Error(
      "La imagen no puede superar los 2 MB."
    );
  }

  // Usamos siempre el mismo nombre.
  // Así, cuando cambias el logo,
  // reemplazamos el anterior.
  const path =
    `${businessId}/logo`;

  const {
    error: uploadError,
  } = await supabase.storage
    .from("business-logos")
    .upload(
      path,
      file,
      {
        upsert: true,
        contentType:
          file.type,
        cacheControl: "60",
      }
    );

  if (uploadError) {
    console.error(
      "Logo upload error:",
      uploadError
    );

    throw new Error(
      uploadError.message ||
        "No se pudo subir el logo."
    );
  }

  const {
    data: publicData,
  } = supabase.storage
    .from("business-logos")
    .getPublicUrl(path);

  if (
    !publicData?.publicUrl
  ) {
    throw new Error(
      "No se pudo obtener la URL del logo."
    );
  }

  // La versión evita que el navegador
  // siga mostrando el logo anterior
  // por caché.
  return (
    `${publicData.publicUrl}` +
    `?v=${Date.now()}`
  );
}

export async function createPlatformBusiness(
  business
) {
  const {
    logoFile,
    logoUrl,
    ...payload
  } = business;

  // Primero creamos el negocio normalmente.
  const result =
    await callPlatformAdmin(
      "create_business",
      {
        business: {
          ...payload,

          // Compatibilidad por si todavía
          // existe algún formulario viejo.
          logoUrl:
            logoFile
              ? ""
              : logoUrl || "",
        },
      }
    );

  // Si no eligieron una imagen,
  // ya terminamos.
  if (!logoFile) {
    return result;
  }

  const negocioId =
    result.business
      ?.negocio_id;

  if (!negocioId) {
    return {
      ...result,

      logoUploadError:
        "El negocio fue creado, pero no se encontró su ID para subir el logo.",
    };
  }

  try {
    const uploadedLogo =
      await uploadPlatformBusinessLogo(
        negocioId,
        logoFile
      );

    // Guardamos la URL pública
    // dentro de la configuración.
    await updatePlatformBusiness(
      negocioId,
      {
        nombre_comercial:
          payload.nombreComercial ||
          payload.nombre ||
          "",

        logo_url:
          uploadedLogo,

        nit:
          payload.nit || "",

        direccion:
          payload.direccion ||
          "",

        telefono:
          payload.telefono ||
          "",

        payment_info:
          payload.paymentInfo ||
          "",

        reglas_pedidos:
          payload.reglasPedidos ||
          "",
      }
    );

    return {
      ...result,
      logoUrl:
        uploadedLogo,
    };
  } catch (error) {
    console.error(
      "Business logo setup failed:",
      error
    );

    // IMPORTANTE:
    // El restaurante ya existe.
    // No queremos mostrar que todo falló.
    return {
      ...result,

      logoUploadError:
        error?.message ||
        "El restaurante fue creado, pero no se pudo guardar el logo.",
    };
  }
}

export async function setPlatformBusinessAccess(
  businessId,
  active
) {
  return callPlatformAdmin(
    "set_business_access",
    {
      businessId,
      active,
    }
  );
}

export async function resetPlatformOwnerPassword(
  businessId,
  password
) {
  return callPlatformAdmin(
    "reset_owner_password",
    {
      businessId,
      password,
    }
  );
}

export function updatePlatformBusiness(
  businessId,
  config
) {
  return callPlatformAdmin(
    "update_business",
    {
      businessId,
      config,
    }
  );
}

export function verifyQrManifest(
  businessId,
  codes
) {
  return callPlatformAdmin(
    "verify_qr_manifest",
    {
      businessId,
      codes,
    }
  );
}