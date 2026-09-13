import {
  useEffect,
  useState,
} from "react";

import {
  updatePlatformBusiness,
  uploadPlatformBusinessLogo,
} from "./platformAdminApi";

const fields = [
  [
    "nombre_comercial",
    "Nombre comercial",
    160,
  ],

  ["nit", "NIT", 80],

  [
    "direccion",
    "Dirección",
    240,
  ],

  [
    "telefono",
    "Teléfono",
    80,
  ],

  [
    "payment_info",
    "Instrucciones de pago",
    500,
  ],

  [
    "reglas_pedidos",
    "Reglas de interpretación de pedidos",
    20000,
  ],
];

export default function BusinessEditor({
  business,
  onSaved,
  onCancel,
}) {
  const [form, setForm] =
    useState(() =>
      Object.fromEntries(
        fields.map(
          ([key]) => [
            key,

            business
              .configuracion
              ?.[key] ||
              (key ===
              "nombre_comercial"
                ? business.nombre
                : ""),
          ]
        )
      )
    );

  const [
    logoUrl,
    setLogoUrl,
  ] = useState(
    business.configuracion
      ?.logo_url || ""
  );

  const [
    logoFile,
    setLogoFile,
  ] = useState(null);

  const [
    logoPreview,
    setLogoPreview,
  ] = useState("");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview("");
      return;
    }

    const url =
      URL.createObjectURL(
        logoFile
      );

    setLogoPreview(url);

    return () => {
      URL.revokeObjectURL(
        url
      );
    };
  }, [logoFile]);

  async function save(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");

    try {
      let finalLogoUrl =
        logoUrl;

      if (logoFile) {
        finalLogoUrl =
          await uploadPlatformBusinessLogo(
            business.id,
            logoFile
          );

        setLogoUrl(
          finalLogoUrl
        );
      }

      await updatePlatformBusiness(
        business.id,
        {
          ...form,
          logo_url:
            finalLogoUrl,
        }
      );

      await onSaved();
    } catch (e) {
      setError(
        e?.message ||
          "No fue posible guardar."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      style={{
        display: "grid",
        gap: 12,
      }}
    >
      <h4 style={{ margin: 0 }}>
        Editar negocio
      </h4>

      <label
        style={{
          display: "grid",
          gap: 7,
        }}
      >
        <span>Logo del negocio</span>

        {(logoPreview ||
          logoUrl) && (
          <img
            src={
              logoPreview ||
              logoUrl
            }
            alt="Logo"
            style={{
              width: 120,
              height: 120,
              objectFit:
                "contain",

              border:
                "1px solid #ddd",

              borderRadius:
                12,

              padding: 8,

              background:
                "#fff",
            }}
          />
        )}

        <label
          style={{
            display:
              "inline-flex",

            width:
              "fit-content",

            padding:
              "10px 14px",

            borderRadius:
              10,

            background:
              "#efeff2",

            fontWeight:
              700,

            cursor:
              busy
                ? "default"
                : "pointer",
          }}
        >
          Choose image

          <input
            type="file"
            accept="image/png,image/jpeg,.jpg,.jpeg,.png"
            disabled={busy}
            style={{
              display: "none",
            }}
            onChange={(
              event
            ) => {
              const file =
                event.target
                  .files?.[0] ||
                null;

              setLogoFile(
                file
              );
            }}
          />
        </label>

        <small>
          JPG, JPEG o PNG.
          Máximo 2 MB.
        </small>
      </label>

      {fields.map(
        ([
          key,
          label,
          max,
        ]) => (
          <label
            key={key}
            style={{
              display:
                "grid",

              gap: 5,
            }}
          >
            <span>{label}</span>

            {key ===
              "payment_info" ||
            key ===
              "reglas_pedidos" ? (
              <textarea
                rows={
                  key ===
                  "reglas_pedidos"
                    ? 7
                    : 3
                }
                maxLength={
                  max
                }
                value={
                  form[key]
                }
                disabled={
                  busy
                }
                onChange={(
                  e
                ) =>
                  setForm({
                    ...form,

                    [key]:
                      e.target
                        .value,
                  })
                }
              />
            ) : (
              <input
                required={
                  key ===
                  "nombre_comercial"
                }
                maxLength={
                  max
                }
                value={
                  form[key]
                }
                disabled={
                  busy
                }
                onChange={(
                  e
                ) =>
                  setForm({
                    ...form,

                    [key]:
                      e.target
                        .value,
                  })
                }
              />
            )}
          </label>
        )
      )}

      {error && (
        <p
          role="alert"
          style={{
            color:
              "#970000",
          }}
        >
          {error}
        </p>
      )}

      <small>
        El POS cargará el
        logo nuevo al volver
        a iniciar sesión. Los
        QR lo mostrarán al
        abrirse nuevamente.
      </small>

      <button
        type="submit"
        disabled={busy}
      >
        {busy
          ? "Guardando..."
          : "Guardar cambios"}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
      >
        Cancelar
      </button>
    </form>
  );
}