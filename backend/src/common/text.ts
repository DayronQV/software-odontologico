/** Minúsculas y sin acentos: "Penicilína" y "penicilina" se consideran iguales. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
