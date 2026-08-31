import { createHash, randomBytes } from "node:crypto";
import { mkdir, access, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const output = path.resolve("qr-output");
try { await access(output); throw new Error("qr-output ya existe. No se sobrescribieron códigos existentes."); } catch (error) { if (!String(error.message).includes("ENOENT")) throw error; }
await mkdir(output, { recursive: true });
const baseUrl = (process.env.QR_BASE_URL || "https://theklooyd.github.io/SistemaFacturacionSL/").replace(/\/?$/, "/");
const rows = [];
for (let mesa = 1; mesa <= 12; mesa += 1) { const token = randomBytes(32).toString("base64url"); const url = `${baseUrl}?qr=${token}`; await QRCode.toFile(path.join(output, `mesa-${String(mesa).padStart(2, "0")}.png`), url, { width: 900, margin: 2 }); rows.push(`(${mesa}, ${mesa}, '${createHash("sha256").update(token).digest("hex")}', ${mesa <= 8})`); }
await writeFile(path.join(output, "register-qr-codes.sql"), `insert into public.mesa_qr_codes (mesa_id, mesa_number, token_hash, is_active) values\n${rows.join(",\n")}\non conflict (mesa_number) do nothing;\n`);
console.log("Se crearon 12 PNG y un SQL local dentro de qr-output.");