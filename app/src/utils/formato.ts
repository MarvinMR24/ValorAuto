/** Formatos de texto y número para mostrar (sin depender de Intl). */

/** "mercedes-benz" -> "Mercedes-Benz", "f-150" -> "F-150", "grand cherokee" -> "Grand Cherokee". */
export function capitalizar(texto: string): string {
  return texto.replace(/(^|[\s-])([a-záéíóúñ])/g, (_, sep: string, letra: string) => sep + letra.toUpperCase());
}

/** 15694.33 -> "15.694" */
export function miles(valor: number): string {
  return String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 15694.33 -> "US$ 15.694" */
export function dolares(valor: number): string {
  return `US$ ${miles(valor)}`;
}

/** "85.000 km" a partir de lo escrito por el usuario ("85.000", "85000 km") -> 85000; null si no es válido. */
export function parsearEntero(texto: string): number | null {
  const limpio = texto.replace(/[^\d]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) ? n : null;
}
