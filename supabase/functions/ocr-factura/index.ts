// ============================================================
//  Edge Function: ocr-factura
//  OCR de facturas de proveedores vía Claude Vision.
//  Recibe { image_base64, media_type } y devuelve JSON estructurado
//  con proveedor, fecha, folio, ítems, subtotal, IVA y total.
//
//  Auth: valida JWT de usuario de Supabase (getUser).
//  Secreto requerido: ANTHROPIC_API_KEY
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO = "claude-sonnet-4-6";

const SYSTEM = `Eres un OCR especializado en documentos tributarios electrónicos (DTE) chilenos: facturas, boletas, notas de débito y guías de despacho de proveedores de repuestos, insumos navales e industriales.

Tu tarea: analizar la imagen y extraer TODOS los datos visibles con precisión máxima.

RESPONDE ÚNICAMENTE con JSON válido. Sin explicaciones, sin comentarios, sin bloques de código, sin texto antes ni después del JSON.

Formato exacto:
{
  "folio": "número de factura/boleta como aparece o null",
  "tipo_documento": "Factura Electrónica|Boleta Electrónica|Nota de Débito|Guía de Despacho|otro",
  "fecha": "YYYY-MM-DD (convierte dd/mm/yyyy si es necesario) o null",
  "proveedor": "razón social completa del emisor",
  "rut_proveedor": "RUT del emisor sin puntos con guión (ej: 76543210-9) o null",
  "razon_social_cliente": "nombre del receptor si aparece o null",
  "items": [
    {
      "descripcion": "descripción literal del ítem tal como aparece",
      "codigo": "código o SKU del ítem si aparece o null",
      "cantidad": número (1 si no se indica),
      "unidad": "UN|KG|LT|M|HR|GL|caja|otro",
      "precio_unitario": número entero sin símbolos,
      "precio_total": número entero sin símbolos
    }
  ],
  "neto": número entero (subtotal antes de IVA),
  "iva": número entero,
  "total": número entero,
  "observaciones": "notas de crédito, condiciones u otro texto relevante o null"
}

REGLAS CRÍTICAS para números chilenos:
- El punto (.) separa miles: $1.234.567 → 1234567
- La coma (,) es decimal: $1.234,56 → 1234  (redondear a entero)
- Los símbolos $ y CLP no forman parte del número
- Si no puedes leer un número con certeza, usa null (nunca inventes)
- Si hay descuento por línea, calcula precio_total = cantidad × precio_unitario × (1 - descuento/100)`;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "No autorizado." }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "FALTA_API_KEY" }, 503);

    const body = await req.json();
    const { image_base64, media_type = "image/jpeg" } = body;

    if (!image_base64 || typeof image_base64 !== "string") {
      return json({ error: "image_base64 requerida." }, 400);
    }

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!tiposPermitidos.includes(media_type)) {
      return json({ error: `Tipo de imagen no soportado: ${media_type}` }, 400);
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 3000,
        thinking: { type: "disabled" },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type, data: image_base64 },
              },
              {
                type: "text",
                text: "Extrae todos los datos de este documento tributario en el formato JSON especificado. Solo JSON, sin texto adicional.",
              },
            ],
          },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return json({ error: `Anthropic ${upstream.status}: ${errText.slice(0, 400)}` }, 502);
    }

    const result = await upstream.json();
    const rawText = result.content?.[0]?.text ?? "";

    // Extrae el primer objeto JSON de la respuesta
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return json({ error: "No se pudo extraer JSON de la respuesta.", raw: rawText.slice(0, 500) }, 422);
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(match[0]);
    } catch {
      return json({ error: "JSON inválido en la respuesta.", raw: rawText.slice(0, 500) }, 422);
    }

    return json({ ok: true, data: extracted });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
