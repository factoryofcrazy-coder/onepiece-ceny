// Slovenské skloňovanie podľa počtu: 1 karta, 2–4 karty, 5+ kariet.
export const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
/** „vyhoď 1 kartu / 3 karty / 5 kariet“ */
export const kartyAkuz = (n: number) => `${n} ${plural(n, "kartu", "karty", "kariet")}`;
/** „1 karta / 3 karty / 5 kariet“ */
export const karty = (n: number) => `${n} ${plural(n, "karta", "karty", "kariet")}`;
