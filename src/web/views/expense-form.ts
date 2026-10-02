import { SALES_CATEGORY, categorize } from "../../shared/categorize";
import type { ExpenseInput, Kind } from "../../shared/types";
import { ApiError } from "../api";
import { Safe, html, must } from "../dom";
import { moneyInput, normText, todayISO } from "../format";
import { state, userSlot } from "../state";

export interface FormValues {
  kind: Kind;
  amount: string;
  description: string;
  user_id: number;
  category_id: number | null;
  date: string;
}

export const blankValues = (): FormValues => ({
  kind: "despesa",
  amount: "",
  description: "",
  user_id: state.me,
  category_id: null,
  date: todayISO(),
});

const catId = (name: string): number | null => state.categories.find((c) => c.name === name)?.id ?? null;

export function expenseFormHtml(id: string, v: FormValues, submitLabel: string): Safe {
  return html`
    <form id="${id}" class="entry" autocomplete="off" novalidate>
      <div class="seg" role="radiogroup" aria-label="Tipo de lançamento">
        <label><input type="radio" name="kind" value="despesa" ${v.kind === "despesa" ? "checked" : ""} /><span>Despesa</span></label>
        <label><input type="radio" name="kind" value="venda" ${v.kind === "venda" ? "checked" : ""} /><span>Venda / entrada</span></label>
      </div>
      <label class="field">
        <span>Valor (R$)</span>
        <input class="big" name="amount" inputmode="decimal" placeholder="0,00" value="${v.amount}" enterkeyhint="next" />
      </label>
      <label class="field">
        <span>Descrição</span>
        <input name="description" list="desc-list" maxlength="200" placeholder="Ex.: Marina, Sikaflex, venda do GPS" value="${v.description}" enterkeyhint="done" />
      </label>
      <div class="field">
        <span data-who>${v.kind === "venda" ? "Quem recebeu o dinheiro" : "Quem pagou"}</span>
        <div class="seg chips" role="radiogroup">
          ${state.users.map(
            (u) => html`<label class="slot-${userSlot(u.id)}"><input type="radio" name="user_id" value="${u.id}" ${u.id === v.user_id ? "checked" : ""} /><span>${u.name}</span></label>`,
          )}
        </div>
      </div>
      <div class="row2 cat-date">
        <label class="field">
          <span>Categoria</span>
          <select name="category_id">
            <option value="">Sem categoria</option>
            ${state.categories.map((c) => html`<option value="${c.id}" ${c.id === v.category_id ? "selected" : ""}>${c.name}</option>`)}
          </select>
        </label>
        <label class="field">
          <span>Data</span>
          <input type="date" name="date" value="${v.date}" max="2100-12-31" />
        </label>
      </div>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary" type="submit">${submitLabel}</button>
    </form>`;
}

const field = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;
const kindOf = (form: HTMLFormElement): Kind => (form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value as Kind) ?? "despesa";

/** Última despesa com a mesma descrição (para sugerir categoria e valor de lançamentos recorrentes). */
function lastWithDescription(desc: string) {
  const key = normText(desc);
  return key ? state.expenses.find((e) => normText(e.description) === key) : undefined; // lista já vem do mais novo para o mais antigo
}

export function attachExpenseForm(form: HTMLFormElement, onSubmit: (input: ExpenseInput) => Promise<void>, categoryTouched = false): void {
  let touched = categoryTouched;
  const category = field(form, "category_id");
  const description = field(form, "description");
  const amount = field(form, "amount");
  const error = must<HTMLElement>(".form-error", form);

  const showError = (msg: string) => {
    error.textContent = msg;
    error.hidden = !msg;
  };

  const suggestCategory = () => {
    if (touched) return;
    if (kindOf(form) === "venda") {
      category.value = String(catId(SALES_CATEGORY) ?? "");
      return;
    }
    const text = description.value.trim();
    if (!text) {
      category.value = "";
      return;
    }
    const id = lastWithDescription(text)?.category_id ?? catId(categorize(text));
    category.value = id !== null ? String(id) : "";
  };

  category.addEventListener("change", () => (touched = true));
  description.addEventListener("input", suggestCategory);
  description.addEventListener("change", () => {
    suggestCategory();
    const known = lastWithDescription(description.value);
    if (known && !amount.value.trim() && known.kind === kindOf(form)) amount.value = (known.amount_cents / 100).toFixed(2).replace(".", ",");
  });
  form.querySelectorAll<HTMLInputElement>('input[name="kind"]').forEach((r) =>
    r.addEventListener("change", () => {
      must("[data-who]", form).textContent = kindOf(form) === "venda" ? "Quem recebeu o dinheiro" : "Quem pagou";
      if (kindOf(form) === "despesa" && category.value === String(catId(SALES_CATEGORY))) {
        touched = false;
        category.value = "";
      }
      suggestCategory();
    }),
  );

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showError("");
    const money = moneyInput(amount.value);
    if (!money || !/^\d+(\.\d{1,2})?$/.test(money) || Number(money) <= 0) return showError("Informe um valor válido, maior que zero.");
    if (!description.value.trim()) return showError("Informe a descrição.");
    if (!field(form, "date").value) return showError("Informe a data.");
    const button = must<HTMLButtonElement>('button[type="submit"]', form);
    button.disabled = true;
    try {
      await onSubmit({
        kind: kindOf(form),
        amount: money,
        description: description.value.trim(),
        user_id: Number(form.querySelector<HTMLInputElement>('input[name="user_id"]:checked')?.value),
        category_id: category.value ? Number(category.value) : null,
        date: field(form, "date").value,
      });
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "Não foi possível salvar.");
    } finally {
      button.disabled = false;
    }
  });

  // Permite limpar o formulário depois de lançar, mantendo pessoa, tipo e data.
  form.addEventListener("reset-entry", () => {
    amount.value = "";
    description.value = "";
    category.value = "";
    touched = false;
    showError("");
  });
}
