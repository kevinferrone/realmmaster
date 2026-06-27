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
  const imgRef = useRef<HTMLImageElement>(null)
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePts, setMeasurePts] = useState<{ x: number, y: number }[]>([])
  const [measureCur, setMeasureCur] = useState<{ x: number, y: number } | null>(null)

  // Zoom + pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<{ x: number, y: number }>({ x: 0, y: 0 })
  const [grabbing, setGrabbing] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panningRef = useRef(false)
  const panStartRef = useRef<{ mx: number, my: number, px: number, py: number }>({ mx: 0, my: 0, px: 0, py: 0 })
  const panMovedRef = useRef(false)

  // Pins are anchored to the rendered image rectangle so they never move relative to the map
  // when the container resizes (sidebar/scrollbar/layout changes).
  const [contSize, setContSize] = useState({ w: 0, h: 0 })
  const [natSize, setNatSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const update = () => setContSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapImageUrl])

  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth) setNatSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [mapImageUrl])

  function imgRect() {
    const { w: cw, h: ch } = contSize
    const { w: nw, h: nh } = natSize
    if (!cw || !ch || !nw || !nh) return null
    const scale = Math.min(cw / nw, ch / nh)
    const dw = nw * scale, dh = nh * scale
    return { dw, dh, ox: (cw - dw) / 2, oy: (ch - dh) / 2 }
  }

  useEffect(() => { if (token) loadData() }, [token])

  async function loadData() {
    // Load player info
    const pr = await fetch(`/api/player/setup?token=${token}`)
    if (!pr.ok) { setError('Invalid invite link.'); setLoading(false); return }
    const pd = await pr.json()
    setPlayer(pd.player)
    setWorld(pd.world)
    setMapImageUrl(pd.world?.map_image_url || '')

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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={{ ...s.btnSm, ...(measureMode ? { background: 'rgba(201,147,58,0.2)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
              onClick={() => { setMeasureMode(m => !m); setSelectedPin(null); setMeasurePts([]); setMeasureCur(null) }}>
              {measureMode ? '✕ Stop Measuring' : '📏 Measure'}
            </button>
            <a href={`/play/${token}`} style={{ textDecoration: 'none' }}>
              <button style={s.btnSm}>← Back to Chat</button>
            </a>
          </div>
        </nav>

        <div style={s.layout}>
          {/* MAP */}
          <div style={s.mapWrap}>

            {/* Zoom controls */}
            {mapImageUrl && (
              <div style={s.zoomBar}>
                <button style={s.zoomBtn} title="Zoom in"
                  onClick={() => setZoom(z => Math.min(5, +(z + 0.5).toFixed(2)))}>+</button>
                <div style={s.zoomLabel}>{Math.round(zoom * 100)}%</div>
                <button style={s.zoomBtn} title="Zoom out"
                  onClick={() => setZoom(z => { const nz = Math.max(1, +(z - 0.5).toFixed(2)); if (nz === 1) setPan({ x: 0, y: 0 }); return nz })}>−</button>
                <button style={{ ...s.zoomBtn, fontSize: 12 }} title="Reset view"
                  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>⊙</button>
              </div>
            )}

            <div ref={mapRef}
              style={{ ...s.mapContainer, cursor: measureMode ? 'crosshair' : grabbing ? 'grabbing' : 'grab' }}
              onMouseDown={e => {
                if (e.button !== 0 || measureMode) return
                panningRef.current = true
                panMovedRef.current = false
                panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
                setGrabbing(true)
              }}
              onMouseMove={e => {
                if (!panningRef.current) return
                const dx = e.clientX - panStartRef.current.mx
                const dy = e.clientY - panStartRef.current.my
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMovedRef.current = true
                setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy })
              }}
              onMouseUp={() => { panningRef.current = false; setGrabbing(false) }}
              onMouseLeave={() => { panningRef.current = false; setGrabbing(false) }}>

              {/* Pan/zoom transform layer — image + pins move/scale together */}
              <div ref={wrapRef} style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center', transition: panningRef.current ? 'none' : 'transform 0.08s ease-out' }}>
                {mapImageUrl
                  ? <img ref={imgRef} src={mapImageUrl} alt="World Map" style={s.mapImg} draggable={false}
                      onLoad={e => setNatSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a4a30', fontStyle: 'italic' }}>No map available yet.</div>
                }

                {locations.map(loc => {
                  const revealed = isRevealed(loc.id)
                  const isSelected = selectedPin?.id === loc.id
                  const rect = imgRect()
                  const left = rect ? `${rect.ox + (loc.x_percent / 100) * rect.dw}px` : `${loc.x_percent}%`
                  const top = rect ? `${rect.oy + (loc.y_percent / 100) * rect.dh}px` : `${loc.y_percent}%`
                  return (
                    <div key={loc.id}
                      style={{
                        ...s.pin,
                        left,
                        top,
                        transform: `translate(-50%, -100%) scale(${loc.pin_scale ?? 1}) rotate(${loc.pin_rotation ?? 0}deg)`,
                        ...(isSelected ? s.pinSelected : {})
                      }}
                      onClick={e => {
                        if (panMovedRef.current) { panMovedRef.current = false; return }
                        e.stopPropagation()
                        setSelectedPin(loc)
                      }}>
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

              {/* Measure overlay — screen-space, sits above the pan/zoom layer */}
              {measureMode && (
                <div
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const p = { x: e.clientX - r.left, y: e.clientY - r.top }; setMeasurePts([p]); setMeasureCur(p) }}
                  onMouseMove={e => { if (!measurePts.length) return; const r = e.currentTarget.getBoundingClientRect(); setMeasureCur({ x: e.clientX - r.left, y: e.clientY - r.top }) }}
                  onMouseUp={e => { if (e.button !== 0) return; e.stopPropagation(); setMeasurePts([]); setMeasureCur(null) }}
                  onMouseLeave={() => { setMeasurePts([]); setMeasureCur(null) }}
                  onContextMenu={e => { e.preventDefault(); if (measurePts.length && measureCur) setMeasurePts(p => [...p, measureCur]) }}
                  style={{ position: 'absolute', inset: 0, zIndex: 100, cursor: 'crosshair' }}>
                  {measurePts.length > 0 && measureCur && (() => {
                    const pts = [...measurePts, measureCur]
                    let px = 0
                    for (let i = 1; i < pts.length; i++) px += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
                    const ms = parseFloat(world?.map_scale)
                    const milesAcross = ms > 0 ? ms : 100
                    const cont = mapRef.current
                    const img = imgRef.current
                    let dw = cont ? cont.clientWidth : 1
                    if (cont && img && img.naturalWidth) {
                      const sc = Math.min(cont.clientWidth / img.naturalWidth, cont.clientHeight / img.naturalHeight)
                      dw = img.naturalWidth * sc
                    }
                    // dw is the unzoomed contain-fit width; multiply by zoom for on-screen pixels.
                    const miles = Math.round(px * (milesAcross / (dw * zoom)))
                    return (
                      <>
                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                          <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#e8b86d" strokeWidth={2} />
                          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#c04040" />)}
                        </svg>
                        <div style={{ position: 'absolute', left: measureCur.x + 10, top: measureCur.y - 28, background: '#1a1208', color: '#e8b86d', border: '1px solid #c9933a', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                          {miles} mi
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
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
  zoomBar: { position: 'absolute', top: 16, right: 16, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'rgba(13,10,7,0.92)', border: '1px solid rgba(201,147,58,0.3)', borderRadius: 8, padding: 6 },
  zoomBtn: { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#e8b86d', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 6, fontSize: 18, lineHeight: 1, cursor: 'pointer', fontFamily: 'Georgia, serif' },
  zoomLabel: { fontSize: 10, color: '#9a8a70', minWidth: 30, textAlign: 'center', letterSpacing: '0.05em' },
  mapContainer: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  mapImg: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' },
  pin: { position: 'absolute', transform: 'translate(-50%, -100%)', transformOrigin: 'bottom center', cursor: 'pointer', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  pinSelected: { zIndex: 6 },
  pinDot: { width: 12, height: 12, borderRadius: '50%', border: '2px solid' },
  pinLabel: { background: 'rgba(13,10,7,0.85)', border: '1px solid', borderRadius: 4, padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 },
  revealedDot: { color: '#5aaa5a', fontSize: 8 },
  sidebar: { width: 300, borderLeft: '1px solid rgba(201,147,58,0.2)', background: '#0d0a07', overflowY: 'auto', flexShrink: 0 },
  panel: { padding: '1.25rem' },
  panelTitle: { fontSize: 12, letterSpacing: '0.12em', color: '#e8b86d', marginBottom: 12, textTransform: 'uppercase' },
  loreBox: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.15)', borderRadius: 8, padding: '10px 12px', marginTop: 10, maxHeight: 280, overflowY: 'auto', overflowWrap: 'break-word' },
  lockedBox: { background: '#1a1206', border: '1px solid rgba(90,74,48,0.3)', borderRadius: 8, padding: '20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  revealedBadge: { fontSize: 11, color: '#5aaa5a', background: 'rgba(58,122,58,0.1)', border: '1px solid rgba(58,122,58,0.3)', borderRadius: 4, padding: '3px 8px', display: 'inline-block' },
  btnSm: { background: 'transparent', color: '#c9933a', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 5, padding: '4px 10px', fontFamily: 'Georgia, serif', fontSize: 11, cursor: 'pointer' },
}
