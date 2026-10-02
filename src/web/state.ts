import type { Bootstrap, Category, Expense, Settlement, Stats, User } from "../shared/types";
import { api } from "./api";

export const state = {
  me: 0,
  users: [] as User[],
  categories: [] as Category[],
  expenses: [] as Expense[],
  settlements: [] as Settlement[],
  stats: null as Stats | null, // histórico completo (saldos e totais gerais)
};

export async function loadAll(): Promise<void> {
  const [boot, expenses, settlements, stats] = await Promise.all([
    api<Bootstrap>("GET", "/api/bootstrap"),
    api<Expense[]>("GET", "/api/expenses"),
    api<Settlement[]>("GET", "/api/settlements"),
    api<Stats>("GET", "/api/stats"),
  ]);
  Object.assign(state, { me: boot.me, users: boot.users, categories: boot.categories, expenses, settlements, stats });
}

export const userName = (id: number): string => state.users.find((u) => u.id === id)?.name ?? "?";
export const catName = (id: number | null): string =>
  (id !== null && state.categories.find((c) => c.id === id)?.name) || "Sem categoria";
/** Índice estável da pessoa (define a cor nos gráficos e nos chips). */
export const userSlot = (id: number): number => Math.max(0, state.users.findIndex((u) => u.id === id));
