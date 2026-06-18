import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Warehouse, ArrowRightLeft, ShoppingCart, Package } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { estadoStock } from "../lib/stock";
import { C, clp } from "../theme";
import { FilterBtn, ModuleShell } from "../ui";
import { skey } from "./almacen/util";
import TabBodegas from "./almacen/TabBodegas";
import TabMovimientos from "./almacen/TabMovimientos";
import TabStock from "./almacen/TabStock";
import TabCompras from "./almacen/TabCompras";

const TAB_KEY = "cmms-almacen-tab";
const TABS = [
  { id: "bodegas", label: "Bodegas", icon: Warehouse },
  { id: "stock", label: "Stock", icon: Package },
  { id: "movs", label: "Movimientos", icon: ArrowRightLeft },
  { id: "compras", label: "Compras", icon: ShoppingCart },
];

export default function Almacen({ navParams }) {
  const { profile, empresa } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [items, setItems] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [stock, setStock] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [comprasItems, setComprasItems] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("stock");
  const [ocInit, setOcInit] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, bods, its, stk, movs, cps, cpsIts, otsAll, eqs, dests] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("bodegas", { order: { col: "codigo", asc: true } }),
        fetchAll("inventario_items", { order: { col: "codigo", asc: true } }),
        fetchAll("stock"),
        fetchAll("movimientos", { order: { col: "fecha", asc: false } }),
        fetchAll("compras", { order: { col: "fecha", asc: false } }),
        fetchAll("compras_items"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("inventario_item_destinos"),
      ]);
      setEmbarcaciones(embs); setBodegas(bods); setItems(its); setStock(stk);
      setMovimientos(movs); setCompras(cps); setComprasItems(cpsIts); setOts(otsAll);
      setEquipos(eqs); setDestinos(dests);
    } catch (e) { setError("No se pudo cargar el almacén. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  useEffect(() => {
    if (navParams?.tab && TABS.some((t) => t.id === navParams.tab)) setTab(navParams.tab);
  }, [navParams?.tab]);

  const stockMap = useMemo(() => {
    const m = new Map();
    stock.forEach((s) => m.set(skey(s.item_id, s.bodega_id), Number(s.cantidad) || 0));
    return m;
  }, [stock]);

  const totalItem = (id) => bodegas.reduce((s, b) => s + (stockMap.get(skey(id, b.id)) || 0), 0);
  const itemDesc = (id) => items.find((i) => i.id === id)?.descripcion || "—";
  const itemPrecio = (id) => items.find((i) => i.id === id)?.precio || 0;
  const whName = (id) => bodegas.find((b) => b.id === id)?.nombre || "—";

  const valorTotal = useMemo(
    () => items.reduce((s, i) => s + totalItem(i.id) * (i.precio || 0), 0),
    [items, stockMap, bodegas],
  );
  const nBajoMin = useMemo(
    () => items.filter((i) => estadoStock(totalItem(i.id), i.stock_min, i.stock_max).key === "bajo").length,
    [items, stockMap, bodegas],
  );
  const ocsAbiertas = compras.filter((o) => !["recibida", "cancelada"].includes(o.estado)).length;

  function reponer(item) {
    const total = totalItem(item.id);
    const sugerido = Math.max(1, (item.stock_max || item.stock_min * 2 || 5) - total);
    setOcInit({ proveedor: item.proveedor || "", items: [{ item_id: item.id, cantidad: sugerido, precio: item.precio || 0 }] });
    setTab("compras");
  }

  if (loading) {
    return (
      <ModuleShell kicker="Gestión de Almacenes" title="Almacén & Compras" loading />
    );
  }

  return (
    <ModuleShell
      kicker="Gestión de Almacenes · Libbrecht / Pascual"
      title="Almacén & Compras"
      sub="Bodegas múltiples (tierra + a bordo), movimientos ligados a OT, y órdenes de compra con recepción automática al stock. Vistas kanban en Stock y Compras."
      error={error}
      onRetry={cargar}
      toolbar={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <FilterBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                <Icon size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
                {t.label}
              </FilterBtn>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>
            {tab === "stock" && `${bodegas.length} bodegas · ${clp(valorTotal)} · ${nBajoMin} bajo mín.`}
            {tab === "compras" && `${ocsAbiertas} OC abiertas · ${compras.length} totales`}
            {tab === "movs" && `${movimientos.length} movimientos`}
            {tab === "bodegas" && `${bodegas.length} bodegas`}
          </span>
        </div>
      }
    >
      {tab === "bodegas" && (
        <TabBodegas profile={profile} empresa={empresa} embarcaciones={embarcaciones}
          bodegas={bodegas} setBodegas={setBodegas} recargar={cargar} setError={setError} />
      )}
      {tab === "stock" && (
        <TabStock profile={profile} items={items} setItems={setItems} bodegas={bodegas} stockMap={stockMap}
          stock={stock} setStock={setStock} setError={setError} onReponer={reponer}
          equipos={equipos} destinos={destinos} embarcaciones={embarcaciones} />
      )}
      {tab === "movs" && (
        <TabMovimientos profile={profile} items={items} bodegas={bodegas} embarcaciones={embarcaciones} ots={ots}
          movimientos={movimientos} stockMap={stockMap} itemDesc={itemDesc} whName={whName}
          recargar={cargar} setError={setError} />
      )}
      {tab === "compras" && (
        <TabCompras profile={profile} items={items} bodegas={bodegas} compras={compras}
          comprasItems={comprasItems} stockMap={stockMap}
          itemDesc={itemDesc} itemPrecio={itemPrecio} whName={whName}
          ocInit={ocInit} onOcInitUsed={() => setOcInit(null)}
          recargar={cargar} setError={setError} />
      )}
    </ModuleShell>
  );
}
