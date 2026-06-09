import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";

// ============================================================
//  Contexto de Autenticación
//  Expone: session, user, profile (empresa_id, rol, nombre),
//  empresa, loading, y métodos signIn / signUp / signOut.
//  El profile y la empresa determinan QUÉ datos ve el usuario
//  (reforzado por RLS en la base de datos).
// ============================================================

const AuthContext = createContext(null);

// Corre una promesa con límite de tiempo. Evita que un getSession/consulta a
// Supabase colgado (token expirado tras suspensión, red despertando) deje la app
// atrapada para siempre en "Cargando tu perfil…". Las consultas de supabase-js
// son thenables, así que Promise.race funciona con ellas.
function conTimeout(promesa, ms, etiqueta) {
  let t;
  const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout:${etiqueta}`)), ms); });
  return Promise.race([Promise.resolve(promesa).finally(() => clearTimeout(t)), limite]);
}
const PROFILE_TIMEOUT_MS = 7000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);  // ¿ya intentamos cargar el perfil?
  const [profileError, setProfileError] = useState(false);    // ¿falló la carga del perfil?
  const [authError, setAuthError] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const loadedUserIdRef = useRef(undefined);  // último usuario cuyo perfil ya cargamos
  const inflightRef = useRef(null);           // { uid, promise } carga de perfil en curso (dedupe)

  // Carga el perfil del usuario (empresa_id, rol, nombre) y su empresa.
  // Robusto ante cuelgues: cada consulta tiene timeout y, si falla la primera
  // vez (timeout/red), reintenta una vez tras refrescar el token. Solo marca
  // profileError si el reintento también falla → pantalla "Reintentar", nunca
  // spinner infinito. Deduplica cargas concurrentes para el mismo usuario
  // (getSession + INITIAL_SESSION pueden dispararla a la vez al arrancar).
  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); setEmpresa(null); setProfileLoaded(true); setProfileError(false); return; }
    if (inflightRef.current && inflightRef.current.uid === userId) return inflightRef.current.promise;

    setProfileLoaded(false); setProfileError(false);  // empezamos a cargar

    const consultar = async () => {
      const { data: prof, error } = await conTimeout(
        supabase.from("profiles")
          .select("id, empresa_id, nombre, email, rol, embarcacion_id, activo")
          .eq("id", userId).single(),
        PROFILE_TIMEOUT_MS, "profiles");
      if (error) throw error;
      let emp = null;
      if (prof?.empresa_id) {
        const { data } = await conTimeout(
          supabase.from("empresas")
            .select("id, nombre, puerto_base, plan, activa, codigo_invitacion")
            .eq("id", prof.empresa_id).single(),
          PROFILE_TIMEOUT_MS, "empresas");
        emp = data || null;
      }
      return { prof, emp };
    };

    const promesa = (async () => {
      try {
        let res;
        try {
          res = await consultar();
        } catch (e1) {
          // Reintento único: si fue timeout/red, refrescar el token y reintentar
          // suele resolver (la conexión ya está despierta).
          console.warn("[CMMS] Reintentando carga de perfil tras:", e1?.message || e1);
          try { await conTimeout(supabase.auth.refreshSession(), 6000, "refresh"); } catch { /* ignore */ }
          res = await consultar();
        }
        setProfile(res.prof);
        setEmpresa(res.emp);
        setProfileError(false);
      } catch (e) {
        console.error("[CMMS] Error cargando perfil:", e?.message || e);
        setProfile(null);
        setEmpresa(null);
        setProfileError(true);   // falló dos veces: NO es "pendiente de asignación"
      } finally {
        setProfileLoaded(true);
      }
    })();

    inflightRef.current = { uid: userId, promise: promesa };
    try { await promesa; } finally { if (inflightRef.current?.promise === promesa) inflightRef.current = null; }
  }, []);

  // Inicializa la sesión y se suscribe a los cambios de autenticación.
  useEffect(() => {
    let mounted = true;

    // Red de seguridad: si getSession() tardara demasiado por cualquier motivo,
    // liberamos la pantalla de carga igual a los 5s para no quedar atrapados en
    // "Iniciando sistema…". onAuthStateChange recuperará la sesión si llega tarde.
    const failsafe = setTimeout(() => { if (mounted) setLoading(false); }, 5000);

    (async () => {
      try {
        const { data, error } = await conTimeout(supabase.auth.getSession(), 6000, "getSession");
        if (error) throw error;
        if (!mounted) return;
        const uid = data.session?.user?.id ?? null;
        setSession(data.session);
        loadedUserIdRef.current = uid;
        await loadProfile(uid);
      } catch (e) {
        console.error("[CMMS] Error al iniciar la sesión:", e?.message || e);
        if (mounted) setAuthError("No se pudo conectar con el servidor. Revisa la configuración de Supabase (.env.local) y tu conexión.");
      } finally {
        clearTimeout(failsafe);
        if (mounted) setLoading(false);   // SIEMPRE deja de cargar, pase lo que pase
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(newSession);
      const uid = newSession?.user?.id ?? null;
      // Solo recargamos el perfil cuando CAMBIA el usuario (login/logout real).
      // Eventos como TOKEN_REFRESHED —que se disparan al volver de otra pestaña—
      // mantienen el mismo usuario: recargar ahí dejaba la app en "Cargando…".
      if (uid !== loadedUserIdRef.current) {
        loadedUserIdRef.current = uid;
        try { await loadProfile(uid); }
        catch (e) { console.error("[CMMS] Error cargando perfil tras cambio de sesión:", e?.message || e); }
      }
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
    profile, empresa, loading, profileLoaded, profileError, authError, passwordRecovery,
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
