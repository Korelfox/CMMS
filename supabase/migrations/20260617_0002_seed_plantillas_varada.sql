-- Seed: tres plantillas profesionales de varada para flota pesquera industrial chilena.
-- Basadas en estándares SOLAS, MARPOL, requisitos DIRECTEMAR y prácticas de astilleros
-- nacionales (ASMAR, Asenav, Harima).
--
-- Plantilla 1 – Varada Anual          (tipo: varada,        12 meses, ~28 ítems, ~380 HH)
-- Plantilla 2 – Varada de Clasificación (tipo: varada,      60 meses, ~40 ítems, ~720 HH)
-- Plantilla 3 – Parada de Puerto       (tipo: parada_puerto, sin periodo, ~18 ítems, ~165 HH)
--
-- empresa_id = NULL → globales (solo lectura vía RLS).

do $$
declare
  p_anual   uuid := gen_random_uuid();
  p_clasif  uuid := gen_random_uuid();
  p_puerto  uuid := gen_random_uuid();
begin

-- ── Cabeceras ─────────────────────────────────────────────────────────────────
insert into public.varada_plantillas
  (id, empresa_id, nombre, tipo, tipo_nave, intervalo_meses, descripcion)
values
  (p_anual,  null, 'Varada Anual – Pesquero Industrial',       'varada',        null, 12,
   'Varada en dique seco anual para buques pesqueros industriales. Incluye casco, propulsión, gobierno, cubierta, electricidad, seguridad y bodega. Cumple requisitos DIRECTEMAR / Capitanía de Puerto para certificación anual.'),
  (p_clasif, null, 'Varada de Clasificación 5 Años – Pesquero', 'varada',       null, 60,
   'Varada mayor de clasificación quinquenal. Inspección completa por sociedad clasificadora (DNV / Bureau Veritas / Lloyd''s). Incluye survey estructural completo, UT de espesores, inspección de maquinaria principal, LSA y sistema contraincendio. Habilitante para certificado de clase.'),
  (p_puerto, null, 'Parada de Puerto – Mantenimiento Programado', 'parada_puerto', null, null,
   'Parada planificada en muelle sin salida a dique. Cubre motor principal, generadores, sistemas de pesca y seguridad básica. Duración típica: 5–10 días. No requiere varada en seco.');

-- ─────────────────────────────────────────────────────────────────────────────
-- PLANTILLA 1: VARADA ANUAL (28 ítems)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.varada_plantilla_items
  (plantilla_id, empresa_id, sistema, descripcion, horas_estimadas, responsable_tipo, critico_zarpe, orden)
values

-- Casco y Estructura
(p_anual, null, 'Casco y Estructura', 'Limpieza de casco con hidrolavado a alta presión y remoción de biofouling (algas, mejillones, lapas)', 32, 'astillero', false, 10),
(p_anual, null, 'Casco y Estructura', 'Inspección visual completa del casco exterior: soldaduras, corrosión, abolladuras y daños mecánicos', 8, 'inspeccion', false, 20),
(p_anual, null, 'Casco y Estructura', 'Medición de espesores por ultrasonido (UT) según plan de muestreo aprobado por DIRECTEMAR', 16, 'inspeccion', false, 30),
(p_anual, null, 'Casco y Estructura', 'Aplicación de dos manos de pintura anticorrosiva epóxica y una mano de antifouling de alto rendimiento', 56, 'astillero', false, 40),
(p_anual, null, 'Casco y Estructura', 'Revisión, medición y reemplazo de ánodos de sacrificio de zinc en casco y apéndices', 10, 'astillero', false, 50),
(p_anual, null, 'Casco y Estructura', 'Inspección y sellado de penetraciones de casco: boquillas, sea chests, válvulas de fondo', 8, 'propio', true, 60),

