
export function exportCSV(rows){
  const header='timestamp,event,detail\n'
  const body=rows.map(r=>`${r.ts},${r.event},${(r.detail||'').replaceAll(',',';')}`).join('\n')
  const blob=new Blob([header+body],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob); const a=document.createElement('a')
  a.href=url; a.download=`session_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
const voiceCache = { voices: [], ready: false }
function ensureVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return []
  const list = window.speechSynthesis.getVoices()
  if (list.length) {
    voiceCache.voices = list
    voiceCache.ready = true
  }
  return list
}

export function preloadVoices() {
  const synth = window.speechSynthesis
  if (!synth) return []
  const list = ensureVoices()
  if (list.length) return list
  return new Promise((resolve) => {
    const handle = () => {
      const voices = synth.getVoices()
      synth.removeEventListener('voiceschanged', handle)
      voiceCache.voices = voices
      voiceCache.ready = true
      resolve(voices)
    }
    synth.addEventListener('voiceschanged', handle)
    synth.getVoices()
  })
}

export function speak(text, opts = {}){
  const synth = window.speechSynthesis
  if (!synth) return false
  const voices = ensureVoices()
  const { voiceURI = '', pitch = 0.85, rate = 0.92, volume = 0.93 } = opts
  const matchVoice = () => {
    if (!voices || !voices.length) return null
    if (voiceURI) {
      const byUri = voices.find(v => v.voiceURI === voiceURI || v.name === voiceURI)
      if (byUri) return byUri
    }
    const maleNames = /(bruno|markus|otto|bär|bear|bass|bariton|mann|peter|felix|ludwig|thorsten|heinz)/
    const femaleNames = /(coco|soft|kindlich|child|emma|lotte|luna|mia|lea)/
    const male = voices.find(v => v.lang?.toLowerCase().startsWith('de') && maleNames.test((v.name || '').toLowerCase()))
    if (male) return male
    const female = voices.find(v => v.lang?.toLowerCase().startsWith('de') && femaleNames.test((v.name || '').toLowerCase()))
    if (female) return female
    const german = voices.find(v => v.lang?.toLowerCase().startsWith('de'))
    if (german) return german
    return voices[0] || null
  }
  const chosenVoice = matchVoice()
  const utterance = new SpeechSynthesisUtterance(text)
  if (chosenVoice) utterance.voice = chosenVoice
  utterance.rate = rate
  utterance.pitch = pitch
  utterance.volume = volume
  synth.cancel()
  synth.speak(utterance)
  return true
}

const audioCache = new Map()
export function playCustomVoice(src = '/assets/coco.mp3', options = {}) {
  if (!src || typeof Audio === 'undefined') return false
  try {
    let audio = audioCache.get(src)
    if (!audio) {
      audio = new Audio(src)
      audioCache.set(src, audio)
    }
    audio.pause()
    if (options.volume != null) audio.volume = options.volume
    audio.currentTime = 0
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => console.warn('Custom voice play blocked', err))
    }
    return true
  } catch (err) {
    console.warn('Custom voice error', err)
    return false
  }
}
