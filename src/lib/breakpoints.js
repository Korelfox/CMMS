// Breakpoints compartidos — Oficina sigue siendo experiencia PC; estos umbrales
// solo activan layout compacto cuando el viewport es angosto o bajo (horizontal móvil).

/** Celular en horizontal: poca altura útil (~375–430px) aunque el ancho sea >760px */
export const OFFICINA_LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 520px)";

/** Sidebar drawer + shell compacto: ancho limitado O horizontal móvil */
export const OFFICINA_NARROW_QUERY = "(max-width: 1024px), (orientation: landscape) and (max-height: 520px)";

/** Ajustes extra en teléfos (retrato angosto o horizontal) */
export const OFFICINA_COMPACT_QUERY = "(max-width: 760px), (orientation: landscape) and (max-height: 520px)";
