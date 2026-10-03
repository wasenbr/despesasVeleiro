import type { Settlement } from "../../shared/types";
import { ApiError, api } from "../api";
import { emitChanged } from "../bus";
import { html, must, toast } from "../dom";
import { centsToInput, moneyInput, todayISO } from "../format";
import { state, userName } from "../state";
import { attachExpenseForm, expenseFormHtml } from "./expense-form";
import { auditText } from "./rows";
import { closeSheet, openSheet } from "./sheet";

export function openExpenseEditor(id: number): void {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  const dlg = openSheet(
    "Editar lançamento",
    html`${expenseFormHtml("edit-form", {
      kind: e.kind, nature: e.nature, amount: centsToInput(e.amount_cents), description: e.description,
      user_id: e.user_id, category_id: e.category_id, date: e.date,
    }, "Salvar alterações", "ajuste")}
      <p class="muted small audit">${auditText(e)}</p>
      <button type="button" class="btn danger" id="delete-expense">Excluir lançamento</button>`,
  );
  attachExpenseForm(
    must<HTMLFormElement>("#edit-form", dlg),
    async (input) => {
      await api("PUT", `/api/expenses/${id}`, input);
      closeSheet();
      toast("Alterações salvas");
      emitChanged();
    },
    true,
  );
  must("#delete-expense", dlg).addEventListener("click", async () => {
    if (!confirm(`Excluir "${e.description}"?`)) return;
    try {
      await api("DELETE", `/api/expenses/${id}`);
      closeSheet();
      toast("Lançamento excluído");
      emitChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Erro ao excluir", true);
    }
  });
}

export function settlementFormHtml(id: string, s: { from: number; to: number; amount: string; date: string; note: string }, submitLabel: string) {
  const options = (selected: number) => state.users.map((u) => html`<option value="${u.id}" ${u.id === selected ? "selected" : ""}>${u.name}</option>`);
  return html`
    <form id="${id}" class="entry" autocomplete="off" novalidate>
      <div class="row2">
        <label class="field"><span>Quem pagou</span><select name="from_user">${options(s.from)}</select></label>
        <label class="field"><span>Quem recebeu</span><select name="to_user">${options(s.to)}</select></label>
      </div>
      <label class="field"><span>Valor (R$)</span><input class="big" name="amount" inputmode="decimal" placeholder="0,00" value="${s.amount}" /></label>
      <div class="row2">
        <label class="field"><span>Data</span><input type="date" name="date" value="${s.date}" /></label>
        <label class="field"><span>Observação</span><input name="note" maxlength="200" placeholder="Ex.: Pix" value="${s.note}" /></label>
      </div>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary" type="submit">${submitLabel}</button>
    </form>`;
}

/** Liga o formulário de acerto; onSubmit recebe o corpo pronto para a API. */
export function attachSettlementForm(form: HTMLFormElement, onSubmit: (body: Record<string, unknown>) => Promise<void>): void {
  const error = must<HTMLElement>(".form-error", form);
  const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    const money = moneyInput(val("amount"));
    const fail = (m: string) => ((error.textContent = m), (error.hidden = false));
    if (!money || !/^\d+(\.\d{1,2})?$/.test(money) || Number(money) <= 0) return fail("Informe um valor válido, maior que zero.");
    if (val("from_user") === val("to_user")) return fail("Quem paga e quem recebe devem ser pessoas diferentes.");
    if (!val("date")) return fail("Informe a data.");
    const button = must<HTMLButtonElement>('button[type="submit"]', form);
    button.disabled = true;
    try {
      await onSubmit({ from_user: Number(val("from_user")), to_user: Number(val("to_user")), amount: money, date: val("date"), note: val("note").trim() });
    } catch (e) {
      fail(e instanceof ApiError ? e.message : "Não foi possível salvar.");
    } finally {
      button.disabled = false;
    }
  });
}

export function openSettlementEditor(id: number): void {
  const s: Settlement | undefined = state.settlements.find((x) => x.id === id);
  if (!s) return;
  const dlg = openSheet(
    "Editar acerto",
    html`${settlementFormHtml("edit-settlement", { from: s.from_user, to: s.to_user, amount: centsToInput(s.amount_cents), date: s.date, note: s.note }, "Salvar alterações")}
      <p class="muted small audit">${auditText(s)}</p>
      <button type="button" class="btn danger" id="delete-settlement">Excluir acerto</button>`,
  );
  attachSettlementForm(must<HTMLFormElement>("#edit-settlement", dlg), async (body) => {
    await api("PUT", `/api/settlements/${id}`, body);
    closeSheet();
    toast("Alterações salvas");
    emitChanged();
  });
  must("#delete-settlement", dlg).addEventListener("click", async () => {
    if (!confirm(`Excluir o acerto de ${userName(s.from_user)} para ${userName(s.to_user)}?`)) return;
    await api("DELETE", `/api/settlements/${id}`).catch((err) => toast(err.message, true));
    closeSheet();
    emitChanged();
  });
}

export const newSettlementDefaults = (from: number, to: number, cents: number) => ({
  from, to, amount: cents > 0 ? centsToInput(cents) : "", date: todayISO(), note: "",
});
