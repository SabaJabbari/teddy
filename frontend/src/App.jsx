// frontend/src/App.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ModelViewer from './ModelViewer.jsx'
import { exportCSV } from './utils.js'
import { chatWithAI } from './chat.js'
import Onboarding from './components/Onboarding.jsx'
// Optional: import './theme.css'

const STYLES = ['Formell', 'Informell', 'Humorvoll']
const STYLE_DESCRIPTIONS = [
  'Respektvoll, höflich und ohne Emojis.',
  'Locker, duzend und freundlich mit kleinen Emojis.',
  'Warm mit feinem Humor und sanften Emojis.'
]
const BACKGROUNDS = ['Waldlicht', 'Dämmerung', 'Aurora']
const MUSIC = ['Sanfte Piano-Wellen', 'Lofi Breeze', 'Aurora Pads']
const MUSIC_SOURCES = [
  '/assets/piano_waves.wav',
  '/assets/lofi_breeze.wav',
  '/assets/aurora_pad.wav'
]
const MODEL_VARIANTS = [
  { label: 'Ruhige Begrüßung', url: '/models/teddy.glb' },
  { label: 'Energiegeladener Tanz', url: '/models/Waving.glb' },
]
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
const apiUrl = (path) => (resolvedBase ? `${resolvedBase}${path}` : path)

function Selector({ label, list, index, setIndex, hint }) {
  return (
    <div className='row'>
      <span className='label'>
        {label}
        {hint && (
          <button type='button' className='tooltipIcon' title={hint} aria-label={`${label} Info`}>
            i
          </button>
        )}
      </span>
      <div className='selector'>
        <button className='btn' onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}>&lt;</button>
        <div className='value'>{list[index]}</div>
        <button className='btn' onClick={() => setIndex((i) => (i + 1) % list.length)}>&gt;</button>
      </div>
    </div>
  )
}

