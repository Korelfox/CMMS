// Utilidades compartidas de los tabs de Almacén.
export const HOY = () => new Date().toISOString().slice(0, 10);
export const skey = (item_id, bodega_id) => `${item_id}__${bodega_id}`;
