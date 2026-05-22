import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchArtist, fetchArtistAlbums, fetchArtistHistory,
  runPipeline, fetchPipelineStatus,
  fmtStreams, fmtFull,
} from '../api'

const BASE = import.meta.env.VITE_API_URL || '/api'
const H    = { 'ngrok-skip-browser-warning': '1' }

async function fetchYoutube(name) {
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}/youtube`, { headers: H })
  if (!r.ok) return null
  return r.json()
}

async function startYoutubeEnrich(name) {
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}/youtube/enrich`, { method: 'POST', headers: H })
  if (!r.ok) throw new Error('Enrichissement YouTube échoué')
  return r.json()
}

async function fetchYoutubeStatus(name) {
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}/youtube/enrich/status`, { headers: H })
  if (!r.ok) return null
  return r.json()
}

function cacheAge(lastUpdate) {
  if (!lastUpdate) return 'inconnu'
  const diffH = Math.floor((Date.now() - new Date(lastUpdate)) / 3_600_000)
  if (diffH < 1)  return 'récemment'
  if (diffH < 24) return `il y a ${diffH}h`
  return `il y a ${Math.floor(diffH / 24)}j`
}

function fmtAxis(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'K'
  return n.toString()
}

const ALBUM_COLORS = [
  '#5baed4','#9272cf','#d4844c','#57b87c','#cc7aad',
  '#c9a830','#53b58a','#c47474','#8892d8','#44b5a3',
  '#6298d4','#b87ecf',
]

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:  { minHeight: '100vh', background: 'var(--bg)' },
  nav: {
    padding: '10px 24px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 12,
    position: 'sticky', top: 0, zIndex: 50,
  },
  back: {
    fontSize: 12, color: 'var(--text3)', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4,
    transition: 'color 0.15s', userSelect: 'none',
  },
  logo:     { fontWeight: 700, fontSize: 13, letterSpacing: 2, color: 'var(--green)' },
  navSep:   { color: 'var(--border2)', fontSize: 14 },
  navRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: 'var(--bg3)', border: '1px solid var(--border2)',
    color: 'var(--text2)', transition: 'all 0.15s', cursor: 'pointer',
  },
  refreshStatus: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' },
  main: { padding: '28px 24px', maxWidth: 1200, margin: '0 auto' },

  artistHdr: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 },
  avatar: {
    width: 52, height: 52, borderRadius: '50%', background: 'var(--green)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, color: '#000', flexShrink: 0, overflow: 'hidden',
  },
  artistName: { fontSize: 30, fontWeight: 800, letterSpacing: 1, lineHeight: 1 },
  artistSub:  { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontWeight: 400, marginTop: 6 },

  kpis: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 },
  kpi: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px',
  },
  kpiLbl: { fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginBottom: 10 },
  kpiVal: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 },
  kpiSub: { fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginTop: 5 },

  row2: { display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginBottom: 12 },
  card: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '18px 20px',
  },
  cardTitle: {
    fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  topBadge: {
    fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
    background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4,
    padding: '2px 8px', letterSpacing: 1,
  },

  barRow:   { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  barLabel: {
    fontSize: 11, fontWeight: 400, color: 'var(--text2)', width: 130,
    textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
  },
  barTrack: { flex: 1, height: 14, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' },
  legend:   { display: 'flex', gap: 16, marginTop: 12 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' },
  legendDot:  { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },

  donutWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 4 },
  legRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '8px 0', borderBottom: '1px solid var(--border)',
  },
  legL:      { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'var(--text2)' },
  legDot:    { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legR:      { textAlign: 'right' },
  legStreams: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  legCount:   { fontSize: 11, color: 'var(--text3)' },

  detailCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '18px 24px',
    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
    marginTop: 12, textDecoration: 'none',
  },
  detailCardLeft:  { display: 'flex', flexDirection: 'column', gap: 4 },
  detailCardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  detailCardSub:   { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' },
  detailCardArrow: { fontSize: 20, color: 'var(--green)', fontWeight: 700 },

  loading: { textAlign: 'center', padding: 80, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 },

  // Importing screen
  importWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24 },
  importTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: 0.5 },
  importSub:   { fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' },
  importBar:   { width: 360, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' },
  importFill:  { height: '100%', background: 'var(--green)', borderRadius: 2, transition: 'width 0.8s ease' },
  importMsg:   { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontStyle: 'italic' },
  importError: { fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono)', textAlign: 'center', maxWidth: 400 },
}

// ─── Album bar chart ──────────────────────────────────────────────────────────
function AlbumBarChart({ albums }) {
  const top    = albums.slice(0, 12)
  const max    = Math.max(...top.map(a => a.streamsKworb), 1)
  const ticks  = [0.25, 0.5, 0.75, 1].map(f => Math.round(f * max))
  const labelW = Math.min(240, Math.max(100, Math.max(...top.map(a => a.name.length), 0) * 7.2))
  return (
    <div>
      {top.map((album, i) => (
        <div key={album.name} style={S.barRow}>
          <div style={{ ...S.barLabel, width: labelW }}>{album.name}</div>
          <div style={S.barTrack}>
            <div style={{ ...S.barFill, width: `${Math.round((album.streamsKworb / max) * 100)}%`, background: ALBUM_COLORS[i % ALBUM_COLORS.length] }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', width: 52, textAlign: 'right', flexShrink: 0 }}>
            {fmtAxis(album.streamsKworb)}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingLeft: labelW + 8, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
        <span>0</span>
        {ticks.map((v, i) => <span key={i}>{fmtAxis(v)}</span>)}
      </div>
    </div>
  )
}

// ─── History chart ────────────────────────────────────────────────────────────
function HistoryChart({ data }) {
  const [hovered, setHovered] = useState(null)
  if (!data || data.length < 2) return (
    <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '24px 0', textAlign: 'center' }}>
      Pas assez de données — le graphique se remplira au fil des mises à jour quotidiennes.
    </div>
  )

  const W = 900, H = 180
  const PAD = { t: 12, r: 16, b: 28, l: 64 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  const vals  = data.map(d => d.totalStreams)
  const minV  = Math.min(...vals)
  const maxV  = Math.max(...vals)
  const range = maxV - minV || 1

  const xOf = i => (i / (data.length - 1)) * iW
  const yOf = v => iH - ((v - minV) / range) * iH

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.totalStreams)}`).join(' ')
  const areaPath = `${linePath} L ${xOf(data.length - 1)} ${iH} L 0 ${iH} Z`

  const yTicks  = [0, 0.5, 1].map(f => minV + range * f)
  const xLabels = data.length <= 10
    ? data.map((d, i) => ({ i, label: d.date }))
    : [0, Math.floor(data.length / 2), data.length - 1].map(i => ({ i, label: data[i].date }))

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g transform={`translate(${PAD.l},${PAD.t})`}>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={0} y1={yOf(v)} x2={iW} y2={yOf(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={-8} y={yOf(v) + 4} textAnchor="end" fill="var(--text3)" fontSize={10} fontFamily="var(--font-mono)">
                {fmtStreams(v)}
              </text>
            </g>
          ))}
          <path d={areaPath} fill="url(#histGrad)" />
          <path d={linePath} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinejoin="round" />
          {data.map((d, i) => (
            <circle key={i} cx={xOf(i)} cy={yOf(d.totalStreams)}
              r={hovered === i ? 5 : 3}
              fill={hovered === i ? 'var(--green)' : 'var(--bg2)'}
              stroke="var(--green)" strokeWidth={2}
              style={{ cursor: 'pointer', transition: 'r 0.1s' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          {xLabels.map(({ i, label }) => (
            <text key={i} x={xOf(i)} y={iH + 18} textAnchor="middle" fill="var(--text3)" fontSize={9} fontFamily="var(--font-mono)">
              {label}
            </text>
          ))}
        </g>
      </svg>
      {hovered !== null && (
        <div style={{
          position: 'absolute', top: PAD.t, left: PAD.l + xOf(hovered) + 10,
          background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6,
          padding: '6px 10px', pointerEvents: 'none', zIndex: 10,
          fontSize: 11, fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ color: 'var(--text3)', marginBottom: 2 }}>{data[hovered].date}</div>
          <div style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtFull(data[hovered].totalStreams)}</div>
          <div style={{ color: 'var(--text2)' }}>+{fmtStreams(data[hovered].dailyStreams)}/j</div>
        </div>
      )}
    </div>
  )
}

// ─── Donut ────────────────────────────────────────────────────────────────────
function Donut({ solo, feat }) {
  const total = solo + feat || 1
  const pct   = Math.round((solo / total) * 100)
  const r = 48, cx = 60, cy = 60, sw = 16
  const circ = 2 * Math.PI * r
  const sl   = (solo / total) * circ
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg3)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--green)" strokeWidth={sw}
        strokeDasharray={`${sl} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--purple)" strokeWidth={sw}
        strokeDasharray={`${circ - sl} ${circ}`} strokeDashoffset={-sl}
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize="17" fontWeight="800"
        fontFamily="var(--font-display)">{pct}%</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--text3)" fontSize="9"
        fontFamily="var(--font-mono)">SOLO</text>
    </svg>
  )
}

// ─── Écran d'importation silencieux ──────────────────────────────────────────
function ImportingScreen({ name, onDone }) {
  const navigate  = useNavigate()
  const pollRef   = useRef(null)
  const [step, setStep]   = useState(0)
  const [msg, setMsg]     = useState('Démarrage…')
  const [err, setErr]     = useState(null)
  const TOTAL_STEPS = 5

  useEffect(() => {
    runPipeline(name).catch(() => {})

    pollRef.current = setInterval(async () => {
      try {
        const s = await fetchPipelineStatus(name)
        setStep(s.step ?? 0)
        setMsg(s.message ?? '')
        if (s.status === 'done') {
          clearInterval(pollRef.current)
          onDone()
        }
        if (s.status === 'error') {
          clearInterval(pollRef.current)
          setErr(s.message || 'Une erreur est survenue lors de l\'importation.')
        }
      } catch { /* ignore */ }
    }, 2000)

    return () => clearInterval(pollRef.current)
  }, [name])

  const pct = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <div style={S.importWrap}>
      <div style={S.importTitle}>Importation de {name.toUpperCase()}</div>
      {!err ? (
        <>
          <div style={S.importBar}>
            <div style={{ ...S.importFill, width: `${pct}%` }} />
          </div>
          <div style={S.importSub}>{pct}% — {msg}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            Cette opération prend environ 30 secondes…
          </div>
        </>
      ) : (
        <>
          <div style={S.importError}>{err}</div>
          <button
            onClick={() => navigate('/')}
            style={{ ...S.navBtn, marginTop: 8 }}
          >← Retour à l'accueil</button>
        </>
      )}
    </div>
  )
}

// ─── Page artiste ─────────────────────────────────────────────────────────────
export default function Artist() {
  const { name }  = useParams()
  const navigate  = useNavigate()
  const pollRef   = useRef(null)

  const [data, setData]           = useState(null)
  const [albums, setAlbums]       = useState([])
  const [history, setHistory]     = useState([])
  const [youtube, setYoutube]         = useState(null)
  const [ytLoading, setYtLoading]     = useState(false)
  const [ytEnriching, setYtEnriching] = useState(false)
  const [ytProgress, setYtProgress]   = useState(null)   // {done, total, current}
  const [ytError, setYtError]         = useState(null)
  const ytPollRef = useRef(null)
  const [loading, setLoading]     = useState(true)
  const [notFound, setNotFound]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  const loadData = (n) => {
    setLoading(true)
    setNotFound(false)
    Promise.all([
      fetchArtist(n),
      fetchArtistAlbums(n).catch(() => []),
      fetchArtistHistory(n).catch(() => []),
    ])
      .then(([d, a, h]) => { setData(d); setAlbums(a); setHistory(h) })
      .then(async () => {
        setYtLoading(true)
        try {
          const yt = await fetchYoutube(n)
          if (yt?.available) {
            setYoutube(yt)
          } else {
            // Lancer l'enrichissement en arrière-plan et poller la progression
            setYtEnriching(true)
            await startYoutubeEnrich(n)
            ytPollRef.current = setInterval(async () => {
              const status = await fetchYoutubeStatus(n)
              if (!status) return
              if (status.status === 'running') {
                setYtProgress({ done: status.done, total: status.total, current: status.current })
              } else if (status.status === 'done') {
                clearInterval(ytPollRef.current)
                setYtEnriching(false)
                setYtProgress(null)
                const yt2 = await fetchYoutube(n)
                setYoutube(yt2)
              } else if (status.status === 'error') {
                clearInterval(ytPollRef.current)
                setYtEnriching(false)
                setYtProgress(null)
                setYtError(status.message)
              }
            }, 2000)
          }
        } catch (e) {
          setYtError(e.message)
          setYtEnriching(false)
        } finally {
          setYtLoading(false)
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData(name) }, [name])
  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(ytPollRef.current) }, [])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshMsg('Démarrage…')
    try {
      await runPipeline(name, { forceS: true })
      pollRef.current = setInterval(async () => {
        const s = await fetchPipelineStatus(name)
        setRefreshMsg(s.message)
        if (s.status === 'done') {
          clearInterval(pollRef.current)
          setRefreshing(false)
          setRefreshMsg('')
          loadData(name)
        }
        if (s.status === 'error') {
          clearInterval(pollRef.current)
          setRefreshing(false)
          setRefreshMsg(`Erreur : ${s.message}`)
        }
      }, 2500)
    } catch {
      setRefreshing(false)
      setRefreshMsg('Impossible de joindre le serveur.')
    }
  }

  const Nav = () => (
    <nav style={S.nav}>
      <span style={S.back}
        onClick={() => navigate('/')}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
      >← Tous les artistes</span>
      <span style={S.navSep}>·</span>
      <span style={S.logo}>STREAM ANALYTICS</span>
      <div style={S.navRight}>
        {refreshMsg && <span style={S.refreshStatus}>{refreshMsg}</span>}
        <button style={S.navBtn} onClick={() => navigate('/compare')}>⇄ Comparer</button>
        {!notFound && (
          <button
            style={{ ...S.navBtn, opacity: refreshing ? 0.6 : 1, color: refreshing ? 'var(--green)' : 'var(--text2)' }}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            Rafraîchir
          </button>
        )}
      </div>
    </nav>
  )

  if (loading) return (
    <div style={S.page}>
      <Nav />
      <div style={S.loading}>Chargement de {name}…</div>
    </div>
  )

  // Artiste non trouvé → importation automatique silencieuse
  if (notFound) return (
    <div style={S.page}>
      <Nav />
      <div style={S.main}>
        <ImportingScreen name={name} onDone={() => loadData(name)} />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!data) return null

  const { kpis, soloTracks, featTracks, topTracks, artistImage, lastUpdate } = data
  const totalTitres = soloTracks.count + featTracks.count
  const top15       = (topTracks || []).slice(0, 15)
  const maxBar      = Math.max(...top15.map(t => t.streams), 1)
  const labelW15    = Math.min(200, Math.max(100, Math.max(...top15.map(t => t.name.length), 0) * 7.2))

  return (
    <div style={S.page}>
      <Nav />

      <div className="main-pad">
        {/* ── Header artiste ── */}
        <div style={S.artistHdr}>
          <div style={S.avatar}>
            {artistImage
              ? <img src={artistImage} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : name[0].toUpperCase()
            }
          </div>
          <div>
            <div style={S.artistName}>{name.toUpperCase()}</div>
            <div style={S.artistSub}>
              Spotify Analytics · {totalTitres} titres · mis à jour {cacheAge(lastUpdate)}
            </div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="kpi-grid">
          <div style={S.kpi}>
            <div style={S.kpiLbl}>↗ Streams totaux</div>
            <div style={S.kpiVal}>{fmtStreams(kpis.totalStreams)}</div>
            <div style={S.kpiSub}>{fmtFull(kpis.totalStreams)}</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiLbl}>♫ Écoutes / jour</div>
            <div style={S.kpiVal}>{fmtStreams(kpis.dailyStreams)}</div>
            <div style={S.kpiSub}>moyenne quotidienne</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiLbl}>◎ Titres solo</div>
            <div style={{ ...S.kpiVal, color: 'var(--green)' }}>{soloTracks.count}</div>
            <div style={S.kpiSub}>{fmtStreams(soloTracks.streams)} streams</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiLbl}>⊕ Featurings</div>
            <div style={{ ...S.kpiVal, color: 'var(--purple)' }}>{featTracks.count}</div>
            <div style={S.kpiSub}>{fmtStreams(featTracks.streams)} streams</div>
          </div>
        </div>

        {/* ── Historique ── */}
        {history.length > 0 && (
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={S.cardTitle}>
              <span>Évolution des streams</span>
              <span style={S.topBadge}>{history.length} point{history.length > 1 ? 's' : ''}</span>
            </div>
            <HistoryChart data={history} />
          </div>
        )}

        {/* ── Top 15 + Donut ── */}
        <div className="row-2col">
          <div style={S.card}>
            <div style={S.cardTitle}><span>Top 15 — Streams totaux</span></div>
            {top15.map((t, i) => (
              <div key={i} style={S.barRow}>
                <div style={{ ...S.barLabel, width: labelW15 }}>{t.name}</div>
                <div style={S.barTrack}>
                  <div style={{
                    ...S.barFill,
                    width: `${Math.round((t.streams / maxBar) * 100)}%`,
                    background: t.type === 'solo' ? 'var(--green)' : 'var(--purple)',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', width: 48, textAlign: 'right', flexShrink: 0 }}>
                  {fmtAxis(t.streams)}
                </div>
              </div>
            ))}
            <div style={S.legend}>
              <div style={S.legendItem}><div style={{ ...S.legendDot, background: 'var(--green)' }} />Solo</div>
              <div style={S.legendItem}><div style={{ ...S.legendDot, background: 'var(--purple)' }} />Feat</div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}><span>Solo vs Feat</span></div>
            <div style={S.donutWrap}>
              <Donut solo={soloTracks.count} feat={featTracks.count} />
              <div style={{ width: '100%' }}>
                <div style={S.legRow}>
                  <div style={S.legL}><div style={{ ...S.legDot, background: 'var(--green)' }} />Solo</div>
                  <div style={S.legR}>
                    <div style={S.legStreams}>{fmtStreams(soloTracks.streams)}</div>
                    <div style={S.legCount}>{soloTracks.count} titres</div>
                  </div>
                </div>
                <div style={{ ...S.legRow, borderBottom: 'none' }}>
                  <div style={S.legL}><div style={{ ...S.legDot, background: 'var(--purple)' }} />Feat</div>
                  <div style={S.legR}>
                    <div style={S.legStreams}>{fmtStreams(featTracks.streams)}</div>
                    <div style={S.legCount}>{featTracks.count} titres</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Streams par album ── */}
        {albums.filter(a => a.albumType === 'own').length > 0 && (
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={S.cardTitle}>
              <span>Streams par album</span>
              <span style={S.topBadge}>TOP {Math.min(albums.filter(a => a.albumType === 'own').length, 12)}</span>
            </div>
            <AlbumBarChart albums={albums.filter(a => a.albumType === 'own')} />
          </div>
        )}

        {/* ── Section YouTube ── */}
        <div style={{ ...S.card, marginBottom: 12 }}>
          <div style={S.cardTitle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#e05252' }}>▶</span> YouTube
            </span>
            {youtube?.available && (
              <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4,
                padding: '2px 8px' }}>
                {youtube.videos?.length} vidéos
              </span>
            )}
          </div>

          {(ytLoading || ytEnriching) && (
            <div style={{ padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: ytProgress ? 8 : 0 }}>
                {ytEnriching
                  ? `⟳ Récupération YouTube… ${ytProgress ? `${ytProgress.done}/${ytProgress.total}` : ''}`
                  : '⟳ Chargement…'}
              </div>
              {ytProgress && ytProgress.total > 0 && (
                <>
                  <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', background: '#e05252', borderRadius: 2, transition: 'width 0.5s ease', width: `${Math.round((ytProgress.done / ytProgress.total) * 100)}%` }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontStyle: 'italic' }}>
                    {ytProgress.current}
                  </div>
                </>
              )}
            </div>
          )}

          {ytError && !ytLoading && !ytEnriching && (
            <div style={{ fontSize: 11, color: '#f87171', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
              {ytError}
            </div>
          )}

          {youtube?.available && !ytLoading && !ytEnriching && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>VUES TOTALES</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtStreams(youtube.totalViews)}</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>VIDÉOS SOLO</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)' }}>{youtube.soloCount}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{fmtStreams(youtube.soloViews)} vues</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>FEATURINGS</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#e05252' }}>{youtube.featCount}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{fmtStreams(youtube.featViews)} vues</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>TOP VIDÉO</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                  {(youtube.topVideos?.[0]?.videoTitle || youtube.topVideos?.[0]?.trackName || '—').slice(0, 45)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  {fmtStreams(youtube.topVideos?.[0]?.views)} vues
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Lien vers le détail ── */}
        <div
          style={S.detailCard}
          onClick={() => navigate(`/artist/${encodeURIComponent(name)}/tracks`)}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.background = '#1a1a1a' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}
        >
          <div style={S.detailCardLeft}>
            <div style={S.detailCardTitle}>Détail des titres & albums</div>
            <div style={S.detailCardSub}>
              {totalTitres} titres · streams par album · solo / feat · export CSV
            </div>
          </div>
          <div style={S.detailCardArrow}>→</div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
