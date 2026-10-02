/** Leitura da planilha .ods original e conversão para lançamentos/acertos. */
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { categorize, norm } from "../src/shared/categorize";

export type Cell = number | string | Date | null;
type XNode = Record<string, any>;

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: false });

function textOf(nodes: XNode[]): string {
  let s = "";
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n)) {
      if (k === "#text") s += String(v);
      else if (k !== ":@" && Array.isArray(v)) s += textOf(v);
    }
  }
  return s.trim();
}

/** Percorre em profundidade e devolve os nós com a tag dada, sem entrar dentro deles. */
function find(nodes: XNode[], tag: string, out: XNode[] = []): XNode[] {
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (k === tag) out.push(n);
      else if (Array.isArray(v)) find(v, tag, out);
    }
  }
  return out;
}

const attr = (n: XNode, name: string): string | undefined => n[":@"]?.["@_" + name];

export function readOds(path: string): Record<string, Cell[][]> {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const content = files["content.xml"];
  if (!content) throw new Error("Arquivo .ods inválido (sem content.xml).");
  const doc = parser.parse(strFromU8(content)) as XNode[];
  const sheets: Record<string, Cell[][]> = {};
  for (const table of find(doc, "table:table")) {
    const rows: Cell[][] = [];
    for (const row of find(table["table:table"], "table:table-row")) {
      const cells: Cell[] = [];
      for (const c of row["table:table-row"] as XNode[]) {
        if (!c["table:table-cell"]) continue;
        const rep = Math.min(Number(attr(c, "table:number-columns-repeated") ?? 1), 30);
        const type = attr(c, "office:value-type");
        let val: Cell = null;
        if (type === "float" || type === "currency" || type === "percentage") val = Number(attr(c, "office:value"));
        else if (type === "date") val = new Date(`${String(attr(c, "office:date-value")).slice(0, 10)}T00:00:00Z`);
        else if (type) val = textOf(c["table:table-cell"]) || null;
        for (let i = 0; i < rep; i++) cells.push(val);
      }
      while (cells.length && cells[cells.length - 1] === null) cells.pop();
      const repeat = Math.min(Number(attr(row, "table:number-rows-repeated") ?? 1), cells.length ? 1000 : 5);
      for (let i = 0; i < repeat; i++) rows.push([...cells]);
    }
    sheets[attr(table, "table:name") ?? `aba${Object.keys(sheets).length}`] = rows;
  }
  return sheets;
}

// ---------------------------------------------------------------- datas

const DAY = 86_400_000;
const SUSPECT_DAYS = 120; // mais longe que isso da mediana das vizinhas = provável erro de digitação
const ACCEPT_DAYS = 60; // a correção só é aplicada se ficar a menos que isso da mediana
const dayNum = (d: Date) => Math.floor(d.getTime() / DAY);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const mk = (y: number, m: number, d: number): Date | null => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null;
};

export interface Item {
  row: number;
  date: Cell;
  description: string;
  final?: Date;
}

/**
 * A lista da planilha é cronológica, então uma data muito distante da mediana das linhas vizinhas
 * é tratada como erro de digitação (ano trocado ou dia/mês invertidos) e corrigida. Linhas sem data
 * herdam a da linha anterior. Cada correção é registrada em `report`.
 */
