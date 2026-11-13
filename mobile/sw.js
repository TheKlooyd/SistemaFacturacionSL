/* Only the public offline page is cached. Never store authenticated responses. */
const CACHE = "klooyd-mobile-offline-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add("/mobile/offline.html")),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("klooyd-mobile-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith("/mobile/") ||
    event.request.mode !== "navigate"
  )
    return;
  event.respondWith(
    fetch("/mobile/index.html", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Mobile entry unavailable");
        return response;
      })
      .catch(() => caches.match("/mobile/offline.html")),
  );
});
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    data = null;
  }
  const title =
    typeof data?.title === "string" ? data.title.slice(0, 120) : "Klooyd";
  const body =
    typeof data?.body === "string"
      ? data.body.slice(0, 600)
      : "Tienes novedades en tu negocio.";
  let href = "/mobile/notificaciones";
  try {
    const target = new URL(data?.href, self.location.origin);
    if (
      target.origin === self.location.origin &&
      target.pathname.startsWith("/mobile/")
    )
      href = target.pathname + target.search;
  } catch {
    /* Keep safe default. */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/mobile/icon-192.png",
      badge: "/mobile/icon-192.png",
      tag: String(data?.id || "klooyd"),
      data: { href },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = new URL(
    event.notification.data?.href || "/mobile/notificaciones",
    self.location.origin,
  );
  if (
    href.origin !== self.location.origin ||
    !href.pathname.startsWith("/mobile/")
  )
    return;
  event.waitUntil(self.clients.openWindow(href.href));
});
