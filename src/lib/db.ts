import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'gestor.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
    seedAdmin(db)
  }
  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_configs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      meta_token TEXT,
      meta_account_ids TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      meta_account_id TEXT,
      color TEXT NOT NULL DEFAULT '#00c4a0',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

function seedAdmin(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (count === 0) {
    const id = require('crypto').randomUUID()
    const email = process.env.ADMIN_EMAIL || 'admin@oralunic.com'
    const name = process.env.ADMIN_NAME || 'Administrador'
    const password = process.env.ADMIN_PASSWORD || 'admin123'
    const hash = bcrypt.hashSync(password, 10)

    db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`)
      .run(id, email, name, hash)

    db.prepare(`INSERT INTO user_configs (user_id) VALUES (?)`).run(id)

    console.log(`[DB] Admin user created: ${email}`)
  }
}

export interface User {
  id: string
  email: string
  name: string
  role: string
}

export interface UserConfig {
  meta_token: string | null
  meta_account_ids: string[]
}

export interface Account {
  id: string
  slug: string
  name: string
  meta_account_id: string | null
  color: string
  active: number
}

export const userRepo = {
  findByEmail(email: string): (User & { password_hash: string }) | null {
    return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as any || null
  },
  findById(id: string): User | null {
    return getDb().prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(id) as any || null
  },
  create(id: string, email: string, name: string, passwordHash: string, role = 'viewer'): User {
    getDb().prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
      .run(id, email, name, passwordHash, role)
    getDb().prepare(`INSERT INTO user_configs (user_id) VALUES (?)`).run(id)
    return { id, email, name, role }
  },
}

export const configRepo = {
  get(userId: string): UserConfig {
    const row = getDb().prepare('SELECT * FROM user_configs WHERE user_id = ?').get(userId) as any
    const envToken = process.env.META_TOKEN || null
    const envAccounts: string[] = process.env.META_ACCOUNT_IDS
      ? JSON.parse(process.env.META_ACCOUNT_IDS)
      : []
    if (!row) return { meta_token: envToken, meta_account_ids: envAccounts }
    const dbAccounts: string[] = JSON.parse(row.meta_account_ids || '[]')
    return {
      meta_token: row.meta_token || envToken || null,
      meta_account_ids: dbAccounts.length > 0 ? dbAccounts : envAccounts,
    }
  },
  save(userId: string, config: Partial<UserConfig>) {
    const current = this.get(userId)
    const updated = { ...current, ...config }
    getDb().prepare(`
      INSERT INTO user_configs (user_id, meta_token, meta_account_ids, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        meta_token = excluded.meta_token,
        meta_account_ids = excluded.meta_account_ids,
        updated_at = excluded.updated_at
    `).run(userId, updated.meta_token, JSON.stringify(updated.meta_account_ids))
  },
}

export const accountRepo = {
  list(): Account[] {
    return getDb().prepare('SELECT * FROM accounts WHERE active = 1 ORDER BY name').all() as Account[]
  },
  findBySlug(slug: string): Account | null {
    return getDb().prepare('SELECT * FROM accounts WHERE slug = ?').get(slug) as Account || null
  },
  findById(id: string): Account | null {
    return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account || null
  },
  // Sync real accounts from Meta API (upsert by Meta account ID)
  upsertFromMeta(metaAccounts: Array<{ id: string; name: string }>) {
    const upsert = getDb().prepare(`
      INSERT INTO accounts (id, slug, name, meta_account_id, color)
      VALUES (?, ?, ?, ?, '#00c4a0')
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        meta_account_id = excluded.meta_account_id,
        slug = excluded.slug
    `)
    const tx = getDb().transaction(() => {
      for (const acc of metaAccounts) {
        // Generate slug: name-based + unique account ID suffix to avoid UNIQUE constraint conflicts
        const base = acc.name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'acc'
        const suffix = acc.id.replace('act_', '').slice(-8)
        const slug = `${base}-${suffix}`
        try {
          upsert.run(acc.id, slug, acc.name, acc.id)
        } catch (e) {
          console.error('[upsertFromMeta] Failed for', acc.id, e)
        }
      }
    })
    tx()
  },
}