export function fixDates(items: Item[], report: string[], label: string): void {
  const ymd = items.map((it): [number, number, number] | null => {
    if (it.date instanceof Date) return [it.date.getUTCFullYear(), it.date.getUTCMonth() + 1, it.date.getUTCDate()];
    if (typeof it.date === "string") {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(it.date.trim());
      if (m) return [Number(m[3]), Number(m[2]), Number(m[1])];
    }
    return null;
  });
  const orig = ymd.map((p) => (p ? mk(...p) : null));
  const tag = (it: Item) => `[${label}] linha ${it.row}: '${it.description}'`;

  items.forEach((it, i) => {
    const near: number[] = [];
    for (let j = Math.max(0, i - 3); j <= Math.min(items.length - 1, i + 3); j++) {
      const o = orig[j];
      if (j !== i && o) near.push(dayNum(o));
    }
    const d = orig[i];
    const p = ymd[i];
    if (!near.length || !p) return;
    near.sort((a, b) => a - b);
    const exp = near[Math.floor(near.length / 2)]!;
    if (d && Math.abs(dayNum(d) - exp) <= SUSPECT_DAYS) {
      it.final = d;
      return;
    }
    const [y, m, dd] = p;
    const expYear = new Date(exp * DAY).getUTCFullYear();
    const years = new Set([y - 2, y - 1, y, y + 1, y + 2, expYear - 1, expYear, expYear + 1]);
    let best: Date | null = null;
    for (const yy of years) {
      for (const [mm, d2] of [[m, dd], [dd, m]] as const) {
        const c = mk(yy, mm, d2);
        if (c && (!best || Math.abs(dayNum(c) - exp) < Math.abs(dayNum(best) - exp))) best = c;
      }
    }
    const raw = it.date instanceof Date ? iso(it.date) : String(it.date);
    if (best && Math.abs(dayNum(best) - exp) <= ACCEPT_DAYS) {
      it.final = best;
      report.push(`${tag(it)} data ${raw} -> ${iso(best)}`);
    } else {
      if (d) it.final = d;
      report.push(`${tag(it)} data ${raw} parece fora de ordem (vizinhas ~${iso(new Date(exp * DAY))})${d ? ", mantida" : ""}`);
    }
  });

  let last: Date | undefined;
  for (const it of items) {
    if (it.final) last = it.final;
    else if (last) {
      it.final = last;
      report.push(`${tag(it)} sem data -> ${iso(last)} (linha anterior)`);
    }
  }
  let next: Date | undefined;
  for (const it of [...items].reverse()) {
    if (it.final) next = it.final;
    else if (next) {
      it.final = next;
      report.push(`${tag(it)} sem data -> ${iso(next)} (linha seguinte)`);
    }
  }
}

// ---------------------------------------------------------------- conversão

export interface ImportedExpense extends Item {
  amount: number;
  kind: "despesa" | "venda";
  user: string;
  category: string;
}
export interface ImportedSettlement extends Item {
  from: string;
  to: string;
  amount: number;
}
export interface ImportResult {
  expenses: ImportedExpense[];
  settlements: ImportedSettlement[];
  expectedBalance: number | null; // "Saldo Cleiton" calculado pela própria planilha (aba Atual)
  report: string[];
}

