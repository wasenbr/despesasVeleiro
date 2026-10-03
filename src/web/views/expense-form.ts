import { SALES_CATEGORY, categorize, suggestNature } from "../../shared/categorize";
import { NATURES, natureLabel, type ClassifyResult, type ExpenseInput, type Kind, type Nature } from "../../shared/types";
import { ApiError, api } from "../api";
import { Safe, html, must } from "../dom";
import { fmtDay, moneyInput, normText, todayISO } from "../format";
import { catName, state, userName, userSlot } from "../state";

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

/**
 * "despesa" e "venda": lançamento rápido. Só descrição e valor ficam à vista; quem pagou, tipo, data e
 * categoria (sugeridos automaticamente) ficam em "Detalhes".
 * "ajuste": edição de um lançamento existente, com todos os campos à vista.
 */
export type FormMode = "despesa" | "venda" | "ajuste";

/** Atalhos fixos da tela inicial: os lançamentos mais comuns. */
const SHORTCUTS = ["Marina", "Marinheiro"];

export function expenseFormHtml(id: string, v: FormValues, submitLabel: string, mode: FormMode): Safe {
  const quick = mode !== "ajuste";
  const amountField = html`<label class="field">
      <span>Valor (R$)</span>
      <input class="big" name="amount" inputmode="decimal" placeholder="0,00" value="${v.amount}" enterkeyhint="done" />
    </label>`;
  const descInput = html`<input name="description" list="desc-list" maxlength="200" aria-label="Descrição"
      placeholder="${quick ? "Ou digite outra descrição" : "Ex.: Marina, Sikaflex, venda do GPS"}" value="${v.description}" enterkeyhint="next" />`;
  const whoField = html`<div class="field">
      <span data-who>${v.kind === "venda" ? "Quem recebeu o dinheiro" : "Quem pagou"}</span>
      <div class="seg chips" role="radiogroup">
        ${state.users.map(
          (u) => html`<label class="slot-${userSlot(u.id)}"><input type="radio" name="user_id" value="${u.id}" ${u.id === v.user_id ? "checked" : ""} /><span>${u.name}</span></label>`,
        )}
      </div>
    </div>`;
  const natureField = html`<div class="field" data-nature-field ${v.kind === "venda" ? "hidden" : ""}>
      <span>Tipo da despesa</span>
      <div class="seg small natures" role="radiogroup" aria-label="Tipo da despesa">
        ${NATURES.map(
          (n) => html`<label class="nat-${n.id}"><input type="radio" name="nature" value="${n.id}" ${n.id === v.nature ? "checked" : ""} /><span>${n.short}</span></label>`,
        )}
      </div>
    </div>`;
  const dateField = html`<label class="field">
      <span>Data</span>
      <input type="date" name="date" value="${v.date}" max="2100-12-31" />
    </label>`;
  const categoryField = html`<label class="field"><span>Categoria</span>
      <select name="category_id">
        <option value="">Sem categoria</option>
        ${state.categories.map((c) => html`<option value="${c.id}" ${c.id === v.category_id ? "selected" : ""}>${c.name}</option>`)}
      </select></label>`;
  const footer = html`<p class="ai-hint" data-ai-hint role="status" hidden></p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary" type="submit">${submitLabel}</button>`;

  if (!quick) {
    return html`
      <form id="${id}" class="entry" autocomplete="off" novalidate>
        <div class="seg" role="radiogroup" aria-label="Tipo de lançamento">
          <label><input type="radio" name="kind" value="despesa" ${v.kind === "despesa" ? "checked" : ""} /><span>Despesa</span></label>
          <label><input type="radio" name="kind" value="venda" ${v.kind === "venda" ? "checked" : ""} /><span>Venda / entrada</span></label>
        </div>
        ${amountField}
        <label class="field"><span>Descrição</span>${descInput}</label>
        ${whoField}${natureField}
        <div class="row2 cat-date">${categoryField}${dateField}</div>
        ${footer}
      </form>`;
  }
  return html`
    <form id="${id}" class="entry" autocomplete="off" novalidate>
      <input type="hidden" name="kind" value="${mode}" />
      <div class="field">
        <span>Descrição</span>
        ${mode === "despesa" ? quickDescriptions() : ""}
        ${descInput}
      </div>
      ${amountField}
      <details class="more" data-more>
        <summary>Detalhes <span class="muted" data-more-summary></span></summary>
        <div class="entry">${whoField}${natureField}${dateField}${categoryField}</div>
      </details>
      ${footer}
    </form>`;
}

/** Despesa mais recente da categoria (a lista já vem do mais novo para o mais antigo). */
function lastInCategory(categoryName: string) {
  const id = catId(categoryName);
  return id === null ? undefined : state.expenses.find((e) => e.kind === "despesa" && e.category_id === id);
}

/** Descrição mais recente usada na categoria (ex.: "Marina" pode estar lançada como "Mensalidade marina"). */
function shortcutDescription(categoryName: string): string {
  return lastInCategory(categoryName)?.description.trim() || categoryName;
}

/** Descrições de despesa mais usadas (grafia do lançamento mais recente), fora as dos atalhos. */
function topDescriptions(n: number): string[] {
  const skip = new Set(SHORTCUTS.map(catId).filter((x) => x !== null));
  const count = new Map<string, { text: string; n: number }>();
  for (const e of state.expenses) {
    if (e.kind !== "despesa" || (e.category_id !== null && skip.has(e.category_id))) continue;
    const key = normText(e.description);
    const item = count.get(key);
    if (item) item.n++;
    else count.set(key, { text: e.description.trim(), n: 1 }); // lista vem do mais novo para o mais antigo
  }
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, n).map((d) => d.text);
}

