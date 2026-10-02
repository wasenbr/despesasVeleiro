import { NATURES, type Expense, type Kind } from "../../shared/types";
import { html, mount, must } from "../dom";
import { brl, monthLong, normText } from "../format";
import { state } from "../state";
import { expenseRow } from "./rows";

const filters = { q: "", kind: "" as "" | Kind, user: "", nature: "", cat: "", month: "", limit: 80 };

function matching(): Expense[] {
  const q = normText(filters.q);
  return state.expenses.filter(
    (e) =>
      (!q || normText(e.description).includes(q)) &&
      (!filters.kind || e.kind === filters.kind) &&
      (!filters.user || String(e.user_id) === filters.user) &&
      (!filters.nature || (e.kind === "despesa" && e.nature === filters.nature)) &&
      (!filters.cat || (filters.cat === "none" ? e.category_id === null : String(e.category_id) === filters.cat)) &&
      (!filters.month || e.date.startsWith(filters.month)),
  );
}

export function renderList(root: HTMLElement): void {
  const months = [...new Set(state.expenses.map((e) => e.date.slice(0, 7)))];
  mount(
    root,
    html`
      <section class="card filters">
        <input type="search" id="f-q" placeholder="Buscar lançamento…" value="${filters.q}" autocomplete="off" />
        <div class="seg small" role="radiogroup" aria-label="Tipo">
          ${([["", "Todos"], ["despesa", "Despesas"], ["venda", "Vendas"]] as const).map(
            ([v, label]) => html`<label><input type="radio" name="f-kind" value="${v}" ${filters.kind === v ? "checked" : ""} /><span>${label}</span></label>`,
          )}
        </div>
        <div class="row2">
          <select id="f-user" aria-label="Pessoa"><option value="">Pessoas</option>
            ${state.users.map((u) => html`<option value="${u.id}" ${String(u.id) === filters.user ? "selected" : ""}>${u.name}</option>`)}</select>
          <select id="f-nature" aria-label="Tipo da despesa"><option value="">Tipos</option>
            ${NATURES.map((n) => html`<option value="${n.id}" ${n.id === filters.nature ? "selected" : ""}>${n.label}</option>`)}</select>
        </div>
        <div class="row2">
          <select id="f-cat" aria-label="Categoria"><option value="">Categorias</option><option value="none" ${filters.cat === "none" ? "selected" : ""}>Sem categoria</option>
            ${state.categories.map((c) => html`<option value="${c.id}" ${String(c.id) === filters.cat ? "selected" : ""}>${c.name}</option>`)}</select>
          <select id="f-month" aria-label="Mês"><option value="">Meses</option>
            ${months.map((m) => html`<option value="${m}" ${m === filters.month ? "selected" : ""}>${monthLong(m)}</option>`)}</select>
        </div>
      </section>
      <p class="summary muted" id="list-summary"></p>
      <div id="list-body"></div>`,
  );
  must<HTMLInputElement>("#f-q", root).addEventListener("input", (e) => {
    filters.q = (e.target as HTMLInputElement).value;
    filters.limit = 80;
    updateList(root);
  });
  root.querySelectorAll<HTMLInputElement>('input[name="f-kind"]').forEach((r) =>
    r.addEventListener("change", () => ((filters.kind = r.value as "" | Kind), (filters.limit = 80), updateList(root))),
  );
  for (const [id, key] of [["#f-user", "user"], ["#f-nature", "nature"], ["#f-cat", "cat"], ["#f-month", "month"]] as const) {
    must<HTMLSelectElement>(id, root).addEventListener("change", (e) => {
      filters[key] = (e.target as HTMLSelectElement).value;
      filters.limit = 80;
      updateList(root);
    });
  }
  updateList(root);
}

function updateList(root: HTMLElement): void {
  const items = matching();
  const net = items.reduce((s, e) => s + (e.kind === "despesa" ? e.amount_cents : -e.amount_cents), 0);
  must("#list-summary", root).textContent = `${items.length} lançamento${items.length === 1 ? "" : "s"} · total ${brl(net)}`;

  const shown = items.slice(0, filters.limit);
  const groups = new Map<string, Expense[]>();
  for (const e of shown) {
    const key = e.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  mount(
    must("#list-body", root),
    html`
      ${[...groups].map(([month, rows]) => {
        const total = items.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + (e.kind === "despesa" ? e.amount_cents : -e.amount_cents), 0);
        return html`<section class="card group"><div class="card-head"><h3>${monthLong(month)}</h3><span class="muted">${brl(total)}</span></div>
          <div class="rows">${rows.map(expenseRow)}</div></section>`;
      })}
      ${items.length === 0 ? html`<p class="muted center">Nada encontrado.</p>` : ""}
      ${items.length > shown.length ? html`<button type="button" class="btn" id="more">Mostrar mais (${items.length - shown.length})</button>` : ""}`,
  );
  root.querySelector("#more")?.addEventListener("click", () => ((filters.limit += 80), updateList(root)));
}
