const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.sqlite");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    status TEXT,
    partner_id INTEGER,
    muted INTEGER DEFAULT 0
  )
`);