export default function App() {
  // Onboarding/Profil
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [comfortProfile, setComfortProfile] = useState(null)
  const [onboardingData, setOnboardingData] = useState(null)

  // UI-States
  const [styleIdx, setStyleIdx] = useState(0)
  const [bgIdx, setBgIdx] = useState(1)
  const [musicIdx, setMusicIdx] = useState(0)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const [modelIdx, setModelIdx] = useState(1)
  const [introPlayed, setIntroPlayed] = useState(false)
  const [isWaving, setIsWaving] = useState(true)
  const [areFeetMoving, setAreFeetMoving] = useState(true)
  const [isBlinking, setIsBlinking] = useState(true)
  const [avatarScale, setAvatarScale] = useState(1)
  const [logs, setLogs] = useState([])
  const [showProtocol, setShowProtocol] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [breathing, setBreathing] = useState(false)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 900
  })
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight
  }))
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem('coco_user')) || null } catch { return null }
  })
  const [displayName, setDisplayName] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [showIntroScreen, setShowIntroScreen] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem('coco_intro_seen') !== '1' } catch { return true }
  })

  // Chat
  const [chatInput, setChatInput] = useState('')
  const [chat, setChat] = useState(() => {
    if (typeof window === 'undefined') {
      return [{ role: 'assistant', content: 'Hallo! Ich bin Coco, dein Selfcare-Avatar. Wie kann ich dir heute helfen?', style: STYLES[0] }]
    }
    try {
      const stored = JSON.parse(localStorage.getItem('coco_chat') || 'null')
      if (Array.isArray(stored) && stored.length) return stored
    } catch {}
    return [{ role: 'assistant', content: 'Hallo! Ich bin Coco, dein Selfcare-Avatar. Wie kann ich dir heute helfen?', style: STYLES[0] }]
  })
  const [busy, setBusy] = useState(false)
  const [crisisBanner, setCrisisBanner] = useState('')

  // Audio
  const musicRef = useRef(null)
  const musicPlayersRef = useRef([])
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [ttsAvailable, setTtsAvailable] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  useEffect(() => {
    const name = user?.name || 'Gast'
    setDisplayName(isMobile && name.length > 12 ? `${name.slice(0, 11)}…` : name)
  }, [user, isMobile])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const trimmed = chat.slice(-200)
      localStorage.setItem('coco_chat', JSON.stringify(trimmed))
    } catch {}
  }, [chat])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } catch {}
  }, [chat, busy])
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.pathname !== '/reset-password') return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || ''
    setResetToken(token)
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return
    musicPlayersRef.current = MUSIC_SOURCES.map((src) => {
      const audio = new Audio(src)
      audio.loop = true
      audio.volume = 0.5
      audio.preload = 'auto'
      return audio
    })
    return () => {
      musicPlayersRef.current.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
    }
  }, [])
  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/tts/status'))
      .then(res => res.ok ? res.json() : { enabled: false })
      .then(data => { if (alive) setTtsAvailable(Boolean(data?.enabled)) })
      .catch(() => { if (alive) setTtsAvailable(false) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (!ttsAvailable) setVoiceError('ElevenLabs ist nicht konfiguriert. Hinterlege API-Key & Voice-ID im Backend.')
  }, [ttsAvailable])

  const log = useCallback((event, detail = '') => {
    const entry = { ts: new Date().toISOString(), event, detail }
    setLogs((l) => [entry, ...l].slice(0, 300))
  }, [])
  const storeUser = useCallback((payload) => {
    let normalized = null
    if (payload?.guest) {
      normalized = { id: 'guest', name: 'Gast', email: '', guest: true }
    } else if (payload?.user) {
      normalized = { token: payload.token, id: payload.user.id, name: payload.user.name, email: payload.user.email }
    }
    setUser(normalized)
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('coco_user', JSON.stringify(normalized)) } catch {}
    }
  }, [])
  const clampScale = useCallback((value) => Math.min(1.3, Math.max(0.8, value)), [])
  const changeAvatarScale = useCallback((delta) => {
    setAvatarScale((prev) => {
      const next = clampScale((prev || 1) + delta)
      log('avatar_scale', String(next))
      return next
    })
  }, [clampScale, log])

  function applySettings(nextMusicEnabled = musicEnabled) {
    if (musicRef.current) {
      musicRef.current.pause()
      musicRef.current.currentTime = 0
    }
    const nextTrack = nextMusicEnabled ? (musicPlayersRef.current[musicIdx] || null) : null
    if (nextTrack) {
      try {
        nextTrack.currentTime = 0
        nextTrack.play()
        musicRef.current = nextTrack
      } catch (err) {
        console.warn('Audio play blocked', err)
        musicRef.current = null
      }
    } else {
      musicRef.current = null
    }
    const modelLabel = MODEL_VARIANTS[modelIdx]?.label || MODEL_VARIANTS[0].label
    const musicLabel = nextMusicEnabled ? MUSIC[musicIdx] : 'aus'
    log('apply_settings', `style=${STYLES[styleIdx]};bg=${BACKGROUNDS[bgIdx]};music=${musicLabel};model=${modelLabel}`)
  }

  function toggleMusic() {
    const next = !musicEnabled
    setMusicEnabled(next)
    applySettings(next)
    log('music_toggle', next ? 'on' : 'off')
  }

  async function testVoice() {
    const texts = [
      'Guten Tag. Ich begleite dich ruhig durch die Übung.',
      'Hey! Lass uns kurz locker durchatmen, okay?',
      'Einatmen wie ein Staubsauger, ausatmen wie ein Drache – nur ohne Feuer!'
    ]
    const ok = await speakMessage(texts[styleIdx])
    if (!ok) {
      const alt = new Audio(['/assets/formal.wav','/assets/informal.wav','/assets/humorous.wav'][styleIdx])
      alt.currentTime = 0; alt.play()
    }
    log('play_sample', `style=${STYLES[styleIdx]}`)
  }

  // Atemübung
  const breathingRef = useRef(false)
  const timerRef = useRef(null)
  function startBreathing() {
    breathingRef.current = true
    setBreathing(true)
    log('breathing_start', '')
    const phases = ['inhale','hold','exhale']
    const textByStyle = {
      inhale: ['Ruhig einatmen – vier Sekunden.','Tief ein! Vier Sekunden.','Einatmen – stell dir Kakao vor! Vier Sekunden.'],
      hold:   ['Kurz halten – zwei Sekunden.','Anhalten – zwei Sekunden.','Freeze – zwei Sekunden!'],
      exhale: ['Langsam ausatmen – vier Sekunden.','Locker aus – vier Sekunden.','Laaaangsam aus – wie eine Luftmatratze.']
    }
    let count = 0
    const loop = async () => {
      if (!breathingRef.current) return
      const p = phases[count % 3]
      const t = (p === 'hold') ? 2000 : 4000
      const txt = textByStyle[p][styleIdx]
      const ok = await speakMessage(txt)
      if (!ok) new Audio('/assets/formal.wav').play()
      log('breathing_phase', p)
      count++
      if (count < 18) timerRef.current = setTimeout(() => { loop() }, t)
      else { setBreathing(false); breathingRef.current = false; log('breathing_end', '') }
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    loop()
  }

  function resetAll() {
    setStyleIdx(0); setBgIdx(1); setMusicIdx(0)
    setIntroPlayed(false)
    setModelIdx(1)
    setAvatarScale(1)
    setMusicEnabled(true)
    if (musicRef.current) musicRef.current.pause()
    musicPlayersRef.current.forEach((audio) => {
      audio.pause()
      audio.currentTime = 0
    })
    breathingRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    setBreathing(false)
    setCrisisBanner('')
    setIsWaving(true)
    setAreFeetMoving(true)
    setIsBlinking(true)
    log('reset', '')
  }
  const clearChatHistory = useCallback(() => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Möchtest du den Chat-Verlauf wirklich löschen?')
      if (!ok) return
    }
    const seed = { role: 'assistant', content: 'Hallo! Ich bin Coco, dein Selfcare-Avatar. Wie kann ich dir heute helfen?', style: STYLES[0] }
    setChat([seed])
    try { localStorage.removeItem('coco_chat') } catch {}
  }, [])

  // Senden – IMMER antwortet das Backend (keine lokalen Fallback-Texte)
  async function sendChat() {
    const text = chatInput.trim()
    if (!text) return

    if (crisisBanner) setCrisisBanner('') // alten Hinweis schließen

    const userMsg = { role: 'user', content: text }
    const nextChat = [...chat, userMsg]
    setChat(nextChat)
    setChatInput('')

    setBusy(true)
    try {
      const styleKey = ['formal','informal','humor'][styleIdx]
      const extra = onboardingData || {}
      const res = await chatWithAI(nextChat, styleKey, extra)

      const reply = typeof res?.reply === 'string' ? res.reply : ''
      if (!reply.trim()) {
        const note = '(Die Antwort vom Server war leer.)'
        setChat([...nextChat, { role: 'assistant', content: note, style: STYLES[styleIdx] }])
        log('chat_empty_reply', '')
      } else {
        if (res?.crisis && musicRef.current) musicRef.current.pause()
        if (res?.crisis) {
          setCrisisBanner('Hinweis: Wenn akute Gefahr besteht, kontaktiere bitte den Notruf 112 oder eine vertraute Person.')
        }
        setChat([...nextChat, { role: 'assistant', content: reply, style: STYLES[styleIdx] }])
        try { await speakMessage(reply) } catch {}
        log('chat_reply', `len=${reply.length}; crisis=${res?.crisis ? '1':'0'}`)
      }
    } catch (e) {
      const errMsg = (e && e.message) ? e.message : 'Unbekannter Fehler'
      setChat([...nextChat, { role: 'assistant', content: `(API-Fehler) ${errMsg}`, style: STYLES[styleIdx] }])
      log('chat_error', String(e))
    } finally {
      setBusy(false)
    }
  }

  // Cleanup
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (musicRef.current) musicRef.current.pause()
    musicPlayersRef.current.forEach((audio) => {
      audio.pause()
      audio.currentTime = 0
    })
    breathingRef.current = false
  }, [])

  // Profil (wenn extern gesetzt)
  useEffect(() => {
    if (!comfortProfile) return
    const { styleIdx: s, bgIdx: b, musicIdx: m } = comfortProfile
    setStyleIdx(s); setBgIdx(b); setMusicIdx(m)
    const id = setTimeout(applySettings, 0)
    return () => clearTimeout(id)
  }, [comfortProfile])

  const bgClass = ['nature','neutral','future'][bgIdx]
  const responsiveScale = useMemo(() => avatarScale, [avatarScale])
  const playElevenVoice = useCallback(async (text) => {
    if (!ttsAvailable || !text) return false
    try {
      setVoiceStatus('ElevenLabs wird vorbereitet…')
      setVoiceError('')
      const resp = await fetch(apiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (!resp.ok) throw new Error(`tts ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      await audio.play()
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
      setVoiceStatus('ElevenLabs Stimme aktiv')
      return true
    } catch (err) {
      console.warn('TTS playback failed', err)
      setVoiceError('ElevenLabs konnte nicht abgespielt werden.')
      return false
    }
  }, [ttsAvailable])
  const speakMessage = useCallback(async (text) => {
    if (!text) return false
    setVoiceError('')
    if (ttsAvailable) {
      const ok = await playElevenVoice(text)
      if (ok) return true
      setVoiceError('ElevenLabs konnte nicht abgespielt werden.')
      return false
    }
    setVoiceError('ElevenLabs ist nicht konfiguriert.')
    return false
  }, [ttsAvailable, playElevenVoice])
  const formatAuthError = useCallback((status, data) => {
    if (data?.error) return data.error
    if (status === 429) return 'Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.'
    if (status === 401) return 'Ungültige Zugangsdaten.'
    if (status === 400) return 'Bitte prüfe deine Eingaben.'
    if (status >= 500) return 'Serverfehler. Bitte später erneut versuchen.'
    return 'Anmeldung fehlgeschlagen.'
  }, [])
  const handleAuthSubmit = useCallback(async (mode = 'login') => {
    if (authLoading) return
    setAuthLoading(true)
    setAuthError('')
    try {
      const payload = mode === 'register'
        ? { name: authForm.name.trim(), email: authForm.email.trim(), password: authForm.password }
        : { email: authForm.email.trim(), password: authForm.password }
      const res = await fetch(apiUrl(`/api/auth/${mode}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(formatAuthError(res.status, data))
      if (!data?.user) throw new Error('Antwort ungültig')
      storeUser(data)
      setAuthForm({ name: '', email: '', password: '' })
    } catch (err) {
      const msg = String(err?.message || '')
      if (/failed to fetch|networkerror|fetch/i.test(msg)) {
        setAuthError('Server nicht erreichbar. Bitte prüfe deine Verbindung oder versuche es später.')
      } else {
        setAuthError(err.message || 'Anmeldung fehlgeschlagen')
      }
    } finally {
      setAuthLoading(false)
    }
  }, [authLoading, authForm, storeUser, formatAuthError])
  const handleForgot = useCallback(async () => {
    if (forgotLoading) return
    setForgotError('')
    setForgotMsg('')
    const email = authForm.email.trim()
    if (!email) {
      setForgotError('Bitte zuerst eine E-Mail eingeben.')
      return
    }
    setForgotLoading(true)
    try {
      const res = await fetch(apiUrl('/api/auth/forgot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Anfrage fehlgeschlagen.')
      setForgotMsg('Wenn ein Konto existiert, senden wir einen Link per E-Mail.')
    } catch (err) {
      const msg = String(err?.message || 'Anfrage fehlgeschlagen.')
      setForgotError(msg)
    } finally {
      setForgotLoading(false)
    }
  }, [forgotLoading, authForm])
  const logout = useCallback(() => {
    storeUser(null)
  }, [storeUser])
  const dismissIntro = useCallback(() => {
    setShowIntroScreen(false)
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('coco_intro_seen', '1') } catch {}
    }
  }, [])
  const currentModelUrl = MODEL_VARIANTS[modelIdx]?.url || MODEL_VARIANTS[0].url
  const effectiveAvatarScale = avatarScale * (isMobile ? 2.4 : 1)
  const isIntroAnimationActive = !introPlayed && /waving/i.test(currentModelUrl || '')

  useEffect(() => {
    if (introPlayed) return
    if (!/waving/i.test(currentModelUrl || '')) setIntroPlayed(true)
  }, [introPlayed, currentModelUrl])

  const handleIntroAnimationFinished = useCallback(() => {
    if (!isIntroAnimationActive) return
    setIntroPlayed(true)
    setModelIdx(0)
    log('intro_animation_done', 'switch_to_teddy')
  }, [isIntroAnimationActive, log])

  const panelFields = (
    <>
      <Selector
        label='Sprachstil'
        list={STYLES}
        index={styleIdx}
        setIndex={setStyleIdx}
        hint='Bestimmt Tonfall und Anrede in den Antworten.'
      />
      <div className='small' style={{ marginTop: -4, marginBottom: 6 }}>{STYLE_DESCRIPTIONS[styleIdx]}</div>
      <Selector
        label='Hintergrund'
        list={BACKGROUNDS}
        index={bgIdx}
        setIndex={setBgIdx}
        hint='Aendert die Stimmung der Szene.'
      />
      <Selector
        label='Musik'
        list={MUSIC}
        index={musicIdx}
        setIndex={setMusicIdx}
        hint='Leise Hintergrundmusik passend zur Stimmung.'
      />
      <div className='row' style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <button className='btn' onClick={applySettings}>Einstellungen anwenden</button>
        <button className='btn' onClick={toggleMusic}>
          {musicEnabled ? 'Musik stummschalten' : 'Musik einschalten'}
        </button>
        <button className='btn' onClick={startBreathing} disabled={breathing}>1-min Atemübung</button>
        <button className='btn' onClick={resetAll}>Reset</button>
        <button className='btn btnGhost' onClick={clearChatHistory}>Chat löschen</button>
      </div>
      {crisisBanner && (
        <div className='row' style={{ marginTop: 8 }}>
          <div className='value' style={{ background: 'rgba(255,99,99,0.2)', border: '1px solid rgba(255,99,99,0.35)' }}>
            {crisisBanner}
          </div>
        </div>
      )}
    </>
  )

  const panel = (
    <div className='panel'>
      <div className='panelHeader'>
        <h2>Einstellung</h2>
        <button className='btn' onClick={() => setShowSettingsPanel(false)}>Schließen</button>
      </div>
      {panelFields}
    </div>
  )

  const mobilePanel = (
    <div className='mobilePanelOverlay mobilePanelFullscreen' onClick={() => setShowSettingsPanel(false)}>
      <div className='panel panelMobile panelFullscreen' onClick={(e) => e.stopPropagation()}>
        <div className='panelHeader'>
          <h2>Einstellung</h2>
          <button className='btn' onClick={() => setShowSettingsPanel(false)}>Schließen</button>
        </div>
        {panelFields}
      </div>
    </div>
  )

  const authView = (
    <div className='authScreen'>
      <div className='authCard'>
        <h2>{authMode === 'login' ? 'Anmelden' : 'Registrieren'}</h2>
        <p className='small' style={{ color: '#475569' }}>
          Speichere dein Profil, damit Coco dich beim nächsten Besuch wiedererkennt – oder überspringe die Anmeldung.
        </p>
        <div className='authToggle'>
          <button
            type='button'
            className={authMode === 'login' ? 'active' : ''}
            onClick={() => { setAuthMode('login'); setAuthError(''); setForgotError(''); setForgotMsg('') }}
          >Anmelden</button>
          <button
            type='button'
            className={authMode === 'register' ? 'active' : ''}
            onClick={() => { setAuthMode('register'); setAuthError(''); setForgotError(''); setForgotMsg('') }}
          >Registrieren</button>
        </div>
        <form
          className='authForm'
          onSubmit={(e) => {
            e.preventDefault()
            handleAuthSubmit(authMode)
          }}
        >
          {authMode === 'register' && (
            <label>
              <span>Name</span>
              <input
                type='text'
                value={authForm.name}
                onChange={(e) => setAuthForm((f) => ({ ...f, name: e.target.value }))}
                placeholder='Dein Name'
                required={authMode === 'register'}
              />
            </label>
          )}
          <label>
            <span>E-Mail</span>
            <input
              type='email'
              value={authForm.email}
              onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))}
              placeholder='name@example.com'
              required
            />
          </label>
          <label>
            <span>Passwort</span>
            <input
              type='password'
              value={authForm.password}
              onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
              placeholder='mind. 6 Zeichen'
              required
              minLength={6}
            />
          </label>
          {authMode === 'login' && (
            <button
              type='button'
              className='btn btnGhost'
              onClick={handleForgot}
              disabled={forgotLoading}
            >
              {forgotLoading ? 'Bitte warten…' : 'Passwort vergessen'}
            </button>
          )}
          {forgotError && <div className='authError'>{forgotError}</div>}
          {forgotMsg && <div className='authSuccess'>{forgotMsg}</div>}
          {authError && <div className='authError'>{authError}</div>}
          <button className='btn btnPrimary' type='submit' disabled={authLoading}>
            {authLoading ? 'Bitte warten…' : authMode === 'login' ? 'Anmelden' : 'Registrieren'}
          </button>
          <button type='button' className='btn btnGhost' onClick={() => storeUser({ guest: true })}>Vielleicht später</button>
        </form>
      </div>
    </div>
  )

  const resetView = (
    <div className='authScreen'>
      <div className='authCard'>
        <h2>Passwort zuruecksetzen</h2>
        <p className='small' style={{ color: '#475569' }}>
          Bitte gib dein neues Passwort ein.
        </p>
        <form
          className='authForm'
          onSubmit={async (e) => {
            e.preventDefault()
            if (resetLoading) return
            setResetError('')
            if (!resetToken) {
              setResetError('Token fehlt. Bitte pruefe den Link.')
              return
            }
            if (resetPassword.length < 6) {
              setResetError('Passwort muss mindestens 6 Zeichen haben.')
              return
            }
            if (resetPassword !== resetConfirm) {
              setResetError('Passwoerter stimmen nicht ueberein.')
              return
            }
            setResetLoading(true)
            try {
              const res = await fetch(apiUrl('/api/auth/reset'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, password: resetPassword })
              })
              const data = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error(data?.error || 'Reset fehlgeschlagen.')
              setResetSuccess(true)
            } catch (err) {
              const msg = String(err?.message || 'Reset fehlgeschlagen.')
              setResetError(msg)
            } finally {
              setResetLoading(false)
            }
          }}
        >
          <label>
            <span>Neues Passwort</span>
            <input
              type='password'
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder='mind. 6 Zeichen'
              required
              minLength={6}
              disabled={resetLoading || resetSuccess}
            />
          </label>
          <label>
            <span>Passwort bestaetigen</span>
            <input
              type='password'
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder='Passwort erneut eingeben'
              required
              minLength={6}
              disabled={resetLoading || resetSuccess}
            />
          </label>
          {resetError && <div className='authError'>{resetError}</div>}
          {resetSuccess && (
            <div className='authSuccess'>Passwort geaendert. Du kannst dich jetzt anmelden.</div>
          )}
          <button className='btn btnPrimary' type='submit' disabled={resetLoading || resetSuccess}>
            {resetLoading ? 'Bitte warten…' : 'Passwort speichern'}
          </button>
          <button
            type='button'
            className='btn btnGhost'
            onClick={() => { if (typeof window !== 'undefined') window.location.href = '/' }}
          >
            Zurueck zur Anmeldung
          </button>
        </form>
      </div>
    </div>
  )

  const introView = (
    <div className='introOverlay'>
      <div className='introCard'>
        <h2>Willkommen bei Coco</h2>
        <p className='small' style={{ color: '#475569' }}>
          Kurz und knapp: So nutzt du die App am besten.
        </p>
        <div className='introList'>
          <div><b>Chatten:</b> Schreibe, was du gerade brauchst, und Coco antwortet im gewaehlten Stil.</div>
          <div><b>Stil anpassen:</b> Wechsel zwischen Formell, Informell, Humorvoll sowie Hintergrund und Musik.</div>
          <div><b>Tools:</b> Starte eine 1-Min-Atemuebung oder lass dir Antworten vorlesen.</div>
        </div>
        <div className='introActions'>
          <button className='btn btnPrimary' onClick={dismissIntro}>Los geht's</button>
          <button className='btn btnGhost' onClick={dismissIntro}>Später</button>
        </div>
      </div>
    </div>
  )

  // Onboarding zuerst
  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={({ profile, answers, skipped }) => {
          if (skipped) {
            setShowOnboarding(false)
            log('onboarding_skipped', '')
            return
          }
          setComfortProfile(profile)
          setOnboardingData({ profile, answers })

          // Automatisch Stil/Hintergrund/Musik übernehmen und anwenden
          setStyleIdx(profile.styleIdx)
          setBgIdx(profile.bgIdx)
          setMusicIdx(profile.musicIdx)
          setTimeout(() => { applySettings() }, 0) // nach User-Geste -> Audio erlaubt

          const intro = `Hallo${answers.name ? " " + answers.name : ""}! Danke für dein Vertrauen 🧸. Ich passe mich jetzt deinem Tempo an – ${
            profile.pacing === "sehr_langsam" ? "ganz langsam" : "ruhig"
          } und ${
            profile.tone === "sanft" ? "sanft" : profile.tone === "aktivierend" ? "leicht aufbauend" : "klar"
          }.`

          // Intro; erste echte Antwort kommt dann vom Backend auf die erste Nutzereingabe
          const introStyle = STYLES[profile.styleIdx] || STYLES[0]
          setChat([{ role: 'assistant', content: intro, style: introStyle }])

          setShowOnboarding(false)
          log('onboarding_complete', JSON.stringify({ profile, answers }))
        }}
      />
    )
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/reset-password') {
    return resetView
  }

  if (!user) {
    return authView
  }

  return (
    <div className={`app ${bgClass}`} style={isMobile ? { minHeight: "100vh" } : undefined}>
      {showIntroScreen && introView}
      <div className='header'>
        <span>Coco</span>
        <div className='userBadge'>
          <span>{displayName}</span>
          <button className='btn btnSmall' onClick={logout} aria-label='Abmelden'>Abmelden</button>
        </div>
      </div>
      <div className={`scene ${isMobile ? 'sceneMobile' : ''}`}>
        <>
          {!showSettingsPanel && (
            <div className={`panelToggle ${isMobile ? 'panelToggleMobile' : ''}`}>
              <button
                className='btn btnHamburger'
                aria-label='Einstellungen öffnen'
                onClick={() => setShowSettingsPanel(true)}
              >
                <span />
                <span />
                <span />
              </button>
            </div>
          )}
          {showSettingsPanel && (isMobile ? mobilePanel : panel)}
        </>

        <div className='modelSection'>
          <ModelViewer
            bgClass={bgClass}
            modelUrl={currentModelUrl}
            isWaving={isWaving}
            moveFeet={areFeetMoving}
            blinkEyes={isBlinking}
            scaleMultiplier={effectiveAvatarScale}
            viewport={viewport}
            playNativeOnce={isIntroAnimationActive}
            onAnimationFinished={handleIntroAnimationFinished}
          />
        </div>

        <div className={`chatWrap ${isMobile ? 'chatWrapMobile' : ''}`}>
          <div className={`chat ${busy ? 'chatBusy' : ''}`}>
            <div className='chatHistory'>
              {chat.map((m, i) => (
                <div key={i} className={'msg ' + (m.role === 'user' ? 'user' : 'bot')}>
                  {m.role === 'user' ? 'Du: ' : 'Coco: '}
                  {m.content}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            {busy && (
              <div className='chatLoading' aria-live='polite'>
                Coco tippt<span className='dot'>.</span><span className='dot'>.</span><span className='dot'>.</span>
              </div>
            )}
            <div className='chatRow'>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder='Nachricht schreiben…'
                onKeyDown={(e) => e.key === 'Enter' && !busy && sendChat()}
                disabled={busy}
              />
              <button className='btn' disabled={busy || !chatInput.trim()} onClick={sendChat}>
                {busy ? 'Senden…' : 'Senden'}
              </button>
            </div>
          </div>
        </div>

        {showProtocol && (
          <div className='rightDock'>
            <h3>Protokoll</h3>
            {logs.slice(0, 50).map((l, i) => (
              <div key={i} className='logline'>{l.ts} — {l.event} — {l.detail}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
