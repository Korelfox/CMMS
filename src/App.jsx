import React from "react";
import { Anchor, Clock, LogOut } from "lucide-react";
import { useAuth } from "./lib/auth";
import { C, archivo } from "./theme";
import { Spinner } from "./ui";
import Login from "./components/Login";
import AppShell from "./components/AppShell";
import ResetPassword from "./components/ResetPassword";

export default function App() {
  const { loading, isAuthenticated, isOnboarded, profile, signOut, passwordRecovery } = useAuth();

  // 1. Cargando sesión
  if (loading) return <Spinner label="Iniciando sistema…" />;

  // 2. Llegó desde el enlace de "restablecer contraseña"
  if (passwordRecovery) return <ResetPassword />;

  // 3. Sin sesión → pantalla de acceso
  if (!isAuthenticated) return <Login />;

  // 4. Con sesión pero sin empresa asignada → esperando onboarding
  if (!isOnboarded) return <PendingOnboarding nombre={profile?.nombre} signOut={signOut} />;

  // 5. Autenticado y asignado a una empresa → aplicación
  return <AppShell />;
}

function PendingOnboarding({ nombre, signOut }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${C.abyss}, ${C.ocean})`, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 40, maxWidth: 460, textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,.2)" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: C.yellowBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <Clock size={28} color={C.yellow} />
        </div>
        <h2 style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.abyss, marginBottom: 10 }}>
          Cuenta pendiente de asignación
        </h2>
        <p style={{ color: C.slate, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          Hola {nombre || "usuario"}, tu cuenta está creada pero aún no ha sido asignada a una empresa.
          Un administrador debe vincularte a tu organización para que accedas al sistema.
        </p>
        <button onClick={signOut} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <LogOut size={15} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
