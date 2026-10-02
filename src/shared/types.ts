/** Tipos compartilhados entre a API (servidor) e a interface (navegador). Valores monetários em centavos. */

export type Kind = "despesa" | "venda";

export interface User {
  id: number;
  username: string;
  name: string;
}

export interface Category {
  id: number;
  name: string;
}

/** kind 'despesa': user_id pagou. kind 'venda': user_id recebeu o dinheiro (abate do total). */
export interface Expense {
  id: number;
  date: string; // AAAA-MM-DD
  description: string;
  amount_cents: number;
  kind: Kind;
  user_id: number;
  category_id: number | null;
  created_by: number | null;
  created_at: string;
}

export interface ExpenseInput {
  date: string;
  description: string;
  amount: string | number; // em reais; aceita vírgula
  kind: Kind;
  user_id: number;
  category_id: number | null;
}

/** Acerto: from_user transferiu dinheiro para to_user. */
export interface Settlement {
  id: number;
  date: string;
  from_user: number;
  to_user: number;
  amount_cents: number;
  note: string;
}

export interface SettlementInput {
  date: string;
  from_user: number;
  to_user: number;
  amount: string | number;
  note: string;
}

export interface Bootstrap {
  me: number;
  users: User[];
  categories: Category[];
}

export interface Balance {
  paid: number; // despesas pagas - vendas recebidas
  share: number; // parte justa
  sent: number;
  received: number;
  balance: number; // positivo: tem a receber; negativo: deve
}

export interface Transfer {
  from: number;
  to: number;
  amount_cents: number;
}

export interface MonthRow {
  month: string; // AAAA-MM
  expenses: number;
  sales: number;
  by_user: Record<string, number>;
  by_category: Record<string, number>;
}

export interface Stats {
  period: { from: string | null; to: string | null };
  totals: { expenses: number; sales: number; net: number; monthly_avg: number; count: number };
  per_user: Record<string, { paid: number; sales: number }>;
  balances: Record<string, Balance>;
  transfers: Transfer[];
  categories: { name: string; total: number; count: number }[];
  category_order: string[];
  monthly: MonthRow[];
  cumulative: { date: string; total: number }[];
  balance_series: { date: string; balances: Record<string, number> }[];
  top: { id: number; date: string; description: string; amount_cents: number; user_id: number; category: string }[];
}