-- Propulsión
(p_anual, null, 'Propulsión', 'Extracción, inspección dimensional y verificación de balance de hélice. Reparación de cavitación si aplica', 20, 'astillero', true, 70),
(p_anual, null, 'Propulsión', 'Medición de huelgo radial y axial del bocín (eje propulsor). Cambio de bocín si desgaste supera límite', 10, 'astillero', true, 80),
(p_anual, null, 'Propulsión', 'Cambio de sello de popa (lip seal o cartucho según modelo). Verificación de estanqueidad', 16, 'astillero', true, 90),
(p_anual, null, 'Propulsión', 'Inspección visual de acoplamiento eje–reductora: holguras, tornillos, disco flexible o cardán', 6, 'propio', false, 100),
(p_anual, null, 'Propulsión', 'Vaciado de reductora, inspección visual de engranajes y análisis espectroscópico de aceite', 10, 'propio', true, 110),
(p_anual, null, 'Propulsión', 'Reemplazo de ánodos del eje propulsor y de la bocina', 6, 'astillero', false, 120),

-- Gobierno
(p_anual, null, 'Gobierno', 'Inspección y medición de holguras del timón (codaste, mecha y pala). Verificación de apriete de pernos', 8, 'astillero', true, 130),
(p_anual, null, 'Gobierno', 'Revisión del tubo codastes del timón, cuadernal, pasacabos y lubricación general', 8, 'astillero', false, 140),
(p_anual, null, 'Gobierno', 'Prueba funcional del servomotor de gobierno: respuesta, caudal y presión en ambas bandas', 4, 'propio', true, 150),

-- Equipos de Cubierta
(p_anual, null, 'Cubierta y Aparejos', 'Limpieza profunda, ajuste de sellos e inspección estructural de escotillas de bodega y cámara de máquinas', 8, 'propio', false, 160),
(p_anual, null, 'Cubierta y Aparejos', 'Mantención de winches de arrastre/cerco: cambio de aceite, revisión de frenos, bandas y embragues', 20, 'propio', false, 170),
(p_anual, null, 'Cubierta y Aparejos', 'Revisión y engrase de cabrestantes de amarre, molinete de ancla y rodillos de guía', 10, 'propio', false, 180),

-- Sistema Eléctrico
(p_anual, null, 'Sistema Eléctrico', 'Inspección de cableados, canaletas y prensaestopas en zonas húmedas, cubiertas y cámara de máquinas', 12, 'propio', false, 190),
(p_anual, null, 'Sistema Eléctrico', 'Revisión y limpieza de conectores de cubierta, luminarias y cajas de empalme expuestas', 8, 'propio', false, 200),
(p_anual, null, 'Sistema Eléctrico', 'Prueba de alumbrado de navegación según Colreg (7 luces): encendido, ángulos y alcance visual', 4, 'propio', true, 210),

-- Seguridad y Salvamento (SOLAS)
(p_anual, null, 'Seguridad y Salvamento', 'Revisión y prueba de balsas salvavidas inflables: indicadores HRU, pingas, luces de destello. Certificación anual', 6, 'inspeccion', true, 220),
(p_anual, null, 'Seguridad y Salvamento', 'Inspección de equipos de lucha contra incendio: extintores portátiles, redes CO₂, bocas de incendio', 6, 'inspeccion', true, 230),
(p_anual, null, 'Seguridad y Salvamento', 'Prueba de bombas y dispositivos de achique. Revisión de válvulas de fondo y alarmas de nivel de sentina', 8, 'propio', true, 240),

-- Bodega y Procesado
(p_anual, null, 'Bodega y Procesado', 'Limpieza profunda, desinfección con hipoclorito y secado de bodegas de pesca y cámaras frigoríficas', 24, 'propio', false, 250),
(p_anual, null, 'Bodega y Procesado', 'Revisión del sistema de refrigeración de bodega: compresor, condensador, evaporadores y aislaciones', 16, 'tercero', false, 260),

-- Servicios Generales
(p_anual, null, 'Servicios Generales', 'Prueba hidrostática de mangueras contraincendio y revisión de válvulas de servicio de cubierta', 4, 'propio', false, 270),
(p_anual, null, 'Servicios Generales', 'Inspección del sistema de achique de sentinas, tanques de lastre y sistema de agua de mar', 6, 'propio', false, 280),
(p_anual, null, 'Servicios Generales', 'Inspección y renovación de grasa en bochas, cierres y articulaciones de portones y trampillas', 4, 'propio', false, 290);

