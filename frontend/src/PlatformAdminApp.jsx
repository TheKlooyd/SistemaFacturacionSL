import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import BusinessEditor from "./BusinessEditor";
import { printBusinessQrs } from "./qrPrint";
import {
  createPlatformBusiness,
  getPlatformAdminStatus,
  listPlatformBusinesses,
  resetPlatformOwnerPassword,
  setPlatformBusinessAccess,
} from "./platformAdminApi";

const fieldStyle = {
  display: "grid",
  gap: 6,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid rgba(0,0,0,.16)",
  borderRadius: 10,
  font: "inherit",
  background: "#fff",
};

const buttonStyle = {
  padding: "10px 14px",
  border: 0,
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function AdminLogin({ onReady }) {
  const [email, setEmail] = useState("kennethlloydcortezbaena72@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrorText("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const result = await getPlatformAdminStatus();
      onReady(result.admin);
    } catch (error) {
      setErrorText(error?.message || "No fue posible iniciar sesión.");
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f4f4f6",
        padding: 20,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(420px, 100%)",
          background: "#fff",
          borderRadius: 18,
          padding: 26,
          boxShadow: "0 14px 38px rgba(0,0,0,.10)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13, opacity: 0.55, fontWeight: 700 }}>
            SISTEMA FACTURACIÓN SL
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 28 }}>Administración</h1>
        </div>

        <label style={fieldStyle}>
          <span>Correo</span>
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label style={fieldStyle}>
          <span>Contraseña</span>
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {errorText && (
          <div
            style={{
              padding: 11,
              borderRadius: 10,
              background: "rgba(190,0,0,.08)",
              color: "#970000",
            }}
          >
            {errorText}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{ ...buttonStyle, background: "#1b1b1f", color: "#fff" }}
        >
          {busy ? "Validando..." : "Entrar al panel"}
        </button>
      </form>
    </div>
  );
}

