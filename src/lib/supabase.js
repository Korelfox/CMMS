import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Aviso claro en consola si faltan las variables (evita errores crípticos)
  console.error(
    "[CMMS] Faltan variables de entorno. Crea un archivo .env.local con " +
      "VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example)."
  );
}

export const supabase = createClient(url || "", anonKey || "", {
  auth: {
    persistSession: true,       // mantiene la sesión entre recargas
    autoRefreshToken: true,     // renueva el token automáticamente
    detectSessionInUrl: true,   // soporta enlaces de confirmación/recuperación
  },
});

export const hasConfig = Boolean(url && anonKey);

// Mensaje claro de arranque para diagnóstico (no expone la clave).
if (hasConfig) {
  console.info("[CMMS] Supabase configurado correctamente. URL:", url);
} else {
  console.error("[CMMS] Supabase SIN configurar. Falta .env.local o el servidor no se reinició.");
}
