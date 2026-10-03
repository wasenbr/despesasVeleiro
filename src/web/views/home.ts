import { api } from "../api";
import { emitChanged } from "../bus";
import { html, mount, must, toast } from "../dom";
import { brl, todayISO } from "../format";
import { state, userSlot } from "../state";
import { attachExpenseForm, blankValues, expenseFormHtml } from "./expense-form";
import { expenseRow } from "./rows";

export function renderHome(root: HTMLElement): void {
  mount(
    root,
    html`
      <div class="kpis" id="home-kpis"></div>
      <section class="card">
        <h2>Nova despesa</h2>
        ${expenseFormHtml("quick-form", blankValues(), "Lançar despesa", "despesa")}
      </section>
      <section class="card" id="home-recent"></section>`,
  );
  const form = must<HTMLFormElement>("#quick-form", root);
  attachExpenseForm(form, async (input) => {
    await api("POST", "/api/expenses", input);
    toast("Despesa lançada ✓");
    form.dispatchEvent(new Event("reset-entry"));
    emitChanged();
  });
  updateHome(root);
}

/** Atualiza só os indicadores e a lista, sem refazer o formulário (preserva o que está sendo digitado). */
export function updateHome(root: HTMLElement): void {
  const stats = state.stats;
  if (!stats) return;

  // Custo do ano corrente (despesas menos vendas) e média pelos meses já decorridos no ano.
  const today = todayISO();
  const year = today.slice(0, 4);
  const yearTotal = state.expenses
    .filter((e) => e.date.startsWith(year) && e.date <= today)
    .reduce((sum, e) => sum + (e.kind === "despesa" ? e.amount_cents : -e.amount_cents), 0);
  const monthsElapsed = Number(today.slice(5, 7));

  mount(
    must("#home-kpis", root),
    html`
      <div class="kpi"><span>Custo em ${year}</span><strong>${brl(yearTotal)}</strong></div>
      <div class="kpi"><span>Média mensal em ${year}</span><strong>${brl(Math.round(yearTotal / monthsElapsed))}</strong></div>
      ${state.users.map((u) => {
        const b = stats.balances[u.id]?.balance ?? 0;
        const label = b > 0 ? "a receber" : b < 0 ? "deve" : "em dia";
        return html`<a class="kpi person slot-${userSlot(u.id)} ${b < 0 ? "owes" : ""}" href="#/acertos" title="Ver acertos">
          <span><i class="dot" aria-hidden="true"></i>${u.name} · ${label}</span><strong>${brl(Math.abs(b))}</strong></a>`;
      })}`,
  );

  const last = state.expenses.slice(0, 8);
  mount(
    must("#home-recent", root),
    html`
      <div class="card-head"><h2>Últimos lançamentos</h2><a href="#/lancamentos">Ver todos</a></div>
      ${last.length ? html`<div class="rows">${last.map(expenseRow)}</div>` : html`<p class="muted">Nenhum lançamento ainda.</p>`}`,
  );
}
