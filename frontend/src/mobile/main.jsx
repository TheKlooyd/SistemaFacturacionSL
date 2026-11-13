import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MobileApp from "./MobileApp.jsx";
import "./mobile.css";

// GitHub Pages serves 404.html for a fresh visit to a dynamic route.
const url = new URL(window.location.href);
const route = url.searchParams.get("mobile_route");
if (route && /^\/mobile\/(?!\/)/.test(route)) {
  const target = new URL(route, window.location.origin);
  if (target.origin === window.location.origin)
    window.history.replaceState(null, "", target.pathname + target.search);
}
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register("/mobile/sw.js", { scope: "/mobile/" })
    .catch(() => {
      // The authenticated app remains usable if installation is unavailable.
    });
}
