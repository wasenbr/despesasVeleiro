import { ApiError, api } from "../api";
import { html, mount, must } from "../dom";

/** Tela de entrada. Na primeira vez (sem nenhum usuário) vira a tela de criação do primeiro usuário. */
export function renderLogin(root: HTMLElement, needsSetup: boolean, onDone: () => void): void {
  mount(
    root,
    html`
      <main class="login">
        <img src="/icons/icon.svg" alt="" width="72" height="72" />
        <h1>Despesas do Veleiro</h1>
        <p class="muted">${needsSetup ? "Primeiro acesso: crie o seu usuário. Depois você poderá adicionar o outro sócio em Ajustes." : "Entre para lançar e consultar as despesas."}</p>
        <form id="login-form" class="entry card" novalidate>
          ${needsSetup ? html`<label class="field"><span>Seu nome</span><input name="name" maxlength="60" autocomplete="name" /></label>` : ""}
          <label class="field"><span>Usuário</span><input name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" /></label>
          <label class="field"><span>Senha${needsSetup ? " (mínimo 8 caracteres)" : ""}</span><input type="password" name="password" autocomplete="${needsSetup ? "new-password" : "current-password"}" /></label>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn primary" type="submit">${needsSetup ? "Criar usuário e entrar" : "Entrar"}</button>
        </form>
      </main>`,
  );
  const form = must<HTMLFormElement>("#login-form", root);
  const error = must<HTMLElement>(".form-error", form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    const button = must<HTMLButtonElement>('button[type="submit"]', form);
    button.disabled = true;
    try {
      await api("POST", needsSetup ? "/api/setup" : "/api/login", { username: v("username"), password: v("password"), name: v("name") });
      onDone();
    } catch (e) {
      error.textContent = e instanceof ApiError ? e.message : "Não foi possível entrar.";
      error.hidden = false;
      button.disabled = false;
    }
  });
}
