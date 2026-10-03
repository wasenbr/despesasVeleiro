/// <reference lib="webworker" />
// Service worker: guarda a "casca" do app para abrir instantaneamente (e mostrar a tela de erro
// em vez de uma página em branco sem rede). Dados da API nunca são guardados em cache.
declare const BUILD_ID: string;
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `veleiro-${BUILD_ID}`;
const SHELL = ["/", "/app.js", "/app.css", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];

sw.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => sw.skipWaiting()));
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== sw.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) ?? (await caches.match("/")) ?? Response.error()),
  );
});
