import 'dotenv/config'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')
const dataPath = path.join(rootDir, 'data', 'users.json')

const DATABASE_URL = process.env.DATABASE_URL || ''
const PGSSL_MODE = process.env.PGSSLMODE || ''

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required to run migration.')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSL_MODE === 'disable'
    ? false
    : (PGSSL_MODE ? { rejectUnauthorized: false } : (!DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false))
})

async function ensureDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      salt text NOT NULL,
      password_hash text NOT NULL,
      hash_algo text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
}

async function loadUsers() {
  try {
    const raw = await fs.readFile(dataPath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    if (err.code === 'ENOENT') return []
    console.error('Failed to read users.json', err)
    process.exit(1)
  }
}

async function migrate() {
  await ensureDb()
  const users = await loadUsers()
  if (!users.length) {
    console.log('No users to migrate.')
    return
  }
  let inserted = 0
  let skipped = 0
  for (const user of users) {
    if (!user?.id || !user?.email || !user?.salt || !user?.passwordHash) {
      skipped += 1
      continue
    }
    const res = await pool.query(
      `INSERT INTO users (id, name, email, salt, password_hash, hash_algo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING`,
      [
        user.id,
        user.name || '',
        user.email,
        user.salt,
        user.passwordHash,
        user.hashAlgo || null,
        user.createdAt ? new Date(user.createdAt) : new Date()
      ]
    )
    if (res.rowCount === 1) inserted += 1
    else skipped += 1
  }
  console.log(`Migration complete. Inserted: ${inserted}, skipped: ${skipped}`)
}

migrate()
  .catch((err) => {
    console.error('Migration failed', err)
    process.exit(1)
  })
  .finally(async () => {
    await pool.end()
  })
