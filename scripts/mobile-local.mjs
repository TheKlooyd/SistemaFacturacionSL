import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  access,
  cp,
} from "node:fs/promises";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { createHash, randomBytes, createECDH } from "node:crypto";
import pg from "pg";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = resolve(root, "local");
const state = resolve(local, "state.local");
const cli = resolve(root, "node_modules/supabase/dist/supabase.js");
// Docker's per-user installer does not update already-open terminal environments.
if (process.platform === "win32") {
  for (const base of [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
  ].filter(Boolean)) {
    const bin = resolve(
      base,
      base === process.env.LOCALAPPDATA
        ? "Programs/DockerDesktop/resources/bin"
        : "Docker/Docker/resources/bin",
    );
    if (existsSync(resolve(bin, "docker.exe"))) {
      process.env.PATH = bin + delimiter + (process.env.PATH ?? "");
      break;
    }
  }
}
const exists = async (path) =>
  access(path).then(
    () => true,
    () => false,
  );
export function localUrl(value, port) {
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (port && url.port !== String(port))
  )
    throw new Error("Se rechazó una conexión fuera del entorno local.");
  return url;
}
async function guard() {
  if (await exists(resolve(local, "supabase/.temp/project-ref")))
    throw new Error(
      "El entorno local no debe estar vinculado a un proyecto remoto.",
    );
  const config = await readFile(resolve(local, "supabase/config.toml"), "utf8");
  if (!config.includes('project_id = "klooyd-mobile-local"'))
    throw new Error("Identidad local incorrecta.");
}
function run(args, capture = false) {
  const result = spawnSync(
    process.execPath,
    [cli, ...args, "--workdir", local],
    {
      cwd: root,
      encoding: "utf8",
      stdio: capture ? "pipe" : "inherit",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    writeFileSync(
      resolve(local, "last-command.log"),
      (result.stderr ?? "") +
        "\n" +
        (result.stdout ?? "") +
        "\n" +
        (result.error?.message ?? ""),
    );
    throw new Error(
      `Supabase ${args[0]} falló. Diagnóstico local en local/last-command.log.`,
    );
  }
  return result.stdout;
}
export async function localStatus() {
  await guard();
  const status = JSON.parse(run(["status", "--output", "json"], true));
  localUrl(status.API_URL, 55321);
  localUrl(status.DB_URL, 55322);
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY)
    throw new Error("Faltan claves del Supabase local.");
  return status;
}
export async function localDatabase(status) {
  localUrl(status.DB_URL, 55322);
  const client = new pg.Client({ connectionString: status.DB_URL });
  await client.connect();
  return client;
}
export async function api(
  status,
  path,
  { token = status.SERVICE_ROLE_KEY, body, method = "POST" } = {},
) {
  localUrl(status.API_URL, 55321);
  const response = await fetch(`${status.API_URL}${path}`, {
    method,
    headers: {
      apikey: status.ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, ok: response.ok, data };
}
async function prepare() {
  await guard();
  await mkdir(state, { recursive: true });
  const names = (await readdir(resolve(root, "supabase/migrations")))
    .filter((x) => x.endsWith(".sql"))
    .sort();
  let sql =
    "-- GENERATED LOCAL ONLY. Never apply this bootstrap to a hosted project.\n";
  sql += await readFile(resolve(root, "supabase_schema.sql"), "utf8");
  sql += "\nalter table public.productos add column if not exists size text;\n";
  for (const name of names)
    sql +=
      `\n-- Source: ${name}\n` +
      (await readFile(resolve(root, "supabase/migrations", name), "utf8"));
  const digest = createHash("sha256").update(sql).digest("hex");
  const previous = await readFile(
    resolve(state, "schema.sha256"),
    "utf8",
  ).catch(() => "");
  if (
    previous &&
    previous !== digest &&
    (await exists(resolve(state, "started")))
  )
    throw new Error(
      "Cambió el esquema. Conserva tus datos o ejecuta local:reset -- --confirm-local-reset para recrear SOLO las pruebas.",
    );
  const dir = resolve(local, "supabase/migrations");
  await mkdir(dir, { recursive: true });
  let migrations = (await readdir(dir)).filter((x) => x.endsWith(".sql"));
  if (!migrations.length) {
    run(["migration", "new", "local_bootstrap"]);
    migrations = (await readdir(dir)).filter((x) => x.endsWith(".sql"));
  }
  if (migrations.length !== 1)
    throw new Error(
      "El bootstrap local requiere exactamente una migración generada.",
    );
  await writeFile(resolve(dir, migrations[0]), sql);
  await writeFile(resolve(state, "schema.sha256"), digest);
  for (const name of ["mobile-pin", "mobile-push"])
    await cp(
      resolve(root, "supabase/functions", name),
      resolve(local, "supabase/functions", name),
      { recursive: true },
    );
  await cp(
    resolve(root, "supabase/functions/mobile-deno.lock"),
    resolve(local, "supabase/functions/mobile-deno.lock"),
  );
  await mkdir(resolve(local, "frontend/src"), { recursive: true });
  await cp(
    resolve(root, "frontend/src/paymentMath.js"),
    resolve(local, "frontend/src/paymentMath.js"),
  );
  if (!(await exists(resolve(state, "push.json")))) {
    const key = createECDH("prime256v1");
    key.generateKeys();
    await writeFile(
      resolve(state, "push.json"),
      JSON.stringify(
        {
          publicKey: key.getPublicKey().toString("base64url"),
          privateKey: key.getPrivateKey().toString("base64url"),
          secret: randomBytes(32).toString("hex"),
        },
        null,
        2,
      ),
    );
  }
  const push = JSON.parse(await readFile(resolve(state, "push.json"), "utf8"));
  await writeFile(
    resolve(state, "functions.env"),
    [
      "MOBILE_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173",
      `WEB_PUSH_PUBLIC_KEY=${push.publicKey}`,
      `WEB_PUSH_PRIVATE_KEY=${push.privateKey}`,
      "WEB_PUSH_SUBJECT=https://localhost/mobile/",
      `MOBILE_PUSH_DISPATCH_SECRET=${push.secret}`,
      "",
    ].join("\n"),
  );
  console.log(
    `Configuración local preparada con ${names.length} migraciones canónicas. Sin conexión a producción.`,
  );
}
async function frontendEnv(status) {
  const push = JSON.parse(await readFile(resolve(state, "push.json"), "utf8"));
  await writeFile(
    resolve(root, "frontend/.env.mobile-local.local"),
    `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\nVITE_WEB_PUSH_PUBLIC_KEY=${push.publicKey}\n`,
  );
}
async function seed(status) {
  const credentialsFile = resolve(state, "accounts.json");
  let accounts = JSON.parse(
    await readFile(credentialsFile, "utf8").catch(() => "null"),
  );
  accounts ??= [
    {
      email: "propietario.restaurante@example.test",
      role: "propietario",
      business: "restaurante-pruebas",
    },
    {
      email: "propietario.taller@example.test",
      role: "propietario",
      business: "taller-pruebas",
    },
    {
      email: "cajero@example.test",
      role: "cajero",
      business: "restaurante-pruebas",
    },
    {
      email: "mesero@example.test",
      role: "mesero",
      business: "restaurante-pruebas",
    },
  ].map((x) => ({ ...x, password: randomBytes(18).toString("base64url") }));
  // Save first so an interrupted seed can reuse exactly the same credentials.
  await writeFile(credentialsFile, JSON.stringify(accounts, null, 2));
  const db = await localDatabase(status);
  try {
    for (const account of accounts) {
      let user = (
        await db.query("select id from auth.users where email=$1", [
          account.email,
        ])
      ).rows[0];
      if (!user) {
        const created = await api(status, "/auth/v1/admin/users", {
          body: {
            email: account.email,
            password: account.password,
            email_confirm: true,
          },
        });
        if (!created.ok)
          throw new Error(
            `No se pudo crear la cuenta ficticia: HTTP ${created.status}.`,
          );
        user = created.data;
      }
      account.userId = user.id;
      const name =
        account.business === "restaurante-pruebas"
          ? "Restaurante de pruebas"
          : "Taller de pruebas";
      const business = (
        await db.query(
          `insert into public.negocios(slug,nombre) values($1,$2)
        on conflict(slug) do update set nombre=excluded.nombre returning id`,
          [account.business, name],
        )
      ).rows[0].id;
      account.businessId = business;
      await db.query(
        `insert into public.negocio_configuracion(negocio_id,nombre_comercial,tipo_negocio,nombre_estacion_singular,nombre_estacion_plural)
        values($1,$2,$3,$4,$5) on conflict(negocio_id) do nothing`,
        [
          business,
          name,
          account.business === "restaurante-pruebas"
            ? "restaurante"
            : "taller_motos",
          account.business === "restaurante-pruebas" ? "Mesa" : "Puesto",
          account.business === "restaurante-pruebas" ? "Mesas" : "Puestos",
        ],
      );
      await db.query(
        `insert into public.suscripciones(negocio_id,estado,starts_at) values($1,'activa',now()-interval '1 day') on conflict do nothing`,
        [business],
      );
      await db.query(
        `insert into public.negocio_usuarios(negocio_id,user_id,rol) values($1,$2,$3) on conflict do nothing`,
        [business, user.id, account.role],
      );
      await db.query(
        `insert into public.mesas(negocio_id,numero,name) values($1,1,$2) on conflict(negocio_id,numero) do nothing`,
        [
          business,
          account.business === "restaurante-pruebas" ? "Mesa 1" : "Puesto 1",
        ],
      );
      const category = (
        await db.query(
          `insert into public.categorias(negocio_id,name) values($1,'Pruebas') on conflict(negocio_id,lower(btrim(name))) do update set name=excluded.name returning id`,
          [business],
        )
      ).rows[0].id;
      if (
        !(
          await db.query(
            "select id from public.productos where negocio_id=$1 limit 1",
            [business],
          )
        ).rowCount
      ) {
        await db.query(
          `insert into public.productos(negocio_id,category_id,name,item_type,price,purchase_price,stock_quantity)
          values($1,$2,'Producto de prueba','product',15000,9000,5),($1,$2,'Servicio de prueba','service',25000,0,0)`,
          [business, category],
        );
        await db.query(
          `insert into public.pagos(negocio_id,table_id,table_name,method,subtotal,tip_amount,total_with_tip,paid_amount,items,payment_splits)
          values($1,'1','Prueba local','EFECTIVO',15000,1500,16500,20000,'[]','[{"method":"EFECTIVO","amount":20000}]')`,
          [business],
        );
      }
    }
    await writeFile(credentialsFile, JSON.stringify(accounts, null, 2));
  } finally {
    await db.end();
  }
  console.log(
    "Datos ficticios preparados. Credenciales: local/state.local/accounts.json (excluido de Git).",
  );
}
async function main() {
  const action = process.argv[2];
  await guard();
  if (action === "prepare") return prepare();
  if (action === "start") {
    await prepare();
    // Capture output: CLI start/status print local service keys by default.
    run(["start"], true);
    await writeFile(resolve(state, "started"), new Date().toISOString());
    const status = await localStatus();
    await frontendEnv(status);
    await seed(status);
    console.log(
      "Supabase: http://127.0.0.1:55321 | Studio: http://127.0.0.1:55323",
    );
    return;
  }
  if (action === "reset") {
    if (!process.argv.includes("--confirm-local-reset"))
      throw new Error(
        "Confirma el borrado de datos LOCALES: npm run local:reset -- --confirm-local-reset",
      );
    // Verify a running local instance before changing its bootstrap marker.
    await localStatus();
    await writeFile(resolve(state, "started"), "");
    const { unlink } = await import("node:fs/promises");
    await unlink(resolve(state, "started"));
    await prepare();
    run(["db", "reset"], true);
    await writeFile(resolve(state, "started"), new Date().toISOString());
    const status = await localStatus();
    await frontendEnv(status);
    await seed(status);
    return;
  }
  if (action === "stop") {
    run(["stop"]);
    return;
  }
  if (action === "status") {
    await localStatus();
    console.log(
      "Supabase local está disponible (API 55321, PostgreSQL 55322, Studio 55323).",
    );
    return;
  }
  if (action === "seed") return seed(await localStatus());
  if (action === "phone-build") {
    const status = await localStatus();
    const push = JSON.parse(
      await readFile(resolve(state, "push.json"), "utf8"),
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, "frontend/node_modules/vite/bin/vite.js"),
        "build",
        "--mode",
        "mobile-phone",
        "--outDir",
        resolve(state, "phone-dist"),
      ],
      {
        cwd: resolve(root, "frontend"),
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: status.API_URL,
          VITE_SUPABASE_PROXY_PATH: "/local-api",
          VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
          VITE_WEB_PUSH_PUBLIC_KEY: push.publicKey,
        },
      },
    );
    if (result.status !== 0)
      throw new Error("Falló la compilación local para Android.");
    return;
  }
  if (action === "push") {
    const status = await localStatus();
    const push = JSON.parse(
      await readFile(resolve(state, "push.json"), "utf8"),
    );
    const response = await fetch(`${status.API_URL}/functions/v1/mobile-push`, {
      method: "POST",
      headers: { "x-mobile-push-key": push.secret },
    });
    if (!response.ok)
      throw new Error(
        `Dispatcher local: HTTP ${response.status}. Revisa local:functions.`,
      );
    console.log(await response.json());
    return;
  }
  if (action === "functions") {
    await prepare();
    await localStatus();
    run(["functions", "serve", "--env-file", resolve(state, "functions.env")]);
    return;
  }
  if (action === "web") {
    const status = await localStatus();
    await frontendEnv(status);
    // Explicit mode and environment override any inherited production Vite values.
    const push = JSON.parse(
      await readFile(resolve(state, "push.json"), "utf8"),
    );
    const child = spawn(
      process.execPath,
      [
        resolve(root, "frontend/node_modules/vite/bin/vite.js"),
        "--mode",
        "mobile-local",
        "--host",
        "127.0.0.1",
      ],
      {
        cwd: resolve(root, "frontend"),
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: status.API_URL,
          VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
          VITE_WEB_PUSH_PUBLIC_KEY: push.publicKey,
        },
      },
    );
    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
    return;
  }
  throw new Error("Acción local no reconocida.");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
