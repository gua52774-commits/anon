const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error("❌ Gagal membuka database:", err.message);
  else console.log("✅ Database SQLite siap!");
});

// Buat tabel users jika belum ada
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    status TEXT,
    partner_id INTEGER,
    muted INTEGER DEFAULT 0
  )
`);

module.exports = db;
