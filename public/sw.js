/**
 * Service worker de JSuzuki Control.
 *
 * Criterio: los datos financieros NUNCA se guardan en el cache. Solo se
 * cachea el armazon de la aplicacion para que abra rapido y para mostrar una
 * pantalla decente sin conexion. Toda peticion a /api/ va siempre a la red.
 */

const VERSION = "fc-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL_ASSETS = ["/offline.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nada que venga de la API se cachea.
  if (url.pathname.startsWith("/api/")) return;

  // Navegacion: red primero, y si no hay conexion, la pantalla offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Recursos estaticos de Next: cache primero, con revalidacion en segundo plano.
  if (url.pathname.startsWith("/_next/static/") || SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
