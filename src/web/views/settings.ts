import { ApiError, api } from "../api";
import { emitChanged } from "../bus";
import { html, mount, must, toast } from "../dom";
import { state } from "../state";

async function run(form: HTMLFormElement, action: () => Promise<void>, okMessage: string): Promise<void> {
  const error = must<HTMLElement>(".form-error", form);
  error.hidden = true;
  try {
    await action();
    toast(okMessage);
  } catch (e) {
    error.textContent = e instanceof ApiError ? e.message : "Não foi possível salvar.";
    error.hidden = false;
  }
}

export function renderSettings(root: HTMLElement, onLogout: () => void): void {
  const me = state.users.find((u) => u.id === state.me);
  mount(
    root,
    html`
      <section class="card">
        <h2>Conta</h2>
        <p>Você está logado como <strong>${me?.name}</strong> (${me?.username}).</p>
        <button type="button" class="btn" id="logout">Sair</button>
      </section>

      <section class="card">
        <h2>Trocar senha</h2>
        <form id="pw-form" class="entry" autocomplete="off" novalidate>
          <label class="field"><span>Senha atual</span><input type="password" name="old" autocomplete="current-password" /></label>
          <label class="field"><span>Nova senha (mínimo 8 caracteres)</span><input type="password" name="new" autocomplete="new-password" /></label>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn" type="submit">Trocar senha</button>
        </form>
      </section>

      <section class="card">
        <h2>Pessoas</h2>
        <p class="muted small">As despesas são divididas igualmente entre todas as pessoas cadastradas.</p>
        <ul class="plain">${state.users.map((u) => html`<li>${u.name} <span class="muted">(${u.username})</span></li>`)}</ul>
        <details><summary>Adicionar pessoa</summary>
          <form id="user-form" class="entry" autocomplete="off" novalidate>
            <label class="field"><span>Nome</span><input name="name" maxlength="60" /></label>
            <label class="field"><span>Usuário (para entrar)</span><input name="username" maxlength="40" autocapitalize="none" autocorrect="off" /></label>
            <label class="field"><span>Senha (mínimo 8 caracteres)</span><input type="password" name="password" autocomplete="new-password" /></label>
            <p class="form-error" role="alert" hidden></p>
            <button class="btn" type="submit">Adicionar</button>
          </form></details>
      </section>

      <section class="card">
        <h2>Categorias</h2>
        <ul class="plain cats">
          ${state.categories.map(
            (c) => html`<li><span>${c.name}</span><span><button type="button" class="link" data-rename="${c.id}">renomear</button>
              <button type="button" class="link danger" data-delete="${c.id}">excluir</button></span></li>`,
          )}
        </ul>
        <form id="cat-form" class="inline" autocomplete="off" novalidate>
          <input name="name" maxlength="60" placeholder="Nova categoria" aria-label="Nova categoria" />
          <button class="btn" type="submit">Adicionar</button>
          <p class="form-error" role="alert" hidden></p>
        </form>
      </section>

      <section class="card">
        <h2>Exportar dados (backup)</h2>
        <p class="muted small">Planilhas CSV para abrir no Excel, Numbers ou Google Planilhas.</p>
        <div class="row2">
          <a class="btn" href="/api/export/lancamentos.csv" download>Lançamentos</a>
          <a class="btn" href="/api/export/acertos.csv" download>Acertos</a>
        </div>
      </section>

      <section class="card">
        <h2>Instalar no iPhone</h2>
        <ol class="steps">
          <li>Abra este endereço no <strong>Safari</strong>.</li>
          <li>Toque no botão de compartilhar (quadrado com seta para cima).</li>
          <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
        </ol>
        <p class="muted small">Ele abre em tela cheia, como um aplicativo. No Android: menu do Chrome → Instalar aplicativo.</p>
      </section>`,
  );

  must("#logout", root).addEventListener("click", async () => {
    await api("POST", "/api/logout").catch(() => {});
    onLogout();
  });

  const pw = must<HTMLFormElement>("#pw-form", root);
  pw.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = (n: string) => (pw.elements.namedItem(n) as HTMLInputElement).value;
    void run(pw, async () => {
      await api("POST", "/api/password", { old: v("old"), new: v("new") });
      pw.reset();
    }, "Senha alterada");
  });

  const uf = must<HTMLFormElement>("#user-form", root);
  uf.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = (n: string) => (uf.elements.namedItem(n) as HTMLInputElement).value;
    void run(uf, async () => {
      await api("POST", "/api/users", { name: v("name"), username: v("username"), password: v("password") });
      emitChanged();
    }, "Pessoa adicionada");
  });

  const cf = must<HTMLFormElement>("#cat-form", root);
  cf.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void run(cf, async () => {
      await api("POST", "/api/categories", { name: (cf.elements.namedItem("name") as HTMLInputElement).value });
      emitChanged();
    }, "Categoria adicionada");
  });

  root.querySelectorAll<HTMLElement>("[data-rename]").forEach((b) =>
    b.addEventListener("click", async () => {
      const cat = state.categories.find((c) => c.id === Number(b.dataset.rename));
      const name = cat && prompt("Novo nome da categoria:", cat.name)?.trim();
      if (!cat || !name || name === cat.name) return;
      await api("PUT", `/api/categories/${cat.id}`, { name }).then(emitChanged, (e) => toast(e.message, true));
    }),
  );
  root.querySelectorAll<HTMLElement>("[data-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      const cat = state.categories.find((c) => c.id === Number(b.dataset.delete));
      if (!cat || !confirm(`Excluir a categoria "${cat.name}"?`)) return;
      await api("DELETE", `/api/categories/${cat.id}`).then(emitChanged, (e) => toast(e.message, true));
    }),
  );
}
