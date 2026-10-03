import { api } from "../api";
import { emitChanged } from "../bus";
import { html, mount, must, toast } from "../dom";
import { brl } from "../format";
import { state, userName } from "../state";
import { attachSettlementForm, newSettlementDefaults, settlementFormHtml } from "./edit";
import { settlementRow } from "./rows";

export function renderSettlements(root: HTMLElement): void {
  const stats = state.stats;
  const transfer = stats?.transfers[0];
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
          ? html`<p class="headline"><strong>${userName(transfer.from)}</strong> deve <strong>${brl(transfer.amount_cents)}</strong> a <strong>${userName(transfer.to)}</strong></p>
              <p class="muted small">O valor já vem preenchido abaixo. Registre o acerto quando a transferência for feita.</p>`
          : html`<p class="headline">Tudo acertado ✓</p>`}
      </section>
      <section class="card">
        <h2>Registrar acerto</h2>
        ${settlementFormHtml("settle-form", defaults, "Registrar acerto")}
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
