import type { Safe } from "../dom";
import { html, must } from "../dom";

/** Folha modal (sobe da parte de baixo no celular) usada para editar lançamentos e acertos. */
export function openSheet(title: string, body: Safe): HTMLDialogElement {
  const dlg = must<HTMLDialogElement>("#sheet");
  dlg.innerHTML = html`
    <div class="sheet-head">
      <h2>${title}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Fechar">✕</button>
    </div>
    <div class="sheet-body">${body}</div>`.html;
  dlg.onclick = (e) => {
    if (e.target === dlg || (e.target as HTMLElement).closest("[data-close]")) dlg.close();
  };
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export const closeSheet = (): void => must<HTMLDialogElement>("#sheet").close();
