import { html, mount, must } from "../dom";
import { renderSales, renderSettlements } from "./settle";
import { renderSettings } from "./settings";

/** Sub-abas de Ferramentas: o que não se faz no dia a dia. */
export type ToolTab = "acertos" | "vendas" | "ajustes";
const TABS: [ToolTab, string][] = [["acertos", "Acertos"], ["vendas", "Vendas"], ["ajustes", "Ajustes"]];
let current: ToolTab = "acertos";

export function renderTools(root: HTMLElement, onLogout: () => void, tab?: ToolTab): void {
  if (tab) current = tab;
  mount(
    root,
    html`
      <div class="seg subtabs" role="radiogroup" aria-label="Ferramentas">
        ${TABS.map(([id, label]) => html`<label><input type="radio" name="tool" value="${id}" ${id === current ? "checked" : ""} /><span>${label}</span></label>`)}
      </div>
      <div id="tool-body"></div>`,
  );
  const body = must("#tool-body", root);
  const draw = () => {
    if (current === "acertos") renderSettlements(body);
    else if (current === "vendas") renderSales(body);
    else renderSettings(body, onLogout);
  };
  root.querySelectorAll<HTMLInputElement>('input[name="tool"]').forEach((r) =>
    r.addEventListener("change", () => {
      current = r.value as ToolTab;
      draw();
    }),
  );
  draw();
}
