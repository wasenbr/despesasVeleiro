import { natureLabel, type Expense, type Settlement } from "../../shared/types";
import { html } from "../dom";
import { brl, fmtDay, fmtStamp } from "../format";
import { catName, userName, userSlot } from "../state";

export const personDot = (userId: number) => html`<i class="dot slot-${userSlot(userId)}" aria-hidden="true"></i>${userName(userId)}`;

type Audited = { created_by: number | null; created_at: string; updated_by: number | null; updated_at: string | null };

/** Quem lançou (e quem alterou por último), para auditoria. */
export function auditText(r: Audited): string {
  const made = r.created_by !== null ? `Lançado por ${userName(r.created_by)} em ${fmtStamp(r.created_at)}` : "Importado da planilha";
  return r.updated_by !== null && r.updated_at ? `${made} · alterado por ${userName(r.updated_by)} em ${fmtStamp(r.updated_at)}` : made;
}
const by = (r: Audited) => (r.created_by !== null ? ` · lançado por ${userName(r.created_by)}` : "");

export function expenseRow(e: Expense) {
  const sale = e.kind === "venda";
  return html`
    <button type="button" class="row" data-edit="${e.id}">
      <span class="row-main">
        <span class="row-title">${e.description}</span>
        ${sale ? "" : html`<span class="tag nat-${e.nature}"><i class="dot" aria-hidden="true"></i>${natureLabel(e.nature)}</span>`}
        <span class="row-sub">${fmtDay(e.date)} · ${catName(e.category_id)} · ${personDot(e.user_id)}${sale ? by(e) : ""}</span>
      </span>
      <span class="row-amount ${sale ? "sale" : ""}">${sale ? html`<small class="badge">venda</small> −` : ""}${brl(e.amount_cents)}</span>
    </button>`;
}

export function settlementRow(s: Settlement) {
  return html`
    <button type="button" class="row" data-edit-settlement="${s.id}">
      <span class="row-main">
        <span class="row-title">${userName(s.from_user)} → ${userName(s.to_user)}</span>
        <span class="row-sub">${fmtDay(s.date)}${s.note ? ` · ${s.note}` : ""}${by(s)}</span>
      </span>
      <span class="row-amount">${brl(s.amount_cents)}</span>
    </button>`;
}