-- ─────────────────────────────────────────────────────────────────────────────
-- PLANTILLA 2: VARADA DE CLASIFICACIÓN 5 AÑOS (40 ítems)
-- Incluye todo el scope anual más inspecciones de sociedad clasificadora
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.varada_plantilla_items
  (plantilla_id, empresa_id, sistema, descripcion, horas_estimadas, responsable_tipo, critico_zarpe, orden)
values

-- Casco y Estructura (survey completo)
(p_clasif, null, 'Casco y Estructura', 'Limpieza de casco con hidrolavado a alta presión y remoción de biofouling', 40, 'astillero', false, 10),
(p_clasif, null, 'Casco y Estructura', 'Survey estructural completo por sociedad clasificadora: inspección visual de todos los compartimentos, cuadernas, mamparos y doble fondo', 24, 'inspeccion', false, 20),
(p_clasif, null, 'Casco y Estructura', 'Plan de medición UT completo: espesores de fondo, costados, cubiertas, cuadernas y mamparos según tabla clase', 40, 'inspeccion', false, 30),
(p_clasif, null, 'Casco y Estructura', 'Reparación de zonas con pérdida de espesor superior al 20% (refuerzo o reemplazo de planchas)', 80, 'astillero', false, 40),
(p_clasif, null, 'Casco y Estructura', 'Inspección de quilla de balance y apéndices hidrodinámicos. Alineamiento y ajuste si aplica', 12, 'astillero', false, 50),
(p_clasif, null, 'Casco y Estructura', 'Inspección de línea de flotación y survey de francobordo (loadline renewal)', 8, 'inspeccion', true, 60),
(p_clasif, null, 'Casco y Estructura', 'Aplicación de sistema de pintura completo: dos manos anticorrosiva epóxica + antifouling de cobre', 72, 'astillero', false, 70),
(p_clasif, null, 'Casco y Estructura', 'Reemplazo total de ánodos de sacrificio según cálculo de corrientes y área a proteger', 14, 'astillero', false, 80),
(p_clasif, null, 'Casco y Estructura', 'Revisión y prueba hidrostática de válvulas de fondo y boquillas de casco (sea chests)', 10, 'propio', true, 90),

-- Propulsión
(p_clasif, null, 'Propulsión', 'Extracción completa del sistema de eje: hélice, eje, bocín, sello de popa e inspección dimensional total', 32, 'astillero', true, 100),
(p_clasif, null, 'Propulsión', 'Survey del eje propulsor por sociedad clasificadora: ensayo de partículas magnéticas (MT) o ultrasonido', 12, 'inspeccion', true, 110),
(p_clasif, null, 'Propulsión', 'Cambio de bocín (rodamiento de eje) y verificación de alineamiento del eje con reductora', 20, 'astillero', true, 120),
(p_clasif, null, 'Propulsión', 'Cambio de sello de popa y ánodos del eje propulsor', 14, 'astillero', true, 130),
(p_clasif, null, 'Propulsión', 'Inspección y overhaul de reductora: engranajes, cojinetes, sellos y análisis espectrométrico de aceite', 32, 'tercero', true, 140),
(p_clasif, null, 'Propulsión', 'Inspección y prueba de toma de fuerza (PTO) y embrague hidráulico si aplica', 12, 'tercero', false, 150),

-- Gobierno
(p_clasif, null, 'Gobierno', 'Survey del timón por sociedad clasificadora: holguras, mecha, pala y soldaduras', 16, 'inspeccion', true, 160),
(p_clasif, null, 'Gobierno', 'Overhaul del servomotor de gobierno: cambio de sellos, válvulas y aceite hidráulico', 24, 'tercero', true, 170),
(p_clasif, null, 'Gobierno', 'Inspección del sistema de gobierno de emergencia y prueba de control desde el timón de respeto', 6, 'propio', true, 180),

