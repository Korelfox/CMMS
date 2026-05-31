import React, { useState } from "react";
import { Anchor, Mail, Lock, User, LogIn, UserPlus, KeyRound } from "lucide-react";
import { useAuth } from "../lib/auth";
import { hasConfig } from "../lib/supabase";
import { C, archivo } from "../theme";
import { inputStyle, primaryBtn } from "../ui";

export default function Login() {
  const { signIn, signUp, resetPassword, authError } = useAuth();
  const [modo, setModo] = useState("login"); // 'login' | 'signup' | 'recover'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigoEmpresa, setCodigoEmpresa] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (modo === "login") {
      await signIn(email.trim(), password);
    } else if (modo === "recover") {
      const ok = await resetPassword(email.trim());
      if (ok) setMsg("Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja (y la carpeta de spam).");
    } else {
      const ok = await signUp(email.trim(), password, nombre.trim(), codigoEmpresa.trim());
      if (ok) setMsg(codigoEmpresa.trim()
        ? "Cuenta creada. Revisa tu correo para confirmarla, luego ingresa. Tu administrador te asignará el rol que corresponde."
        : "Cuenta creada. Revisa tu correo para confirmarla. Sin código de empresa, un administrador deberá asignarte manualmente.");
    }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: `linear-gradient(135deg, ${C.abyss}, ${C.ocean})` }}>
      {/* Panel izquierdo: marca */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8%", color: C.foam }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Anchor size={32} color={C.abyss} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ ...archivo, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>CMMS Flota</div>
            <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>Gestión de Mantenimiento</div>
          </div>
        </div>
        <h1 style={{ ...archivo, fontSize: 34, fontWeight: 800, lineHeight: 1.15, maxWidth: 460, marginBottom: 16 }}>
          Mantenimiento naval, bajo control.
        </h1>
        <p style={{ fontSize: 15, opacity: 0.75, maxWidth: 440, lineHeight: 1.6 }}>
          Equipos, órdenes de trabajo, preventivo, inventario, confiabilidad y costos — para tu flota, en un solo lugar.
        </p>
        <div style={{ marginTop: 36, fontSize: 12, opacity: 0.5, lineHeight: 1.6 }}>
          Mora Gutiérrez · Libbrecht · Parra/Crespo · Pascual<br />ISO 55000 · ISO 14224
        </div>
      </div>

      {/* Panel derecho: formulario */}
      <div style={{ width: 480, background: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 56px" }}>
        <h2 style={{ ...archivo, fontSize: 24, fontWeight: 800, color: C.abyss, marginBottom: 6 }}>
          {modo === "login" ? "Iniciar sesión" : modo === "recover" ? "Recuperar contraseña" : "Crear cuenta"}
        </h2>
        <p style={{ color: C.slate, fontSize: 13.5, marginBottom: 26 }}>
          {modo === "login" ? "Ingresa con tu correo y contraseña." : modo === "recover" ? "Te enviaremos un enlace a tu correo para crear una nueva contraseña." : "Regístrate para comenzar."}
        </p>

        {!hasConfig && (
          <div style={{ background: C.yellowBg, color: C.yellow, padding: "10px 12px", borderRadius: 9, fontSize: 12.5, marginBottom: 16, fontWeight: 600 }}>
            ⚠ Falta configurar Supabase. Crea un archivo <code>.env.local</code> con tus claves (ver <code>.env.example</code>).
          </div>
        )}

        <form onSubmit={submit}>
          {modo === "signup" && (
            <Field icon={User} label="Nombre">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required style={{ ...inputStyle(), paddingLeft: 38 }} placeholder="Tu nombre" />
            </Field>
          )}
          {modo === "signup" && (
            <Field icon={KeyRound} label="Código de empresa (opcional)">
              <input value={codigoEmpresa} onChange={(e) => setCodigoEmpresa(e.target.value.toUpperCase())} maxLength={12} style={{ ...inputStyle(), paddingLeft: 38, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }} placeholder="Ej: A1B2C3" />
            </Field>
          )}
          <Field icon={Mail} label="Correo">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ ...inputStyle(), paddingLeft: 38 }} placeholder="tu@correo.cl" />
          </Field>
          {modo !== "recover" && (
            <Field icon={Lock} label="Contraseña">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ ...inputStyle(), paddingLeft: 38 }} placeholder="••••••••" />
            </Field>
          )}
          {modo === "login" && (
            <div style={{ textAlign: "right", marginTop: -8, marginBottom: 14 }}>
              <button type="button" onClick={() => { setModo("recover"); setMsg(null); }}
                style={{ background: "none", border: "none", color: C.steel, fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {authError && <div style={{ color: C.red, fontSize: 13, marginBottom: 12, fontWeight: 500 }}>{authError}</div>}
          {msg && <div style={{ color: C.green, fontSize: 13, marginBottom: 12, fontWeight: 500, lineHeight: 1.5 }}>{msg}</div>}

          <button type="submit" disabled={busy || !hasConfig} style={{ ...primaryBtn, width: "100%", marginTop: 6, opacity: busy || !hasConfig ? 0.6 : 1 }}>
            {modo === "login" ? <LogIn size={17} /> : modo === "recover" ? <Mail size={17} /> : <UserPlus size={17} />}
            {busy ? "Procesando…" : modo === "login" ? "Ingresar" : modo === "recover" ? "Enviar enlace" : "Crear cuenta"}
          </button>
        </form>

        <div style={{ marginTop: 22, textAlign: "center", fontSize: 13, color: C.slate }}>
          {modo === "recover" ? (
            <button onClick={() => { setModo("login"); setMsg(null); }}
              style={{ background: "none", border: "none", color: C.steel, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              ← Volver a iniciar sesión
            </button>
          ) : (
            <>
              {modo === "login" ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
              <button onClick={() => { setModo(modo === "login" ? "signup" : "login"); setMsg(null); }}
                style={{ background: "none", border: "none", color: C.steel, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {modo === "login" ? "Crear una" : "Iniciar sesión"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 5 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <Icon size={16} color={C.slate} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        {children}
      </div>
    </div>
  );
}
