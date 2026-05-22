import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchArtistAlbums, fetchArtistTracks, fmtStreams, fmtFull } from '../api'

const BASE = import.meta.env.VITE_API_URL || '/api'
const H    = { 'ngrok-skip-browser-warning': '1' }

async function fetchYoutubeTracks(name) {
  const r = await fetch(`${BASE}/artists/${encodeURIComponent(name)}/youtube`, { headers: H })
  if (!r.ok) return null
  return r.json()
}

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
  logo:     { fontWeight: 700, fontSize: 13, letterSpacing: 2, color: 'var(--green)' },
  navSep:   { color: 'var(--border2)', fontSize: 14 },
  navRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: {
    padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: 'var(--bg3)', border: '1px solid var(--border2)',
    color: 'var(--text2)', cursor: 'pointer',
  },
  main: { padding: '28px 24px', maxWidth: 1200, margin: '0 auto' },

  pageHdr:   { marginBottom: 24 },
  pageTitle: { fontSize: 24, fontWeight: 800, letterSpacing: 1, color: 'var(--text)', lineHeight: 1 },
  pageSub:   { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 6 },

  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: 1,
    textTransform: 'uppercase', margin: '28px 0 14px',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  sectionLine: { flex: 1, height: 1, background: 'var(--border)' },

  card: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '18px 20px',
  },

  filterBar: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, flexWrap: 'wrap' },
  filterPill: {
    padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border2)', cursor: 'pointer', transition: 'all 0.15s',
  },
  searchInput: {
    marginLeft: 'auto', background: 'var(--bg3)', border: '1px solid var(--border2)',
    borderRadius: 6, padding: '5px 14px', color: 'var(--text)', fontSize: 12, width: 220,
  },
  csvBtn: {
    padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border2)', background: 'var(--bg3)',
    color: 'var(--text2)', cursor: 'pointer',
  },

  albumSelect: {
    background: 'var(--bg2)', border: '1px solid var(--border2)',
    borderRadius: 8, padding: '9px 14px', color: 'var(--text)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', minWidth: 280, maxWidth: 520,
  },
  albumMeta: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    fontSize: 10, fontWeight: 600, color: 'var(--text3)', textAlign: 'left',
    padding: '6px 10px 6px 0', borderBottom: '1px solid var(--border)',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  thR:   { textAlign: 'right' },
  td:    { padding: '9px 10px 9px 0', fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)' },
  tdR:   { textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--text3)' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 },
  linkIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: 4, color: 'var(--text3)',
    border: '1px solid transparent', fontSize: 11, transition: 'all 0.15s', textDecoration: 'none',
  },
  loadMore: {
    padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border2)', background: 'var(--bg3)',
    color: 'var(--text2)', cursor: 'pointer',
  },

  loading: { textAlign: 'center', padding: 80, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 },
}

function TypeBadge({ type }) {
  return (
    <span style={{
      ...S.badge,
      background: type === 'solo' ? 'var(--green-bg)' : 'var(--purple-bg)',
      color:      type === 'solo' ? 'var(--green)'    : 'var(--purple)',
    }}>{type?.toUpperCase()}</span>
  )
}

