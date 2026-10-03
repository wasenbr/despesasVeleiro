/**
 * Regras de negócio: saldo entre os sócios e estatísticas para os gráficos.
 * Todos os valores são inteiros em centavos. A divisão é igual entre todos os usuários.
 *
 * Saldo de cada usuário (positivo = tem a receber, negativo = deve):
 *   saldo = (despesas que pagou - vendas que recebeu) - parte justa + acertos enviados - acertos recebidos
 *   parte justa = (total de despesas - total de vendas) / nº de usuários
 */
import { NATURES, type Balance, type Category, type Expense, type MonthRow, type Settlement, type Stats, type Transfer, type User } from "../shared/types";

export const signed = (e: Pick<Expense, "amount_cents" | "kind">): number =>
  e.kind === "despesa" ? e.amount_cents : -e.amount_cents;

type SettlementLike = Pick<Settlement, "from_user" | "to_user" | "amount_cents">;
type ExpenseLike = Pick<Expense, "amount_cents" | "kind" | "user_id">;

export function balances(
  userIds: number[],
  expenses: ExpenseLike[],
  settlements: SettlementLike[],
): Record<number, Balance> {
  const paid: Record<number, number> = Object.fromEntries(userIds.map((u) => [u, 0]));
  for (const e of expenses) paid[e.user_id] = (paid[e.user_id] ?? 0) + signed(e);
  const total = Object.values(paid).reduce((a, b) => a + b, 0);
  const share = total / (userIds.length || 1);
  const sent: Record<number, number> = {};
  const received: Record<number, number> = {};
  for (const s of settlements) {
    sent[s.from_user] = (sent[s.from_user] ?? 0) + s.amount_cents;
    received[s.to_user] = (received[s.to_user] ?? 0) + s.amount_cents;
  }
  const out: Record<number, Balance> = {};
  for (const u of userIds) {
    const p = paid[u] ?? 0;
    const se = sent[u] ?? 0;
    const re = received[u] ?? 0;
    out[u] = { paid: p, share: Math.round(share), sent: se, received: re, balance: Math.round(p - share + se - re) };
  }
  return out;
}

/** Quem deve pagar a quem para zerar os saldos (algoritmo guloso). */
export function transfers(bal: Record<number, Balance>): Transfer[] {
  const debtors: [number, number][] = [];
  const creditors: [number, number][] = [];
  for (const [id, b] of Object.entries(bal)) {
    if (b.balance < 0) debtors.push([Number(id), -b.balance]);
    if (b.balance > 0) creditors.push([Number(id), b.balance]);
  }
  debtors.sort((a, b) => b[1] - a[1]);
  creditors.sort((a, b) => b[1] - a[1]);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d[1], c[1]);
    if (amount > 0) out.push({ from: d[0], to: c[0], amount_cents: amount });
    d[1] -= amount;
    c[1] -= amount;
    if (d[1] <= 0) i++;
    if (c[1] <= 0) j++;
  }
  return out;
}

/** Lista 'AAAA-MM' de first a last, inclusive. */
export function monthRange(first: string, last: string): string[] {
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  const ly = Number(last.slice(0, 4));
  const lm = Number(last.slice(5, 7));
  const out: string[] = [];
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
    if (++m === 13) {
      y++;
      m = 1;
    }
  }
  return out;
}

