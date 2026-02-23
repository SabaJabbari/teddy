
import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { Pool } from 'pg'
import nodemailer from 'nodemailer'

const app = express()
const PORT = process.env.PORT || 8787
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173']
const ORIGINS = Array.from(new Set([
  ...DEFAULT_ORIGINS,
  ...(process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean)
]))
const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || ''
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || process.env.ELEVEN_VOICE_ID || ''
const ELEVEN_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5'
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex')
const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 1000 * 60 * 60 * 24 * 7)
const DATABASE_URL = process.env.DATABASE_URL || ''
const PGSSL_MODE = process.env.PGSSLMODE || ''
const APP_URL = process.env.APP_URL || ''
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const SMTP_FROM = process.env.SMTP_FROM || ''
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true'
const LOG_REQUESTS = String(process.env.LOG_REQUESTS || 'true').toLowerCase() !== 'false'
const CHAT_DEFAULT_MODE = process.env.CHAT_DEFAULT_MODE || 'avatar_full'
const EVAL_LOG_ENABLED = String(process.env.EVAL_LOG_ENABLED || 'true').toLowerCase() !== 'false'

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (ORIGINS.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  }
}))
app.use(express.json({ limit: '1mb' }))

const buckets = new Map()
const authBuckets = new Map()
const authEmailBuckets = new Map()
const resetTokens = new Map()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, 'data')
const usersFile = path.join(dataDir, 'users.json')
const evalLogsFile = process.env.EVAL_LOG_FILE
  ? (path.isAbsolute(process.env.EVAL_LOG_FILE) ? process.env.EVAL_LOG_FILE : path.join(__dirname, process.env.EVAL_LOG_FILE))
  : path.join(dataDir, 'chat-eval.ndjson')
const dbConfig = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
      ssl: PGSSL_MODE === 'disable'
        ? false
        : (PGSSL_MODE ? { rejectUnauthorized: false } : (!DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false))
    }
  : null
const pool = dbConfig ? new Pool(dbConfig) : null
const CHAT_MODES = new Set(['text', 'avatar', 'avatar_safety', 'avatar_full'])

app.use((req, res, next) => {
  const id = crypto.randomBytes(6).toString('hex')
  req.requestId = id
  res.setHeader('x-request-id', id)
  if (!LOG_REQUESTS) return next()
  const start = Date.now()
  res.on('finish', () => {
    const durationMs = Date.now() - start
    const entry = {
      ts: new Date().toISOString(),
      id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs
    }
    console.log(JSON.stringify(entry))
  })
  next()
})

app.get('/health', async (req, res) => {
  try {
    if (pool) {
      await pool.query('SELECT 1')
    }
    res.json({ ok: true, uptime: Math.round(process.uptime()), db: pool ? 'ok' : 'disabled' })
  } catch (err) {
    console.error('health error', err)
    res.status(503).json({ ok: false, uptime: Math.round(process.uptime()), db: 'error' })
  }
})

