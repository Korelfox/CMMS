import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Warehouse, ArrowRightLeft, ShoppingCart } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { C } from "../theme";
import { Card, PageHead, ErrorBanner, InlineSpinner } from "../ui";
import { skey } from "./almacen/util";
import TabBodegas from "./almacen/TabBodegas";
import TabMovimientos from "./almacen/TabMovimientos";
import TabStock from "./almacen/TabStock";
import TabCompras from "./almacen/TabCompras";

export default function Almacen() {
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
  const [ocInit, setOcInit] = useState(null); // ítem pre-cargado al navegar desde "Reponer"

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

  // Mapa de stock para lecturas rápidas: { item_id__bodega_id : cantidad }
  const stockMap = useMemo(() => {
    const m = new Map();
    stock.forEach((s) => m.set(skey(s.item_id, s.bodega_id), Number(s.cantidad) || 0));
    return m;
  }, [stock]);

  const itemDesc   = (id) => items.find((i) => i.id === id)?.descripcion || "—";
  const itemPrecio = (id) => items.find((i) => i.id === id)?.precio || 0;
  const whName     = (id) => bodegas.find((b) => b.id === id)?.nombre || "—";

  function reponer(item) {
    const total     = bodegas.reduce((s, b) => s + (stockMap.get(skey(item.id, b.id)) || 0), 0);
    const sugerido  = Math.max(1, (item.stock_max || item.stock_min * 2 || 5) - total);
    setOcInit({ proveedor: item.proveedor || "", items: [{ item_id: item.id, cantidad: sugerido, precio: item.precio || 0 }] });
    setTab("compras");
  }

  if (loading) return <div><PageHead kicker="Gestión de Almacenes" title="Almacén & Compras" /><Card><InlineSpinner label="Cargando almacén…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Gestión de Almacenes · Libbrecht / Pascual" title="Almacén & Compras"
        sub="Bodegas múltiples (tierra + a bordo), movimientos con consumo ligado a OT, y órdenes de compra con recepción que actualiza el stock automáticamente." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <TabBtn active={tab === "bodegas"} onClick={() => setTab("bodegas")} icon={Warehouse}>Bodegas</TabBtn>
        <TabBtn active={tab === "stock"} onClick={() => setTab("stock")} icon={Warehouse}>Stock por Bodega</TabBtn>
        <TabBtn active={tab === "movs"} onClick={() => setTab("movs")} icon={ArrowRightLeft}>Movimientos</TabBtn>
        <TabBtn active={tab === "compras"} onClick={() => setTab("compras")} icon={ShoppingCart}>Órdenes de Compra</TabBtn>
      </div>

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
    </div>
  );
}

function TabBtn({ active, onClick, children, icon: Icon }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9, border: `1px solid ${active ? C.cyan : C.line}`, background: active ? C.cyan : "#fff", color: active ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
      <Icon size={15} />{children}
    </button>
  );
}
