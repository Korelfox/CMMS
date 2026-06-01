import React, { useState } from "react";
import { Anchor, Lock, Check, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { C, archivo } from "../theme";
import { inputStyle, primaryBtn } from "../ui";

export default function ResetPassword() {
  const { updatePassword, authError, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [listo, setListo] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (password.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (password !== confirm) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    const ok = await updatePassword(password);
    setBusy(false);
    if (ok) setListo(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${C.abyss}, ${C.ocean})`, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 40, maxWidth: 440, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Anchor size={26} color={C.abyss} strokeWidth={2.4} />
          </div>
          <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss }}>CMMS Korelfox</div>
        </div>

        {listo ? (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: 13, background: C.greenBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Check size={28} color={C.green} />
            </div>
            <h2 style={{ ...archivo, fontSize: 20, fontWeight: 800, color: C.abyss, marginBottom: 8 }}>Contraseña actualizada</h2>
            <p style={{ color: C.slate, fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>Ya puedes ingresar con tu nueva contraseña.</p>
            <button onClick={signOut} style={{ ...primaryBtn, width: "100%" }}>Ir a iniciar sesión</button>
          </div>
        ) : (
          <>
            <h2 style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.abyss, marginBottom: 6 }}>Nueva contraseña</h2>
            <p style={{ color: C.slate, fontSize: 13.5, marginBottom: 22, lineHeight: 1.5 }}>Define tu nueva contraseña de acceso al sistema.</p>
            <form onSubmit={submit}>
              <Campo label="Nueva contraseña">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ ...inputStyle(), paddingLeft: 38 }} placeholder="••••••••" />
              </Campo>
              <Campo label="Repetir contraseña">
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} style={{ ...inputStyle(), paddingLeft: 38 }} placeholder="••••••••" />
              </Campo>
              {(err || authError) && <div style={{ color: C.red, fontSize: 13, marginBottom: 12, fontWeight: 500 }}>{err || authError}</div>}
              <button type="submit" disabled={busy} style={{ ...primaryBtn, width: "100%", marginTop: 4, opacity: busy ? 0.6 : 1 }}>
                <ShieldCheck size={17} /> {busy ? "Guardando…" : "Guardar contraseña"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 5 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <Lock size={16} color={C.slate} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        {children}
      </div>
    </div>
  );
}
