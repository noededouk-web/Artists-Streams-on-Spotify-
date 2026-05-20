// api.js — Client pour l'API FastAPI
const BASE = import.meta.env.VITE_API_URL || '/api'

const headers = { 'ngrok-skip-browser-warning': '1' }

export async function fetchArtists() {
  const r = await fetch(`${BASE}/artists`, { headers })
  if (!r.ok) throw new Error('Erreur lors du chargement des artistes')
  return r.json()
}

export async function fetchArtist(name) {
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}`, { headers })
  if (!r.ok) throw new Error(`Artiste "${name}" introuvable`)
  return r.json()
}

export async function fetchArtistTracks(name, { trackType, album, limit = 200 } = {}) {
  const params = new URLSearchParams()
  if (trackType) params.set('track_type', trackType)
  if (album)     params.set('album', album)
  params.set('limit', limit)
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}/tracks?${params}`, { headers })
  if (!r.ok) throw new Error('Erreur tracks')
  return r.json()
}

export async function fetchArtistAlbums(name) {
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}/albums`, { headers })
  if (!r.ok) throw new Error('Erreur albums')
  return r.json()
}

export async function runPipeline(artist, { forceS = false, forceE = false, skipExport = false, kworbId } = {}) {
  const params = new URLSearchParams({ artist, force_scrape: forceS, force_enrich: forceE, skip_export: skipExport })
  if (kworbId) params.set('kworb_id', kworbId)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(`${BASE}/pipeline/run?${params}`, { method: 'POST', headers, signal: ctrl.signal })
    if (!r.ok) throw new Error(`API erreur ${r.status}`)
    return r.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchPipelineStatus(artist) {
  const r = await fetch(`${BASE}/pipeline/status/${encodeURIComponent(artist)}`, { headers })
  if (!r.ok) throw new Error('Erreur statut')
  return r.json()
}

export async function fetchArtistHistory(name) {
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}/history`, { headers })
  if (!r.ok) throw new Error('Erreur historique')
  return r.json()
}

export async function fetchSchedulerStatus() {
  const r = await fetch(`${BASE}/scheduler/status`, { headers })
  if (!r.ok) throw new Error('Erreur scheduler')
  return r.json()
}

export function fmtStreams(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString('fr-FR')
}

export function fmtFull(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('fr-FR')
}