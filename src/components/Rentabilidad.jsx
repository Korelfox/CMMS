import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Fish, Plus, Trash2, Settings, BookOpen, ChevronDown, ChevronRight, Check, LayoutDashboard, Download, ExternalLink, Fuel } from "lucide-react";
import {
  ComposedChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend,
} from "recharts";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../lib/db";
import { supabase } from "../lib/supabase";
import { C, archivo, clp, num, isAdmin, canOperate, tint } from "../theme";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, ghostBtn,
  inputStyle, bluInput, thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";

import { calcPL } from "./rentabilidad/calc";
import TabDashboard from "./rentabilidad/TabDashboard";
import TabMareas from "./rentabilidad/TabMareas";
import TabEspecies from "./rentabilidad/TabEspecies";
import TabConfig from "./rentabilidad/TabConfig";

export default function Rentabilidad({ onNavigate, navParams }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [mareas,    setMareas]    = useState([]);
  const [ots,       setOts]       = useState([]);
  const [especies,  setEspecies]  = useState([]);
  const [capturas,  setCapturas]  = useState([]);
  const [economias, setEconomias] = useState([]);
  const [conf,      setConf]      = useState({ precio_combustible_l: 0, precio_aceite_l: 0, parte_tripulacion_pct: 50 });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [tab,       setTab]       = useState("dashboard");
  const [navMareaId, setNavMareaId] = useState(null);  // ID de marea a abrir automáticamente
  const [filtroEmb, setFiltroEmb] = useState("all");

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, ms, os, esp, caps, ecos, empData] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("mareas",        { order: { col: "zarpe_at", asc: false } }),
        fetchAll("ordenes_trabajo"),
        fetchAll("especies",      { order: { col: "nombre",   asc: true } }),
        fetchAll("marea_captura"),
        fetchAll("marea_economia"),
        supabase.from("empresas")
          .select("precio_combustible_l,precio_aceite_l,parte_tripulacion_pct")
          .eq("id", profile.empresa_id).single().then((r) => r.data || {}),
      ]);
      setEmbarcaciones(embs); setMareas(ms); setOts(os);
      setEspecies(esp); setCapturas(caps); setEconomias(ecos);
      if (empData) setConf(empData);
    } catch (e) { setError("No se pudo cargar rentabilidad. " + e.message); }
    finally { setLoading(false); }
  }, [profile?.empresa_id]); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  // Navegar desde otro módulo con marea específica (ej. desde Consumos)
  useEffect(() => {
    if (navParams?.mareaId) {
      setTab("mareas");
      setNavMareaId(navParams.mareaId);
    }
  }, [navParams]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";

  const mareasFiltradas = useMemo(() =>
    mareas.filter((m) => m.estado === "cerrada" && (filtroEmb === "all" || m.embarcacion_id === filtroEmb)),
    [mareas, filtroEmb]);

  if (loading) return (
    <div><PageHead kicker="Gestión Comercial" title="Rentabilidad por Marea" />
    <Card><InlineSpinner label="Cargando datos económicos…" /></Card></div>
  );

  const shared = { profile, embarcaciones, ots, especies, setEspecies, capturas, setCapturas, economias, setEconomias, conf, setConf, embName, setError, recargar: cargar, onNavigate };

  return (
    <div>
      <PageHead kicker="Gestión Comercial · Flota Pesquera" title="Rentabilidad por Marea"
        sub="Modelo a la parte: ingreso bruto → gastos del pozo → líquido → parte tripulación → margen del armador." />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        {[["dashboard", LayoutDashboard, "Dashboard"], ["mareas", Fish, "Registro por Marea"], ["especies", BookOpen, "Especies"], ["config", Settings, "Configuración"]].map(([id, Icon, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9, border: `1px solid ${tab === id ? C.cyan : C.line}`, background: tab === id ? C.cyan : "#fff", color: tab === id ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon size={15} />{lbl}
          </button>
        ))}
        {(tab === "mareas" || tab === "dashboard") && embarcaciones.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: 8 }}>
            <FilterBtn active={filtroEmb === "all"} onClick={() => setFiltroEmb("all")}>Toda la flota</FilterBtn>
            {embarcaciones.map((v) => (
              <FilterBtn key={v.id} active={filtroEmb === v.id} onClick={() => setFiltroEmb(v.id)} color={v.color}>{v.nombre}</FilterBtn>
            ))}
          </div>
        )}
      </div>

      {tab === "dashboard" && <TabDashboard mareas={mareasFiltradas} capturas={capturas} economias={economias} ots={ots} embarcaciones={embarcaciones} embName={embName} />}
      {tab === "mareas"   && <TabMareas   {...shared} mareas={mareasFiltradas} allOts={ots} navMareaId={navMareaId} onNavUsed={() => setNavMareaId(null)} />}
      {tab === "especies" && <TabEspecies {...shared} />}
      {tab === "config"   && <TabConfig   {...shared} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// TAB DASHBOARD
// ─────────────────────────────────────────────────────────────────
