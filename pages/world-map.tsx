import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'


export default function PlayerMap() {
  const router = useRouter()
  const { token } = router.query as { token: string }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [player, setPlayer] = useState<any>(null)
  const [world, setWorld] = useState<any>(null)
  const [mapImageUrl, setMapImageUrl] = useState<string>('')
  const [locations, setLocations] = useState<any[]>([])
  const [reveals, setReveals] = useState<any[]>([])
  const [selectedPin, setSelectedPin] = useState<any>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (token) loadData() }, [token])

  async function loadData() {
    // Load player info
    const pr = await fetch(`/api/player/setup?token=${token}`)
    if (!pr.ok) { setError('Invalid invite link.'); setLoading(false); return }
    const pd = await pr.json()
    setPlayer(pd.player)
    setWorld(pd.world)

    // Load world map URL
    const wr = await fetch('/api/dm/worlds', { headers: { 'Content-Type': 'application/json' } })
    const wd = await wr.json()
    const currentWorld = (wd.worlds || []).find((w: any) => w.id === pd.player.world_id)
    setMapImageUrl(currentWorld?.map_image_url || '')

    // Load map locations and reveals
    const mr = await fetch(`/api/dm/map?worldId=${pd.player.world_id}`)
    const md = await mr.json()
    setLocations(md.locations || [])
    setReveals(md.reveals || [])
    setLoading(false)
  }

  function isRevealed(locationId: string) {
    return reveals.some(r => r.location_id === locationId && r.player_id === player?.id)
  }

  function getRevealedLore(locationId: string) {
    if (!isRevealed(locationId)) return null
    return locations.find(l => l.id === locationId)?.lore || null
  }

  if (loading) return <div style={s.center}>✦ Loading map...</div>
  if (error) return <div style={s.center}><p style={{ color: '#c04040' }}>{error}</p></div>

  return (
    <>
      <Head><title>{world?.name || 'World Map'}</title></Head>
      <div style={s.root}>
        <nav style={s.nav}>
          <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span></div>
          <div style={{ fontSize: 13, color: '#c9933a' }}>{world?.name} — World Map</div>
          <a href={`/play/${token}`} style={{ textDecoration: 'none' }}>
            <button style={s.btnSm}>← Back to Chat</button>
          </a>
        </nav>

        <div style={s.layout}>
          {/* MAP */}
          <div style={s.mapWrap}>
            <div ref={mapRef} style={s.mapContainer}>
              {mapImageUrl
                ? <img src={mapImageUrl} alt="World Map" style={s.mapImg} draggable={false} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a4a30', fontStyle: 'italic' }}>No map available yet.</div>
              }

              {locations.map(loc => {
                const revealed = isRevealed(loc.id)
                const isSelected = selectedPin?.id === loc.id
                return (
                  <div key={loc.id}
                    style={{
                      ...s.pin,
                      left: `${loc.x_percent}%`,
                      top: `${loc.y_percent}%`,
                      ...(isSelected ? s.pinSelected : {})
                    }}
                    onClick={e => {
                      e.stopPropagation()
                      setSelectedPin(loc)
                    }}>
                    <div style={{
                      ...s.pinDot,
                      background: revealed ? '#c9933a' : '#5a4a30',
                      borderColor: revealed ? '#f5d49a' : '#7a6a50',
                      boxShadow: revealed ? '0 0 6px rgba(201,147,58,0.6)' : 'none'
                    }} />
                    <div style={{
                      ...s.pinLabel,
                      color: revealed ? '#e8b86d' : '#7a6a50',
                      borderColor: revealed ? 'rgba(201,147,58,0.4)' : 'rgba(120,100,80,0.3)'
                    }}>
                      {loc.name}
                      {revealed && <span style={s.revealedDot}>●</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* SIDEBAR */}
          <div style={s.sidebar}>
            {selectedPin ? (
              <div style={s.panel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={s.panelTitle}>📍 {selectedPin.name}</div>
                  <button style={s.btnSm} onClick={() => setSelectedPin(null)}>✕</button>
                </div>

                {isRevealed(selectedPin.id) ? (
                  <div>
                    <div style={s.revealedBadge}>✓ Known to your character</div>
                    <div style={s.loreBox}>
                      <p style={{ fontSize: 13, color: '#b8a888', lineHeight: 1.7 }}>
                        {getRevealedLore(selectedPin.id) || 'No lore recorded for this location.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={s.lockedBox}>
                    <div style={{ fontSize: 20, marginBottom: 8 }}>🔒</div>
                    <p style={{ fontSize: 13, color: '#5a4a30', fontStyle: 'italic', textAlign: 'center' as any }}>
                      Your character has not yet learned about this location.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={s.panel}>
                <div style={s.panelTitle}>🗺 {world?.name}</div>
                <p style={{ fontSize: 13, color: '#7a6a50', fontStyle: 'italic', marginBottom: 14 }}>
                  Click any pin to view what your character knows about that location.
                </p>
                <div style={{ fontSize: 11, color: '#7a6a50', textTransform: 'uppercase' as any, letterSpacing: '0.1em', marginBottom: 8 }}>
                  Locations ({locations.length})
                </div>
                {locations.map(loc => {
                  const revealed = isRevealed(loc.id)
                  return (
                    <div key={loc.id}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(201,147,58,0.08)', cursor: 'pointer' }}
                      onClick={() => setSelectedPin(loc)}>
                      <span style={{ fontSize: 13, color: revealed ? '#e8dcc8' : '#5a4a30' }}>{loc.name}</span>
                      {revealed
                        ? <span style={{ fontSize: 10, color: '#5aaa5a' }}>Known</span>
                        : <span style={{ fontSize: 10, color: '#5a4a30' }}>🔒</span>
                      }
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { background: '#0d0a07', minHeight: '100vh', color: '#e8dcc8', fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column' },
  center: { background: '#0d0a07', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9933a', fontSize: 18 },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60, borderBottom: '1px solid rgba(201,147,58,0.2)', background: 'rgba(13,10,7,0.95)', position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 },
  logo: { fontSize: 20, fontWeight: 700, color: '#e8b86d' },
  layout: { display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 60px)' },
  mapWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  mapContainer: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  mapImg: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' },
  pin: { position: 'absolute', transform: 'translate(-50%, -100%)', cursor: 'pointer', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  pinSelected: { zIndex: 6 },
  pinDot: { width: 12, height: 12, borderRadius: '50%', border: '2px solid' },
  pinLabel: { background: 'rgba(13,10,7,0.85)', border: '1px solid', borderRadius: 4, padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 },
  revealedDot: { color: '#5aaa5a', fontSize: 8 },
  sidebar: { width: 300, borderLeft: '1px solid rgba(201,147,58,0.2)', background: '#0d0a07', overflowY: 'auto', flexShrink: 0 },
  panel: { padding: '1.25rem' },
  panelTitle: { fontSize: 12, letterSpacing: '0.12em', color: '#e8b86d', marginBottom: 12, textTransform: 'uppercase' },
  loreBox: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.15)', borderRadius: 8, padding: '10px 12px', marginTop: 10 },
  lockedBox: { background: '#1a1206', border: '1px solid rgba(90,74,48,0.3)', borderRadius: 8, padding: '20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  revealedBadge: { fontSize: 11, color: '#5aaa5a', background: 'rgba(58,122,58,0.1)', border: '1px solid rgba(58,122,58,0.3)', borderRadius: 4, padding: '3px 8px', display: 'inline-block' },
  btnSm: { background: 'transparent', color: '#c9933a', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 5, padding: '4px 10px', fontFamily: 'Georgia, serif', fontSize: 11, cursor: 'pointer' },
}
