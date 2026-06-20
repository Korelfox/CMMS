# INFORME EJECUTIVO DE AUDITORÍA — CMMS Korelfox

**Fecha:** 19 de junio 2026  
**Versión auditada:** `52aae85`  
**Alcance:** 100% del código fuente, flujo de datos OT, infraestructura  
**Overall Score:** ⭐⭐⭐⭐ (4.1/5)

---

## 1. Resumen General

El sistema CMMS Korelfox está en un estado de madurez técnica **sólido**, con arquitectura bien estructurada y decisiones de diseño acertadas. La auditoría con agentes especializados revisó 70+ componentes, 50+ migraciones SQL, 7 funciones Edge y toda la lógica pura en `lib/`. Se identificaron **4 hallazgos críticos**, **4 altos**, y **6 medios**.

---

## 2. Puntuación por Área

| Área | Nota | Comentario |
|------|:----:|------------|
| Autenticación | ⭐⭐⭐⭐⭐ | Timeout+failsafe, refresh token, carga segura. Ejemplar. |
| Conexión Supabase | ⭐⭐⭐⭐⭐ | Lock anti-bug de Web Locks API. Bien documentado. |
| Flujo OT | ⭐⭐⭐⭐ | 6 orígenes, 5 estados, 25 destinos. Bien trazado. |
| Capa de datos | ⭐⭐⭐⭐ | CRUD sólido. Falta batch, soft-delete y filtros avanzados. |
| Modo Offline | ⭐⭐⭐⭐ | Cola outbox, cache IndexedDB, conflictos sin optimistic locking. |
| Análisis (Weibull/KPI/Pareto) | ⭐⭐⭐⭐⭐ | Idempotencia del lazo autónomo impecable. Predictivo conservador. |
| Alertas → OT | ⭐⭐⭐⭐ | Deep-link para OTs críticas. IA sin links individuales. |
| Manejo de errores | ⭐⭐⭐⭐ | ErrorBoundary único con key={view}, bien aislado. |

---

## 3. Hallazgos

### 🔴 Críticos (corregir antes de escalar)

| ID | Hallazgo | Ubicación | Riesgo |
|----|----------|-----------|--------|
| C1 | **Transiciones de estado sin validación** — se puede cerrar una OT sin pasar por ejecución | `OrdenesTrabajo.jsx:453` | KPIs y Weibull contaminados |
| C2 | **N+1 en fotos** — `listarFotos()` genera 1 request HTTP por cada adjunto | `lib/fotos.js:78` | UX degradada con muchos adjuntos |
| C3 | **Conflictos offline sin detección** — último en sincronizar pisa | `lib/offline.js` | Pérdida de datos |
| C4 | **Caché stale** — fleetCache no se invalida tras mutaciones | `lib/fleetCache.js` | Usuario ve datos viejos |

### 🟠 Altos

| ID | Hallazgo | Impacto |
|----|----------|---------|
| A1 | OTs `solicitada`/`planificada` pueden estancarse meses sin alerta | Backlog invisible |
| A2 | Sin soft-delete — borrado accidental irrecuperable | Pérdida de datos |
| A3 | Sin operaciones batch en db.js | Rendimiento |
| A4 | `hrs_oper_desde=0` → dato huérfano para Weibull | Calidad analítica |

### 🟡 Medios

| ID | Hallazgo |
|----|----------|
| M1 | `flushOutbox()` y `subirFotos()` secuenciales (lentos con 30+ pendientes) |
| M2 | `borrarFoto()` no atómica — riesgo de referencia huérfana |
| M3 | Alertas IA sin deep-link a OTs individuales |
| M4 | `catch {}` vacíos silencian errores |
| M5 | Sin KPI Time-to-Execute |
| M6 | `equipo_id` no obligatorio en OTs correctivas |

---

## 4. Mapa de Conectores OT

```
ORÍGENES (6)          CICLO DE VIDA (5)         DESTINOS (25)

Solicitudes ─┐                              ┌── Tablero, KPIs, Pareto
Manual UI ───┤    SOLICITADA                ├── Weibull, ConfiabilidadML
Auto PM ─────┼──▶ PLANIFICADA ──▶          ├── RCA, PdM, Criticidad
Auto Pred ───┤    PROGRAMADA      ANALISIS  ├── Fallas, RiesgoFalla
SQL Cron ────┤    EN_EJECUCIÓN ──▶          ├── CGM, Presupuesto
Programación─┘    CERRADA                   ├── LucroCesante, Rentabilidad
                                             ├── Cumplimiento, Backlog
                ALERTAS (12 generadores)     ├── MinMax, CAPEX
                ├── PM vencidos              ├── AuditoriaMES, Bitácora
                ├── OT críticas/altas        ├── Planificación Puerto
                ├── Datos ISO (sin codificar)├── Informe Ejecutivo IA
                ├── OT sin valorizar         ├── Vigilante IA, Copiloto
                └── IA calidad datos         └── Inventario, Almacén, OCR
```

---

## 5. Lo que funciona bien ✅

- **Lazo autónomo idempotente** — huella `pm:{plan}:{hito}` evita spam de OTs duplicadas
- **Predictivo conservador** — Weibull β>1 + r²≥0.75 + criticidad A/B → baja tasa de falsos positivos
- **Auth a prueba de cuelgues** — timeout 5s + failsafe + reintento automático
- **Modo Campo funcional** — offline-first, PWA completa, sincronización diferida
- **25 módulos de análisis** alimentados desde el mismo pool de OTs — single source of truth

---

## 6. Plan de Acción Recomendado

| # | Acción | Esfuerzo | Impacto |
|---|--------|:---:|:---:|
| 1 | Matriz de transiciones de estado válidas | 1h | 🔴 |
| 2 | Cache de signed URLs en fotos (TTL 50min) | 2h | 🔴 |
| 3 | Invalidar fleetCache post-mutación | 3h | 🔴 |
| 4 | Alertas de OTs estancadas por antigüedad | 2h | 🟠 |
| 5 | Soft-delete en tablas principales | 6h | 🟠 |
| 6 | Optimistic locking en outbox offline | 4h | 🔴 |
| 7 | Concurrencia en flushOutbox (batch de 5) | 1h | 🟡 |

**Estimación total críticos:** 10h  
**Estimación total altos + medios:** 18h

---

## 7. Conclusión

Korelfox CMMS está en excelente forma para un sistema de esta complejidad. La arquitectura es sólida, la lógica pura está bien separada de la UI, y las decisiones de diseño (idempotencia, failsafe, offline-first) son profesionalmente correctas. Los 4 hallazgos críticos son acotados y tienen solución directa. Corregidos estos, el sistema está listo para escalar a producción multi-tenant con alta concurrencia.

---

*Informe generado por agentes especializados de auditoría — código + flujo de datos + integración*
