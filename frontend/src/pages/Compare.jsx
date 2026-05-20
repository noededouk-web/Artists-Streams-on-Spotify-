import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchArtists, fetchArtist, fmtStreams, fmtFull } from '../api'

const ARTIST_COLORS = ['#4ade80', '#a855f7', '#38bdf8', '#fb923c']
const MAX = 4

function fmtAxis(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'K'
  return n.toString()
}

const S = {
  page:    { minHeight: '100vh', background: 'var(--bg)' },
  nav: {
    padding: '10px 24px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 12,
    position: 'sticky', top: 0, zIndex: 50,
  },
  back: {
    fontSize: 12, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
    display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.15s', userSelect: 'none',
  },
  logo:     { fontWeight: 700, fontSize: 13, letterSpacing: 2, color: 'var(--green)' },
  navSep:   { color: 'var(--border2)', fontSize: 14 },
  navTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text2)' },
  main:     { padding: '28px 24px', maxWidth: 1200, margin: '0 auto' },

  selectorWrap: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, flexWrap: 'wrap' },
  select: {
    background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8,
    padding: '9px 14px', color: 'var(--text)', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', minWidth: 220,
  },
  pill: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 8px 5px 12px', borderRadius: 20,
    fontSize: 12, fontWeight: 600, border: '1px solid',
  },
  pillX: {
    cursor: 'pointer', fontSize: 16, lineHeight: 1, fontWeight: 300,
    opacity: 0.6, transition: 'opacity 0.15s', marginLeft: 2,
  },
  hint: { fontSize: 11, fontWeight: 400, color: 'var(--text3)', fontFamily: 'var(--font-mono)' },

  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: 1,
    textTransform: 'uppercase', margin: '24px 0 12px',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  sectionLine: { flex: 1, height: 1, background: 'var(--border)' },

  card: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '18px 20px',
  },
  grid: { display: 'grid', gap: 10 },

  kpiCard: {
    background: 'var(--bg2)', borderRadius: 'var(--radius-lg)',
    padding: '20px', border: '1px solid',
  },
  artistHdr: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  artistAvatar: { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' },
  artistInitial: {
    width: 30, height: 30, borderRadius: '50%', background: 'var(--bg3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700,
  },
  artistLabel: { fontSize: 14, fontWeight: 700 },
  kpiRow:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  kpiItem: { background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' },
  kpiLbl:  { fontSize: 10, fontWeight: 500, color: 'var(--text3)', marginBottom: 4 },
  kpiVal:  { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  kpiSub:  { fontSize: 10, fontWeight: 400, color: 'var(--text3)', marginTop: 4 },

  barRow:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barTrack: { flex: 1, height: 16, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 4, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' },

  ratioBar: { height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },

  trackCard: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
  },
  trackHdr: {
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  trackRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', borderBottom: '1px solid var(--border)',
    transition: 'background 0.12s',
  },

  empty: {
    color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12,
    padding: '60px 0', textAlign: 'center',
  },
}

export default function Compare() {
  const navigate = useNavigate()
  const [allArtists, setAllArtists]   = useState([])
  const [selected, setSelected]       = useState([])
  const [artistData, setArtistData]   = useState({})
  const [loadingMap, setLoadingMap]   = useState({})

  useEffect(() => { fetchArtists().then(setAllArtists).catch(() => {}) }, [])

  const addArtist = async (name) => {
    if (!name || selected.includes(name) || selected.length >= MAX) return
    setSelected(prev => [...prev, name])
    setLoadingMap(prev => ({ ...prev, [name]: true }))
    try {
      const d = await fetchArtist(name)
      setArtistData(prev => ({ ...prev, [name]: d }))
    } catch {
      setSelected(prev => prev.filter(n => n !== name))
    } finally {
      setLoadingMap(prev => ({ ...prev, [name]: false }))
    }
  }

  const removeArtist = (name) => {
    setSelected(prev => prev.filter(n => n !== name))
    setArtistData(prev => { const d = { ...prev }; delete d[name]; return d })
  }

  const available  = allArtists.filter(a => !selected.includes(a.name))
  const loaded     = selected.filter(n => artistData[n])
  const maxStreams  = Math.max(...loaded.map(n => artistData[n].kpis.totalStreams), 1)
  const maxDaily   = Math.max(...loaded.map(n => artistData[n].kpis.dailyStreams), 1)
  const nameLabelW = loaded.length > 0
    ? Math.max(...loaded.map(n => n.length), 0) * 8 + 8
    : 80

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <span style={S.back}
          onClick={() => navigate('/')}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
        >← Retour</span>
        <span style={S.navSep}>·</span>
        <span style={S.logo}>STREAM ANALYTICS</span>
        <span style={S.navSep}>·</span>
        <span style={S.navTitle}>Comparaison d'artistes</span>
      </nav>

      <div style={S.main}>

        {/* ── Sélecteur ── */}
        <div style={S.selectorWrap}>
          {selected.length < MAX && (
            <select style={S.select} value="" onChange={e => addArtist(e.target.value)}>
              <option value="">+ Ajouter un artiste…</option>
              {available.map(a => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          )}

          {selected.map((name, i) => {
            const color = ARTIST_COLORS[i % ARTIST_COLORS.length]
            return (
              <div key={name} style={{ ...S.pill, background: `${color}18`, borderColor: `${color}44`, color }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {name}{loadingMap[name] ? ' …' : ''}
                <span style={S.pillX}
                  onClick={() => removeArtist(name)}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                >×</span>
              </div>
            )
          })}

          {selected.length === MAX && (
            <span style={S.hint}>Maximum {MAX} artistes</span>
          )}
        </div>

        {loaded.length === 0 && (
          <div style={S.empty}>
            Sélectionne au moins un artiste pour commencer la comparaison.
          </div>
        )}

        {loaded.length > 0 && (<>

          {/* ── KPI cards ── */}
          <div style={{ ...S.grid, gridTemplateColumns: `repeat(${loaded.length}, 1fr)` }}>
            {loaded.map((name, i) => {
              const d     = artistData[name]
              const color = ARTIST_COLORS[i % ARTIST_COLORS.length]
              return (
                <div key={name} style={{ ...S.kpiCard, borderColor: `${color}40` }}>
                  <div style={S.artistHdr}>
                    {d.artistImage
                      ? <img src={d.artistImage} alt={name} style={S.artistAvatar} />
                      : <div style={{ ...S.artistInitial, color }}>{name[0].toUpperCase()}</div>
                    }
                    <div style={{ ...S.artistLabel, color }}>{name.toUpperCase()}</div>
                  </div>
                  <div style={S.kpiRow}>
                    <div style={S.kpiItem}>
                      <div style={S.kpiLbl}>Streams totaux</div>
                      <div style={{ ...S.kpiVal, color }}>{fmtStreams(d.kpis.totalStreams)}</div>
                      <div style={S.kpiSub}>{fmtFull(d.kpis.totalStreams)}</div>
                    </div>
                    <div style={S.kpiItem}>
                      <div style={S.kpiLbl}>Écoutes / jour</div>
                      <div style={S.kpiVal}>{fmtStreams(d.kpis.dailyStreams)}</div>
                      <div style={S.kpiSub}>moyenne</div>
                    </div>
                    <div style={S.kpiItem}>
                      <div style={S.kpiLbl}>Titres solo</div>
                      <div style={{ ...S.kpiVal, color: 'var(--green)' }}>{d.soloTracks.count}</div>
                      <div style={S.kpiSub}>{fmtStreams(d.soloTracks.streams)}</div>
                    </div>
                    <div style={S.kpiItem}>
                      <div style={S.kpiLbl}>Featurings</div>
                      <div style={{ ...S.kpiVal, color: 'var(--purple)' }}>{d.featTracks.count}</div>
                      <div style={S.kpiSub}>{fmtStreams(d.featTracks.streams)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Streams totaux ── */}
          <div style={S.sectionTitle}>Streams totaux <span style={S.sectionLine} /></div>
          <div style={S.card}>
            {[...loaded]
              .sort((a, b) => artistData[b].kpis.totalStreams - artistData[a].kpis.totalStreams)
              .map(name => {
                const d     = artistData[name]
                const idx   = selected.indexOf(name)
                const color = ARTIST_COLORS[idx % ARTIST_COLORS.length]
                const pct   = Math.round((d.kpis.totalStreams / maxStreams) * 100)
                return (
                  <div key={name} style={S.barRow}>
                    <div style={{ width: nameLabelW, fontSize: 12, fontWeight: 600, color, flexShrink: 0, textAlign: 'right' }}>{name}</div>
                    <div style={S.barTrack}>
                      <div style={{ ...S.barFill, width: `${pct}%`, background: color }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color, width: 56, flexShrink: 0 }}>
                      {fmtStreams(d.kpis.totalStreams)}
                    </div>
                  </div>
                )
              })}
          </div>

          {/* ── Écoutes / jour ── */}
          <div style={S.sectionTitle}>Écoutes / jour <span style={S.sectionLine} /></div>
          <div style={S.card}>
            {[...loaded]
              .sort((a, b) => artistData[b].kpis.dailyStreams - artistData[a].kpis.dailyStreams)
              .map(name => {
                const d     = artistData[name]
                const idx   = selected.indexOf(name)
                const color = ARTIST_COLORS[idx % ARTIST_COLORS.length]
                const pct   = Math.round((d.kpis.dailyStreams / maxDaily) * 100)
                return (
                  <div key={name} style={S.barRow}>
                    <div style={{ width: nameLabelW, fontSize: 12, fontWeight: 600, color, flexShrink: 0, textAlign: 'right' }}>{name}</div>
                    <div style={S.barTrack}>
                      <div style={{ ...S.barFill, width: `${pct}%`, background: color }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color, width: 56, flexShrink: 0 }}>
                      {fmtStreams(d.kpis.dailyStreams)}
                    </div>
                  </div>
                )
              })}
          </div>

          {/* ── Ratio Solo / Feat ── */}
          <div style={S.sectionTitle}>Ratio Solo / Feat <span style={S.sectionLine} /></div>
          <div style={{ ...S.grid, gridTemplateColumns: `repeat(${loaded.length}, 1fr)` }}>
            {loaded.map((name, i) => {
              const d       = artistData[name]
              const color   = ARTIST_COLORS[i % ARTIST_COLORS.length]
              const total   = (d.soloTracks.count + d.featTracks.count) || 1
              const soloPct = Math.round((d.soloTracks.count / total) * 100)
              return (
                <div key={name} style={S.card}>
                  <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 12 }}>{name.toUpperCase()}</div>
                  <div style={S.ratioBar}>
                    <div style={{ height: '100%', width: `${soloPct}%`, background: 'var(--green)', borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ color: 'var(--green)' }}>Solo {soloPct}%</span>
                    <span style={{ color: 'var(--purple)' }}>Feat {100 - soloPct}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginTop: 6 }}>
                    <span>{d.soloTracks.count} titres · {fmtStreams(d.soloTracks.streams)}</span>
                    <span>{d.featTracks.count} titres · {fmtStreams(d.featTracks.streams)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Top 5 titres ── */}
          <div style={S.sectionTitle}>Top 5 titres <span style={S.sectionLine} /></div>
          <div style={{ ...S.grid, gridTemplateColumns: `repeat(${loaded.length}, 1fr)` }}>
            {loaded.map((name, i) => {
              const d     = artistData[name]
              const color = ARTIST_COLORS[i % ARTIST_COLORS.length]
              const top5  = (d.topTracks || []).slice(0, 5)
              return (
                <div key={name} style={S.trackCard}>
                  <div style={{ ...S.trackHdr, borderColor: `${color}33` }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color }}>{name.toUpperCase()}</div>
                  </div>
                  {top5.map((t, j) => (
                    <div key={j} style={S.trackRow}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', width: 14, flexShrink: 0 }}>{j + 1}</div>
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                        {fmtStreams(t.streams)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

        </>)}
      </div>
    </div>
  )
}
