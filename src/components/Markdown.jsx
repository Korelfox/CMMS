import React from "react";
import { C, archivo } from "../theme";

// ============================================================
//  Renderizador markdown mínimo y seguro (sin dependencias).
//  Subconjunto: encabezados ##/###, listas - y 1., **negrita**, ---.
//  Compartido por los módulos de IA (Informe Ejecutivo, Diagnóstico).
// ============================================================

// Negrita inline **texto**
export function mdInline(text) {
  const parts = (text || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ color: C.abyss, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

// markdown → arreglo de elementos React.
export function renderMarkdown(md) {
  const lines = (md || "").split("\n");
  const out = [];
  let list = null, listType = null, key = 0;

  const flush = () => {
    if (list) {
      out.push(listType === "ol"
        ? <ol key={key++} style={{ paddingLeft: 22, margin: "8px 0" }}>{list}</ol>
        : <ul key={key++} style={{ paddingLeft: 22, margin: "8px 0" }}>{list}</ul>);
      list = null; listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flush(); continue; }

    if (/^#{1,3}\s/.test(line)) {
      flush();
      const level = line.match(/^#+/)[0].length;
      const txt = line.replace(/^#+\s/, "");
      const sz = level === 1 ? 20 : level === 2 ? 16.5 : 14.5;
      out.push(
        <div key={key++} style={{
          ...archivo, fontWeight: 800, fontSize: sz, color: C.abyss,
          marginTop: level <= 2 ? 22 : 14, marginBottom: 8,
          borderBottom: level === 2 ? `1px solid ${C.line}` : "none",
          paddingBottom: level === 2 ? 5 : 0,
        }}>{mdInline(txt)}</div>
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) { flush(); out.push(<hr key={key++} style={{ border: "none", borderTop: `1px solid ${C.line}`, margin: "16px 0" }} />); continue; }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ol || ul) {
      const type = ol ? "ol" : "ul";
      if (list && listType !== type) flush();
      if (!list) { list = []; listType = type; }
      list.push(<li key={key++} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.65, margin: "3px 0" }}>{mdInline((ol || ul)[1])}</li>);
      continue;
    }

    flush();
    out.push(<p key={key++} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7, margin: "8px 0" }}>{mdInline(line)}</p>);
  }
  flush();
  return out;
}

// Conversión simple md→HTML para la ventana de impresión.
export function mdToBasicHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = (md || "").split("\n");
  let html = "", list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const inl = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { closeList(); html += `<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`; continue; }
    const ol = line.match(/^\d+\.\s+(.*)$/), ul = line.match(/^[-*]\s+(.*)$/);
    if (ol || ul) {
      const t = ol ? "ol" : "ul";
      if (list && list !== t) closeList();
      if (!list) { list = t; html += `<${t}>`; }
      html += `<li>${inl((ol || ul)[1])}</li>`; continue;
    }
    closeList();
    html += `<p>${inl(line)}</p>`;
  }
  closeList();
  return html;
}
