const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export const brl = (cents: number): string => brlFmt.format(cents / 100);
export const brlCompact = (cents: number): string => compactFmt.format(cents / 100);

/** Valor digitado pelo usuário ("1.234,56" ou "1234.56") -> texto aceito pela API; null se vazio. */
export function moneyInput(raw: string): string | null {
  const s = raw.trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  return s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
}

export const centsToInput = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2024-05-10" -> "10 mai" (com o ano quando não é o ano atual). */
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const base = `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
  return y === new Date().getFullYear() ? base : `${base} ${String(y).slice(2)}`;
}

/** "2024-05" -> "mai/24" */
export const monthShort = (ym: string): string => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
/** "2024-05" -> "maio de 2024" */
export const monthLong = (ym: string): string => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

export function addMonths(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

/** Normaliza para comparar descrições (sem acento, minúsculas). */
export const normText = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Data e hora gravadas pelo banco ("AAAA-MM-DD HH:MM:SS", UTC) -> "02/10/2026 14:30" no fuso local. */
export function fmtStamp(ts: string): string {
  const d = new Date(`${ts.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
