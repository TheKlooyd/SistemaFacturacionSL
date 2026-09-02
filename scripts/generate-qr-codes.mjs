import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const output = path.resolve(process.env.QR_OUTPUT_DIR || "qr-output");

try {
  await access(output);
  throw new Error(`${output} ya existe. No se sobrescribieron códigos existentes.`);
} catch (error) {
  if (!String(error.message).includes("ENOENT")) throw error;
}

await mkdir(output, { recursive: true });

const baseUrl = (
  process.env.QR_BASE_URL
  || "https://theklooyd.github.io/SistemaFacturacionSL/"
).replace(/\/?$/, "/");

const sqlRows = [];
const manifest = [];

for (let mesa = 1; mesa <= 12; mesa += 1) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const url = `${baseUrl}?qr=${token}`;
  const isActive = mesa <= 8;

  await QRCode.toFile(
    path.join(output, `mesa-${String(mesa).padStart(2, "0")}.png`),
    url,
    { width: 900, margin: 2 }
  );

  sqlRows.push(`(${mesa}, ${mesa}, '${tokenHash}', ${isActive})`);
  manifest.push({ mesa, token, url, is_active: isActive });
}

const registrationSql = `-- Archivo sensible generado localmente. No lo suba a Git.
begin;
do $$
begin
  if exists (
    select 1 from public.mesa_qr_codes where mesa_number between 1 and 12
  ) then
    raise exception 'Ya existen códigos QR registrados. No se modificó ningún token.';
  end if;
end
$$;

insert into public.mesa_qr_codes (mesa_id, mesa_number, token_hash, is_active)
values
${sqlRows.join(",\n")};
commit;
`;

await writeFile(path.join(output, "register-qr-codes.sql"), registrationSql);
await writeFile(
  path.join(output, "qr-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log("Se crearon 12 PNG, el SQL de registro y el manifiesto privado dentro de la carpeta de salida.");
