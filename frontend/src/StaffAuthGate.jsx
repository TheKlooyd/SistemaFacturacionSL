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
      <form
        className="authPanel"
        onSubmit={signIn}
      >
        <img
          src={`${
            import.meta.env.BASE_URL
          }logoklooyd.png`}
          alt="Sistema de facturación"
          className="qrLogo"
        />

        <h1>Acceso al sistema</h1>

        <input
          className="input"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          placeholder="Correo"
          required
        />

        <input
          className="input"
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(event.target.value)
          }
          placeholder="Contraseña"
          required
        />

        <button
          className="btnPrimary"
          type="submit"
          disabled={checkingAccess}
        >
          {checkingAccess
            ? "Comprobando..."
            : "Ingresar"}
        </button>

        {error && <p>{error}</p>}
      </form>
    </main>
  );
}