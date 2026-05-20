import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchArtist, fetchArtistAlbums, fetchArtistTracks, fetchArtistHistory,
  runPipeline, fetchPipelineStatus,
  fmtStreams, fmtFull,
} from '../api'

// ─── Pipeline steps (mirrors pipeline.py) ────────────────────────────────────
const PIPELINE_STEPS = [
  { label: 'Résolution Spotify',    fn: 'get_spotify_artist()' },
  { label: 'Scraping Kworb',        fn: 'scrape_kworb_spotify()' },
  { label: 'Enrichissement albums', fn: 'enrich_albums_with_tracks()' },
  { label: 'Export Power BI',       fn: 'export_all()' },
  { label: 'Sauvegarde terminée',   fn: 'Pipeline complet' },
]

function PipelinePanel({ artistName, onDone }) {
  const pollRef = useRef(null)
  const [job, setJob] = useState(null) // { status, message, step }

  useEffect(() => () => clearInterval(pollRef.current), [])

  const launch = useCallback(async () => {
    setJob({ status: 'queued', message: 'Démarrage…', step: 0 })
    try {
      await runPipeline(artistName)
    } catch {
      setJob({ status: 'error', message: 'Impossible de joindre le serveur. L\'API est-elle lancée ?', step: -1 })
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const s = await fetchPipelineStatus(artistName)
        setJob(s)
        if (s.status === 'done') { clearInterval(pollRef.current); setTimeout(onDone, 600) }
        if (s.status === 'error') clearInterval(pollRef.current)
      } catch { clearInterval(pollRef.current) }
    }, 2000)
  }, [artistName, onDone])

  const stepState = (i) => {
    if (!job) return 'pending'
    if (job.status === 'done')  return 'done'
    const step = job.step ?? 0
    if (i + 1 < step)  return 'done'
    if (i + 1 === step) return 'active'
    return 'pending'
  }

  const PS = {
    wrap:  { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginTop: 24, maxWidth: 480 },
    hdr:   { padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 },
    title: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', fontFamily: 'var(--font-mono)', flex: 1 },
    row:   { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)' },
    icon:  { width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 },
    lbl:   { fontSize: 12, flex: 1 },
    fn:    { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' },
    msg:   { padding: '10px 20px', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontStyle: 'italic', borderBottom: '1px solid var(--border)' },
    btn:   { margin: '16px 20px', padding: '10px 24px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--green)', color: '#000', cursor: 'pointer', border: 'none' },
  }

  const iconEl = (state) => {
    if (state === 'done')   return <div style={{ ...PS.icon, background: 'var(--green-bg)', color: 'var(--green)' }}>✓</div>
    if (state === 'active') return <div style={{ ...PS.icon, background: 'rgba(250,204,21,0.15)', color: '#facc15' }}>⟳</div>
    return <div style={{ ...PS.icon, background: 'var(--bg3)', color: 'var(--text3)' }}>○</div>
  }

  return (
    <div style={PS.wrap}>
      <div style={PS.hdr}>
        <div style={PS.title}>
          {!job && 'Pipeline non lancé'}
          {job?.status === 'queued'  && '⟳ En attente…'}
          {job?.status === 'running' && '⟳ Pipeline en cours'}
          {job?.status === 'done'    && '✓ Terminé — chargement…'}
          {job?.status === 'error'   && '✕ Erreur'}
        </div>
      </div>

      {PIPELINE_STEPS.map((step, i) => (
        <div key={i} style={{ ...PS.row, ...(i === PIPELINE_STEPS.length - 1 ? { borderBottom: 'none' } : {}) }}>
          {iconEl(stepState(i))}
          <div style={{ ...PS.lbl, color: stepState(i) === 'done' ? 'var(--text)' : stepState(i) === 'active' ? '#facc15' : 'var(--text3)' }}>
            {step.label}
          </div>
          <div style={PS.fn}>{step.fn}</div>
        </div>
      ))}

      {job?.message && <div style={PS.msg}>{job.message}</div>}

      {!job && (
        <button style={PS.btn} onClick={launch}>
          Lancer le pipeline →
        </button>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  '#38bdf8','#a855f7','#fb923c','#4ade80','#f472b6',
  '#facc15','#34d399','#f87171','#818cf8','#2dd4bf',
  '#60a5fa','#e879f9',
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
  logo:   { fontWeight: 700, fontSize: 13, letterSpacing: 2, color: 'var(--green)' },
  navSep: { color: 'var(--border2)', fontSize: 14 },
  navRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 },
  refreshStatus: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontWeight: 400 },
  refreshBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: 'var(--bg3)', border: '1px solid var(--border2)',
    color: 'var(--text2)', transition: 'all 0.15s',
  },
  main: { padding: '28px 24px', maxWidth: 1200, margin: '0 auto' },

  // Artist header
  artistHdr: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 },
  avatar: {
    width: 52, height: 52, borderRadius: '50%', background: 'var(--green)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, color: '#000', flexShrink: 0, overflow: 'hidden',
  },
  artistName: { fontSize: 30, fontWeight: 800, letterSpacing: 1, lineHeight: 1 },
  artistSub:  { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontWeight: 400, marginTop: 6 },

  // KPIs
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 },
  kpi: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px',
  },
  kpiLbl:  { fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginBottom: 10 },
  kpiVal:  { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 },
  kpiSub:  { fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginTop: 5 },

  // Two-column row
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

  // Bar chart
  barRow:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  barLabel: {
    fontSize: 11, fontWeight: 400, color: 'var(--text2)', width: 130,
    textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  barTrack:  { flex: 1, height: 14, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 3, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' },
  legend:    { display: 'flex', gap: 16, marginTop: 12 },
  legendItem:{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 400, color: 'var(--text2)' },
  legendDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },

  // Donut
  donutWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 4 },
  legRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '8px 0', borderBottom: '1px solid var(--border)',
  },
  legL:      { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'var(--text2)' },
  legDot:    { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legR:      { textAlign: 'right' },
  legStreams: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  legCount:  { fontSize: 11, fontWeight: 400, color: 'var(--text3)' },

  // Section
  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: 1,
    textTransform: 'uppercase', margin: '20px 0 12px',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  sectionLine: { flex: 1, height: 1, background: 'var(--border)' },

  // Axis
  axisRow: {
    display: 'flex', justifyContent: 'space-between',
    marginTop: 8, paddingLeft: 138,
    fontSize: 10, fontWeight: 400, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
  },

  // Track table
  filterRow: { display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' },
  filterBtn: {
    padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    fontWeight: 600, border: '1px solid var(--border2)',
    background: 'var(--bg3)', color: 'var(--text2)', transition: 'all 0.15s',
  },
  searchTrack: {
    marginLeft: 'auto', background: 'var(--bg3)', border: '1px solid var(--border2)',
    borderRadius: 6, padding: '5px 14px', color: 'var(--text)',
    fontSize: 12, fontWeight: 400, width: 220,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    fontSize: 10, fontWeight: 600, color: 'var(--text3)', textAlign: 'left',
    padding: '6px 10px 6px 0', borderBottom: '1px solid var(--border)',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  thR:    { textAlign: 'right' },
  td:     { padding: '9px 10px 9px 0', fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)' },
  tdR:    { textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--text3)' },
  badge:  { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 },
  linkIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: 4, color: 'var(--text3)',
    background: 'transparent', border: '1px solid transparent',
    fontSize: 11, transition: 'all 0.15s', cursor: 'pointer',
    textDecoration: 'none',
  },

  // Album classification blocks
  albumBlock: {
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    marginBottom: 6, overflow: 'hidden',
  },
  albumHdr: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
    cursor: 'pointer', background: 'var(--bg2)', transition: 'background 0.15s',
  },
  albumDot:    { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  albumName:   { flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)' },
  albumMeta:   { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' },
  albumStreams: { fontSize: 11, color: 'var(--text2)', marginRight: 8, fontFamily: 'var(--font-mono)' },
  albumChevron: { fontSize: 11, color: 'var(--text3)', transition: 'transform 0.2s', userSelect: 'none' },
  albumBarWrap: { padding: '0 16px', background: 'var(--bg3)' },
  trackTable:   { width: '100%', borderCollapse: 'collapse', background: 'var(--bg)' },

  loading: { textAlign: 'center', padding: 80, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  error:   { textAlign: 'center', padding: 60, color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: 12 },
}

// ─── History line chart ───────────────────────────────────────────────────────
function HistoryChart({ data }) {
  const [hovered, setHovered] = useState(null)
  if (!data || data.length < 2) return (
    <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '24px 0', textAlign: 'center' }}>
      Pas assez de données — le graphique se remplira au fil des scraping quotidiens.
    </div>
  )

  const W = 900, H = 180
  const PAD = { t: 12, r: 16, b: 28, l: 64 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  const vals   = data.map(d => d.totalStreams)
  const minV   = Math.min(...vals)
  const maxV   = Math.max(...vals)
  const range  = maxV - minV || 1

  const xOf = i  => (i / (data.length - 1)) * iW
  const yOf = v  => iH - ((v - minV) / range) * iH

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.totalStreams)}`).join(' ')
  const areaPath = `${linePath} L ${xOf(data.length - 1)} ${iH} L 0 ${iH} Z`

  const yTicks = [0, 0.5, 1].map(f => minV + range * f)
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
          {/* Grid */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={0} y1={yOf(v)} x2={iW} y2={yOf(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={-8} y={yOf(v) + 4} textAnchor="end" fill="var(--text3)" fontSize={10} fontFamily="var(--font-mono)">
                {fmtStreams(v)}
              </text>
            </g>
          ))}
          {/* Area */}
          <path d={areaPath} fill="url(#histGrad)" />
          {/* Line */}
          <path d={linePath} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinejoin="round" />
          {/* Hover dots */}
          {data.map((d, i) => (
            <circle key={i} cx={xOf(i)} cy={yOf(d.totalStreams)} r={hovered === i ? 5 : 3}
              fill={hovered === i ? 'var(--green)' : 'var(--bg2)'}
              stroke="var(--green)" strokeWidth={2}
              style={{ cursor: 'pointer', transition: 'r 0.1s' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          {/* X labels */}
          {xLabels.map(({ i, label }) => (
            <text key={i} x={xOf(i)} y={iH + 18} textAnchor="middle" fill="var(--text3)" fontSize={9} fontFamily="var(--font-mono)">
              {label}
            </text>
          ))}
        </g>
      </svg>
      {/* Tooltip */}
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


// ─── Donut SVG ────────────────────────────────────────────────────────────────
function Donut({ solo, feat }) {
  const total = solo + feat || 1
  const pct   = Math.round((solo / total) * 100)
  const r = 48, cx = 60, cy = 60, sw = 16
  const circ = 2 * Math.PI * r
  const sl = (solo / total) * circ
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

// ─── Album bar chart ──────────────────────────────────────────────────────────
function AlbumBarChart({ albums }) {
  const top     = albums.slice(0, 12)
  const max     = Math.max(...top.map(a => a.streamsKworb), 1)
  const ticks   = [0.25, 0.5, 0.75, 1].map(f => Math.round(f * max))
  const labelW  = Math.min(240, Math.max(100, Math.max(...top.map(a => a.name.length), 0) * 7.2))

  return (
    <div>
      {top.map((album, i) => (
        <div key={album.name} style={S.barRow}>
          <div style={{ ...S.barLabel, width: labelW }}>{album.name}</div>
          <div style={S.barTrack}>
            <div style={{
              ...S.barFill,
              width: `${Math.round((album.streamsKworb / max) * 100)}%`,
              background: ALBUM_COLORS[i % ALBUM_COLORS.length],
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', width: 52, textAlign: 'right', flexShrink: 0 }}>
            {fmtAxis(album.streamsKworb)}
          </div>
        </div>
      ))}
      <div style={{ ...S.axisRow, paddingLeft: labelW + 8 }}>
        <span>0</span>
        {ticks.map((v, i) => <span key={i}>{fmtAxis(v)}</span>)}
      </div>
    </div>
  )
}

// ─── Album classification block ───────────────────────────────────────────────
function AlbumBlock({ album, color, maxStreams }) {
  const [open, setOpen] = useState(false)
  const pct = Math.round((album.streamsKworb / maxStreams) * 100)

  return (
    <div style={S.albumBlock}>
      <div
        style={S.albumHdr}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}
      >
        <div style={{ ...S.albumDot, background: color }} />
        <div style={S.albumName}>{album.name}</div>
        <div style={S.albumMeta}>{album.nbTracks} titres · {album.nbSolo}s / {album.nbFeat}f</div>
        <div style={S.albumStreams}>{fmtStreams(album.streamsKworb)}</div>
        <span style={{ ...S.albumChevron, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </div>

      <div style={{ ...S.albumBarWrap, paddingTop: open ? 0 : 6, paddingBottom: open ? 0 : 6 }}>
        {!open && (
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
          </div>
        )}
      </div>

      {open && (
        <table style={S.trackTable}>
          <thead>
            <tr>
              <th style={{ ...S.th, paddingLeft: 16, width: 32 }}>#</th>
              <th style={S.th}>Titre</th>
              <th style={S.th}>Type</th>
              <th style={{ ...S.th, ...S.thR }}>Streams</th>
              <th style={{ ...S.th, ...S.thR, paddingRight: 16 }}>Daily</th>
            </tr>
          </thead>
          <tbody>
            {album.tracks.map((t, i) => (
              <tr key={i}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ ...S.td, paddingLeft: 16, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{i + 1}</td>
                <td style={{ ...S.td, color: 'var(--text)', fontSize: 12 }}>
                  {t.name}
                  {t.featuredArtists && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>feat. {t.featuredArtists}</span>}
                </td>
                <td style={S.td}>
                  <span style={{
                    ...S.badge,
                    background: t.type === 'solo' ? 'var(--green-bg)' : 'var(--purple-bg)',
                    color:      t.type === 'solo' ? 'var(--green)'    : 'var(--purple)',
                  }}>{t.type?.toUpperCase()}</span>
                </td>
                <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.streams)}</td>
                <td style={{ ...S.td, ...S.tdR, paddingRight: 16 }}>{fmtFull(t.daily)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Artist page ──────────────────────────────────────────────────────────────
export default function Artist() {
  const { name }   = useParams()
  const navigate   = useNavigate()
  const pollRef    = useRef(null)

  const [data, setData]             = useState(null)
  const [albums, setAlbums]         = useState([])
  const [allTracks, setAllTracks]   = useState([])
  const [history, setHistory]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [filter, setFilter]         = useState('all')
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState('streams')
  const [sortAsc, setSortAsc]       = useState(false)
  const [pageSize, setPageSize]     = useState(50)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [selectedAlbum, setSelectedAlbum] = useState('')

  const loadData = (n) => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetchArtist(n),
      fetchArtistAlbums(n),
      fetchArtistTracks(n, { limit: 500 }),
      fetchArtistHistory(n).catch(() => []),
    ])
      .then(([d, a, t, h]) => { setData(d); setAlbums(a); setAllTracks(t); setHistory(h) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const exportCSV = () => {
    const rows = [['#', 'Titre', 'Type', 'Album', 'Streams', 'Daily']]
    allTracks.forEach((t, i) => rows.push([i + 1, t.name, t.type, t.albumName || '', t.streams, t.daily]))
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${name}_streams.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  useEffect(() => { loadData(name) }, [name])
  useEffect(() => () => clearInterval(pollRef.current), [])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshMsg('Démarrage du pipeline…')
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

  if (loading) return <div style={S.page}><div style={S.loading}>Chargement de {name}…</div></div>

  // Artiste non trouvé → proposer le pipeline
  if (error) return (
    <div style={S.page}>
      <nav style={S.nav}>
        <span style={S.back} onClick={() => navigate('/')}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
        >← Tous les artistes</span>
        <span style={S.navSep}>·</span>
        <span style={S.logo}>STREAM ANALYTICS</span>
      </nav>
      <div style={{ ...S.main, display: 'flex', flexDirection: 'column' }}>
        <div style={S.artistHdr}>
          <div style={S.avatar}>{name[0].toUpperCase()}</div>
          <div>
            <div style={S.artistName}>{name.toUpperCase()}</div>
            <div style={S.artistSub}>Artiste non trouvé en base de données</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          Lance le pipeline pour importer les données depuis Kworb et Spotify.
        </div>
        <PipelinePanel artistName={name} onDone={() => loadData(name)} />
      </div>
    </div>
  )

  if (!data) return null

  const { kpis, soloTracks, featTracks, topTracks, artistImage, lastUpdate } = data
  const totalTitres = soloTracks.count + featTracks.count
  const top15       = (topTracks || []).slice(0, 15)
  const maxBar      = Math.max(...top15.map(t => t.streams), 1)
  const labelW15    = Math.min(200, Math.max(100, Math.max(...top15.map(t => t.name.length), 0) * 7.2))
  const ownAlbums   = albums.filter(a => a.albumType === 'own')

  const filteredTracks = allTracks
    .filter(t => {
      if (filter === 'solo' && t.type !== 'solo') return false
      if (filter === 'feat' && t.type !== 'feat') return false
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      const v = sortKey === 'name'
        ? a.name.localeCompare(b.name)
        : (b[sortKey] ?? 0) - (a[sortKey] ?? 0)
      return sortAsc ? -v : v
    })

  const visibleTracks = filteredTracks.slice(0, pageSize)

  const FILTERS = [
    { key: 'all',  label: 'Tous' },
    { key: 'solo', label: 'Solo' },
    { key: 'feat', label: 'Feats' },
  ]

  return (
    <div style={S.page}>
      {/* ── Navbar ── */}
      <nav style={S.nav}>
        <span
          style={S.back}
          onClick={() => navigate('/')}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
        >← Tous les artistes</span>
        <span style={S.navSep}>·</span>
        <span style={S.logo}>STREAM ANALYTICS</span>

        <div style={S.navRight}>
          {refreshMsg && <span style={S.refreshStatus}>{refreshMsg}</span>}
          <button
            style={{ ...S.refreshBtn }}
            onClick={() => navigate('/compare')}
          >⇄ Comparer</button>
          <button
            style={{
              ...S.refreshBtn,
              opacity: refreshing ? 0.6 : 1,
              color: refreshing ? 'var(--green)' : 'var(--text2)',
            }}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            Rafraîchir
          </button>
        </div>
      </nav>

      <div style={S.main}>
        {/* ── Artist header ── */}
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
              Spotify Analytics · {totalTitres} titres · cache ({cacheAge(lastUpdate)})
            </div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div style={S.kpis}>
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

        {/* ── Historique streams ── */}
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
        <div style={S.row2}>
          <div style={S.card}>
            <div style={S.cardTitle}>
              <span>Top 15 — Streams totaux</span>
            </div>
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

        {/* ── Streams par album (albums propres seulement) ── */}
        {ownAlbums.length > 0 && (
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={S.cardTitle}>
              <span>Streams par album</span>
              <span style={S.topBadge}>TOP {Math.min(ownAlbums.length, 12)}</span>
            </div>
            <AlbumBarChart albums={ownAlbums} />
          </div>
        )}

        {/* ── Classification par album (dropdown) ── */}
        <div style={S.sectionTitle}>
          Classification par album
          <span style={S.sectionLine} />
        </div>
        {albums.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '20px 0' }}>
            Aucun album en base. Lance le pipeline avec --force-enrich.
          </div>
        ) : (() => {
          const ownAlbums  = albums.filter(a => a.albumType === 'own')
          const featAlbums = albums.filter(a => a.albumType === 'feat')
          const current    = albums.find(a => a.name === selectedAlbum)
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <select
                  value={selectedAlbum}
                  onChange={e => setSelectedAlbum(e.target.value)}
                  style={{
                    background: 'var(--bg2)', border: '1px solid var(--border2)',
                    borderRadius: 8, padding: '9px 14px', color: 'var(--text)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    minWidth: 280, maxWidth: 480,
                  }}
                >
                  <option value="">Sélectionner un album…</option>
                  {ownAlbums.length > 0 && (
                    <optgroup label="── Albums">
                      {ownAlbums.map(a => (
                        <option key={a.name} value={a.name}>
                          {a.name}  ·  {fmtStreams(a.streamsKworb)}  ({a.nbSolo}s / {a.nbFeat}f)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {featAlbums.length > 0 && (
                    <optgroup label="── Compilations / Featurings">
                      {featAlbums.map(a => (
                        <option key={a.name} value={a.name}>
                          {a.name}  ·  {fmtStreams(a.streamsKworb)}  (feat. seulement)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {current && (
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    {current.nbTracks} titres · {fmtStreams(current.streamsKworb)} streams
                    {current.albumType === 'feat' && (
                      <span style={{ marginLeft: 8, color: 'var(--purple)', fontWeight: 700 }}>
                        COMPILATION / FEAT
                      </span>
                    )}
                  </span>
                )}
              </div>

              {current && (
                <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                  <table style={{ ...S.table, margin: 0 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg3)' }}>
                        <th style={{ ...S.th, paddingLeft: 16, width: 36 }}>#</th>
                        <th style={S.th}>Titre</th>
                        <th style={S.th}>Type</th>
                        <th style={{ ...S.th, ...S.thR }}>Streams</th>
                        <th style={{ ...S.th, ...S.thR, paddingRight: 16 }}>Daily</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.tracks.map((t, i) => (
                        <tr key={i}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ ...S.td, paddingLeft: 16, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{i + 1}</td>
                          <td style={{ ...S.td, color: 'var(--text)' }}>
                            {t.name}
                            {t.featuredArtists && (
                              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>feat. {t.featuredArtists}</span>
                            )}
                          </td>
                          <td style={S.td}>
                            <span style={{
                              ...S.badge,
                              background: t.type === 'solo' ? 'var(--green-bg)' : 'var(--purple-bg)',
                              color:      t.type === 'solo' ? 'var(--green)'    : 'var(--purple)',
                            }}>{t.type?.toUpperCase()}</span>
                          </td>
                          <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.streams)}</td>
                          <td style={{ ...S.td, ...S.tdR, paddingRight: 16 }}>{fmtFull(t.daily)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        })()}

        {/* ── Tracks table ── */}
        <div style={S.sectionTitle}>
          Détail des titres
          <span style={S.sectionLine} />
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            {filteredTracks.length} titre{filteredTracks.length > 1 ? 's' : ''}
          </span>
        </div>
        <div style={S.card}>
          <div style={S.filterRow}>
            {FILTERS.map(f => (
              <button key={f.key} style={{
                ...S.filterBtn,
                background:  filter === f.key ? (f.key === 'feat' ? 'var(--purple-bg)' : f.key === 'solo' ? 'var(--green-bg)' : 'var(--bg2)') : 'var(--bg3)',
                color:       filter === f.key ? (f.key === 'feat' ? 'var(--purple)'    : f.key === 'solo' ? 'var(--green)'    : 'var(--text)') : 'var(--text2)',
                borderColor: filter === f.key ? (f.key === 'feat' ? 'var(--purple)'    : f.key === 'solo' ? 'var(--green)'    : 'var(--border2)') : 'var(--border2)',
              }} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
            <input style={S.searchTrack} placeholder="Rechercher un titre…" value={search} onChange={e => { setSearch(e.target.value); setPageSize(50) }} />
            <button
              onClick={exportCSV}
              style={{ ...S.filterBtn, marginLeft: 'auto', background: 'var(--bg3)', color: 'var(--text2)' }}
              title="Exporter en CSV"
            >↓ CSV</button>
          </div>

          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 32 }}>#</th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                  Titre {sortKey === 'name' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th style={S.th}>Type</th>
                <th style={{ ...S.th, ...S.thR, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('streams')}>
                  Streams {sortKey === 'streams' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th style={{ ...S.th, ...S.thR, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('daily')}>
                  Daily {sortKey === 'daily' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th style={{ ...S.th, width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {visibleTracks.map((t, i) => (
                <tr key={i}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ ...S.td, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{i + 1}</td>
                  <td style={{ ...S.td, color: 'var(--text)' }}>
                    {t.name}
                    {t.featuredArtists && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>feat. {t.featuredArtists}</span>}
                  </td>
                  <td style={S.td}>
                    <span style={{
                      ...S.badge,
                      background: t.type === 'solo' ? 'var(--green-bg)' : 'var(--purple-bg)',
                      color:      t.type === 'solo' ? 'var(--green)'    : 'var(--purple)',
                    }}>{t.type?.toUpperCase()}</span>
                  </td>
                  <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.streams)}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.daily)}</td>
                  <td style={{ ...S.td, textAlign: 'center', paddingRight: 0 }}>
                    {t.spotifyTrackId && (
                      <a href={`https://open.spotify.com/track/${t.spotifyTrackId}`} target="_blank" rel="noreferrer"
                        style={S.linkIcon}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'transparent' }}
                      >↗</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibleTracks.length < filteredTracks.length && (
            <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
              <button
                onClick={() => setPageSize(p => p + 50)}
                style={{ ...S.filterBtn, background: 'var(--bg3)', color: 'var(--text2)', padding: '8px 24px' }}
              >
                Charger 50 de plus ({filteredTracks.length - visibleTracks.length} restants)
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