async function readUsersFile() {
  try {
    const raw = await fs.readFile(usersFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    if (err.code === 'ENOENT') return []
    if (err.name === 'SyntaxError') return []
    console.error('readUsers error', err)
    return []
  }
}

async function writeUsersFile(users = []) {
  await fs.mkdir(dataDir, { recursive: true })
  const tmp = `${usersFile}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(users, null, 2))
  await fs.rename(tmp, usersFile)
}

async function ensureDb() {
  if (!pool) return
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id bigserial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
}

async function getUserByEmail(email) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email])
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      salt: row.salt,
      passwordHash: row.password_hash,
      hashAlgo: row.hash_algo,
      createdAt: row.created_at
    }
  }
  const users = await readUsersFile()
  return users.find((u) => u.email === email) || null
}

async function getUserById(id) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id])
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      salt: row.salt,
      passwordHash: row.password_hash,
      hashAlgo: row.hash_algo,
      createdAt: row.created_at
    }
  }
  const users = await readUsersFile()
  return users.find((u) => u.id === id) || null
}

async function createUser(user) {
  if (pool) {
    await pool.query(
      'INSERT INTO users (id, name, email, salt, password_hash, hash_algo, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [user.id, user.name, user.email, user.salt, user.passwordHash, user.hashAlgo || null, user.createdAt]
    )
    return
  }
  const users = await readUsersFile()
  users.push(user)
  await writeUsersFile(users)
}

async function updateUserAuth(userId, salt, passwordHash, hashAlgo) {
  if (pool) {
    await pool.query(
      'UPDATE users SET salt = $1, password_hash = $2, hash_algo = $3 WHERE id = $4',
      [salt, passwordHash, hashAlgo, userId]
    )
    return
  }
  const users = await readUsersFile()
  const idx = users.findIndex((u) => u.id === userId)
  if (idx === -1) return
  users[idx] = { ...users[idx], salt, passwordHash, hashAlgo }
  await writeUsersFile(users)
}

async function updateUserName(userId, name) {
  if (pool) {
    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, userId])
    return
  }
  const users = await readUsersFile()
  const idx = users.findIndex((u) => u.id === userId)
  if (idx === -1) return
  users[idx] = { ...users[idx], name }
  await writeUsersFile(users)
}

function hashPasswordLegacy(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex')
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function safeEqualHex(a, b) {
  const aBuf = Buffer.from(a, 'hex')
  const bBuf = Buffer.from(b, 'hex')
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function safeEqualString(a, b) {
  const aBuf = Buffer.from(String(a))
  const bBuf = Buffer.from(String(b))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function issueToken(userId) {
  const now = Math.floor(Date.now() / 1000)
  const exp = Math.floor((Date.now() + TOKEN_TTL_MS) / 1000)
  const payload = { sub: userId, iat: now, exp }
  const encoded = base64UrlEncode(JSON.stringify(payload))
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url')
  return { token: `${encoded}.${signature}`, expiresAt: exp * 1000 }
}

function verifyToken(raw = '') {
  const [payload, signature] = String(raw).split('.')
  if (!payload || !signature) return null
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url')
  if (!safeEqualString(signature, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data?.sub || !data?.exp) return null
    if (Date.now() > data.exp * 1000) return null
    return data
  } catch {
    return null
  }
}

function rateLimit(map, key, limit, windowMs) {
  const now = Date.now()
  const arr = map.get(key) || []
  const recent = arr.filter((t) => now - t < windowMs)
  if (recent.length >= limit) return false
  recent.push(now)
  map.set(key, recent)
  return true
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase()
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())
}

function getAppUrl(req) {
  if (APP_URL) return APP_URL.replace(/\/+$/, '')
  const origin = req?.headers?.origin
  if (origin) return String(origin).replace(/\/+$/, '')
  return ORIGINS[0] || 'http://localhost:5173'
}

function getMailer() {
  if (!SMTP_HOST || !SMTP_FROM) return null
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  })
}

async function storeResetToken(userId, tokenHash, expiresAt) {
  if (pool) {
    await pool.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    )
    return
  }
  resetTokens.set(tokenHash, { userId, expiresAt, usedAt: null })
}

async function consumeResetToken(tokenHash) {
  if (pool) {
    const { rows } = await pool.query(
      `UPDATE password_resets
       SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [tokenHash]
    )
    return rows[0]?.user_id || null
  }
  const entry = resetTokens.get(tokenHash)
  if (!entry) return null
  if (entry.usedAt || Date.now() > entry.expiresAt) return null
  entry.usedAt = Date.now()
  resetTokens.set(tokenHash, entry)
  return entry.userId
}
app.use((req,res,next)=>{
  if (req.path && req.path.startsWith('/api/tts')) return next()
  const ip = req.ip || req.headers['x-forwarded-for'] || 'local'
  const now = Date.now()
  const arr = buckets.get(ip) || []
  const recent = arr.filter(t=> now - t < 10000)
  if (recent.length >= 6) return res.status(429).json({ error: 'Too many requests' })
  recent.push(now); buckets.set(ip, recent); next()
})

function isCrisis(text=''){
  const t=(text||'').toLowerCase()
  return ['suizid','selbstmord','mich umbringen','ich will nicht mehr leben','selbstverletz','mich verletzen','cutten','ritzen','kill myself','suicide','self harm','hurt myself','akut gefährdet','krise'].some(k=>t.includes(k))
}

