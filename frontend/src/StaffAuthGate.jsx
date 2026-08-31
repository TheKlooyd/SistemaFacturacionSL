import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function StaffAuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next)); return () => subscription.unsubscribe(); }, []);
  async function signIn(event) { event.preventDefault(); setError(""); const { error: signInError } = await supabase.auth.signInWithPassword({ email, password }); if (signInError) setError("No fue posible iniciar sesión."); }
  if (session === undefined) return <main className="authPage"><p>Comprobando acceso...</p></main>;
  if (session) return <>{children}<button className="staffLogout" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></>;
  return <main className="authPage"><form className="authPanel" onSubmit={signIn}><img src={`${import.meta.env.BASE_URL}saborlatinologo.png`} alt="Sabor Latino" className="qrLogo" /><h1>Acceso personal</h1><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Correo" required /><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña" required /><button className="btnPrimary" type="submit">Ingresar</button>{error && <p>{error}</p>}</form></main>;
}