export function computeStats(
  users: Pick<User, "id" | "name">[],
  categories: Category[],
  expenses: Expense[],
  settlements: Settlement[],
  dateFrom: string | null = null,
  dateTo: string | null = null,
  topCategories = 7,
): Stats {
  const uids = users.map((u) => u.id);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const nameOf = (e: Expense) => (e.category_id != null ? catName.get(e.category_id) : undefined) ?? "Sem categoria";
  const bal = balances(uids, expenses, settlements);
  const inPeriod = (d: string) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);

  const period = expenses
    .filter((e) => inPeriod(e.date))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

  let gross = 0;
  let sales = 0;
  const perUser: Stats["per_user"] = Object.fromEntries(uids.map((u) => [u, { paid: 0, sales: 0 }]));
  for (const e of period) {
    const pu = perUser[e.user_id];
    if (e.kind === "despesa") {
      gross += e.amount_cents;
      if (pu) pu.paid += e.amount_cents;
    } else {
      sales += e.amount_cents;
      if (pu) pu.sales += e.amount_cents;
    }
  }

  // Por categoria (apenas despesas).
  const byCat = new Map<string, { total: number; count: number }>();
  for (const e of period) {
    if (e.kind !== "despesa") continue;
    const cur = byCat.get(nameOf(e)) ?? { total: 0, count: 0 };
    cur.total += e.amount_cents;
    cur.count++;
    byCat.set(nameOf(e), cur);
  }
  const natures = NATURES.map((n) => {
    const list = period.filter((e) => e.kind === "despesa" && e.nature === n.id);
    return { id: n.id, total: list.reduce((a, e) => a + e.amount_cents, 0), count: list.length };
  });
  const categoriesOut = [...byCat].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  const topNames = categoriesOut.slice(0, topCategories).map((c) => c.name);

  // Mensal: despesas por pessoa e por categoria (as demais viram "Demais") e vendas.
  const monthly: MonthRow[] = [];
  if (period.length) {
    const rows = new Map<string, MonthRow>();
    for (const m of monthRange(period[0]!.date.slice(0, 7), period[period.length - 1]!.date.slice(0, 7))) {
      const row: MonthRow = { month: m, expenses: 0, sales: 0, by_user: {}, by_category: {}, by_category_all: {}, by_nature: {} };
      rows.set(m, row);
      monthly.push(row);
    }
    for (const e of period) {
      const row = rows.get(e.date.slice(0, 7))!;
      if (e.kind === "venda") {
        row.sales += e.amount_cents;
        continue;
      }
      row.expenses += e.amount_cents;
      row.by_user[e.user_id] = (row.by_user[e.user_id] ?? 0) + e.amount_cents;
      const name = topNames.includes(nameOf(e)) ? nameOf(e) : "Demais";
      row.by_category[name] = (row.by_category[name] ?? 0) + e.amount_cents;
      row.by_category_all[nameOf(e)] = (row.by_category_all[nameOf(e)] ?? 0) + e.amount_cents;
      row.by_nature[e.nature] = (row.by_nature[e.nature] ?? 0) + e.amount_cents;
    }
  }

  // Acumulado líquido (despesas - vendas) por dia no período.
  const cumulative: Stats["cumulative"] = [];
  let run = 0;
  for (const e of period) {
    run += signed(e);
    const last = cumulative[cumulative.length - 1];
    if (last && last.date === e.date) last.total = run;
    else cumulative.push({ date: e.date, total: run });
  }

  // Evolução do saldo de cada um (histórico completo, recortado pelo período) ao fim de cada dia.
  type Ev = { date: string; order: number; e?: Expense; s?: Settlement };
  const events: Ev[] = [
    ...expenses.map((e) => ({ date: e.date, order: 0, e })),
    ...settlements.map((s) => ({ date: s.date, order: 1, s })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  const paid: Record<number, number> = Object.fromEntries(uids.map((u) => [u, 0]));
  const sent: Record<number, number> = Object.fromEntries(uids.map((u) => [u, 0]));
  const recv: Record<number, number> = Object.fromEntries(uids.map((u) => [u, 0]));
  const series: Stats["balance_series"] = [];
  events.forEach((ev, idx) => {
    if (ev.e) paid[ev.e.user_id] = (paid[ev.e.user_id] ?? 0) + signed(ev.e);
    if (ev.s) {
      sent[ev.s.from_user] = (sent[ev.s.from_user] ?? 0) + ev.s.amount_cents;
      recv[ev.s.to_user] = (recv[ev.s.to_user] ?? 0) + ev.s.amount_cents;
    }
    const lastOfDay = idx + 1 === events.length || events[idx + 1]!.date !== ev.date;
    if (lastOfDay && inPeriod(ev.date)) {
      const share = Object.values(paid).reduce((a, b) => a + b, 0) / (uids.length || 1);
      series.push({
        date: ev.date,
        balances: Object.fromEntries(uids.map((u) => [u, Math.round(paid[u]! - share + sent[u]! - recv[u]!)])),
      });
    }
  });

  const top = period
    .filter((e) => e.kind === "despesa")
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 10)
    .map((e) => ({
      id: e.id,
      date: e.date,
      description: e.description,
      amount_cents: e.amount_cents,
      user_id: e.user_id,
      category: nameOf(e),
    }));

  return {
    period: { from: dateFrom, to: dateTo },
    totals: {
      expenses: gross,
      sales,
      net: gross - sales,
      monthly_avg: Math.round(gross / (monthly.length || 1)),
      count: period.length,
    },
    per_user: perUser,
    balances: bal,
    transfers: transfers(bal),
    categories: categoriesOut,
    natures,
    category_order: categoriesOut.length > topCategories ? [...topNames, "Demais"] : topNames,
    monthly,
    cumulative,
    balance_series: series,
    top,
  };
}
