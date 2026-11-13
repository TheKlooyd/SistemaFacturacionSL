import { spawn, spawnSync } from "node:child_process";
import { existsSync, appendFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { root, localStatus } from "./mobile-local.mjs";
import { createPhoneGateway } from "./mobile-phone-gateway.mjs";

const state = resolve(root, "local/state.local");
const publicDemo = process.argv.includes("--public-demo");
const status = await localStatus();
const build = spawnSync(
  process.execPath,
  [resolve(root, "scripts/mobile-local.mjs"), "phone-build"],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
if (build.status !== 0)
  throw new Error("No se pudo preparar la aplicación de prueba.");
const cloudflared =
  process.platform === "win32"
    ? [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]
        .filter(Boolean)
        .map((base) => resolve(base, "cloudflared/cloudflared.exe"))
        .find(existsSync)
    : "cloudflared";
if (!cloudflared)
  throw new Error(
    "Instala el cliente oficial cloudflared antes de iniciar el túnel.",
  );
const accessKey = randomBytes(32).toString("hex"),
  expiresAt = Date.now() + 2 * 60 * 60 * 1000;
const server = createPhoneGateway({
  apiUrl: status.API_URL,
  anonKey: status.ANON_KEY,
  directory: resolve(state, "phone-dist"),
  accessKey,
  expiresAt,
  publicDemo,
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(5174, "127.0.0.1", resolve);
});
const tunnel = spawn(
  cloudflared,
  ["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:5174"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
const config = {
  accessKey,
  expiresAt,
  port: 5174,
  gatewayPid: process.pid,
  tunnelPid: tunnel.pid,
  publicDemo,
};
await writeFile(
  resolve(state, "phone-access.json"),
  JSON.stringify(config, null, 2),
);
let stopped = false,
  announced = false,
  buffer = "";
function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  tunnel.kill();
  server.close();
  server.closeAllConnections();
  console.log("Acceso Android cerrado. La base de pruebas se conserva.");
}
const timer = setTimeout(stop, expiresAt - Date.now());
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
tunnel.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
  stop();
});
tunnel.once("exit", (code) => {
  if (!stopped && code) process.exitCode = 1;
  stop();
});
async function receive(chunk) {
  const text = chunk.toString();
  appendFileSync(resolve(state, "cloudflared.log"), text);
  buffer = (buffer + text).slice(-8192);
  const origin = buffer.match(
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/,
  )?.[0];
  if (origin && !announced) {
    announced = true;
    config.origin = origin;
    config.accessUrl = origin + (publicDemo ? "/mobile/" : "/access?key=" + accessKey);
    await writeFile(
      resolve(state, "phone-access.json"),
      JSON.stringify(config, null, 2),
    );
    await writeFile(resolve(state, "phone-link.txt"), config.accessUrl + "\n");
    await QRCode.toFile(
      resolve(state, "android-access.png"),
      config.accessUrl,
      { width: 440, margin: 2 },
    );
    console.log(
      "Túnel listo. Enlace de prueba: local/state.local/phone-link.txt; QR: local/state.local/android-access.png.",
    );
    console.log(
      "Credenciales ficticias: local/state.local/accounts.json. Caduca en dos horas; Ctrl+C lo cierra antes.",
    );
  }
}
for (const stream of [tunnel.stdout, tunnel.stderr])
  stream.on("data", (chunk) => {
    receive(chunk).catch((error) => {
      console.error(error.message);
      stop();
    });
  });