const STYLE={
  formal:{
    name:'Formell',
    person:'Sie',
    tone:'professionell, ruhig, respektvoll, sachlich',
    opener:'Verstanden.',
    ask:'Möchten Sie, dass ich eine 1-minütige Atemübung starte?',
    rules:[
      'Anrede ausschließlich "Sie".',
      'Keine Emojis oder Umgangssprache.',
      'Nennen Sie strukturierte Schritte ("Bitte ...", "Falls es passt ...").'
    ],
    mockTips:[
      'Bitte nehmen Sie ruhig Platz, legen Sie die Hände auf den Bauch und atmen Sie 4 Sekunden ein, halten Sie 2 Sekunden und atmen Sie 4 Sekunden aus – drei Durchgänge.',
      'Schauen Sie sich im Raum um und benennen Sie leise drei Dinge – das gibt Orientierung.'
    ]
  },
  informal:{
    name:'Informell',
    person:'du',
    tone:'locker, freundlich, ermutigend',
    opener:'Klar!',
    ask:'Soll ich eine 1-min Atemübung für dich starten?',
    rules:[
      'Sprich die Person mit "du" an.',
      'Nutze 1–2 unterstützende Emojis, wenn es passt.',
      'Erinner den Menschen freundlich daran, kurz innezuhalten.'
    ],
    mockTips:[
      'Okay, setzt dich kurz hin, leg die Hand auf den Bauch und atme 4 Sekunden ein, 2 Sekunden halten, 4 Sekunden aus – locker dreimal.',
      'Schau dich einmal um und nenn dir drei Dinge im Raum – das holt dich ins Jetzt. 😊'
    ]
  },
  humor:{
    name:'Humorvoll',
    person:'du',
    tone:'warm, leicht humorvoll (sensibel, keine Ironie über Probleme)',
    opener:'Alles klar – einmal kurz lächeln 😊',
    ask:'Magst du eine 1-min Atemübung – ganz ohne Drachenfeuer?',
    rules:[
      'Sprich mit "du" und streue ein leichtes, freundliches Bild oder Wortspiel ein.',
      'Genieße kleine Emojis oder lautmalerische Wörter, solange sie respektvoll bleiben.',
      'Halte die Hilfestellung trotzdem klar und bodenständig.'
    ],
    mockTips:[
      'Einmal Pfote aufs Herz: Atme 4 Sekunden ein, 2 Sekunden halten, 4 Sekunden aus – wie eine Welle, die ans Ufer rollt.',
      'Mini-Fokus-Spiel: Suche drei Dinge im Raum und flüster dir ihre Namen – das ist wie ein mentaler Reset-Button. 😌'
    ]
  }
}

function buildSystem(styleKey='formal'){
  const s = STYLE[styleKey] || STYLE.formal
  return [
    `Du bist ein KI-Selfcare-Avatar. Antworte **immer auf Deutsch**.`,
    `Rolle & Grenzen: allgemeine Selbstfürsorge (Atmung 4-2-4, Grounding, Mikro-Pausen, sanfte Reframing-Impulse).`,
    `**Keine** medizinischen/diagnostischen/therapeutischen Ratschläge. Bei medizinischen/akuten Anliegen: an Fachpersonal verweisen.`,
    `Transparenz: Du bist eine **KI**, nicht menschlich.`,
    `Stil: **${s.name}**, Anrede: **${s.person}**, Ton: ${s.tone}.`,
    s.rules ? `Spezifische Stil-Regeln: ${s.rules.join(' ')}` : '',
    `Länge: **2–5 kurze Sätze**. Enthält **1 kleine, konkrete Aktion** + **1 sanfte, offene Frage**.`,
    `Bei möglichen Krisen/Selbstgefährdung: kurze, warme Krisenantwort, Hinweis auf lokalen Notruf **112**.`
  ].filter(Boolean).join('\n')
}

function crisisReply(styleKey='formal'){
  const s = STYLE[styleKey] || STYLE.formal
  const a = s.person==='Sie' ? 'Es tut mir leid zu hören, dass Sie sich gerade so fühlen.' : 'Es tut mir leid zu hören, dass du dich gerade so fühlst.'
  const b = s.person==='Sie' ? 'Wenn Sie akut gefährdet sind: Bitte wenden Sie sich sofort an den Notruf **112** oder an eine vertraute Person vor Ort.' : 'Wenn du akut gefährdet bist: Bitte wende dich sofort an den Notruf **112** oder an eine vertraute Person vor Ort.'
  const c = s.person==='Sie' ? 'Wünschen Sie eine kurze Atemübung, während Sie Unterstützung organisieren?' : 'Möchtest du eine kurze Atemübung, während du Unterstützung organisierst?'
  return `${a} ${b} ${c}`
}

