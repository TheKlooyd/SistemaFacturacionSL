const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();

/** Config */
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0"; // para que funcione bien en cualquier PC

app.use(express.json());

/**
 * Si vas a servir el frontend desde este mismo backend,
 * realmente NO necesitas CORS. Pero lo dejo “seguro” por si
 * en desarrollo sigues usando Vite (5173).
 */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ],
  })
);

/** DB local (ruta robusta) */
const dbPath = path.join(__dirname, "pos.db");
const db = new sqlite3.Database(dbPath);

/** Crear tablas si no existen */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      status TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER,
      status TEXT,
      opened_at TEXT,
      closed_at TEXT,
      total REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id INTEGER,
      qty INTEGER,
      unit_price REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      method TEXT,
      amount REAL,
      paid_at TEXT
    )
  `);
});

/** Crear mesas por defecto si la tabla está vacía */
function seedTablesIfEmpty() {
  db.get(`SELECT COUNT(*) as count FROM tables`, (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      const stmt = db.prepare(`INSERT INTO tables (name, status) VALUES (?, ?)`);
      for (let i = 1; i <= 12; i++) stmt.run(`Mesa ${i}`, "FREE");
      stmt.finalize();
      console.log("Mesas creadas (seed).");
    }
  });
}
seedTablesIfEmpty();

/** Test */
app.get("/ping", (req, res) => {
  res.json({ message: "Backend funcionando 🚀" });
});

/** ========== API ========== */

// Listar mesas
app.get("/tables", (req, res) => {
  db.all(`SELECT * FROM tables ORDER BY id`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Cambiar estado de una mesa
app.patch("/tables/:id", (req, res) => {
  const { status } = req.body; // "FREE" | "BUSY"
  const { id } = req.params;

  db.run(`UPDATE tables SET status = ? WHERE id = ?`, [status, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// Registrar pago
app.post("/payments", (req, res) => {
  const { order_id, method, amount } = req.body;

  if (!method || !amount) {
    return res.status(400).json({ error: "method y amount son requeridos" });
  }

  const paidAt = new Date().toISOString();

  db.run(
    `INSERT INTO payments (order_id, method, amount, paid_at) VALUES (?, ?, ?, ?)`,
    [order_id || null, method, amount, paidAt],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, paid_at: paidAt });
    }
  );
});

// Reporte diario
app.get("/reports/daily", (req, res) => {
  const date = req.query.date; // YYYY-MM-DD
  if (!date) return res.status(400).json({ error: "date requerido" });

  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;

  db.all(
    `
    SELECT method, COUNT(*) as tickets, SUM(amount) as total
    FROM payments
    WHERE paid_at BETWEEN ? AND ?
    GROUP BY method
    `,
    [start, end],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get(
        `
        SELECT COUNT(*) as tickets, SUM(amount) as total
        FROM payments
        WHERE paid_at BETWEEN ? AND ?
        `,
        [start, end],
        (err2, summary) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ date, summary, breakdown: rows });
        }
      );
    }
  );
});

/** ========== Servir Frontend (build) ========== */
const distPath = path.join(__dirname, "..", "frontend", "dist");
const indexHtml = path.join(distPath, "index.html");

if (fs.existsSync(indexHtml)) {
  app.use(express.static(distPath));

  app.get("/", (req, res) => res.sendFile(indexHtml));
  // OJO: no pongo "catch-all" porque tu app no usa rutas tipo /algo (es una sola página)
} else {
  console.warn(
    "⚠️ No encontré el build del frontend en:",
    distPath,
    "\n   Corre `npm run build` en frontend y copia la carpeta dist."
  );
}

/** Mostrar IPs útiles */
function printLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

app.listen(PORT, HOST, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  const ips = printLocalIPs();
  if (ips.length) {
    console.log("🌐 En esta red también podrías abrirlo (misma WiFi/LAN):");
    ips.forEach((ip) => console.log(`   http://${ip}:${PORT}`));
  }
});
