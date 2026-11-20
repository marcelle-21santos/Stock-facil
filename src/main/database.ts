import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

let db: Database.Database

export function getDatabase(): Database.Database {
  if (db) return db
  const folder = app.getPath('userData')
  mkdirSync(folder, { recursive: true })
  db = new Database(join(folder, 'stock-facil.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
      category TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK(quantity >= 0),
      purchase_price_cents INTEGER NOT NULL CHECK(purchase_price_cents >= 0),
      sale_price_cents INTEGER NOT NULL CHECK(sale_price_cents >= 0),
      min_stock INTEGER NOT NULL DEFAULT 0 CHECK(min_stock >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sold_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('DINHEIRO','PIX','DEBITO','CREDITO')),
      total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
      status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED','CANCELED')),
      canceled_at TEXT,
      canceled_by TEXT
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
      line_total_cents INTEGER NOT NULL CHECK(line_total_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      movement_type TEXT NOT NULL CHECK(movement_type IN ('INITIAL','SALE','CANCEL_SALE','ADJUSTMENT')),
      quantity_delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      sale_id INTEGER REFERENCES sales(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_movements_product_id ON stock_movements(product_id);
  `)
  return db
}

export function closeDatabase() {
  if (db) {
    db.close()
    // @ts-expect-error reset lazy singleton during app shutdown
    db = undefined
  }
}
