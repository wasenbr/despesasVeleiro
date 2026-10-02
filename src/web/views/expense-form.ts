import { SALES_CATEGORY, categorize, suggestNature } from "../../shared/categorize";
import { NATURES, type ClassifyResult, type ExpenseInput, type Kind, type Nature } from "../../shared/types";
import { ApiError, api } from "../api";
import { Safe, html, must } from "../dom";
import { moneyInput, normText, todayISO } from "../format";
import { state, userSlot } from "../state";

export interface FormValues {
  kind: Kind;
  nature: Nature;
  amount: string;
  description: string;
  user_id: number;
  category_id: number | null;
  date: string;
}

export const blankValues = (): FormValues => ({
  kind: "despesa",
  nature: "outro",
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
      <div class="field" data-nature-field ${v.kind === "venda" ? "hidden" : ""}>
        <span>Tipo da despesa</span>
        <div class="seg small natures" role="radiogroup" aria-label="Tipo da despesa">
          ${NATURES.map(
            (n) => html`<label class="nat-${n.id}"><input type="radio" name="nature" value="${n.id}" ${n.id === v.nature ? "checked" : ""} /><span>${n.short}</span></label>`,
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
      <p class="ai-hint" data-ai-hint role="status" hidden></p>
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

/** Respostas da IA já recebidas nesta sessão (a mesma descrição não é consultada de novo). */
const aiCache = new Map<string, ClassifyResult>();

const natureOf = (form: HTMLFormElement): Nature =>
  (form.querySelector<HTMLInputElement>('input[name="nature"]:checked')?.value as Nature) ?? "outro";

export function attachExpenseForm(form: HTMLFormElement, onSubmit: (input: ExpenseInput) => Promise<void>, editing = false): void {
  let touched = editing; // categoria escolhida pelo usuário: não sobrescrever com sugestões
  let natureTouched = editing;
  const category = form.elements.namedItem("category_id") as HTMLSelectElement;
  const description = field(form, "description");
  const amount = field(form, "amount");
  const error = must<HTMLElement>(".form-error", form);

  const showError = (msg: string) => {
    error.textContent = msg;
    error.hidden = !msg;
  };

  const setNature = (n: Nature) => {
    const radio = form.querySelector<HTMLInputElement>(`input[name="nature"][value="${n}"]`);
    if (radio) radio.checked = true;
  };

  /** Tipo sugerido: o mesmo da última despesa com essa descrição, senão por palavras e categoria. */
  const suggestNatureNow = () => {
    if (natureTouched || kindOf(form) === "venda") return;
    const text = description.value.trim();
    const catLabel = category.selectedOptions[0]?.textContent ?? "";
    const known = lastWithDescription(text);
    setNature(known && known.kind === "despesa" ? known.nature : text ? suggestNature(text, catLabel) : "outro");
  };

  // ---- IA: só para descrições novas (as já usadas são resolvidas na hora, sem custo) ----
  const hint = must<HTMLElement>("[data-ai-hint]", form);
  const setHint = (msg: string) => {
    hint.textContent = msg;
    hint.hidden = !msg;
  };
  let aiTimer: number | undefined;
  let aiSeq = 0;
  const askAi = (immediate: boolean) => {
    clearTimeout(aiTimer);
    const text = description.value.trim();
    const eligible = state.ai.enabled && !editing && kindOf(form) === "despesa" && text.length >= 3 && !lastWithDescription(text) && !(touched && natureTouched);
    if (!eligible) {
      aiSeq++;
      setHint("");
      return;
    }
    const run = async () => {
      const seq = ++aiSeq;
      const key = normText(text);
      let result = aiCache.get(key);
      if (!result) {
        setHint("✨ Classificando com IA…");
        result = await api<ClassifyResult>("POST", "/api/classify", { description: text }).catch(() => undefined);
        if (result && result.source !== "none") aiCache.set(key, result);
      }
      if (seq !== aiSeq) return; // o usuário continuou digitando ou já lançou
      if (!result || result.source === "none") return setHint("");
      if (!touched && result.category_id !== null) category.value = String(result.category_id);
      if (!natureTouched && result.nature) setNature(result.nature);
      setHint("✨ Categoria e tipo sugeridos pela IA");
    };
    if (immediate) void run();
    else aiTimer = window.setTimeout(run, 700);
  };

  const suggestCategory = () => {
    if (!touched) {
      if (kindOf(form) === "venda") category.value = String(catId(SALES_CATEGORY) ?? "");
      else {
        const text = description.value.trim();
        const id = text ? (lastWithDescription(text)?.category_id ?? catId(categorize(text))) : null;
        category.value = id !== null ? String(id) : "";
      }
    }
    suggestNatureNow();
  };

  category.addEventListener("change", () => {
    touched = true;
    setHint("");
    suggestNatureNow();
  });
  form.querySelectorAll<HTMLInputElement>('input[name="nature"]').forEach((r) =>
    r.addEventListener("change", () => {
      natureTouched = true;
      setHint("");
    }),
  );
  description.addEventListener("input", () => {
    suggestCategory();
    askAi(false);
  });
  description.addEventListener("change", () => {
    suggestCategory();
    askAi(true);
    const known = lastWithDescription(description.value);
    if (known && !amount.value.trim() && known.kind === kindOf(form)) amount.value = (known.amount_cents / 100).toFixed(2).replace(".", ",");
  });
  form.querySelectorAll<HTMLInputElement>('input[name="kind"]').forEach((r) =>
    r.addEventListener("change", () => {
      must("[data-who]", form).textContent = kindOf(form) === "venda" ? "Quem recebeu o dinheiro" : "Quem pagou";
      must("[data-nature-field]", form).hidden = kindOf(form) === "venda";
      if (kindOf(form) === "despesa" && category.value === String(catId(SALES_CATEGORY))) {
        touched = false;
        category.value = "";
      }
      suggestCategory();
      askAi(true);
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
    aiSeq++; // descarta qualquer resposta da IA que ainda esteja a caminho
    try {
      await onSubmit({
        kind: kindOf(form),
        nature: kindOf(form) === "venda" ? "outro" : natureOf(form),
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
    natureTouched = false;
    setNature("outro");
    aiSeq++;
    setHint("");
    showError("");
  });
}
