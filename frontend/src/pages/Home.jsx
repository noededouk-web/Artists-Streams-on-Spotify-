import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchArtists, fmtStreams } from '../api'

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' },
  nav: {
    padding: '12px 28px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
  },
  logo:    { fontWeight: 700, fontSize: 13, letterSpacing: 1, color: 'var(--green)' },
  navSub:  { fontSize: 11, fontWeight: 400, color: 'var(--text3)' },
  platformPill: {
    marginLeft: 'auto', display: 'flex', gap: 4,
    background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 4px',
  },
  pill: {
    padding: '4px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
  },

  hero: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '64px 24px 48px',
    borderBottom: '1px solid var(--border)',
  },
  heroLogo: { fontSize: 36, fontWeight: 800, letterSpacing: 2, color: 'var(--text)', marginBottom: 6 },
  heroSub:  { fontSize: 12, fontWeight: 500, color: 'var(--text3)', letterSpacing: 2, marginBottom: 28, textTransform: 'uppercase' },

  searchWrap: {
    width: '100%', maxWidth: 540,
    display: 'flex', background: 'var(--bg2)',
    border: '1px solid var(--border2)', borderRadius: 10, overflow: 'hidden',
  },
  searchInput: {
    flex: 1, background: 'transparent', border: 'none',
    padding: '14px 20px', color: 'var(--text)', fontSize: 14, fontWeight: 400,
  },
  searchBtn: {
    padding: '14px 26px', background: 'var(--green)', color: '#000',
    fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
    transition: 'opacity 0.15s', flexShrink: 0,
  },

  section: { padding: '36px 28px', maxWidth: 1200, margin: '0 auto', width: '100%' },
  sectionHdr: {
    fontSize: 11, fontWeight: 600, letterSpacing: 1, color: 'var(--text3)',
    marginBottom: 18, textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  sectionLine: { flex: 1, height: 1, background: 'var(--border)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 },
  card: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '18px', cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  cardTop:  { display: 'flex', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: '50%', background: 'var(--green)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 17, fontWeight: 700, color: '#000', flexShrink: 0, overflow: 'hidden',
  },
  cardName: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  cardDate: { fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginTop: 2 },
  stats:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  stat:     { background: 'var(--bg3)', borderRadius: 6, padding: '7px 10px' },
  statLbl:  { fontSize: 10, fontWeight: 500, color: 'var(--text3)', letterSpacing: 0.3, marginBottom: 3 },
  statVal:  { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  viewBtn: {
    padding: '7px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
    background: 'var(--green-bg)', border: '1px solid rgba(74,222,128,0.2)',
    color: 'var(--green)', textAlign: 'center',
  },
  empty: { color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '40px 0', textAlign: 'center' },
}

const PLATFORMS = [
  { key: 'spotify',  label: '▶ Spotify', active: true  },
  { key: 'youtube',  label: '▶ YouTube', active: false },
]

export default function Home() {
  const navigate  = useNavigate()
  const [artists, setArtists]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [platform, setPlatform] = useState('spotify')

  useEffect(() => {
    fetchArtists()
      .then(setArtists)
      .catch(() => setArtists([]))
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    const name = query.trim()
    if (!name) return
    navigate(`/artist/${encodeURIComponent(name)}`)
  }

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <span style={S.logo}>STREAM ANALYTICS</span>
        <span style={S.navSub}>· Données musicales</span>
        <button
          onClick={() => navigate('/compare')}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            color: 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)' }}
        >⇄ Comparer</button>
        <div style={S.platformPill}>
          {PLATFORMS.map(p => (
            <button
              key={p.key}
              style={{
                ...S.pill,
                background:  p.key === platform ? 'var(--green-bg)' : 'transparent',
                color:       p.key === platform ? 'var(--green)'    : 'var(--text3)',
                cursor:      p.active ? 'pointer' : 'not-allowed',
                opacity:     p.active ? 1 : 0.45,
              }}
              onClick={() => p.active && setPlatform(p.key)}
              title={p.active ? '' : 'Bientôt disponible'}
            >{p.label}</button>
          ))}
        </div>
      </nav>

      {/* ── Hero search ── */}
      <div style={S.hero}>
        <div style={S.heroLogo}>STREAM ANALYTICS</div>
        <div style={S.heroSub}>Analyse de streams · {platform === 'spotify' ? 'Spotify' : 'YouTube'}</div>

        <form style={{ width: '100%', maxWidth: 540 }} onSubmit={handleSearch}>
          <div style={S.searchWrap}>
            <input
              style={S.searchInput}
              placeholder="Rechercher un artiste… (ex : Damso, Nekfeu)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              style={{ ...S.searchBtn, opacity: query.trim() ? 1 : 0.4 }}
              disabled={!query.trim()}
            >
              Rechercher →
            </button>
          </div>
        </form>
      </div>

      {/* ── Artistes en base ── */}
      <div style={S.section}>
        <div style={S.sectionHdr}>
          Artistes en base ({artists.length})
          <span style={S.sectionLine} />
        </div>

        {loading && <div style={S.empty}>Chargement…</div>}
        {!loading && artists.length === 0 && (
          <div style={S.empty}>Aucun artiste — utilisez la recherche ci-dessus pour en ajouter un.</div>
        )}

        <div style={S.grid}>
          {artists.map(a => (
            <div
              key={a.name}
              style={S.card}
              onClick={() => navigate(`/artist/${encodeURIComponent(a.name)}`)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = '#1a1a1a' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.background = 'var(--bg2)' }}
            >
              <div style={S.cardTop}>
                <div style={S.avatar}>
                  {a.artistImage
                    ? <img src={a.artistImage} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : a.name[0].toUpperCase()
                  }
                </div>
                <div>
                  <div style={S.cardName}>{a.name.toUpperCase()}</div>
                  <div style={S.cardDate}>{a.lastUpdate || '—'}</div>
                </div>
              </div>
              <div style={S.stats}>
                <div style={S.stat}>
                  <div style={S.statLbl}>STREAMS</div>
                  <div style={S.statVal}>{fmtStreams(a.totalStreams)}</div>
                </div>
                <div style={S.stat}>
                  <div style={S.statLbl}>/ JOUR</div>
                  <div style={S.statVal}>{fmtStreams(a.dailyStreams)}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                {a.totalTracks} titres analysés
              </div>
              <div style={S.viewBtn}>Voir l'artiste →</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
