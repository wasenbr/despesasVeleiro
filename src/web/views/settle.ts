import { api } from "../api";
import { emitChanged } from "../bus";
import { html, mount, must, toast } from "../dom";
import { brl } from "../format";
import { state, userName } from "../state";
import { attachSettlementForm, newSettlementDefaults, settlementFormHtml } from "./edit";
import { attachExpenseForm, blankValues, expenseFormHtml } from "./expense-form";
import { expenseRow, settlementRow } from "./rows";

export function renderSettlements(root: HTMLElement): void {
  const transfer = state.stats?.transfers[0];
  const others = state.users.filter((u) => u.id !== state.me);
  const defaults = transfer
    ? newSettlementDefaults(transfer.from, transfer.to, transfer.amount_cents)
    : newSettlementDefaults(state.me, others[0]?.id ?? state.me, 0);

  mount(
    root,
    html`
      <section class="card">
        <h2>Situação</h2>
        ${transfer
          ? html`<p class="headline"><strong>${userName(transfer.from)}</strong> deve <strong>${brl(transfer.amount_cents)}</strong> a <strong>${userName(transfer.to)}</strong></p>`
          : html`<p class="headline">Tudo acertado ✓</p>`}
        <details class="more">
          <summary>Registrar acerto</summary>
          <p class="muted small">Use quando a transferência entre os sócios for feita. O valor já vem preenchido. Fica registrado quem lançou.</p>
          ${settlementFormHtml("settle-form", defaults, "Registrar acerto")}
        </details>
      </section>
      <section class="card">
        <h2>Histórico de acertos</h2>
        ${state.settlements.length ? html`<div class="rows">${state.settlements.map(settlementRow)}</div>` : html`<p class="muted">Nenhum acerto registrado.</p>`}
      </section>`,
  );
  attachSettlementForm(must<HTMLFormElement>("#settle-form", root), async (body) => {
    await api("POST", "/api/settlements", body);
    toast("Acerto registrado ✓");
    emitChanged();
  });
}

export function renderSales(root: HTMLElement): void {
  const sales = state.expenses.filter((e) => e.kind === "venda");
  mount(
    root,
    html`
      <section class="card">
        <h2>Vendas e entradas</h2>
        <p class="muted small">Dinheiro que entrou para o barco (ex.: venda de equipamento). Abate do total das despesas.</p>
        <details class="more">
          <summary>Registrar venda / entrada</summary>
          ${expenseFormHtml("sale-form", { ...blankValues(), kind: "venda" }, "Registrar venda", "venda")}
        </details>
      </section>
      <section class="card">
        <h2>Histórico de vendas</h2>
        ${sales.length ? html`<div class="rows">${sales.map(expenseRow)}</div>` : html`<p class="muted">Nenhuma venda registrada.</p>`}
      </section>`,
  );
  const saleForm = must<HTMLFormElement>("#sale-form", root);
  attachExpenseForm(saleForm, async (input) => {
    await api("POST", "/api/expenses", input);
    toast("Venda registrada ✓");
    saleForm.dispatchEvent(new Event("reset-entry"));
    emitChanged();
  });
}