-- Maquinaria Principal
(p_clasif, null, 'Motor Principal', 'Inspección general de motor principal: culatas, camisas, pistones, cigüeñal y turbocompresor', 40, 'tercero', true, 190),
(p_clasif, null, 'Motor Principal', 'Survey del motor principal por sociedad clasificadora (borescope o apertura según plan)', 16, 'inspeccion', true, 200),
(p_clasif, null, 'Motor Principal', 'Inspección y prueba de inyectores (banco de prueba): caudal, presión de apertura y pulverización', 12, 'tercero', false, 210),
(p_clasif, null, 'Motor Principal', 'Revisión de intercambiadores de calor (enfriador de agua y aceite): limpieza química y prueba de presión', 10, 'propio', false, 220),

-- Sistema Eléctrico
(p_clasif, null, 'Sistema Eléctrico', 'Survey eléctrico por sociedad clasificadora: tableros, distribución, cables y aislamiento (Megger)', 20, 'inspeccion', false, 230),
(p_clasif, null, 'Sistema Eléctrico', 'Revisión de generadores auxiliares: devanados, escobillas, reguladores de voltaje y protecciones', 24, 'tercero', false, 240),
(p_clasif, null, 'Sistema Eléctrico', 'Prueba y calibración de todos los instrumentos de navegación: radar, GPS diferencial, AIS, ECDIS', 12, 'tercero', true, 250),
(p_clasif, null, 'Sistema Eléctrico', 'Revisión de instalación eléctrica en zonas clasificadas (cámara de pinturas, tanques de combustible)', 8, 'inspeccion', false, 260),

-- Seguridad y Salvamento (survey SOLAS quinquenal)
(p_clasif, null, 'Seguridad y Salvamento', 'Survey SOLAS completo: balsas salvavidas, trajes de inmersión, EPIs, luces de socorro (pyrotecnia)', 12, 'inspeccion', true, 270),
(p_clasif, null, 'Seguridad y Salvamento', 'Inspección y prueba del sistema fijo de extinción de incendio (CO₂ o espuma) de cámara de máquinas', 10, 'inspeccion', true, 280),
(p_clasif, null, 'Seguridad y Salvamento', 'Inspección del sistema de detección temprana de incendio: detectores, paneles y alarmas', 8, 'inspeccion', true, 290),
(p_clasif, null, 'Seguridad y Salvamento', 'Prueba hidrostática de cilindros CO₂ y recarga o reemplazo según fecha de vencimiento', 6, 'tercero', true, 300),
(p_clasif, null, 'Seguridad y Salvamento', 'Inspección de sistema de fondeo: anclas, cadenas, esclusas y capachina. Prueba de largada de emergencia', 8, 'propio', true, 310),

-- Cubierta y Aparejos
(p_clasif, null, 'Cubierta y Aparejos', 'Overhaul de winches de arrastre o cerco: engranajes, frenos hidráulicos, sellos y rodamientos', 32, 'tercero', false, 320),
(p_clasif, null, 'Cubierta y Aparejos', 'Inspección de grúas de cubierta y pescantes de bote de rescate: prueba de carga (110% SWL)', 12, 'inspeccion', true, 330),
(p_clasif, null, 'Cubierta y Aparejos', 'Inspección y ajuste de escotillas de carga: sellos, cierres, drenajes y prueba de estanqueidad', 16, 'propio', false, 340),

-- Sistemas de Bombas y Tuberías
(p_clasif, null, 'Sistemas de Bombas', 'Inspección de todas las bombas de achique, lastre y contraincendio: rodetes, cierres mecánicos y válvulas', 20, 'propio', true, 350),
(p_clasif, null, 'Sistemas de Bombas', 'Prueba hidrostática de tuberías de presión según plan de tuberías clase (>10 años de servicio)', 16, 'inspeccion', false, 360),

-- Bodega y Procesado
(p_clasif, null, 'Bodega y Procesado', 'Limpieza, desinfección y renovación de aislaciones de bodega de pesca. Inspección de coeficiente K', 32, 'tercero', false, 370),
(p_clasif, null, 'Bodega y Procesado', 'Overhaul del sistema de refrigeración: compresor, válvulas termostáticas, purga del circuito y prueba de hermeticidad con nitrógeno', 24, 'tercero', false, 380),