export function extract(sheets: Record<string, Cell[][]>, onlyCurrent = false): ImportResult {
  const report: string[] = [];
  const expenses: ImportedExpense[] = [];
  const settlements: ImportedSettlement[] = [];
  let expectedBalance: number | null = null;

  for (const [name, rows] of Object.entries(sheets)) {
    if (onlyCurrent && name !== "Atual") continue;
    const header = rows[0];
    if (!header || String(header[0] ?? "").trim().toLowerCase() !== "despesa - descrição") continue;
    const people: [number, string][] = [[2, String(header[2])], [3, String(header[3])]];
    const acertoCol = header.indexOf("Acerto - Data");
    const items: ImportedExpense[] = [];
    const setl: ImportedSettlement[] = [];
    let inSettle = true;

    for (let i = 1; i < rows.length; i++) {
      const row: Cell[] = [...rows[i]!, ...Array(14).fill(null)];
      const rowNo = i + 1;
      const label = row[0] != null ? String(row[0]).trim() : "";
      if (name === "Atual" && String(row[5]).trim() === "Saldo Cleiton" && typeof row[6] === "number") expectedBalance = row[6];

      if (acertoCol >= 0 && inSettle) {
        const a = row[acertoCol]!;
        if (typeof a === "string" && a.trim().toLowerCase() === "total") inSettle = false;
        else if (a !== null || row[acertoCol + 1] || row[acertoCol + 2]) {
          for (const k of [1, 2]) {
            const v = row[acertoCol + k];
            if (typeof v === "number" && v > 0) {
              setl.push({
                row: rowNo, date: a, description: String(row[acertoCol + 3] ?? "Acerto"),
                from: String(header[acertoCol + k]), to: String(header[acertoCol + 3 - k]), amount: v,
              });
            }
          }
        }
      }
      if (label.toLowerCase() === "total") break;
      if (!label) continue;
      // O "Ajuste saldo" só carrega o saldo de uma aba para a outra. Importando todas as abas, não é necessário.
      if (label.toLowerCase().startsWith("ajuste saldo") && !onlyCurrent) continue;

      for (const [col, person] of people) {
        const v = row[col];
        if (v === null || v === "") continue;
        if (typeof v !== "number") {
          report.push(`[${name}] linha ${rowNo}: '${label}' valor '${v}' ignorado (não é número)`);
          continue;
        }
        if (v === 0) continue;
        let description = label;
        if (/^desconto vendas/i.test(label)) description = "Venda Navman e Buja";
        if (/^ajuste saldo/i.test(label)) description = "Ajuste de saldo (saldo anterior)";
        const kind = v < 0 ? "venda" : "despesa";
        items.push({
          row: rowNo, date: row[1]!, description, amount: Math.abs(v), kind, user: person,
          category: description.startsWith("Ajuste de saldo") ? "Outros" : categorize(description, kind),
        });
      }
    }
    fixDates(items, report, name);
    // Acertos são poucos e não seguem ordem cronológica, então a correção automática não vale para eles.
    for (const s of setl) {
      if (s.date instanceof Date) s.final = s.date;
      // Caso conhecido: acerto "sobre conserto bolina" digitado como 2025-01-09; a bolina foi consertada em dez/2025-jan/2026.
      if (s.final && iso(s.final) === "2025-01-09" && norm(s.description).includes("bolina")) {
        s.final = new Date(Date.UTC(2026, 0, 9));
        report.push(`[${name} acertos] linha ${s.row}: '${s.description}' data 2025-01-09 -> 2026-01-09`);
      }
      if (!s.final) report.push(`[${name} acertos] linha ${s.row}: acerto sem data válida ignorado`);
    }
    for (let i = setl.length - 1; i >= 0; i--) if (!setl[i]!.final) setl.splice(i, 1);
    expenses.push(...items);
    settlements.push(...setl);
  }
  return { expenses, settlements, expectedBalance, report: [...new Set(report)] };
}

// ---------------------------------------------------------------- SQL

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const cents = (v: number) => Math.round(v * 100);

export function toSql(r: ImportResult, replace: boolean): string {
  const user = (n: string) => `(SELECT id FROM users WHERE name = ${q(n)} COLLATE NOCASE)`;
  const lines = ["-- Gerado por `npm run import`. Execute com `wrangler d1 execute veleiro --remote --file=import.sql`."];
  if (replace) lines.push("DELETE FROM expenses;", "DELETE FROM settlements;");
  for (const e of [...r.expenses].sort((a, b) => dayNum(a.final!) - dayNum(b.final!))) {
    lines.push(
      `INSERT INTO expenses(date, description, amount_cents, kind, user_id, category_id) VALUES (${q(iso(e.final!))}, ${q(e.description)}, ${cents(e.amount)}, ${q(e.kind)}, ${user(e.user)}, (SELECT id FROM categories WHERE name = ${q(e.category)}));`,
    );
  }
  for (const s of [...r.settlements].sort((a, b) => dayNum(a.final!) - dayNum(b.final!))) {
    const note = s.description === "Acerto" ? "" : s.description;
    lines.push(
      `INSERT INTO settlements(date, from_user, to_user, amount_cents, note) VALUES (${q(iso(s.final!))}, ${user(s.from)}, ${user(s.to)}, ${cents(s.amount)}, ${q(note)});`,
    );
  }
  return lines.join("\n") + "\n";
}
