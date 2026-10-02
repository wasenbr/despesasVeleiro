/** Avisa a aplicação que os dados mudaram (ela recarrega do servidor e redesenha a tela atual). */
export const emitChanged = (): void => {
  document.dispatchEvent(new Event("data-changed"));
};