-- Marpol
(p_clasif, null, 'MARPOL y Medio Ambiente', 'Inspección del separador de sentinas (Oil/Water Separator): membrana, sensores y registro ORB', 8, 'inspeccion', true, 390),
(p_clasif, null, 'MARPOL y Medio Ambiente', 'Inspección del sistema de gestión de aguas de lastre (si aplica Convenio BWM)', 6, 'inspeccion', false, 400);

-- ─────────────────────────────────────────────────────────────────────────────
-- PLANTILLA 3: PARADA DE PUERTO (18 ítems)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.varada_plantilla_items
  (plantilla_id, empresa_id, sistema, descripcion, horas_estimadas, responsable_tipo, critico_zarpe, orden)
values

-- Motor Principal
(p_puerto, null, 'Motor Principal', 'Cambio de aceite motor principal y filtros de aceite (por tiempo o horas según fabricante)', 12, 'propio', false, 10),
(p_puerto, null, 'Motor Principal', 'Cambio de filtros de agua de mar, agua dulce y combustible del motor principal', 6, 'propio', false, 20),
(p_puerto, null, 'Motor Principal', 'Revisión y ajuste de válvulas de admisión y escape, medición de presiones de compresión', 12, 'tercero', false, 30),
(p_puerto, null, 'Motor Principal', 'Inspección y prueba de inyectores en banco: presión de apertura, pulverización y estanqueidad', 16, 'tercero', false, 40),
(p_puerto, null, 'Motor Principal', 'Revisión de correas de alternador, bomba de agua y tensor. Cambio preventivo si vida > 3.000 h', 6, 'propio', false, 50),
(p_puerto, null, 'Motor Principal', 'Limpieza e inspección del turbocompresor: rotor, difusor, lado caliente y lado frío', 8, 'tercero', false, 60),

-- Generadores
(p_puerto, null, 'Generadores', 'Cambio de aceite y filtros de generadores auxiliares. Revisión de correas y batería de arranque', 8, 'propio', false, 70),
(p_puerto, null, 'Generadores', 'Prueba de carga y transferencia automática del generador de emergencia', 4, 'propio', true, 80),

-- Reductora y Propulsión
(p_puerto, null, 'Propulsión', 'Cambio de aceite y revisión visual interior de reductora. Análisis de aceite si supera 1.000 h', 10, 'propio', false, 90),
(p_puerto, null, 'Propulsión', 'Inspección de sellos del eje desde sala de máquinas: humedad, huelgo y vibración en marcha', 4, 'propio', false, 100),

-- Gobierno
(p_puerto, null, 'Gobierno', 'Revisión del aceite hidráulico del servomotor y guardines del timón. Prueba de respuesta en ambas bandas', 4, 'propio', true, 110),

-- Sistema Eléctrico y Navegación
(p_puerto, null, 'Sistema Eléctrico', 'Revisión de panel eléctrico principal: termografía de tablero, bornes y protecciones térmicas', 6, 'propio', false, 120),
(p_puerto, null, 'Sistema Eléctrico', 'Inspección y calibración de equipos de navegación: radar, GPS, AIS, ecosonda y VHF', 8, 'tercero', true, 130),

-- Seguridad
(p_puerto, null, 'Seguridad y Salvamento', 'Revisión de balsas salvavidas, EPIs, extintores portátiles y luces de socorro (pirotecnia)', 4, 'inspeccion', true, 140),
(p_puerto, null, 'Seguridad y Salvamento', 'Prueba de bombas de achique de sentinas y revisión de alarmas de nivel', 4, 'propio', true, 150),

-- Aparejos y Bodega
(p_puerto, null, 'Cubierta y Aparejos', 'Mantención de winches de red y aparejo de cubierta: lubricación, inspección de frenos y embragues', 16, 'propio', false, 160),
(p_puerto, null, 'Bodega y Procesado', 'Limpieza y desinfección básica de bodega de pesca y revisión del sistema de frío', 12, 'propio', false, 170),
(p_puerto, null, 'Servicios Generales', 'Revisión de amarras, eslingas de maniobra, ancla y cadena. Reemplazo de grilletes vencidos', 6, 'propio', false, 180);

end $$;
