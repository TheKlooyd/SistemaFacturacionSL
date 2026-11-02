import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  clearActiveTenant,
  resolveTenantForSession,
} from "./tenantSession";

export default function StaffAuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [tenant, setTenant] = useState(undefined);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [checkingAccess, setCheckingAccess] =
    useState(false);

  // Usuario cuyo tenant ya fue validado correctamente.
  const validatedUserIdRef = useRef(null);

  // Evita lanzar dos validaciones simultáneas.
  const validatingUserIdRef = useRef(null);

  // Permite invalidar una validación vieja si ocurre logout
  // o cambia el usuario mientras todavía estaba ejecutándose.
  const validationGenerationRef = useRef(0);

  async function validateAccess(nextSession) {
    const userId = nextSession?.user?.id;

    if (!userId) {
      return;
    }

    // Ya validamos este mismo usuario.
    // Un TOKEN_REFRESHED / SIGNED_IN repetido no debe desmontar el POS.
    if (validatedUserIdRef.current === userId) {
      setSession(nextSession);
      return;
    }

    // Ya hay una validación corriendo para este usuario.
    if (validatingUserIdRef.current === userId) {
      setSession(nextSession);
      return;
    }

    const generation =
      ++validationGenerationRef.current;

    validatingUserIdRef.current = userId;

    setSession(nextSession);
    setTenant(undefined);
    setCheckingAccess(true);
    setError("");

    try {
      const resolvedTenant =
        await resolveTenantForSession(nextSession);

      // Si mientras esperábamos hubo logout/cambio de usuario,
      // ignoramos este resultado viejo.
      if (
        generation !==
        validationGenerationRef.current
      ) {
        return;
      }

      validatedUserIdRef.current = userId;
      setTenant(resolvedTenant);
    } catch (accessError) {
      if (
        generation !==
        validationGenerationRef.current
      ) {
        return;
      }

      console.error(
        "Tenant access error:",
        accessError
      );

      validatedUserIdRef.current = null;

      clearActiveTenant();
      setTenant(null);

      setError(
        accessError?.message ||
          "No fue posible validar el acceso al establecimiento."
      );
    } finally {
      if (
        generation ===
        validationGenerationRef.current
      ) {
        validatingUserIdRef.current = null;
        setCheckingAccess(false);
      }
    }
  }

  function clearSessionState() {
    // Invalida cualquier consulta que todavía esté corriendo.
    validationGenerationRef.current += 1;

    validatedUserIdRef.current = null;
    validatingUserIdRef.current = null;

    clearActiveTenant();

    setSession(null);
    setTenant(null);
    setCheckingAccess(false);
  }

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) {
          return;
        }

        if (
          event === "SIGNED_OUT" ||
          !nextSession
        ) {
          clearSessionState();
          return;
        }

        const nextUserId =
          nextSession.user?.id;

        // Esto es lo importante:
        //
        // TOKEN_REFRESHED, SIGNED_IN repetido, cambio de pestaña,
        // recuperación de foco, etc.
        //
        // Si sigue siendo el usuario que ya validamos,
        // solo actualizamos la sesión y dejamos el POS intacto.
        if (
          nextUserId &&
          validatedUserIdRef.current ===
            nextUserId
        ) {
          setSession(nextSession);
          return;
        }

        void validateAccess(nextSession);
      }
    );

    return () => {
      active = false;

      validationGenerationRef.current += 1;

      subscription.unsubscribe();
    };
  }, []);

  async function signIn(event) {
    event.preventDefault();

    setError("");
    setCheckingAccess(true);

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      setCheckingAccess(false);

      setError(
        "Correo o contraseña incorrectos."
      );
    }
  }

  async function signOut() {
    clearSessionState();

    await supabase.auth.signOut();
  }

  if (
    session === undefined ||
    tenant === undefined
  ) {
    return (
      <main className="authPage">
        <p>Comprobando acceso...</p>
      </main>
    );
  }

  if (session && tenant) {
    return (
      <>
        {children}

        <button
          className="staffLogout"
          onClick={signOut}
        >
          Cerrar sesión
        </button>
      </>
    );
  }

  return (
    <main className="authPage">
      <div className="authLayout">
      <section className="authIntro" aria-label="SL Business">
        <div className="authIntroBrand"><span className="slMonogram">sl<span>·</span></span><span>SL <strong>Business</strong></span></div>
        <div className="eyebrow">UN ESPACIO. TODO TU NEGOCIO.</div>
        <h2>El siguiente paso<br />de tu negocio<span>.</span></h2>
        <p>Ventas, inventario y clientes en un mismo lugar. Claridad para tu día a día, espacio para crecer.</p>
        <svg className="authBlueprint" viewBox="0 0 380 180" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth=".7" opacity=".15"><path d="M0 140 190 40l190 100M0 160 190 60l190 100M0 180 190 80l190 100M40 180 230 80M80 180 270 80M120 180 310 80M160 180 350 80M220 180 30 80M260 180 70 80M300 180 110 80M340 180 150 80" /></g>
          <g stroke="currentColor" strokeWidth="1.2"><path d="m115 72 75-40 75 40-75 40-75-40Z" /><path d="M115 72v60l75 40 75-40V72M190 112v60M152 52l75 40v22" /><path d="m137 115 24 13v15l-24-13v-15Z" /><path d="M102 52V36h16M262 36h16v16M102 148v16h16M262 164h16v-16" opacity=".5" /></g>
          <g fill="currentColor"><circle cx="190" cy="32" r="2" /><circle cx="115" cy="132" r="2" /><circle cx="265" cy="132" r="2" /></g>
        </svg>
        <div className="authIntroFoot">FACTURACIÓN &nbsp; / &nbsp; INVENTARIO &nbsp; / &nbsp; GESTIÓN</div>
      </section>
      <form
        className="authPanel"
        onSubmit={signIn}
      >
        <div className="eyebrow">TU ESPACIO DE TRABAJO</div>
        <h1>Te damos la bienvenida</h1>
        <p className="authSubtitle">Ingresa a tu cuenta para continuar con tu negocio.</p>

        <label className="label" htmlFor="staff-email">Correo electrónico</label>
        <input
          id="staff-email"
          autoComplete="username"
          className="input"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          placeholder="nombre@tunegocio.com"
          required
        />

        <label className="label" htmlFor="staff-password">Contraseña</label>
        <input
          id="staff-password"
          autoComplete="current-password"
          className="input"
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(event.target.value)
          }
          placeholder="Ingresa tu contraseña"
          required
        />

        <button
          className="btnPrimary"
          type="submit"
          disabled={checkingAccess}
        >
          {checkingAccess
            ? "Comprobando..."
            : "Ingresar a mi negocio →"}
        </button>

        {error && <p role="alert" className="authError">{error}</p>}
        <p className="authSecurity">Un espacio privado para ti y tu equipo.<br />SL Business · Sistema de facturación</p>
      </form>
      </div>
    </main>
  );
}