/** Atalhos (Marina, Marinheiro) e uma lista com os demais lançamentos comuns; o campo aceita texto livre. */
function quickDescriptions(): Safe {
  const top = topDescriptions(20);
  return html`<div class="quick-desc">
    ${SHORTCUTS.map((name) => html`<button type="button" class="chip" data-desc="${shortcutDescription(name)}" data-cat="${name}">${name}</button>`)}
    ${top.length
      ? html`<select class="chip" data-desc-pick aria-label="Outros lançamentos comuns">
          <option value="">Outros…</option>
          ${top.map((d) => html`<option value="${d}">${d}</option>`)}
        </select>`
      : ""}
  </div>`;
}

const field = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;
// No modo rápido "kind" é um campo oculto; na edição, um grupo de rádios. Os dois expõem .value.
const kindOf = (form: HTMLFormElement): Kind => ((form.elements.namedItem("kind") as RadioNodeList | HTMLInputElement).value as Kind) || "despesa";

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
  let amountAuto = false; // valor preenchido pela sugestão (pode ser trocado por outra sugestão)
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
  let aiRun: (() => void) | undefined; // consulta agendada e ainda não iniciada
  let aiPending: Promise<void> | undefined;
  const askAi = (immediate: boolean) => {
    clearTimeout(aiTimer);
    aiRun = undefined;
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
      updateSummary();
    };
    const start = () => {
      aiRun = undefined;
      aiPending = run().finally(() => (aiPending = undefined));
    };
    if (immediate) start();
    else {
      aiRun = start;
      aiTimer = window.setTimeout(start, 700);
    }
  };
  /** Antes de lançar, termina a consulta à IA em andamento (no lançamento rápido a categoria não está à vista). */
  const settleAi = async () => {
    clearTimeout(aiTimer);
    aiRun?.();
    await aiPending;
  };
  /** Resumo do que está em "Detalhes" (lançamento rápido), para conferir sem abrir. */
  const more = form.querySelector<HTMLDetailsElement>("[data-more]");
  const moreSummary = form.querySelector<HTMLElement>("[data-more-summary]");
  const updateSummary = () => {
    if (!moreSummary) return;
    const date = field(form, "date").value;
    const who = Number(form.querySelector<HTMLInputElement>('input[name="user_id"]:checked')?.value);
    const parts = [date === todayISO() ? "hoje" : date ? fmtDay(date) : "sem data", userName(who)];
    if (kindOf(form) === "despesa") parts.push(catName(category.value ? Number(category.value) : null), natureLabel(natureOf(form)));
    moreSummary.textContent = `· ${parts.join(" · ")}`;
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
  const setAmountFrom = (e: { amount_cents: number }) => {
    amount.value = (e.amount_cents / 100).toFixed(2).replace(".", ",");
    amountAuto = true;
  };
  description.addEventListener("change", () => {
    suggestCategory();
    askAi(true);
    // Sugere o último valor usado; troca também um valor que já tinha sido sugerido (não o digitado).
    const known = lastWithDescription(description.value);
    if ((amountAuto || !amount.value.trim()) && known?.kind === kindOf(form)) setAmountFrom(known);
    else if (amountAuto) {
      amount.value = "";
      amountAuto = false;
    }
  });
  amount.addEventListener("input", () => (amountAuto = false));
  /** Escolha na lista ou num atalho: traz sempre o valor do último lançamento, mesmo que já houvesse um valor digitado. */
  const pickDescription = (desc: string, last = lastWithDescription(desc)) => {
    description.value = desc;
    if (last?.kind === kindOf(form)) setAmountFrom(last);
    description.dispatchEvent(new Event("change", { bubbles: true })); // sugere categoria e tipo
    amount.focus();
    amount.select();
  };
  form.querySelectorAll<HTMLButtonElement>("[data-desc]").forEach((b) =>
    b.addEventListener("click", () => pickDescription(b.dataset.desc ?? "", lastInCategory(b.dataset.cat ?? "") ?? lastWithDescription(b.dataset.desc ?? ""))),
  );
  form.querySelector<HTMLSelectElement>("[data-desc-pick]")?.addEventListener("change", (ev) => {
    const pick = ev.target as HTMLSelectElement;
    if (!pick.value) return;
    const desc = pick.value;
    pick.value = "";
    pickDescription(desc);
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
    try {
      if (!editing) await settleAi(); // a categoria pode estar escondida em "Detalhes"
      aiSeq++; // descarta qualquer resposta da IA que ainda esteja a caminho
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

  // Limpa o formulário depois de lançar, mantendo a data; quem pagou volta a ser o usuário logado.
  form.addEventListener("reset-entry", () => {
    const me = form.querySelector<HTMLInputElement>(`input[name="user_id"][value="${state.me}"]`);
    if (me) me.checked = true;
    amount.value = "";
    amountAuto = false;
    description.value = "";
    category.value = "";
    touched = false;
    natureTouched = false;
    setNature("outro");
    aiSeq++;
    setHint("");
    showError("");
    if (more) more.open = false;
    updateSummary();
  });

  form.addEventListener("input", updateSummary);
  form.addEventListener("change", updateSummary);
  updateSummary();
}
