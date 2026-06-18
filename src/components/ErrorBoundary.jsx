import React from "react";
import { C, tint } from "../theme";

// Captura errores de render de un módulo y muestra un aviso claro en vez de
// dejar la pantalla en blanco. Registra el error en consola y expone un gancho
// (window.__cmmsOnError) para enchufar Sentry u otro monitor más adelante.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
     
    console.error("[CMMS] Error de UI:", error, info && info.componentStack);
    if (typeof window !== "undefined" && typeof window.__cmmsOnError === "function") {
      try { window.__cmmsOnError(error, info); } catch { /* el monitor no debe romper la app */ }
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: tint(C.red, 8), border: `1px solid ${C.red}`, borderRadius: 12, padding: "20px 22px", maxWidth: 640 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.abyss, marginBottom: 6 }}>
            Algo salió mal en esta vista
          </div>
          <p style={{ fontSize: 13.5, color: C.slate, lineHeight: 1.6, marginTop: 0 }}>
            El error quedó registrado. Puedes reintentar o cambiar de módulo en el menú;
            el resto del sistema sigue funcionando.
          </p>
          <pre style={{ fontSize: 12, color: C.red, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {String((this.state.error && this.state.error.message) || this.state.error)}
          </pre>
          <button onClick={this.reset}
            style={{ marginTop: 6, background: C.steel, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
