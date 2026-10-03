import { api } from "../api";
import { emitChanged } from "../bus";
import { html, mount, must, toast } from "../dom";
import { brl, monthLong, todayISO } from "../format";
import { state, userName } from "../state";
import { attachExpenseForm, blankValues, expenseFormHtml } from "./expense-form";
import { expenseRow } from "./rows";

export function renderHome(root: HTMLElement): void {
  mount(
    root,
    html`
      <section class="card" id="home-balance"></section>
      <section class="card">
        <h2>Novo lançamento</h2>
        ${expenseFormHtml("quick-form", blankValues(), "Lançar")}
      </section>
      <section class="card" id="home-recent"></section>`,
  );
  const form = must<HTMLFormElement>("#quick-form", root);
  attachExpenseForm(form, async (input) => {
    await api("POST", "/api/expenses", input);
    toast("Lançado ✓");
    form.dispatchEvent(new Event("reset-entry"));
    emitChanged();
  });
  updateHome(root);
}

/** Atualiza só os cartões de dados, sem refazer o formulário (preserva o que está sendo digitado). */
export function updateHome(root: HTMLElement): void {
  const stats = state.stats;
  const balance = must("#home-balance", root);
  const recent = must("#home-recent", root);
  if (!stats) return;

  const month = todayISO().slice(0, 7);
  const monthTotal = state.expenses
    .filter((e) => e.date.startsWith(month))
    .reduce((sum, e) => sum + (e.kind === "despesa" ? e.amount_cents : -e.amount_cents), 0);

  const headline = stats.transfers.length
    ? stats.transfers.map((t) => html`<p class="headline"><strong>${userName(t.from)}</strong> deve <strong>${brl(t.amount_cents)}</strong> a <strong>${userName(t.to)}</strong></p>`)
    : html`<p class="headline">Tudo acertado ✓</p>`;

  mount(
    balance,
    html`
      <h2>Saldo entre vocês</h2>
      ${headline}
      <ul class="people">
        ${state.users.map((u) => {
          const b = stats.balances[u.id];
          return html`<li><span><i class="dot slot-${state.users.indexOf(u)}"></i>${u.name}</span>
            <span class="muted">pagou ${brl(b?.paid ?? 0)} · parte justa ${brl(b?.share ?? 0)}</span></li>`;
        })}
      </ul>
      <p class="muted small">Em ${monthLong(month)}: <strong>${brl(monthTotal)}</strong> · média mensal geral: ${brl(stats.totals.monthly_avg)}</p>
      ${stats.transfers.length ? html`<a class="btn" href="#/acertos">Registrar acerto</a>` : ""}`,
  );

  const last = state.expenses.slice(0, 6);
  mount(
    recent,
    html`
      <div class="card-head"><h2>Últimos lançamentos</h2><a href="#/lancamentos">Ver todos</a></div>
      ${last.length ? html`<div class="rows">${last.map(expenseRow)}</div>` : html`<p class="muted">Nenhum lançamento ainda.</p>`}`,
  );
}
