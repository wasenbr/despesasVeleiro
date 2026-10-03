import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from "chart.js";
import { NATURES, type Nature, type Stats } from "../../shared/types";
import { api } from "../api";
import { html, mount, must } from "../dom";
import { addMonths, brl, brlCompact, fmtDay, monthShort, todayISO } from "../format";
import { state, userName } from "../state";

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

type PeriodKey = "12m" | "ano" | "tudo" | "custom";
const view = { period: "12m" as PeriodKey, from: "", to: "", split: "tipo" as "pessoa" | "categoria" | "tipo" };
let charts: Chart[] = [];

const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const series = (slot: number): string => css(`--c${(slot % 8) + 1}`);
/** Cores dos tipos de despesa (evitam azul/laranja, que identificam as pessoas). */
const natureColor = (id: Nature): string => ({ manutencao: series(2), melhoria: series(4), marina: series(6), outro: css("--other") })[id];

function range(): { from: string | null; to: string | null } {
  const today = todayISO();
  if (view.period === "12m") return { from: addMonths(today, -11), to: null };
  if (view.period === "ano") return { from: `${today.slice(0, 4)}-01-01`, to: null };
  if (view.period === "custom") return { from: view.from || null, to: view.to || null };
  return { from: null, to: null };
}

/** A cor acompanha a categoria (pelo ranking geral), não a posição no período filtrado. */
function categoryColors(names: string[]): Record<string, string> {
  const overall = (state.stats?.categories ?? []).map((c) => c.name);
  const out: Record<string, string> = {};
  let spare = 7;
  for (const n of names) {
    if (n === "Demais") out[n] = css("--other");
    else {
      const rank = overall.indexOf(n);
      out[n] = rank >= 0 && rank < 7 ? series(rank) : spare < 8 ? series(spare++) : css("--other");
    }
  }
  return out;
}

export function renderCharts(root: HTMLElement): void {
  mount(
    root,
    html`
      <section class="card filters">
        <div class="seg small" role="radiogroup" aria-label="Período">
          ${([["12m", "12 meses"], ["ano", "Este ano"], ["tudo", "Tudo"], ["custom", "Datas"]] as const).map(
            ([v, label]) => html`<label><input type="radio" name="period" value="${v}" ${view.period === v ? "checked" : ""} /><span>${label}</span></label>`,
          )}
        </div>
        <div class="row2" id="custom-range" ${view.period === "custom" ? "" : "hidden"}>
          <label class="field"><span>De</span><input type="date" id="p-from" value="${view.from}" /></label>
          <label class="field"><span>Até</span><input type="date" id="p-to" value="${view.to}" /></label>
        </div>
      </section>
      <div id="charts-body"><p class="muted center">Carregando…</p></div>`,
  );
  root.querySelectorAll<HTMLInputElement>('input[name="period"]').forEach((r) =>
    r.addEventListener("change", () => {
      view.period = r.value as PeriodKey;
      must("#custom-range", root).hidden = view.period !== "custom";
      void load(root);
    }),
  );
  for (const [id, key] of [["#p-from", "from"], ["#p-to", "to"]] as const) {
    must<HTMLInputElement>(id, root).addEventListener("change", (e) => {
      view[key] = (e.target as HTMLInputElement).value;
      void load(root);
    });
  }
  void load(root);
}

async function load(root: HTMLElement): Promise<void> {
  const { from, to } = range();
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  try {
    draw(root, await api<Stats>("GET", `/api/stats?${qs}`));
  } catch (e) {
    mount(must("#charts-body", root), html`<p class="form-error">${(e as Error).message}</p>`);
  }
}

const baseOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: { position: "bottom" as const, labels: { color: css("--ink-2"), usePointStyle: true, pointStyle: "rectRounded", boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 12 } } },
    tooltip: { padding: 10, boxPadding: 4, usePointStyle: true },
  },
});

