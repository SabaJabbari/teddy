// frontend/src/chat.js
const rawBase = (import.meta.env.VITE_API_BASE ?? '').trim()
const normalizedBase = rawBase ? rawBase.replace(/\/+$/, '') : ''
const resolvedBase = (() => {
  if (normalizedBase) return normalizedBase
  if (typeof window === 'undefined') return ''
  const { hostname, protocol, port } = window.location
  if (hostname === 'localhost' && (port === '4173' || port === '5173')) {
    return `${protocol}//${hostname}:8787`
  }
  return ''
})()
const CHAT_ENDPOINT = resolvedBase ? `${resolvedBase}/api/chat` : '/api/chat'

// versucht, Antworttext aus verschiedenen API-Formaten zu ziehen
function extractReply(data) {
  if (!data) return ''
  if (typeof data === 'string') return data

  // bevorzugt data.reply
  if (typeof data.reply === 'string') return data.reply
  if (typeof data.message === 'string') return data.message
  if (typeof data.text === 'string') return data.text

  // OpenAI-ähnlich
  if (Array.isArray(data.choices) && data.choices.length) {
    const c = data.choices[0]
    if (c?.message?.content) return String(c.message.content)
    if (c?.text) return String(c.text)
  }

  // falls data.result?.output etc.
  if (data.result?.output) return String(data.result.output)

  return ''
}

export async function chatWithAI(messages, styleKey = 'formal', extra = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  const modeFromEnv = (import.meta.env.VITE_CHAT_MODE ?? '').trim()
  const modeFromExtra = typeof extra?.mode === 'string' ? extra.mode.trim() : ''
  const mode = modeFromExtra || modeFromEnv || 'avatar_full'

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        style: styleKey,
        mode,
        profile: extra || null,
        evalMeta: extra?.evalMeta || null
      })
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Chat API ${res.status} ${text}`)
    }

    const data = await res.json().catch(() => ({}))
    const reply = extractReply(data)
    const crisis = !!data?.crisis
    return { reply, crisis }
  } catch (err) {
    clearTimeout(timeout)
    // Fehler hochwerfen -> App.jsx zeigt kurzen Fehlerhinweis, aber KEIN Dummy-Text mehr
    throw err
  }
}
