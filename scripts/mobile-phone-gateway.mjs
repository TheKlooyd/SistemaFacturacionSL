import http from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { root, localStatus } from "./mobile-local.mjs";

const state = resolve(root, "local/state.local");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const authRoutes = new Set([
  "/auth/v1/token",
  "/auth/v1/user",
  "/auth/v1/logout",
]);
const apiRoutes = new Set([
  "/rest/v1/rpc/klooyd_mobile",
  "/functions/v1/mobile-pin",
]);
const equal = (a, b) =>
  typeof a === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createPhoneGateway({
  apiUrl,
  anonKey,
  directory,
  accessKey,
  expiresAt,
  publicDemo = false,
}) {
  const cookieName = "__Host-klooyd_local";
  return http.createServer(async (request, response) => {
    const send = (code, body, headers = {}) => {
      response.writeHead(code, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        ...headers,
      });
      response.end(body);
    };
    try {
      if (Date.now() >= expiresAt)
        return send(410, "Prueba temporal finalizada.");
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/access" && request.method === "GET") {
        if (publicDemo) return send(303, "", { Location: "/mobile/" });
        if (!equal(url.searchParams.get("key"), accessKey))
          return send(
            401,
            "Acceso privado. Abre el enlace de prueba proporcionado.",
          );
        return send(303, "", {
          Location: "/mobile/",
          "Set-Cookie": `${cookieName}=${accessKey}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}`,
        });
      }
      const cookies = (request.headers.cookie ?? "")
        .split(";")
        .map((x) => x.trim());
      const cookie = cookies
        .find((x) => x.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      if (!publicDemo && !equal(cookie, accessKey))
        return send(
          401,
          "Acceso privado. Abre el enlace de prueba proporcionado.",
        );
      if (url.pathname.startsWith("/local-api/")) {
        const path = url.pathname.slice("/local-api".length);
        if (!authRoutes.has(path) && !apiRoutes.has(path))
          return send(404, "Ruta no disponible en esta prueba.");
        if (!["GET", "POST", "PUT"].includes(request.method))
          return send(405, "Método no disponible.");
        let body = Buffer.alloc(0);
        for await (const chunk of request) {
          body = Buffer.concat([body, chunk]);
          if (body.length > 16384)
            return send(413, "Solicitud demasiado grande.");
        }
        const headers = {
          apikey: anonKey,
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:5173",
        };
        if (request.headers.authorization)
          headers.Authorization = request.headers.authorization;
        // Never expose Studio, Auth admin, Storage, raw tables, dispatcher or service-role RPCs.
        const upstream = await fetch(apiUrl + path + url.search, {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : body,
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        });
        return send(
          upstream.status,
          Buffer.from(await upstream.arrayBuffer()),
          {
            "Content-Type":
              upstream.headers.get("content-type") || "application/json",
          },
        );
      }
      if (!["GET", "HEAD"].includes(request.method))
        return send(405, "Método no disponible.");
      let path = decodeURIComponent(url.pathname);
      if (path === "/" || (path.startsWith("/mobile/") && !extname(path)))
        path = "/mobile/index.html";
      if (
        !path.startsWith("/mobile/") &&
        !path.startsWith("/assets/") &&
        path != "/logoklooyd.png"
      )
        return send(404, "No disponible.");
      const file = resolve(directory, "." + path);
      if (!file.startsWith(resolve(directory) + sep))
        return send(404, "No disponible.");
      if (!(await stat(file).catch(() => null))?.isFile())
        return send(404, "No disponible.");
      const data = await readFile(file);
      return send(200, request.method === "HEAD" ? "" : data, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
    } catch {
      if (!response.headersSent)
        send(502, "El entorno local no está disponible.");
      else response.end();
    }
  });
}

async function main() {
  const status = await localStatus();
  const publicDemo = process.argv.includes("--public-demo");
  const previous = JSON.parse(await readFile(resolve(state, "phone-access.json"), "utf8").catch(() => "{}"));
  const accessKey = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  const directory = resolve(state, "phone-dist");
  await stat(resolve(directory, "mobile/index.html"));
  const server = createPhoneGateway({
    apiUrl: status.API_URL,
    anonKey: status.ANON_KEY,
    directory,
    accessKey,
    expiresAt,
    publicDemo,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(5174, "127.0.0.1", resolve);
  });
  await writeFile(
    resolve(state, "phone-access.json"),
    JSON.stringify({ ...previous, accessKey: publicDemo ? null : accessKey, expiresAt, port: 5174, publicDemo, gatewayPid: process.pid,
      accessUrl: previous.origin ? previous.origin + (publicDemo ? "/mobile/" : "/access?key=" + accessKey) : undefined }, null, 2),
  );
  console.log(
    publicDemo ? "Demo Android sin barrera adicional en 127.0.0.1:5174. Requiere login de la aplicación y caduca en dos horas."
      : "Acceso Android protegido en 127.0.0.1:5174. Caduca en dos horas. Clave solo en local/state.local/phone-access.json.",
  );
  const timer = setTimeout(() => {
    server.close();
    server.closeAllConnections();
  }, expiresAt - Date.now());
  server.once("close", () => clearTimeout(timer));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
