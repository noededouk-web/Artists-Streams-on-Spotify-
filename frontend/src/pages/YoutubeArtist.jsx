import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmtStreams, fmtFull } from '../api'

const BASE = import.meta.env.VITE_API_URL || '/api'
const H    = { 'ngrok-skip-browser-warning': '1' }

async function fetchYoutubeArtist(slug) {
  const r = await fetch(`${BASE}/youtube/artist/${encodeURIComponent(slug)}`, { headers: H })
  if (!r.ok) throw new Error(`Artiste introuvable sur Kworb YouTube`)
  return r.json()
}

function fmtViews(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString()
}

const COLORS = [
  '#e05252','#e07a52','#d4b03a','#52a870','#52a8c4',
  '#5270c4','#9272cf','#cc7aad','#c47474','#5baed4',
]

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  nav: {
    padding: '10px 24px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 12,
    position: 'sticky', top: 0, zIndex: 50,
  },
  back: {
    fontSize: 12, color: 'var(--text3)', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', transition: 'color 0.15s', userSelect: 'none',
  },
  logo:   { fontWeight: 700, fontSize: 13, letterSpacing: 2, color: '#e05252' },
  navSep: { color: 'var(--border2)', fontSize: 14 },
  navRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: {
    padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: 'var(--bg3)', border: '1px solid var(--border2)',
    color: 'var(--text2)', cursor: 'pointer',
  },
  main: { padding: '28px 24px', maxWidth: 1200, margin: '0 auto' },

  hdr:     { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 },
  ytBadge: {
    width: 52, height: 52, borderRadius: 10, background: '#e05252',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, fontWeight: 900, color: '#fff', flexShrink: 0,
  },
  artistName: { fontSize: 30, fontWeight: 800, letterSpacing: 1, lineHeight: 1 },
  artistSub:  { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 6 },

  kpis: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 },
  kpi: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px',
  },
  kpiLbl: { fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginBottom: 10 },
  kpiVal: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 },
  kpiSub: { fontSize: 11, color: 'var(--text3)', marginTop: 5 },

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

  barRow:   { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  barLabel: { fontSize: 11, color: 'var(--text2)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 },
  barTrack: { flex: 1, height: 14, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' },

  donutWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 4 },
  legRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '8px 0', borderBottom: '1px solid var(--border)',
  },
  legL:      { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'var(--text2)' },
  legDot:    { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legR:      { textAlign: 'right' },
  legVal:    { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  legCount:  { fontSize: 11, color: 'var(--text3)' },

  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: 1,
    textTransform: 'uppercase', margin: '20px 0 12px',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  sectionLine: { flex: 1, height: 1, background: 'var(--border)' },

  filterRow: { display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' },
  filterBtn: {
    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border2)', cursor: 'pointer', transition: 'all 0.15s',
    background: 'var(--bg3)', color: 'var(--text2)',
  },
  searchInput: {
    marginLeft: 'auto', background: 'var(--bg3)', border: '1px solid var(--border2)',
    borderRadius: 6, padding: '5px 14px', color: 'var(--text)', fontSize: 12, width: 220,
  },

  table: { width: '100%', borderCollapse: 'collapse' },
  th:  { fontSize: 10, fontWeight: 600, color: 'var(--text3)', textAlign: 'left', padding: '6px 10px 6px 0', borderBottom: '1px solid var(--border)', letterSpacing: 0.5, textTransform: 'uppercase' },
  thR: { textAlign: 'right' },
  td:  { padding: '9px 10px 9px 0', fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)' },
  tdR: { textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--text3)' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 },
  ytLink: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: 4, color: 'var(--text3)',
    border: '1px solid transparent', fontSize: 11, transition: 'all 0.15s', textDecoration: 'none',
  },
  loadMore: {
    padding: '8px 24px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer',
  },

  loading: { textAlign: 'center', padding: 80, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  error:   { textAlign: 'center', padding: 60, color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: 12 },
}

function Donut({ solo, feat }) {
  const total = solo + feat || 1
  const pct   = Math.round((solo / total) * 100)
  const r = 48, cx = 60, cy = 60, sw = 16
  const circ = 2 * Math.PI * r
  const sl   = (solo / total) * circ
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg3)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e05252" strokeWidth={sw}
        strokeDasharray={`${circ - sl} ${circ}`} strokeDashoffset={-sl}
        transform={`rotate(-90 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--purple)" strokeWidth={sw}
        strokeDasharray={`${sl} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize="17" fontWeight="800"
        fontFamily="var(--font-display)">{pct}%</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--text3)" fontSize="9"
        fontFamily="var(--font-mono)">SOLO</text>
    </svg>
  )
}

