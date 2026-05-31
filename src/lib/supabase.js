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
    // Lock sin Web Locks API. El lock por defecto (navigator.locks) puede
    // quedar retenido si una pestaña murió mal y deja getSession() colgado
    // para siempre (spinner infinito en modo normal; incógnito arranca limpio,
    // por eso ahí sí cargaba). Para una PWA de un usuario por dispositivo esto
    // es seguro y elimina el bloqueo de raíz.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
});

export const hasConfig = Boolean(url && anonKey);

if (!hasConfig) {
  console.error("[CMMS] Supabase SIN configurar. Falta .env.local o el servidor no se reinició.");
}