const axes = (xExtra: object = {}) => ({
  x: { grid: { display: false }, border: { color: css("--grid") }, ticks: { color: css("--ink-2"), maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, ...xExtra },
  y: {
    beginAtZero: false,
    grid: { color: (ctx: { tick: { value: number } }) => (ctx.tick.value === 0 ? css("--ink-3") : css("--grid")) },
    border: { display: false },
    ticks: { color: css("--ink-2"), maxTicksLimit: 6, callback: (v: string | number) => brlCompact(Number(v)) },
  },
});

function draw(root: HTMLElement, s: Stats): void {
  charts.forEach((c) => c.destroy());
  charts = [];
  const body = must("#charts-body", root);
  if (!s.totals.count) {
    mount(body, html`<p class="muted center">Nenhum lançamento neste período.</p>`);
    return;
  }
  const maxCat = Math.max(...s.categories.map((c) => c.total), 1);
  const maxNature = Math.max(...s.natures.map((n) => n.total), 1);
  const catColors = categoryColors(s.category_order);
  const monthLabels = s.monthly.map((m) => monthShort(m.month));

  mount(
    body,
    html`
      <div class="kpis">
        <div class="kpi"><span>Despesas</span><strong>${brl(s.totals.expenses)}</strong></div>
        <div class="kpi"><span>Vendas e entradas</span><strong>${brl(s.totals.sales)}</strong></div>
        <div class="kpi"><span>Líquido</span><strong>${brl(s.totals.net)}</strong></div>
        <div class="kpi"><span>Média por mês</span><strong>${brl(s.totals.monthly_avg)}</strong></div>
      </div>

      <section class="card">
        <h2>Manutenção, melhoria e marina</h2>
        <ul class="bars">
          ${s.natures.map(
            (n) => html`<li><div class="bar-label"><span>${NATURES.find((x) => x.id === n.id)?.label}</span>
              <span>${brl(n.total)} <small class="muted">${s.totals.expenses ? Math.round((n.total / s.totals.expenses) * 100) : 0}%</small></span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${n.total ? Math.max(1, (n.total / maxNature) * 100) : 0}%;background:${natureColor(n.id)}"></div></div></li>`,
          )}
        </ul>
      </section>

      <section class="card">
        <div class="card-head"><h2>Despesas por mês</h2>
          <div class="seg small" role="radiogroup" aria-label="Agrupar por">
            <label><input type="radio" name="split" value="tipo" ${view.split === "tipo" ? "checked" : ""} /><span>Tipo</span></label>
            <label><input type="radio" name="split" value="pessoa" ${view.split === "pessoa" ? "checked" : ""} /><span>Pessoa</span></label>
            <label><input type="radio" name="split" value="categoria" ${view.split === "categoria" ? "checked" : ""} /><span>Categoria</span></label>
          </div></div>
        <div class="chart"><canvas id="c-monthly" role="img" aria-label="Despesas por mês"></canvas></div>
        <details><summary>Ver tabela</summary><div class="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Despesas</th><th>Vendas</th></tr></thead>
          <tbody>${s.monthly.map((m) => html`<tr><td>${monthShort(m.month)}</td><td>${brl(m.expenses)}</td><td>${m.sales ? brl(m.sales) : "–"}</td></tr>`)}</tbody></table></div></details>
      </section>

      <section class="card">
        <h2>Para onde vai o dinheiro</h2>
        <ul class="bars">
          ${s.categories.map(
            (c) => html`<li><div class="bar-label"><span>${c.name}</span><span>${brl(c.total)} <small class="muted">${Math.round((c.total / s.totals.expenses) * 100)}%</small></span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, (c.total / maxCat) * 100)}%;background:${catColors[c.name] ?? series(0)}"></div></div></li>`,
          )}
        </ul>
        <p class="muted small">Barras coloridas: as 7 maiores categorias do período; as demais aparecem como "Demais" nos gráficos mensais.</p>
      </section>

      <section class="card">
        <h2>Gasto acumulado (líquido)</h2>
        <div class="chart"><canvas id="c-cumulative" role="img" aria-label="Gasto acumulado ao longo do tempo"></canvas></div>
      </section>

      <section class="card">
        <h2>Saldo entre os sócios</h2>
        <p class="muted small">Acima de zero: tem a receber. Abaixo: deve.</p>
        <div class="chart"><canvas id="c-balance" role="img" aria-label="Evolução do saldo de cada sócio"></canvas></div>
      </section>

      <section class="card">
        <h2>Quanto cada um pagou</h2>
        <div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Despesas</th><th>Vendas recebidas</th></tr></thead><tbody>
          ${state.users.map((u) => html`<tr><td>${u.name}</td><td>${brl(s.per_user[u.id]?.paid ?? 0)}</td><td>${s.per_user[u.id]?.sales ? brl(s.per_user[u.id]!.sales) : "–"}</td></tr>`)}
        </tbody></table></div>
      </section>

      <section class="card">
        <h2>Maiores despesas</h2>
        <div class="rows">${s.top.map((t) => html`<div class="row static"><span class="row-main"><span class="row-title">${t.description}</span>
          <span class="row-sub">${fmtDay(t.date)} · ${t.category} · ${userName(t.user_id)}</span></span><span class="row-amount">${brl(t.amount_cents)}</span></div>`)}</div>
      </section>`,
  );

  body.querySelectorAll<HTMLInputElement>('input[name="split"]').forEach((r) =>
    r.addEventListener("change", () => {
      view.split = r.value as "pessoa" | "categoria" | "tipo";
      draw(root, s);
    }),
  );

  const tipMoney = { callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${c.dataset.label}: ${brl(c.parsed.y ?? 0)}` } };

  // 1) Barras empilhadas por mês.
  const sets =
    view.split === "pessoa"
      ? state.users.map((u, i) => ({ label: u.name, color: series(i), data: s.monthly.map((m) => m.by_user[u.id] ?? 0) }))
      : view.split === "tipo"
        ? NATURES.filter((n) => s.natures.find((x) => x.id === n.id)?.total).map((n) => ({ label: n.label, color: natureColor(n.id), data: s.monthly.map((m) => m.by_nature[n.id] ?? 0) }))
        : s.category_order.map((n) => ({ label: n, color: catColors[n]!, data: s.monthly.map((m) => m.by_category[n] ?? 0) }));
  charts.push(
    new Chart(must<HTMLCanvasElement>("#c-monthly", body), {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: sets.map((d) => ({ label: d.label, data: d.data, backgroundColor: d.color, borderColor: css("--surface"), borderWidth: 1, maxBarThickness: 28 })),
      },
      options: { ...baseOptions(), scales: { ...axes(), x: { ...axes().x, stacked: true }, y: { ...axes().y, stacked: true, beginAtZero: true } }, plugins: { ...baseOptions().plugins, tooltip: { ...baseOptions().plugins.tooltip, ...tipMoney } } },
    }),
  );

  // 2) e 3) Linhas no tempo (eixo x numérico, rótulos formatados).
  const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const timeAxis = {
    type: "linear" as const,
    ticks: { color: css("--ink-2"), maxTicksLimit: 6, maxRotation: 0, callback: (v: string | number) => monthShort(new Date(Number(v)).toISOString().slice(0, 7)) },
    grid: { display: false },
    border: { color: css("--grid") },
  };
  const lineTip = {
    ...baseOptions().plugins.tooltip,
    callbacks: {
      title: (items: { parsed: { x: number | null } }[]) => fmtDay(new Date(items[0]?.parsed.x ?? 0).toISOString().slice(0, 10)),
      label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${c.dataset.label}: ${brl(c.parsed.y ?? 0)}`,
    },
  };
  const lineDefaults = { borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: css("--surface"), tension: 0 };
  charts.push(
    new Chart(must<HTMLCanvasElement>("#c-cumulative", body), {
      type: "line",
      data: { datasets: [{ ...lineDefaults, label: "Acumulado", borderColor: series(0), backgroundColor: series(0), pointHoverBackgroundColor: series(0), data: s.cumulative.map((p) => ({ x: t(p.date), y: p.total })) }] },
      options: { ...baseOptions(), parsing: false, scales: { x: timeAxis, y: { ...axes().y, beginAtZero: true } }, plugins: { legend: { display: false }, tooltip: lineTip } },
    }),
  );
  charts.push(
    new Chart(must<HTMLCanvasElement>("#c-balance", body), {
      type: "line",
      data: {
        datasets: state.users.map((u, i) => ({
          ...lineDefaults, label: u.name, borderColor: series(i), backgroundColor: series(i), pointHoverBackgroundColor: series(i),
          data: s.balance_series.map((p) => ({ x: t(p.date), y: p.balances[u.id] ?? 0 })),
        })),
      },
      options: { ...baseOptions(), parsing: false, scales: { x: timeAxis, y: axes().y }, plugins: { ...baseOptions().plugins, tooltip: lineTip } },
    }),
  );
}

export const destroyCharts = (): void => {
  charts.forEach((c) => c.destroy());
  charts = [];
};