export default function YoutubeArtist() {
  const { slug }  = useParams()
  const navigate  = useNavigate()

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    setLoading(true)
    fetchYoutubeArtist(slug)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [slug])

  const Nav = () => (
    <nav style={S.nav}>
      <span style={S.back}
        onClick={() => navigate('/')}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
      >← Accueil</span>
      <span style={S.navSep}>·</span>
      <span style={S.logo}>▶ YOUTUBE</span>
      <div style={S.navRight}>
        <button style={S.navBtn} onClick={() => navigate('/compare')}>⇄ Comparer</button>
      </div>
    </nav>
  )

  if (loading) return (
    <div style={S.page}><Nav /><div style={S.loading}>Chargement des données YouTube…</div></div>
  )
  if (error) return (
    <div style={S.page}><Nav /><div style={S.error}>{error}</div></div>
  )
  if (!data) return null

  const { stats, videos, topVideos } = data
  const maxViews  = Math.max(...topVideos.map(v => v.views), 1)
  const labelW    = Math.min(220, Math.max(120, Math.max(...topVideos.map(v => v.title.length), 0) * 6.5))

  const filtered = videos
    .filter(v => {
      if (filter === 'solo' && v.type !== 'solo') return false
      if (filter === 'feat' && v.type !== 'feat') return false
      if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

  const visible = filtered.slice(0, pageSize)

  const FILTERS = [
    { key: 'all',  label: 'Toutes' },
    { key: 'solo', label: 'Solo' },
    { key: 'feat', label: 'Feats' },
  ]

  return (
    <div style={S.page}>
      <Nav />

      <div style={S.main}>
        {/* ── Header ── */}
        <div style={S.hdr}>
          <div style={S.ytBadge}>▶</div>
          <div>
            <div style={S.artistName}>{slug.toUpperCase()}</div>
            <div style={S.artistSub}>YouTube Analytics · {videos.length} vidéos · données Kworb</div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div style={S.kpis}>
          <div style={S.kpi}>
            <div style={S.kpiLbl}>▶ Vues totales</div>
            <div style={S.kpiVal}>{fmtViews(stats.totalViews)}</div>
            <div style={S.kpiSub}>{fmtFull(stats.totalViews)}</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiLbl}>♫ Vues / jour</div>
            <div style={S.kpiVal}>{fmtViews(stats.dailyViews)}</div>
            <div style={S.kpiSub}>moyenne actuelle</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiLbl}>◎ Vidéos solo</div>
            <div style={{ ...S.kpiVal, color: 'var(--purple)' }}>{stats.soloCount}</div>
            <div style={S.kpiSub}>{fmtViews(stats.soloViews)} vues</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiLbl}>⊕ Featurings</div>
            <div style={{ ...S.kpiVal, color: '#e05252' }}>{stats.featCount}</div>
            <div style={S.kpiSub}>{fmtViews(stats.featViews)} vues</div>
          </div>
        </div>

        {/* ── Top 15 + Donut ── */}
        <div style={S.row2}>
          <div style={S.card}>
            <div style={S.cardTitle}><span>Top 15 — Vues totales</span></div>
            {topVideos.map((v, i) => (
              <div key={i} style={S.barRow}>
                <div style={{ ...S.barLabel, width: labelW }}>{v.title}</div>
                <div style={S.barTrack}>
                  <div style={{
                    ...S.barFill,
                    width: `${Math.round((v.views / maxViews) * 100)}%`,
                    background: COLORS[i % COLORS.length],
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', width: 48, textAlign: 'right', flexShrink: 0 }}>
                  {fmtViews(v.views)}
                </div>
              </div>
            ))}
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}><span>Solo vs Feat</span></div>
            <div style={S.donutWrap}>
              <Donut solo={stats.soloCount} feat={stats.featCount} />
              <div style={{ width: '100%' }}>
                <div style={S.legRow}>
                  <div style={S.legL}><div style={{ ...S.legDot, background: 'var(--purple)' }} />Solo</div>
                  <div style={S.legR}>
                    <div style={S.legVal}>{fmtViews(stats.soloViews)}</div>
                    <div style={S.legCount}>{stats.soloCount} vidéos</div>
                  </div>
                </div>
                <div style={{ ...S.legRow, borderBottom: 'none' }}>
                  <div style={S.legL}><div style={{ ...S.legDot, background: '#e05252' }} />Feat</div>
                  <div style={S.legR}>
                    <div style={S.legVal}>{fmtViews(stats.featViews)}</div>
                    <div style={S.legCount}>{stats.featCount} vidéos</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Toutes les vidéos ── */}
        <div style={S.sectionTitle}>
          Toutes les vidéos
          <span style={S.sectionLine} />
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} vidéo{filtered.length > 1 ? 's' : ''}
          </span>
        </div>

        <div style={S.card}>
          <div style={S.filterRow}>
            {FILTERS.map(f => (
              <button key={f.key} style={{
                ...S.filterBtn,
                background:  filter === f.key ? (f.key === 'feat' ? 'rgba(224,82,82,0.12)' : f.key === 'solo' ? 'var(--purple-bg)' : 'var(--bg2)') : 'var(--bg3)',
                color:       filter === f.key ? (f.key === 'feat' ? '#e05252' : f.key === 'solo' ? 'var(--purple)' : 'var(--text)') : 'var(--text3)',
                borderColor: filter === f.key ? (f.key === 'feat' ? '#e05252' : f.key === 'solo' ? 'var(--purple)' : 'var(--border2)') : 'var(--border2)',
              }} onClick={() => { setFilter(f.key); setPageSize(50) }}>{f.label}</button>
            ))}
            <input
              style={S.searchInput}
              placeholder="Rechercher une vidéo…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPageSize(50) }}
            />
          </div>

          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 32 }}>#</th>
                <th style={S.th}>Titre</th>
                <th style={S.th}>Type</th>
                <th style={{ ...S.th, ...S.thR }}>Vues</th>
                <th style={{ ...S.th, ...S.thR }}>Daily</th>
                <th style={{ ...S.th }}>Publié</th>
                <th style={{ ...S.th, width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((v, i) => (
                <tr key={i}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ ...S.td, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{i + 1}</td>
                  <td style={{ ...S.td, color: 'var(--text)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.title}
                  </td>
                  <td style={S.td}>
                    <span style={{
                      ...S.badge,
                      background: v.type === 'solo' ? 'var(--purple-bg)' : 'rgba(224,82,82,0.12)',
                      color:      v.type === 'solo' ? 'var(--purple)'    : '#e05252',
                    }}>{v.type?.toUpperCase()}</span>
                  </td>
                  <td style={{ ...S.td, ...S.tdR }}>{fmtFull(v.views)}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{fmtFull(v.daily)}</td>
                  <td style={{ ...S.td, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {v.published ? v.published.slice(0, 7) : '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', paddingRight: 0 }}>
                    {v.videoId && (
                      <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer"
                        style={S.ytLink}
                        onMouseEnter={e => { e.currentTarget.style.color = '#e05252'; e.currentTarget.style.borderColor = '#e05252' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'transparent' }}
                      >▶</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visible.length < filtered.length && (
            <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
              <button onClick={() => setPageSize(p => p + 50)} style={S.loadMore}>
                Charger 50 de plus ({filtered.length - visible.length} restants)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
