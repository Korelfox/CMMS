import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

// ============================================================
//  Contexto de Autenticación
//  Expone: session, user, profile (empresa_id, rol, nombre),
//  empresa, loading, y métodos signIn / signUp / signOut.
//  El profile y la empresa determinan QUÉ datos ve el usuario
//  (reforzado por RLS en la base de datos).
// ============================================================

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // Carga el perfil del usuario (empresa_id, rol, nombre) y su empresa.
  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); setEmpresa(null); return; }
    try {
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("id, empresa_id, nombre, email, rol, embarcacion_id, activo")
        .eq("id", userId)
        .single();
      if (error) throw error;
      setProfile(prof);

      if (prof?.empresa_id) {
        const { data: emp } = await supabase
          .from("empresas")
          .select("id, nombre, puerto_base, plan, activa, codigo_invitacion")
          .eq("id", prof.empresa_id)
          .single();
        setEmpresa(emp || null);
      } else {
        setEmpresa(null);
      }
    } catch (e) {
      console.error("[CMMS] Error cargando perfil:", e.message);
      setProfile(null);
      setEmpresa(null);
    }
  }, []);

  // Inicializa la sesión y se suscribe a los cambios de autenticación.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted) return;
        setSession(data.session);
        await loadProfile(data.session?.user?.id);
      } catch (e) {
        console.error("[CMMS] Error al iniciar la sesión:", e?.message || e);
        if (mounted) setAuthError("No se pudo conectar con el servidor. Revisa la configuración de Supabase (.env.local) y tu conexión.");
      } finally {
        if (mounted) setLoading(false);   // SIEMPRE deja de cargar, pase lo que pase
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(newSession);
      try { await loadProfile(newSession?.user?.id); }
      catch (e) { console.error("[CMMS] Error cargando perfil tras cambio de sesión:", e?.message || e); }
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setAuthError(traducirError(error.message)); return false; }
    return true;
  }, []);

  const signUp = useCallback(async (email, password, nombre, codigoEmpresa = "") => {
    setAuthError(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nombre, codigo_empresa: (codigoEmpresa || "").trim().toUpperCase() } },
    });
    if (error) { setAuthError(traducirError(error.message)); return false; }
    return true;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null); setEmpresa(null);
  }, []);

  // Envía el correo con el enlace para restablecer la contraseña.
  const resetPassword = useCallback(async (email) => {
    setAuthError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) { setAuthError(traducirError(error.message)); return false; }
    return true;
  }, []);

  // Fija la nueva contraseña (tras llegar desde el enlace del correo).
  const updatePassword = useCallback(async (newPassword) => {
    setAuthError(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setAuthError(traducirError(error.message)); return false; }
    setPasswordRecovery(false);
    return true;
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user?.id);
  }, [session, loadProfile]);

  const value = {
    session, user: session?.user || null,
    profile, empresa, loading, authError, passwordRecovery,
    signIn, signUp, signOut, refreshProfile, resetPassword, updatePassword,
    isAuthenticated: Boolean(session),
    isOnboarded: Boolean(profile?.empresa_id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

// Traduce mensajes comunes de Supabase al español.
function traducirError(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de ingresar.";
  if (m.includes("already registered")) return "Este correo ya está registrado.";
  if (m.includes("password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  return msg || "Ocurrió un error. Intenta nuevamente.";
}
