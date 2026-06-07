import React, { useState } from "react";
import { Warehouse, Plus, Trash2, PackagePlus, Ship, Anchor } from "lucide-react";
import { insertRow, deleteRow, logActivity } from "../../lib/db";
import { C, canOperate, isAdmin } from "../../theme";
import { Card, Pill, primaryBtn, ghostBtn, inputStyle, Field, Empty, GuiaColapsable } from "../../ui";

/* ============================ TAB · BODEGAS ============================ */
export default function TabBodegas({ profile, empresa, embarcaciones, bodegas, setBodegas, recargar, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", tipo: "tierra", embarcacion_id: "" });
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  async function crear() {
    if (!form.codigo.trim() || !form.nombre.trim()) return;
    try {
      const nueva = await insertRow("bodegas", profile.empresa_id, {
        codigo: form.codigo.trim().toUpperCase(), nombre: form.nombre.trim(),
        tipo: form.tipo, embarcacion_id: form.tipo === "a_bordo" ? (form.embarcacion_id || null) : null,
      });
      setBodegas((p) => [...p, nueva]);
      logActivity(profile, "Crear bodega", `${nueva.codigo} · ${nueva.nombre}`);
      setForm({ codigo: "", nombre: "", tipo: "tierra", embarcacion_id: "" }); setShowForm(false);
    } catch (e) {
      setError(e.message.includes("duplicate") ? "Ya existe una bodega con ese código." : "No se pudo crear: " + e.message);
    }
  }
  async function eliminar(id) {
    const b = bodegas.find((x) => x.id === id);
    if (!window.confirm(`¿Eliminar "${b?.nombre}"? Se borrará también todo el stock que tenga.`)) return;
    const respaldo = bodegas;
    setBodegas((p) => p.filter((x) => x.id !== id));
    try { await deleteRow("bodegas", id); logActivity(profile, "Eliminar bodega", `${b?.codigo} · ${b?.nombre}`); recargar(); }
    catch (e) { setBodegas(respaldo); setError("No se pudo eliminar: " + e.message); }
  }
  async function autoCrear() {
    const puerto = empresa?.puerto_base || "Principal";
    const lista = [{ codigo: "BOD-TIERRA", nombre: `Bodega ${puerto}`, tipo: "tierra", embarcacion_id: null },
      ...embarcaciones.map((e) => ({ codigo: `BOD-${e.codigo}`, nombre: `Pañol ${e.nombre}`, tipo: "a_bordo", embarcacion_id: e.id }))];
    try {
      for (const b of lista) {
        try { await insertRow("bodegas", profile.empresa_id, b); } catch (_) { /* ignora duplicados */ }
      }
      logActivity(profile, "Auto-crear bodegas", `${lista.length} bodegas por defecto`);
      recargar();
    } catch (e) { setError("No se pudieron crear las bodegas: " + e.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.slate }}>{bodegas.length} bodega{bodegas.length !== 1 && "s"} registrada{bodegas.length !== 1 && "s"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {puedeOperar && bodegas.length === 0 && embarcaciones.length > 0 && (
            <button onClick={autoCrear} style={ghostBtn}><PackagePlus size={15} /> Crear por defecto</button>
          )}
          {puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={16} /> Nueva Bodega</button>}
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Bodega</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Código"><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} style={inputStyle()} placeholder="BOD-TIERRA" /></Field>
            <Field label="Nombre"><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle()} placeholder="Bodega Puerto Montt" /></Field>
            <Field label="Tipo">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>
                <option value="tierra">Tierra</option><option value="a_bordo">A bordo</option>
              </select>
            </Field>
            {form.tipo === "a_bordo" && (
              <Field label="Embarcación">
                <select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value })} style={inputStyle()}>
                  <option value="">— Selecciona —</option>
                  {embarcaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </Field>
            )}
          </div>
          <GuiaColapsable titulo="Guía del código de bodega" icon={Warehouse}>
            <div style={{ marginBottom: 8 }}>
              Convención: <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>BOD-TIERRA</code> para la bodega central en tierra,
              {" "}<code style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>BOD-&lt;NAVE&gt;</code> para el pañol a bordo de cada embarcación.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
              <li><strong style={{ color: C.abyss }}>Tierra:</strong> <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>BOD-TIERRA</code> (o BOD-PMONTT por puerto)</li>
              <li><strong style={{ color: C.abyss }}>A bordo:</strong> <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>BOD-AUR</code> (pañol de la nave Aurora)</li>
              <li>El botón <strong>"Crear por defecto"</strong> ya genera la bodega de tierra + un pañol por cada nave con esta convención.</li>
              <li>Cada nave debe tener stock crítico a bordo para cubrir 2 fallas de componentes A.</li>
            </ul>
          </GuiaColapsable>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={crear} style={primaryBtn}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {bodegas.length === 0 ? (
        <Card><Empty>
          <Warehouse size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
          Aún no hay bodegas. {embarcaciones.length === 0
            ? "Primero registra al menos una embarcación, luego puedes crear bodegas por defecto automáticamente."
            : "Usa \"Crear por defecto\" para generar la bodega de tierra + un pañol por cada nave, o crea una manualmente."}
        </Empty></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14 }}>
          {bodegas.map((b) => {
            const emb = embarcaciones.find((e) => e.id === b.embarcacion_id);
            const tono = b.tipo === "a_bordo" ? "cyan" : "steel";
            return (
              <Card key={b.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    {b.tipo === "a_bordo" ? <Ship size={20} color={emb?.color || C.cyan} /> : <Anchor size={20} color={C.steel} />}
                    <div>
                      <div style={{ fontWeight: 700, color: C.abyss }}>{b.nombre}</div>
                      <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{b.codigo}</div>
                    </div>
                  </div>
                  {puedeBorrar && <button onClick={() => eliminar(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Pill tone={tono}>{b.tipo === "a_bordo" ? "A bordo" : "Tierra"}</Pill>
                  {emb && <Pill tone="slate">{emb.nombre}</Pill>}
                </div>
              </Card>);
          })}
        </div>
      )}
    </div>
  );
}