function BusinessCard({ business, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  async function importAndPrint(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 100000) return alert("El manifiesto es demasiado grande.");
    const popup = window.open("", "business-qr-print", "width=900,height=900");
    if (!popup) return alert("Permite ventanas emergentes para imprimir los QR.");
    setBusy(true);
    try { await printBusinessQrs(business, JSON.parse(await file.text()), popup); }
    catch (error) { popup.close(); alert(error.message || "No se pudieron imprimir los QR."); }
    finally { setBusy(false); }
  }

  const active = business.estado === "activo";

  async function toggleAccess() {
    const action = active ? "suspender" : "reactivar";
    if (!confirm(`¿Seguro que deseas ${action} ${business.nombre}?`)) return;

    setBusy(true);
    try {
      await setPlatformBusinessAccess(business.id, !active);
      await onChanged();
    } catch (error) {
      alert(error?.message || "No se pudo cambiar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const password = prompt(
      `Nueva contraseña temporal para ${
        business.propietario?.email || business.nombre
      }:`
    );

    if (!password) return;

    if (password.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setBusy(true);
    try {
      await resetPlatformOwnerPassword(business.id, password);
      alert("Contraseña actualizada.");
    } catch (error) {
      alert(error?.message || "No se pudo actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,.09)",
        borderRadius: 16,
        padding: 18,
        display: "grid",
        gap: 12,
        boxShadow: "0 4px 14px rgba(0,0,0,.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 20 }}>{business.nombre}</h3>
          <div style={{ opacity: 0.55, marginTop: 3 }}>{business.slug}</div>
        </div>

        <span
          style={{
            alignSelf: "start",
            padding: "5px 9px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            background: active
              ? "rgba(10,150,70,.12)"
              : "rgba(190,0,0,.10)",
            color: active ? "#08743c" : "#9c0000",
          }}
        >
          {business.estado}
        </span>
      </div>

      <div style={{ lineHeight: 1.6, fontSize: 14 }}>
        <div>
          <b>Propietario:</b>{" "}
          {business.propietario?.email || "Sin propietario"}
        </div>
        <div>
          <b>Plan:</b> {business.suscripcion?.plan_code || "—"}
        </div>
        <div>
          <b>Suscripción:</b> {business.suscripcion?.estado || "—"}
        </div>
        <div>
          <b>Nombre comercial:</b>{" "}
          {business.configuracion?.nombre_comercial || "—"}
        </div>
      </div>

      {editing && <BusinessEditor business={business} onCancel={() => setEditing(false)} onSaved={async () => { await onChanged(); setEditing(false); }} />}
      <button type="button" disabled={busy || editing} onClick={() => setEditing(true)} style={buttonStyle}>Editar negocio</button>
      <label style={{ ...buttonStyle, display: "block", opacity: busy ? 0.5 : 1 }}>
        Imprimir QR desde manifiesto
        <input type="file" accept=".json,application/json" disabled={busy || editing} onChange={importAndPrint} style={{ display: "block", marginTop: 8, maxWidth: "100%" }} />
      </label>
      <small>Selecciona el manifiesto privado descargado al crear este negocio. Se validan sus QR antes de imprimir.</small>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={toggleAccess}
          style={{
            ...buttonStyle,
            background: active ? "#f7e7e7" : "#e5f6ec",
            color: active ? "#8f0000" : "#08743c",
          }}
        >
          {active ? "Suspender" : "Reactivar"}
        </button>

        <button
          type="button"
          disabled={busy || !business.propietario}
          onClick={resetPassword}
          style={{
            ...buttonStyle,
            background: "#efeff2",
            color: "#1b1b1f",
          }}
        >
          Restablecer contraseña
        </button>
      </div>
    </article>
  );
}

function CreateBusinessForm({ onCreated }) {
  const defaultQrBase = useMemo(
    () => new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
    []
  );

  const [form, setForm] = useState({
    nombre: "",
    slug: "",
    ownerEmail: "",
    ownerPassword: "",
    planCode: "manual",
    endsAt: "",
    nombreComercial: "", 
    logoUrl: "",
    nit: "",
    direccion: "",
    telefono: "",
    paymentInfo: "",
    timezone: "America/Bogota",
    moneda: "COP",
    reglasPedidos: "",
    tableCount: 12,
    qrBaseUrl: defaultQrBase,
  });

  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [created, setCreated] = useState(null);

  function setValue(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };

      if (name === "nombre") {
        if (!slugTouched) next.slug = slugify(value);
        if (!current.nombreComercial) next.nombreComercial = value;
      }

      return next;
    });
  }

  function downloadQrManifest() {
    if (!created?.qr_codes?.length) return;

    const payload = {
      business: created.business,
      owner: created.owner,
      qr_codes: created.qr_codes,
      generated_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      created.business?.slug || "negocio"
    }-qr-manifest.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrorText("");
    setCreated(null);

    try {
      const result = await createPlatformBusiness({
        ...form,
        tableCount: Number(form.tableCount),
        endsAt: form.endsAt
          ? new Date(`${form.endsAt}T23:59:59`).toISOString()
          : null,
      });

      setCreated({ ...result, printConfig: { nombre_comercial: form.nombreComercial || form.nombre, logo_url: form.logoUrl } });
      await onCreated();
    } catch (error) {
      setErrorText(error?.message || "No fue posible crear el negocio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 6px 20px rgba(0,0,0,.05)",
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, opacity: 0.55, fontWeight: 800 }}>
          NUEVO CLIENTE
        </div>
        <h2 style={{ margin: "4px 0 0" }}>Crear restaurante</h2>
      </div>

      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 12,
          background: "rgba(30,80,180,.07)",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        El correo propietario debe ser un usuario nuevo. No reutilices el
        correo de Sabor Latino ni el correo del administrador de plataforma.
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <label style={fieldStyle}>
            <span>Nombre del negocio *</span>
            <input
              style={inputStyle}
              value={form.nombre}
              onChange={(e) => setValue("nombre", e.target.value)}
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Slug *</span>
            <input
              style={inputStyle}
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setValue("slug", slugify(e.target.value));
              }}
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Correo propietario *</span>
            <input
              style={inputStyle}
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setValue("ownerEmail", e.target.value)}
              placeholder="ej. kenneth+donjuan@gmail.com"
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Contraseña temporal *</span>
            <input
              style={inputStyle}
              type="password"
              minLength={8}
              value={form.ownerPassword}
              onChange={(e) => setValue("ownerPassword", e.target.value)}
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Nombre comercial</span>
            <input
              style={inputStyle}
              value={form.nombreComercial}
              onChange={(e) => setValue("nombreComercial", e.target.value)}
            />
          </label>

          <label style={fieldStyle}>
            <span>URL del logo</span>
            <input style={inputStyle} type="url" maxLength={500} value={form.logoUrl}
              onChange={(e) => setValue("logoUrl", e.target.value)} placeholder="https://..." />
            <small>Opcional. Sin logo se mostrará el de la plataforma.</small>
          </label>

          <label style={fieldStyle}>
            <span>NIT</span>
            <input
              style={inputStyle}
              value={form.nit}
              onChange={(e) => setValue("nit", e.target.value)}
            />
          </label>

          <label style={fieldStyle}>
            <span>Dirección</span>
            <input
              style={inputStyle}
              value={form.direccion}
              onChange={(e) => setValue("direccion", e.target.value)}
            />
          </label>

          <label style={fieldStyle}>
            <span>Teléfono</span>
            <input
              style={inputStyle}
              value={form.telefono}
              onChange={(e) => setValue("telefono", e.target.value)}
            />
          </label>

          <label style={fieldStyle}>
            <span>Plan</span>
            <input
              style={inputStyle}
              value={form.planCode}
              onChange={(e) =>
                setValue(
                  "planCode",
                  slugify(e.target.value).replace(/-/g, "_")
                )
              }
            />
          </label>

          <label style={fieldStyle}>
            <span>Vence el</span>
            <input
              style={inputStyle}
              type="date"
              value={form.endsAt}
              onChange={(e) => setValue("endsAt", e.target.value)}
            />
          </label>

          <label style={fieldStyle}>
            <span>Mesas</span>
            <input
              style={inputStyle}
              type="number"
              min="1"
              max="12"
              value={form.tableCount}
              onChange={(e) => setValue("tableCount", e.target.value)}
            />
          </label>

          <label style={fieldStyle}>
            <span>Moneda</span>
            <input
              style={inputStyle}
              maxLength={3}
              value={form.moneda}
              onChange={(e) =>
                setValue("moneda", e.target.value.toUpperCase())
              }
            />
          </label>
        </div>

        <label style={fieldStyle}>
          <span>Instrucciones de pago</span>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} maxLength={500}
            value={form.paymentInfo} onChange={(e) => setValue("paymentInfo", e.target.value)}
            placeholder="Medio de pago, titular y número de cuenta" />
          <small>Aparecerán en la cuenta y el comprobante. Déjalo vacío si no aplica.</small>
        </label>

        <label style={fieldStyle}>
          <span>URL base de los QR</span>
          <input
            style={inputStyle}
            type="url"
            value={form.qrBaseUrl}
            onChange={(e) => setValue("qrBaseUrl", e.target.value)}
            required
          />
        </label>

        <label style={fieldStyle}>
          <span>Reglas especiales para pedidos / IA</span>
          <textarea
            style={{
              ...inputStyle,
              minHeight: 90,
              resize: "vertical",
            }}
            value={form.reglasPedidos}
            onChange={(e) => setValue("reglasPedidos", e.target.value)}
          />
        </label>

        {errorText && (
          <div
            style={{
              padding: 11,
              borderRadius: 10,
              background: "rgba(190,0,0,.08)",
              color: "#970000",
            }}
          >
            {errorText}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            ...buttonStyle,
            background: "#1b1b1f",
            color: "#fff",
          }}
        >
          {busy ? "Creando restaurante..." : "Crear restaurante completo"}
        </button>
      </form>

      {created && (
        <div
          style={{
            marginTop: 18,
            padding: 16,
            borderRadius: 14,
            background: "rgba(10,150,70,.08)",
          }}
        >
          <b>Restaurante creado correctamente.</b>
          <button type="button" disabled={busy} style={{ ...buttonStyle, margin: 10 }} onClick={async () => {
            setBusy(true);
            try {
              await printBusinessQrs({ id: created.business.negocio_id, nombre: created.business.nombre, configuracion: created.printConfig }, created);
            } catch (error) { alert(error.message || "No se pudieron imprimir los QR."); }
            finally { setBusy(false); }
          }}>Imprimir QR de las mesas</button>

          <div style={{ marginTop: 8 }}>
            {created.qr_codes?.length || 0} códigos QR fueron registrados.
          </div>

          <button
            type="button"
            onClick={downloadQrManifest}
            style={{
              ...buttonStyle,
              marginTop: 12,
              background: "#fff",
              border: "1px solid rgba(0,0,0,.12)",
            }}
          >
            Descargar manifiesto privado de QR
          </button>

          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
            Guárdalo: contiene los tokens secretos necesarios para
            generar/reimprimir los QR.
          </div>
        </div>
      )}
    </section>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "11px 16px",
        borderRadius: 12,
        border: active
          ? "1px solid rgba(27,27,31,.18)"
          : "1px solid transparent",
        background: active ? "#fff" : "transparent",
        color: "#1b1b1f",
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? "0 5px 16px rgba(0,0,0,.06)" : "none",
      }}
    >
      {children}
    </button>
  );
}