export default function Tracks() {
  const { name } = useParams()
  const navigate = useNavigate()

  const [albums, setAlbums]       = useState([])
  const [allTracks, setAllTracks] = useState([])
  const [ytMap, setYtMap]         = useState({})
  const [loading, setLoading]     = useState(true)

  const [view, setView]           = useState('all')
  const [search, setSearch]       = useState('')
  const [sortKey, setSortKey]     = useState('streams')
  const [sortAsc, setSortAsc]     = useState(false)
  const [pageSize, setPageSize]   = useState(50)
  const [selectedAlbum, setSelectedAlbum] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchArtistAlbums(name),
      fetchArtistTracks(name, { limit: 500 }),
      fetchYoutubeTracks(name).catch(() => null),
    ])
      .then(([a, t, yt]) => {
        setAlbums(a)
        setAllTracks(t)
        if (yt?.available && yt.tracks) {
          const map = {}
          yt.tracks.forEach(v => { if (v.trackName) map[v.trackName] = v })
          setYtMap(map)
        }
      })
      .finally(() => setLoading(false))
  }, [name])

  const ownAlbums    = albums.filter(a => a.albumType === 'own')
  const featAlbums   = albums.filter(a => a.albumType === 'feat')
  const currentAlbum = albums.find(a => a.name === selectedAlbum)
  const hasYt        = Object.keys(ytMap).length > 0

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const exportCSV = () => {
    const rows = [['#', 'Titre', 'Type', 'Album', 'Streams Spotify', 'Daily Spotify', ...(hasYt ? ['Vues YouTube'] : [])]]
    allTracks.forEach((t, i) => {
      const ytViews = ytMap[t.name]?.views ?? ''
      rows.push([i + 1, t.name, t.type, t.albumName || '', t.streams, t.daily, ...(hasYt ? [ytViews] : [])])
    })
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${name}_streams.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const filteredTracks = allTracks
    .filter(t => {
      if (view === 'solo' && t.type !== 'solo') return false
      if (view === 'feat' && t.type !== 'feat') return false
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

  const VIEWS = [
    { key: 'all',   label: 'Tous' },
    { key: 'solo',  label: 'Solo' },
    { key: 'feat',  label: 'Feats' },
    { key: 'album', label: 'Par album' },
  ]

  const pillStyle = (key) => ({
    ...S.filterPill,
    background: view === key
      ? (key === 'solo' ? 'var(--green-bg)' : key === 'feat' ? 'var(--purple-bg)' : key === 'album' ? 'rgba(56,189,248,0.12)' : 'var(--bg2)')
      : 'var(--bg3)',
    color: view === key
      ? (key === 'solo' ? 'var(--green)' : key === 'feat' ? 'var(--purple)' : key === 'album' ? '#38bdf8' : 'var(--text)')
      : 'var(--text3)',
    borderColor: view === key
      ? (key === 'solo' ? 'var(--green)' : key === 'feat' ? 'var(--purple)' : key === 'album' ? '#38bdf8' : 'var(--border2)')
      : 'var(--border2)',
  })

  if (loading) return (
    <div style={S.page}>
      <nav style={S.nav}>
        <span style={S.back} onClick={() => navigate(`/artist/${encodeURIComponent(name)}`)}>← {name.toUpperCase()}</span>
        <span style={S.navSep}>·</span>
        <span style={S.logo}>STREAM ANALYTICS</span>
      </nav>
      <div style={S.loading}>Chargement…</div>
    </div>
  )

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <span style={S.back}
          onClick={() => navigate(`/artist/${encodeURIComponent(name)}`)}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
        >← {name.toUpperCase()}</span>
        <span style={S.navSep}>·</span>
        <span style={S.logo}>STREAM ANALYTICS</span>
        <div style={S.navRight}>
          <button style={S.navBtn} onClick={() => navigate('/compare')}>⇄ Comparer</button>
        </div>
      </nav>

      <div style={S.main}>
        <div style={S.pageHdr}>
          <div style={S.pageTitle}>{name.toUpperCase()} — Titres & Albums</div>
          <div style={S.pageSub}>{allTracks.length} titres · {albums.length} albums</div>
        </div>

        <div style={S.sectionTitle}>
          Titres
          <span style={S.sectionLine} />
        </div>

        <div style={S.card}>
          <div style={S.filterBar}>
            {VIEWS.map(v => (
              <button key={v.key} style={pillStyle(v.key)}
                onClick={() => { setView(v.key); setSearch(''); setPageSize(50) }}
              >{v.label}</button>
            ))}
            {view !== 'album' && (
              <>
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                  {filteredTracks.length} titre{filteredTracks.length > 1 ? 's' : ''}
                </span>
                <input style={S.searchInput} placeholder="Rechercher un titre…" value={search}
                  onChange={e => { setSearch(e.target.value); setPageSize(50) }} />
                <button onClick={exportCSV} style={S.csvBtn} title="Exporter en CSV">↓ CSV</button>
              </>
            )}
          </div>

          {/* ── Vue liste ── */}
          {view !== 'album' && (
            <>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 32 }}>#</th>
                    <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                      Titre {sortKey === 'name' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th style={S.th}>Type</th>
                    <th style={{ ...S.th, ...S.thR, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('streams')}>
                      Spotify {sortKey === 'streams' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th style={{ ...S.th, ...S.thR, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('daily')}>
                      Daily {sortKey === 'daily' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    {hasYt && (
                      <th style={{ ...S.th, ...S.thR }}>
                        <span style={{ color: '#e05252' }}>▶</span> YouTube
                      </th>
                    )}
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
                      <td style={S.td}><TypeBadge type={t.type} /></td>
                      <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.streams)}</td>
                      <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.daily)}</td>
                      {hasYt && (() => {
                        const yt = ytMap[t.name]
                        return (
                          <td style={{ ...S.td, ...S.tdR }}>
                            {yt?.views > 0
                              ? <span style={{ color: '#e05252' }}>{fmtFull(yt.views)}</span>
                              : <span style={{ color: 'var(--text3)' }}>—</span>
                            }
                          </td>
                        )
                      })()}
                      <td style={{ ...S.td, textAlign: 'center', paddingRight: 0 }}>
                        {(() => {
                          const yt = ytMap[t.name]
                          const ytId = yt?.videoId
                          return ytId ? (
                            <a href={`https://www.youtube.com/watch?v=${ytId}`} target="_blank" rel="noreferrer"
                              style={{ ...S.linkIcon, fontSize: 10 }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#e05252'; e.currentTarget.style.borderColor = '#e05252' }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'transparent' }}
                            >▶</a>
                          ) : t.spotifyTrackId ? (
                            <a href={`https://open.spotify.com/track/${t.spotifyTrackId}`} target="_blank" rel="noreferrer"
                              style={S.linkIcon}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'transparent' }}
                            >↗</a>
                          ) : null
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleTracks.length < filteredTracks.length && (
                <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
                  <button onClick={() => setPageSize(p => p + 50)} style={S.loadMore}>
                    Charger 50 de plus ({filteredTracks.length - visibleTracks.length} restants)
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Vue par album ── */}
          {view === 'album' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <select value={selectedAlbum} onChange={e => setSelectedAlbum(e.target.value)} style={S.albumSelect}>
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
                {currentAlbum && (
                  <span style={S.albumMeta}>
                    {currentAlbum.nbTracks} titres · {fmtStreams(currentAlbum.streamsKworb)} streams
                    {currentAlbum.albumType === 'feat' && (
                      <span style={{ marginLeft: 8, color: 'var(--purple)', fontWeight: 700 }}>COMPILATION / FEAT</span>
                    )}
                  </span>
                )}
              </div>
              {currentAlbum && (
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: 36 }}>#</th>
                      <th style={S.th}>Titre</th>
                      <th style={S.th}>Type</th>
                      <th style={{ ...S.th, ...S.thR }}>Streams</th>
                      <th style={{ ...S.th, ...S.thR }}>Daily</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAlbum.tracks.map((t, i) => (
                      <tr key={i}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ ...S.td, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{i + 1}</td>
                        <td style={{ ...S.td, color: 'var(--text)' }}>
                          {t.name}
                          {t.featuredArtists && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>feat. {t.featuredArtists}</span>}
                        </td>
                        <td style={S.td}><TypeBadge type={t.type} /></td>
                        <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.streams)}</td>
                        <td style={{ ...S.td, ...S.tdR }}>{fmtFull(t.daily)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!currentAlbum && (
                <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                  Sélectionne un album dans la liste ci-dessus.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
