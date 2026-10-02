import { api, setUnauthorizedHandler } from "./api";
import { Safe, html, mount, must } from "./dom";
import { loadAll, state } from "./state";
import { destroyCharts, renderCharts } from "./views/charts";
import { openExpenseEditor, openSettlementEditor } from "./views/edit";
import { renderHome, updateHome } from "./views/home";
import { renderList } from "./views/list";
import { renderLogin } from "./views/login";
import { renderSettlements } from "./views/settle";
import { renderSettings } from "./views/settings";

type Route = "inicio" | "lancamentos" | "graficos" | "acertos" | "ajustes";

const ROUTES: { id: Route; label: string; icon: string }[] = [
  { id: "inicio", label: "Início", icon: '<path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10"/>' },
  { id: "lancamentos", label: "Lançamentos", icon: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>' },
  { id: "graficos", label: "Gráficos", icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
  { id: "acertos", label: "Acertos", icon: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>' },
  { id: "ajustes", label: "Ajustes", icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>' },
];

const app = must("#app");
let lastLoad = 0;

const currentRoute = (): Route => {
  const id = location.hash.replace(/^#\/?/, "") as Route;
  return ROUTES.some((r) => r.id === id) ? id : "inicio";
};

function showLogin(needsSetup: boolean): void {
  destroyCharts();
  renderLogin(app, needsSetup, () => void boot());
}

function updateSuggestions(): void {
  const count = new Map<string, number>();
  for (const e of state.expenses) count.set(e.description.trim(), (count.get(e.description.trim()) ?? 0) + 1);
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 150);
  must("#desc-list").innerHTML = top.map(([d]) => `<option value="${d.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"></option>`).join("");
}

function showApp(): void {
  const me = state.users.find((u) => u.id === state.me);
  mount(
    app,
    html`
      <header class="topbar"><strong>⛵ Despesas do Veleiro</strong><span class="muted">${me?.name}</span></header>
      <main id="view" class="view" tabindex="-1"></main>
      <nav class="tabbar" aria-label="Seções">
        ${ROUTES.map(
          (r) => html`<a href="#/${r.id}" data-route="${r.id}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${new Safe(r.icon)}</svg><span>${r.label}</span></a>`,
        )}
      </nav>`,
  );
  renderRoute(true);
}

function renderRoute(scrollTop: boolean): void {
  const route = currentRoute();
  const view = must("#view");
  document.querySelectorAll<HTMLElement>(".tabbar a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.route === route));
  if (route !== "graficos") destroyCharts();
  updateSuggestions();
  switch (route) {
    case "inicio": renderHome(view); break;
    case "lancamentos": renderList(view); break;
    case "graficos": renderCharts(view); break;
    case "acertos": renderSettlements(view); break;
    case "ajustes": renderSettings(view, () => void boot()); break;
  }
  if (scrollTop) window.scrollTo(0, 0);
}

async function reload(): Promise<void> {
  await loadAll();
  lastLoad = Date.now();
  if (!document.querySelector("#view")) return;
  if (currentRoute() === "inicio" && document.querySelector("#home-balance")) {
    updateHome(must("#view"));
    updateSuggestions();
  } else renderRoute(false);
}

async function boot(): Promise<void> {
  try {
    const st = await api<{ needs_setup: boolean; logged_in: boolean }>("GET", "/api/status");
    if (!st.logged_in) return showLogin(st.needs_setup);
    await loadAll();
    lastLoad = Date.now();
    showApp();
  } catch (e) {
    mount(app, html`<main class="login"><p class="form-error">${(e as Error).message}</p><button class="btn" id="retry">Tentar de novo</button></main>`);
    must("#retry").addEventListener("click", () => void boot());
  }
}

setUnauthorizedHandler(() => showLogin(false));
document.addEventListener("data-changed", () => void reload().catch(() => {}));
window.addEventListener("hashchange", () => document.querySelector("#view") && renderRoute(true));

// Dois sócios usam o app: ao voltar para ele, atualiza se os dados estão velhos.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && document.querySelector("#view") && Date.now() - lastLoad > 60_000) void reload().catch(() => {});
});

document.addEventListener("click", (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-edit], [data-edit-settlement]");
  if (!t) return;
  if (t.dataset.edit) openExpenseEditor(Number(t.dataset.edit));
  else openSettlementEditor(Number(t.dataset.editSettlement));
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

void boot();