export default function PlatformAdminApp() {
  const [authState, setAuthState] = useState("checking");
  const [adminEmail, setAdminEmail] = useState("");
  const [businesses, setBusinesses] = useState([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [activeTab, setActiveTab] = useState("businesses");

  async function validateAdmin() {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      setAuthState("signedOut");
      return;
    }

    try {
      const result = await getPlatformAdminStatus();
      setAdminEmail(result.admin?.email || "");
      setAuthState("ready");
    } catch {
      await supabase.auth.signOut();
      setAuthState("signedOut");
    }
  }

  async function refreshBusinesses() {
    setLoadingBusinesses(true);
    setErrorText("");

    try {
      setBusinesses(await listPlatformBusinesses());
    } catch (error) {
      setErrorText(error?.message || "No fue posible cargar los negocios.");
    } finally {
      setLoadingBusinesses(false);
    }
  }

  useEffect(() => {
    void validateAdmin();
  }, []);

  useEffect(() => {
    if (authState === "ready") {
      void refreshBusinesses();
    }
  }, [authState]);

  if (authState === "checking") {
    return (
      <div style={{ padding: 30 }}>
        Comprobando acceso administrativo...
      </div>
    );
  }

  if (authState === "signedOut") {
    return (
      <AdminLogin
        onReady={(admin) => {
          setAdminEmail(admin?.email || "");
          setAuthState("ready");
        }}
      />
    );
  }

  const activeBusinesses = businesses.filter(
    (business) => business.estado === "activo"
  );

  const inactiveBusinesses = businesses.filter(
    (business) => business.estado !== "activo"
  );

  return (
    <main
      style={{
        height: "100dvh",
        overflowY: "auto",
        overflowX: "hidden",
        boxSizing: "border-box",
        background: "#f4f4f6",
        padding: "22px clamp(16px, 4vw, 48px) 50px",
        color: "#1b1b1f",
      }}
    >
      <header
        style={{
          maxWidth: 1250,
          margin: "0 auto 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13, opacity: 0.55, fontWeight: 800 }}>
            PLATFORM ADMIN
          </div>
          <h1 style={{ margin: "5px 0 0" }}>Restaurantes</h1>
          <div style={{ opacity: 0.6, marginTop: 5 }}>{adminEmail}</div>
        </div>

        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            setAuthState("signedOut");
          }}
          style={{
            ...buttonStyle,
            background: "#fff",
            border: "1px solid rgba(0,0,0,.1)",
          }}
        >
          Cerrar sesión
        </button>
      </header>

      <div
        style={{
          maxWidth: 1250,
          margin: "0 auto 22px",
          padding: 5,
          borderRadius: 15,
          background: "rgba(0,0,0,.045)",
          display: "inline-flex",
          gap: 4,
        }}
      >
        <TabButton
          active={activeTab === "businesses"}
          onClick={() => setActiveTab("businesses")}
        >
          Negocios
        </TabButton>

        <TabButton
          active={activeTab === "create"}
          onClick={() => setActiveTab("create")}
        >
          + Crear negocio
        </TabButton>
      </div>

      <div
        style={{
          maxWidth: 1250,
          margin: "0 auto",
        }}
      >
        {activeTab === "businesses" && (
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Negocios activos</h2>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 14,
                    opacity: 0.55,
                  }}
                >
                  {activeBusinesses.length} activo
                  {activeBusinesses.length === 1 ? "" : "s"}
                </div>
              </div>

              <button
                type="button"
                onClick={refreshBusinesses}
                disabled={loadingBusinesses}
                style={{
                  ...buttonStyle,
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,.1)",
                }}
              >
                {loadingBusinesses ? "Actualizando..." : "Actualizar"}
              </button>
            </div>

            {errorText && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 11,
                  borderRadius: 10,
                  background: "rgba(190,0,0,.08)",
                  color: "#970000",
                }}
              >
                {errorText}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(290px, 1fr))",
                gap: 14,
              }}
            >
              {activeBusinesses.map((business) => (
                <BusinessCard
                  key={business.id}
                  business={business}
                  onChanged={refreshBusinesses}
                />
              ))}

              {!loadingBusinesses && activeBusinesses.length === 0 && (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: 22,
                    opacity: 0.65,
                  }}
                >
                  No hay negocios activos.
                </div>
              )}
            </div>

            {inactiveBusinesses.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <div style={{ marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>
                    Suspendidos / inactivos
                  </h2>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 14,
                      opacity: 0.55,
                    }}
                  >
                    Se conservan aquí para poder reactivarlos.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(290px, 1fr))",
                    gap: 14,
                  }}
                >
                  {inactiveBusinesses.map((business) => (
                    <BusinessCard
                      key={business.id}
                      business={business}
                      onChanged={refreshBusinesses}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "create" && (
          <CreateBusinessForm onCreated={refreshBusinesses} />
        )}
      </div>
    </main>
  );
}
