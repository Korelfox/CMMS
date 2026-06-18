import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timer, Save } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fetchAll, insertRow, logActivity } from "../../lib/db";
import { filterByEmbarcacion } from "../../lib/embarcacionActiva";
import {
  validarLectura, modoHorometro, idsBajoPunto, compararPuntosHorometro,
} from "../../lib/horometro";
import { useShell } from "../../context/ShellContext";
import { C, num, canOperate, tint } from "../../theme";
import { EmptyState, InlineSpinner, primaryBtn, inputStyle } from "../../ui";

function CampoHorometroFila({
  eq, horasActuales, valor, onChange, onSave, guardando, puedeOperar, destacado,
}) {
  const hasVal = String(valor).trim() !== "";
  const inputRef = useRef(null);

  useEffect(() => {
    if (destacado && inputRef.current) inputRef.current.focus();
  }, [destacado]);

  return (
    <div
      className="cmms-campo-touch"
      style={{
        padding: "14px 14px 12px",
        marginBottom: 10,
        borderRadius: 12,
        border: `1px solid ${hasVal ? tint(C.sky, 35) : C.line}`,
        background: hasVal ? tint(C.sky, 6) : C.surface,
      }}
    >
      <div style={{ minWidth: 0, marginBottom: 10 }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.35,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {eq.sistema || eq.id_visible}
        </div>
        <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
          {eq.id_visible} · actual <strong style={{ color: C.steel }}>{num(horasActuales)} h</strong>
        </div>
      </div>

      {puedeOperar ? (
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              type="number"
              min={horasActuales}
              step="0.1"
              inputMode="decimal"
              placeholder={String(num(horasActuales))}
              value={valor}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && hasVal) onSave(); }}
              style={{
                ...inputStyle(),
                width: "100%",
                fontSize: 22,
                fontWeight: 800,
                fontFamily: "'IBM Plex Mono', monospace",
                textAlign: "right",
                padding: "12px 36px 12px 12px",
              }}
            />
            <span style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              fontSize: 14, fontWeight: 700, color: C.steel,
            }}>h</span>
          </div>
          <button
            type="button"
            disabled={!hasVal || guardando}
            onClick={onSave}
            style={{
              ...primaryBtn,
              flexShrink: 0,
              minWidth: 52,
              padding: "0 14px",
              justifyContent: "center",
              opacity: hasVal && !guardando ? 1 : 0.5,
            }}
            aria-label="Guardar lectura"
          >
            <Save size={18} />
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.slate, fontStyle: "italic" }}>Solo lectura</div>
      )}
    </div>
  );
}

export default function CampoHorometros({ navParams }) {
  const { profile } = useAuth();
  const { embarcacionId, embarcacionActiva } = useShell();
  const [equipos, setEquipos] = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [valores, setValores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    if (!embarcacionId) return;
    setLoading(true);
    setError(null);
    try {
      const [eqs, lecs] = await Promise.all([
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("lecturas_horometro", { order: { col: "fecha", asc: false } }),
      ]);
      setEquipos(filterByEmbarcacion(eqs, embarcacionId));
      setLecturas(lecs);
    } catch (e) {
      setError("No se pudieron cargar los horómetros. " + e.message);
    } finally {
      setLoading(false);
    }
  }, [embarcacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const lecturasDe = useCallback((id) => lecturas.filter((l) => l.equipo_id === id), [lecturas]);

  const puntos = useMemo(() => (
    equipos
      .filter((e) => modoHorometro(e) === "propio")
      .slice()
      .sort(compararPuntosHorometro)
  ), [equipos]);

  const focusId = navParams?.equipoId || null;

  async function guardarUna(puntoId) {
    const valor = valores[puntoId];
    if (!String(valor ?? "").trim()) return;
    setGuardando(true);
    setError(null);
    setOkMsg(null);
    try {
      const eq = byId.get(puntoId);
      if (!eq) return;

      const horas = Number(valor);
      const fechaLec = new Date();
      const todasLecs = lecturasDe(puntoId);
      const lecPrev = todasLecs[0] ?? null;
      const v = validarLectura({
        horasPrev: lecPrev ? Number(lecPrev.horas) : (eq.horas_actual ?? null),
        fechaPrev: lecPrev?.fecha ?? null,
        horas,
      });
      if (!v.ok) {
        setError(`${eq.id_visible}: ${v.error}`);
        return;
      }
      if (v.warning && !window.confirm(`${eq.sistema}\n\n${v.warning}\n\n¿Guardar de todas formas?`)) return;

      const row = await insertRow("lecturas_horometro", profile.empresa_id, {
        equipo_id: puntoId,
        horas,
        horas_anterior: lecPrev ? Number(lecPrev.horas) : (eq.horas_actual ?? null),
        fuente: "manual",
        usuario_id: profile.id,
        usuario_nombre: profile.nombre || "",
        fecha: fechaLec.toISOString(),
      });

      const ids = idsBajoPunto(puntoId, equipos, byId);
      setEquipos((p) => p.map((x) => (ids.includes(x.id) ? { ...x, horas_actual: horas } : x)));
      setLecturas((p) => [row, ...p]);
      setValores((p) => { const n = { ...p }; delete n[puntoId]; return n; });
      setOkMsg(`Lectura guardada · ${eq.sistema} → ${num(horas)} h`);
      logActivity(profile, "Registrar horómetro (Campo)", `${eq.id_visible} → ${horas} h`);
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!embarcacionId) {
    return <EmptyState icon={Timer} title="Sin embarcación" description="Selecciona una nave en el header." />;
  }

  if (loading) return <InlineSpinner label="Cargando horómetros…" />;

  return (
    <div className="cmms-campo-polish" style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Horómetros</div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>
        {embarcacionActiva?.codigo} · ingresa las horas actuales
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: "10px 12px", borderRadius: 10,
          background: C.redBg, border: `1px solid ${tint(C.red, 30)}`, color: C.red, fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {okMsg && (
        <div style={{
          marginBottom: 12, padding: "10px 12px", borderRadius: 10,
          background: C.greenBg, border: `1px solid ${tint(C.green, 30)}`, color: C.green, fontSize: 13, fontWeight: 600,
        }}>
          {okMsg}
        </div>
      )}

      {puntos.length === 0 ? (
        <EmptyState
          icon={Timer}
          title="Sin puntos de horómetro"
          description="No hay motores o generadores con horómetro propio en esta embarcación."
        />
      ) : (
        puntos.map((eq) => (
          <CampoHorometroFila
            key={eq.id}
            eq={eq}
            horasActuales={eq.horas_actual ?? 0}
            valor={valores[eq.id] ?? ""}
            onChange={(v) => setValores((p) => ({ ...p, [eq.id]: v }))}
            onSave={() => guardarUna(eq.id)}
            guardando={guardando}
            puedeOperar={puedeOperar}
            destacado={focusId === eq.id}
          />
        ))
      )}
    </div>
  );
}