function mockReply(userText='', styleKey='formal'){
  const s = STYLE[styleKey] || STYLE.formal
  const tips = s.mockTips || STYLE.formal.mockTips
  return `${s.opener} ${tips[0]} ${tips[1]} ${s.ask}`
}

function normalizeMode(raw = '') {
  const value = String(raw || '').trim().toLowerCase()
  if (CHAT_MODES.has(value)) return value
  return CHAT_MODES.has(CHAT_DEFAULT_MODE) ? CHAT_DEFAULT_MODE : 'avatar_full'
}

function getModeFlags(mode = 'avatar_full') {
  return {
    avatar: mode !== 'text',
    safety: mode === 'avatar_safety' || mode === 'avatar_full',
    personalization: mode === 'avatar_full'
  }
}

function safeText(value, max = 140) {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

function extractProfileContext(rawProfile) {
  if (!rawProfile || typeof rawProfile !== 'object') return null
  const profile = rawProfile.profile && typeof rawProfile.profile === 'object' ? rawProfile.profile : {}
  const answers = rawProfile.answers && typeof rawProfile.answers === 'object' ? rawProfile.answers : {}
  const ctx = {
    name: safeText(answers.name, 40),
    safePlace: safeText(answers.safePlace, 80),
    companionFeeling: safeText(answers.companionFeeling, 80),
    wishPlace: safeText(answers.wishPlace, 80),
    mood: safeText(answers.weather, 60),
    tone: safeText(profile.tone, 30),
    pacing: safeText(profile.pacing, 30),
    summary: safeText(profile.summary, 220)
  }
  const hasValue = Object.values(ctx).some(Boolean)
  return hasValue ? ctx : null
}

function buildSystemForMode(styleKey = 'formal', mode = 'avatar_full', profileContext = null) {
  if (mode === 'text') {
    const s = STYLE[styleKey] || STYLE.formal
    return [
      'Du bist ein KI-Selfcare-Assistent. Antworte immer auf Deutsch.',
      'Hilf mit kurzen, alltagsnahen Selbstfürsorge-Impulsen (Atmung 4-2-4, Grounding, Mikro-Pausen).',
      'Keine medizinischen/diagnostischen/therapeutischen Ratschläge.',
      `Stil: ${s.name}, Ton: ${s.tone}, Anrede: ${s.person}.`,
      'Länge: 2-5 kurze Sätze mit 1 konkreten Aktion und 1 offenen Frage.'
    ].join('\n')
  }
  const parts = [buildSystem(styleKey)]
  if (mode === 'avatar_full' && profileContext) {
    const profileLines = [
      profileContext.summary ? `Profil-Zusammenfassung: ${profileContext.summary}` : '',
      profileContext.name ? `Name der Person: ${profileContext.name}` : '',
      profileContext.mood ? `Aktuelle Stimmung (self-report): ${profileContext.mood}` : '',
      profileContext.safePlace ? `Sicherer Ort: ${profileContext.safePlace}` : '',
      profileContext.companionFeeling ? `Gewünschte Begleitung: ${profileContext.companionFeeling}` : '',
      profileContext.wishPlace ? `Gewünschter mentaler Ort: ${profileContext.wishPlace}` : '',
      profileContext.tone ? `Bevorzugter Ton: ${profileContext.tone}` : '',
      profileContext.pacing ? `Bevorzugtes Tempo: ${profileContext.pacing}` : ''
    ].filter(Boolean)
    if (profileLines.length) {
      parts.push('Personalisiere die Antwort mit diesem Kontext, ohne sensible Informationen zu erfinden:')
      parts.push(profileLines.join('\n'))
    }
  }
  return parts.join('\n\n')
}

function estimateTokens(text = '') {
  return Math.ceil(String(text || '').length / 4)
}

function estimateTokensFromChars(chars = 0) {
  const value = Number(chars)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.ceil(value / 4)
}

function sanitizeEvalMeta(rawMeta) {
  if (!rawMeta || typeof rawMeta !== 'object') return {}
  const scenarioId = safeText(rawMeta.scenarioId, 80)
  const participantId = safeText(rawMeta.participantId, 80)
  const ratingValue = Number(rawMeta.rating)
  const rating = Number.isFinite(ratingValue) ? ratingValue : null
  return {
    ...(scenarioId ? { scenarioId } : {}),
    ...(participantId ? { participantId } : {}),
    ...(rating != null ? { rating } : {})
  }
}

async function appendEvalLog(entry) {
  if (!EVAL_LOG_ENABLED) return
  try {
    await fs.mkdir(path.dirname(evalLogsFile), { recursive: true })
    await fs.appendFile(evalLogsFile, `${JSON.stringify(entry)}\n`)
  } catch (err) {
    console.error('eval log error', err)
  }
}

app.get('/api/tts/status', (req, res) => {
  const enabled = Boolean(ELEVEN_API_KEY && (ELEVEN_VOICE_ID || req.query.voice))
  res.json({ enabled })
})

app.post('/api/auth/register', async (req, res) => {
  const { name = '', email = '', password = '' } = req.body || {}
  const ip = req.ip || req.headers['x-forwarded-for'] || 'local'
  const cleanName = String(name).trim()
  const cleanEmail = normalizeEmail(email)
  const cleanPassword = String(password)
  if (!rateLimit(authBuckets, `register:${ip}`, 8, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' })
  }
  if (!rateLimit(authEmailBuckets, `register:${cleanEmail}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Zu viele Versuche für diese E-Mail. Bitte später erneut versuchen.' })
  }
  if (!cleanName || cleanName.length > 80 || !cleanEmail || !isValidEmail(cleanEmail) || cleanPassword.length < 6) {
    return res.status(400).json({ error: 'Name, gültige E-Mail und Passwort (mind. 6 Zeichen) erforderlich.' })
  }
  try {
    const existing = await getUserByEmail(cleanEmail)
    if (existing) {
      return res.status(400).json({ error: 'Diese E-Mail ist bereits registriert.' })
    }
    const salt = crypto.randomBytes(16).toString('hex')
    const user = {
      id: crypto.randomUUID(),
      name: cleanName,
      email: cleanEmail,
      salt,
      passwordHash: hashPassword(cleanPassword, salt),
      hashAlgo: 'scrypt-v1',
      createdAt: new Date().toISOString()
    }
    await createUser(user)
    const { token, expiresAt } = issueToken(user.id)
    res.json({
      token,
      expiresAt,
      user: { id: user.id, name: user.name, email: user.email }
    })
  } catch (err) {
    console.error('register error', err)
    res.status(500).json({ error: 'Registrierung fehlgeschlagen.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email = '', password = '' } = req.body || {}
  const ip = req.ip || req.headers['x-forwarded-for'] || 'local'
  const cleanEmail = normalizeEmail(email)
  const cleanPassword = String(password)
  if (!rateLimit(authBuckets, `login:${ip}`, 12, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' })
  }
  if (!rateLimit(authEmailBuckets, `login:${cleanEmail}`, 6, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Zu viele Versuche für diese E-Mail. Bitte später erneut versuchen.' })
  }
  if (!cleanEmail || !cleanPassword) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich.' })
  }
  try {
    const user = await getUserByEmail(cleanEmail)
    if (!user) return res.status(400).json({ error: 'Ungültige Zugangsdaten.' })
    if (!user.salt || !user.passwordHash) return res.status(400).json({ error: 'Ungültige Zugangsdaten.' })
    let valid = false
    if (user.hashAlgo === 'scrypt-v1') {
      const hash = hashPassword(cleanPassword, user.salt)
      valid = safeEqualHex(hash, user.passwordHash)
    } else {
      const legacyHash = hashPasswordLegacy(cleanPassword, user.salt)
      valid = legacyHash === user.passwordHash
      if (valid) {
        const newSalt = crypto.randomBytes(16).toString('hex')
        const newHash = hashPassword(cleanPassword, newSalt)
        await updateUserAuth(user.id, newSalt, newHash, 'scrypt-v1')
      }
    }
    if (!valid) return res.status(400).json({ error: 'Ungültige Zugangsdaten.' })
    const { token, expiresAt } = issueToken(user.id)
    res.json({ token, expiresAt, user: { id: user.id, name: user.name, email: user.email } })
  } catch (err) {
    console.error('login error', err)
    res.status(500).json({ error: 'Login fehlgeschlagen.' })
  }
})

app.post('/api/auth/forgot', async (req, res) => {
  const { email = '' } = req.body || {}
  const ip = req.ip || req.headers['x-forwarded-for'] || 'local'
  const cleanEmail = normalizeEmail(email)
  if (!rateLimit(authBuckets, `forgot:${ip}`, 6, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' })
  }
  if (!rateLimit(authEmailBuckets, `forgot:${cleanEmail}`, 4, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Zu viele Versuche für diese E-Mail. Bitte später erneut versuchen.' })
  }
  if (!cleanEmail || !isValidEmail(cleanEmail)) {
    return res.status(200).json({ ok: true })
  }
  try {
    const user = await getUserByEmail(cleanEmail)
    if (!user) return res.status(200).json({ ok: true })
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30)
    await storeResetToken(user.id, tokenHash, expiresAt)
    const appUrl = getAppUrl(req)
    const resetLink = `${appUrl}/reset-password?token=${rawToken}`
    const mailer = getMailer()
    if (mailer) {
      await mailer.sendMail({
        from: SMTP_FROM,
        to: user.email,
        subject: 'Passwort zuruecksetzen',
        text: `Hallo ${user.name || ''},\n\nKlicke auf den Link, um dein Passwort zurueckzusetzen:\n${resetLink}\n\nDer Link ist 30 Minuten gueltig.\n`,
      })
    } else {
      console.log('Password reset link (no SMTP configured):', resetLink)
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('forgot error', err)
    res.status(500).json({ error: 'Anfrage fehlgeschlagen.' })
  }
})

app.post('/api/auth/reset', async (req, res) => {
  const { token = '', password = '' } = req.body || {}
  const cleanToken = String(token).trim()
  const cleanPassword = String(password)
  if (!cleanToken || cleanPassword.length < 6) {
    return res.status(400).json({ error: 'Token und neues Passwort erforderlich.' })
  }
  try {
    const tokenHash = hashToken(cleanToken)
    const userId = await consumeResetToken(tokenHash)
    if (!userId) return res.status(400).json({ error: 'Token ist ungueltig oder abgelaufen.' })
    const newSalt = crypto.randomBytes(16).toString('hex')
    const newHash = hashPassword(cleanPassword, newSalt)
    await updateUserAuth(userId, newSalt, newHash, 'scrypt-v1')
    res.json({ ok: true })
  } catch (err) {
    console.error('reset error', err)
    res.status(500).json({ error: 'Passwort konnte nicht geaendert werden.' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const data = verifyToken(token)
  if (!data) return res.status(401).json({ error: 'Ungültiger oder abgelaufener Token.' })
  try {
    const user = await getUserById(data.sub)
    if (!user) return res.status(401).json({ error: 'Ungültiger oder abgelaufener Token.' })
    res.json({ user: { id: user.id, name: user.name, email: user.email }, expiresAt: data.exp * 1000 })
  } catch (err) {
    console.error('auth me error', err)
    res.status(500).json({ error: 'Anfrage fehlgeschlagen.' })
  }
})

app.patch('/api/user/profile', async (req, res) => {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const data = verifyToken(token)
  if (!data) return res.status(401).json({ error: 'Ungültiger oder abgelaufener Token.' })
  const { name = '' } = req.body || {}
  const cleanName = String(name).trim()
  if (!cleanName || cleanName.length > 80) {
    return res.status(400).json({ error: 'Name ist erforderlich.' })
  }
  try {
    await updateUserName(data.sub, cleanName)
    res.json({ ok: true, user: { id: data.sub, name: cleanName } })
  } catch (err) {
    console.error('profile update error', err)
    res.status(500).json({ error: 'Profil konnte nicht aktualisiert werden.' })
  }
})

app.post('/api/chat', async (req,res)=>{
  const startedAt = Date.now()
  const { messages = [], style = 'formal', mode = '', profile = null, evalMeta = null } = req.body || {}
  const styleKey = (typeof style === 'string' && style.trim()) ? style.trim() : 'formal'
  const normalizedMode = normalizeMode(mode)
  const modeFlags = getModeFlags(normalizedMode)
  const safeMessages = Array.isArray(messages) ? messages : []
  const last = safeMessages.filter(m=>m?.role==='user').slice(-1)[0]?.content || ''
  const profileContext = modeFlags.personalization ? extractProfileContext(profile) : null
  const cleanEvalMeta = sanitizeEvalMeta(evalMeta)
  const promptChars = safeMessages.reduce((sum, msg) => sum + String(msg?.content || '').length, 0)

  const writeLogAndSend = async ({ reply, crisis = false, llmUsed = false, source = 'unknown', usage = null }) => {
    const completionChars = String(reply || '').length
    const usagePrompt = Number(usage?.prompt_tokens)
    const usageCompletion = Number(usage?.completion_tokens)
    const promptTokens = Number.isFinite(usagePrompt) ? usagePrompt : estimateTokensFromChars(promptChars)
    const completionTokens = Number.isFinite(usageCompletion) ? usageCompletion : estimateTokensFromChars(completionChars)
    const totalTokens = promptTokens + completionTokens
    await appendEvalLog({
      ts: new Date().toISOString(),
      requestId: req.requestId || '',
      mode: normalizedMode,
      style: styleKey,
      flags: modeFlags,
      input: {
        messageCount: safeMessages.length,
        lastUserChars: String(last).length,
        promptChars
      },
      output: {
        crisis,
        llmUsed,
        source,
        replyChars: completionChars
      },
      metrics: {
        latencyMs: Date.now() - startedAt,
        promptTokens,
        completionTokens,
        totalTokens
      },
      eval: cleanEvalMeta
    })
    return res.json({ reply, crisis, mode: normalizedMode })
  }

  if (modeFlags.safety && isCrisis(last)) {
    return writeLogAndSend({
      reply: crisisReply(styleKey),
      crisis: true,
      llmUsed: false,
      source: 'crisis_short_circuit'
    })
  }

  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return writeLogAndSend({
      reply: mockReply(last, styleKey),
      crisis: false,
      llmUsed: false,
      source: 'mock_no_api_key'
    })
  }

  try {
    const payload = {
      model: 'gpt-4o-mini', temperature: 0.4, top_p: 1, max_tokens: 300,
      messages: [{ role:'system', content: buildSystemForMode(styleKey, normalizedMode, profileContext) }, ...safeMessages].slice(-20)
    }
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
      body: JSON.stringify(payload)
    })
    if (!r.ok) {
      const detail = await r.text(); console.error('LLM error:', detail)
      return writeLogAndSend({
        reply: mockReply(last, styleKey),
        crisis: false,
        llmUsed: false,
        source: 'mock_llm_http_error'
      })
    }
    const j = await r.json()
    let reply = j?.choices?.[0]?.message?.content?.trim() || ''
    let source = 'llm'
    if (!reply || reply.split(/\s+/).length > 120) {
      reply = mockReply(last, styleKey)
      source = 'mock_output_guardrail'
    }
    return writeLogAndSend({
      reply,
      crisis: false,
      llmUsed: source === 'llm',
      source,
      usage: j?.usage
    })
  } catch(e) {
    console.error('Server error:', e)
    return writeLogAndSend({
      reply: mockReply(last, styleKey),
      crisis: false,
      llmUsed: false,
      source: 'mock_llm_exception'
    })
  }
})

app.post('/api/tts', async (req, res) => {
  const { text = '', voiceId = ELEVEN_VOICE_ID, modelId = ELEVEN_MODEL_ID, stability = 0.45, similarityBoost = 0.8 } = req.body || {}
  const cleanText = typeof text === 'string' ? text.trim() : ''
  if (!cleanText) return res.status(400).json({ error: 'Missing text' })
  const key = ELEVEN_API_KEY
  const voice = typeof voiceId === 'string' && voiceId.trim() ? voiceId.trim() : ''
  if (!key || !voice) return res.status(400).json({ error: 'TTS not configured' })
  if (cleanText.length > 800) return res.status(400).json({ error: 'Text too long' })

  try {
    const payload = {
      model_id: modelId || ELEVEN_MODEL_ID,
      text: cleanText,
      voice_settings: {
        stability: typeof stability === 'number' ? stability : 0.45,
        similarity_boost: typeof similarityBoost === 'number' ? similarityBoost : 0.8
      }
    }
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': key,
        'accept': 'audio/mpeg'
      },
      body: JSON.stringify(payload)
    })
    if (!ttsRes.ok) {
      const detail = await ttsRes.text()
      console.error('TTS error', detail)
      return res.status(502).json({ error: 'TTS request failed' })
    }
    const buffer = Buffer.from(await ttsRes.arrayBuffer())
    res.set('Content-Type', 'audio/mpeg')
    res.send(buffer)
  } catch (err) {
    console.error('TTS exception', err)
    res.status(500).json({ error: 'TTS unavailable' })
  }
})

async function start() {
  await ensureDb()
  app.listen(PORT, () => {
    const mode = pool ? 'postgres' : 'file'
    console.log(`Selfcare server on http://localhost:${PORT} (CORS ${ORIGINS.join(', ')}) [auth:${mode}]`)
  })
}

start().catch((err) => {
  console.error('Failed to start server', err)
  process.exit(1)
})
