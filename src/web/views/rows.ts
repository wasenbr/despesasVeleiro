import type { Expense, Settlement } from "../../shared/types";
import { html } from "../dom";
import { brl, fmtDay } from "../format";
import { catName, userName, userSlot } from "../state";

export const personDot = (userId: number) => html`<i class="dot slot-${userSlot(userId)}" aria-hidden="true"></i>${userName(userId)}`;

export function expenseRow(e: Expense) {
  const sale = e.kind === "venda";
  return html`
    <button type="button" class="row" data-edit="${e.id}">
      <span class="row-main">
        <span class="row-title">${e.description}</span>
        <span class="row-sub">${fmtDay(e.date)} · ${catName(e.category_id)} · ${personDot(e.user_id)}</span>
      </span>
      <span class="row-amount ${sale ? "sale" : ""}">${sale ? html`<small class="badge">venda</small> −` : ""}${brl(e.amount_cents)}</span>
    </button>`;
}

export function settlementRow(s: Settlement) {
  return html`
    <button type="button" class="row" data-edit-settlement="${s.id}">
      <span class="row-main">
        <span class="row-title">${userName(s.from_user)} → ${userName(s.to_user)}</span>
        <span class="row-sub">${fmtDay(s.date)}${s.note ? ` · ${s.note}` : ""}</span>
      </span>
      <span class="row-amount">${brl(s.amount_cents)}</span>
    </button>`;
}
