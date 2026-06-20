import { hoyLocal } from "../../lib/fechas";
// Utilidades compartidas de los tabs de Almacén.
export const HOY = () => hoyLocal();
export const skey = (item_id, bodega_id) => `${item_id}__${bodega_id}`;
