/** Mini-template com escape automático: tudo que é interpolado é escapado, exceto o que vem de html``. */
export class Safe {
  constructor(readonly html: string) {}
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]!);

const render = (v: unknown): string =>
  v instanceof Safe ? v.html : Array.isArray(v) ? v.map(render).join("") : v === null || v === undefined || v === false ? "" : esc(v);

export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0] ?? "";
  values.forEach((v, i) => (out += render(v) + (strings[i + 1] ?? "")));
  return new Safe(out);
}

export const mount = (el: Element, content: Safe): void => {
  el.innerHTML = content.html;
};

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);

export function must<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
}

let toastTimer: number | undefined;
export function toast(message: string, isError = false): void {
  const el = must("#toast");
  el.textContent = message;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.className = "toast"), isError ? 4000 : 2200);
}
