import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { getSupabaseBrowser } from '../lib/supabase'


function useAuth() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  return { session, loading }
}

export default function MapPage() {
  const { session, loading } = useAuth()
  const [worldId, setWorldId] = useState<string | null>(null)
  const [worlds, setWorlds] = useState<any[]>([])
  const [mapImageUrl, setMapImageUrl] = useState<string>('')
  const [locations, setLocations] = useState<any[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 })
  const [reveals, setReveals] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [parties, setParties] = useState<any[]>([])
  

  const [selectedPin, setSelectedPin] = useState<any>(null)
  const [addingPin, setAddingPin] = useState(false)
  const [newPinPos, setNewPinPos] = useState<{ x: number, y: number } | null>(null)
  const [newPinName, setNewPinName] = useState('')
  const [newPinLore, setNewPinLore] = useState('')
  const [editingPin, setEditingPin] = useState(false)
  const [editName, setEditName] = useState('')
  const [editLore, setEditLore] = useState('')

  const [revealTarget, setRevealTarget] = useState<'player' | 'party'>('player')
  const [revealPlayer, setRevealPlayer] = useState('')
  const [revealParty, setRevealParty] = useState('')
  const [revealMsg, setRevealMsg] = useState('')

  // Location builder chat state
  const [canonText, setCanonText] = useState('')
  const [locMessages, setLocMessages] = useState<{role:string,content:string}[]>([])
  const [locInput, setLocInput] = useState('')
  const [locLoading, setLocLoading] = useState(false)
  const [locLastExchange, setLocLastExchange] = useState<{user:string,assistant:string}|null>(null)
  const [locPinLore, setLocPinLore] = useState('')
  const [locExtracting, setLocExtracting] = useState(false)
  const [locCanonPreview, setLocCanonPreview] = useState<any[]|null>(null)
  const [locCanonPreviewLoading, setLocCanonPreviewLoading] = useState(false)
  const [locCanonSaving, setLocCanonSaving] = useState(false)
  const [locCanonMsg, setLocCanonMsg] = useState('')
  const [locExists, setLocExists] = useState(false)

  const mapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragHappenedRef = useRef(false)
  const isDM = !!session

  const token = session?.access_token
  const authH = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {} as any

  useEffect(() => { if (session) loadWorlds() }, [session])
  useEffect(() => { if (worldId) { loadMap(); if (isDM) { loadPlayers(); loadParties() } } }, [worldId])
  
  const [mapScale, setMapScale] = useState('')          // miles across the full map width
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePts, setMeasurePts] = useState<{ x: number, y: number }[]>([])
  const [measureCur, setMeasureCur] = useState<{ x: number, y: number } | null>(null)
  const [mapGuideMsg, setMapGuideMsg] = useState('')

  // Zoom + pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<{ x: number, y: number }>({ x: 0, y: 0 })
  const [grabbing, setGrabbing] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panningRef = useRef(false)
  const panStartRef = useRef<{ mx: number, my: number, px: number, py: number }>({ mx: 0, my: 0, px: 0, py: 0 })
  const panMovedRef = useRef(false)

  useEffect(() => {
    const w = worlds.find((x: any) => x.id === worldId)
    setMapScale(w?.map_scale || '')
  }, [worldId, worlds])

  async function saveScale() {
    if (!worldId) return
    const r = await fetch('/api/dm/worlds', { method: 'PATCH', headers: authH, body: JSON.stringify({ worldId, mapScale }) })
    setMapGuideMsg(r.ok ? '✓ Scale saved.' : 'Save failed.')
  }

  async function loadWorlds() {
    const r = await fetch('/api/dm/worlds', { headers: authH })
    const d = await r.json()
    setWorlds(d.worlds || [])
    if (d.worlds?.length) {
      const params = new URLSearchParams(window.location.search)
      const requestedId = params.get('worldId')
      const target = requestedId ? d.worlds.find((w: any) => w.id === requestedId) : d.worlds[0]
      const w = target || d.worlds[0]
      setWorldId(w.id)
      setMapImageUrl(w.map_image_url || '')
      setCanonText(w.canon_text || '')
    }
  }

  async function loadMap() {
    if (!worldId) return
    const r = await fetch(`/api/dm/map?worldId=${worldId}`)
    const d = await r.json()
    setLocations(d.locations || [])
    setReveals(d.reveals || [])
  }

  async function loadPlayers() {
    if (!worldId) return
    const r = await fetch(`/api/dm/players?worldId=${worldId}`, { headers: authH })
    const d = await r.json()
    setPlayers(d.players || [])
  }

  async function loadParties() {
    if (!worldId) return
    const r = await fetch(`/api/dm/parties?worldId=${worldId}`, { headers: authH })
    const d = await r.json()
    setParties(d.parties || [])
  }

  function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    // Ignore the click that ends a pan-drag so it doesn't close the open pin.
    if (panMovedRef.current) { panMovedRef.current = false; return }
    if (addingPin) {
      const rect = mapRef.current!.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setNewPinPos({ x, y })
      setNewPinName('')
      setNewPinLore('')
      setLocMessages([])
      setLocInput('')
      setLocLastExchange(null)
      setLocPinLore('')
      setLocCanonPreview(null)
      setLocCanonMsg('')
      setLocExists(false)
    } else {
      // Click on map background — close any open pin
      setSelectedPin(null)
      setEditingPin(false)
    }
  }

  async function sendLocMessage() {
    if (!locInput.trim() || !newPinName.trim() || locLoading) return
    const userMsg = locInput.trim()
    setLocInput('')
    setLocLoading(true)
    const newHistory = [...locMessages, { role: 'user', content: userMsg }]
    setLocMessages(newHistory)
    const r = await fetch('/api/dm/location-builder', {
      method: 'POST', headers: authH,
      body: JSON.stringify({ worldId, locationName: newPinName, message: userMsg, history: locMessages })
    })
    const d = await r.json()
    if (d.reply) {
      setLocMessages([...newHistory, { role: 'assistant', content: d.reply }])
      setLocLastExchange({ user: userMsg, assistant: d.reply })
      setLocExists(d.locationExists || false)
    }
    setLocLoading(false)
  }

  async function extractPinLore() {
    if (locMessages.length === 0 || !newPinName.trim()) return
    setLocExtracting(true)
    const r = await fetch('/api/dm/location-builder', {
      method: 'POST', headers: authH,
      body: JSON.stringify({ worldId, locationName: newPinName, action: 'extract', history: locMessages })
    })
    const d = await r.json()
    if (d.pinLore) setLocPinLore(d.pinLore)
    else setLocPinLore('')
    setLocExtracting(false)
  }

  async function previewLocCanon() {
    if (!locLastExchange || !worldId) return
    setLocCanonPreviewLoading(true)
    setLocCanonPreview(null)
    const r = await fetch('/api/dm/commit-lore', {
      method: 'POST', headers: authH,
      body: JSON.stringify({
        worldId,
        lastUserMessage: locLastExchange.user,
        lastAssistantMessage: locLastExchange.assistant
      })
    })
    const d = await r.json()
    if (d.preview) setLocCanonPreview(d.preview)
    setLocCanonPreviewLoading(false)
  }

  async function saveLocCanon() {
    if (!locCanonPreview || !worldId) return
    setLocCanonSaving(true)
    const r = await fetch('/api/dm/commit-lore', {
      method: 'POST', headers: authH,
      body: JSON.stringify({ worldId, action: 'save', previewData: locCanonPreview })
    })
    const d = await r.json()
    if (d.success) {
      setCanonText(d.canonText)
      setLocCanonMsg('✓ Committed to world canon!')
      setLocCanonPreview(null)
    }
    setLocCanonSaving(false)
  }

  async function saveNewPin() {
    if (!newPinName.trim() || !newPinPos || !worldId) return
    const r = await fetch('/api/dm/map', {
      method: 'POST', headers: authH,
      body: JSON.stringify({ worldId, name: newPinName, lore: locPinLore || '', xPercent: newPinPos.x, yPercent: newPinPos.y })
    })
    const d = await r.json()
    if (d.location) {
      setLocations(prev => [...prev, d.location])
      setNewPinPos(null)
      setAddingPin(false)
    }
  }

  async function saveEditPin() {
    if (!selectedPin) return
    await fetch('/api/dm/map', {
      method: 'PATCH', headers: authH,
      body: JSON.stringify({ locationId: selectedPin.id, name: editName, lore: editLore })
    })
    setLocations(prev => prev.map(l => l.id === selectedPin.id ? { ...l, name: editName, lore: editLore } : l))
    setSelectedPin({ ...selectedPin, name: editName, lore: editLore })
    setEditingPin(false)
  }

  // Pin appearance (size + rotation). Update locally for instant preview, persist on release.
  function previewPinStyle(scale: number, rotation: number) {
    if (!selectedPin) return
    setLocations(prev => prev.map(l => l.id === selectedPin.id ? { ...l, pin_scale: scale, pin_rotation: rotation } : l))
    setSelectedPin((p: any) => p ? { ...p, pin_scale: scale, pin_rotation: rotation } : p)
  }
  async function savePinStyle(scale: number, rotation: number) {
    if (!selectedPin) return
    await fetch('/api/dm/map', {
      method: 'PATCH', headers: authH,
      body: JSON.stringify({ locationId: selectedPin.id, pinScale: scale, pinRotation: rotation })
    })
  }

  async function deletePin() {
    if (!selectedPin || !confirm('Delete this location?')) return
    await fetch('/api/dm/map', {
      method: 'DELETE', headers: authH,
      body: JSON.stringify({ locationId: selectedPin.id })
    })
    setLocations(prev => prev.filter(l => l.id !== selectedPin.id))
    setSelectedPin(null)
  }

  async function revealLore() {
    if (!selectedPin) return
    setRevealMsg('')
    const body: any = { locationId: selectedPin.id }
    if (revealTarget === 'player' && revealPlayer) body.playerId = revealPlayer
    else if (revealTarget === 'party' && revealParty) body.partyId = revealParty
    else { setRevealMsg('Select a player or party.'); return }

    const r = await fetch('/api/dm/reveal', { method: 'POST', headers: authH, body: JSON.stringify(body) })
    const d = await r.json()
    if (d.success) {
      setRevealMsg(`✓ Revealed to ${d.revealedTo} character${d.revealedTo > 1 ? 's' : ''}`)
      await loadMap()
    } else {
      setRevealMsg('Error: ' + d.error)
    }
  }

  function isPinRevealed(locationId: string, playerId: string) {
    return reveals.some(r => r.location_id === locationId && r.player_id === playerId)
  }

  function getRevealedPlayerCount(locationId: string) {
    return reveals.filter(r => r.location_id === locationId).length
  }

  if (loading) return <div style={s.center}>✦ Loading map...</div>
  if (!session) return <div style={s.center}><p style={{ color: '#c04040' }}>Sign in to the DM portal to access the map.</p></div>

  return (
    <>
      <Head><title>Sorasula — World Map</title></Head>
      <div style={s.root}>
        <nav style={s.nav}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span></div>
          </a>
          <div style={{ display: 'flex', gap: 3 }}>
            {[
              { tab: 'worlds', label: '🌍 Worlds' },
              { tab: 'players', label: '🧙 Players' },
              { tab: 'knowledge', label: '🧠 Knowledge' },
              { tab: 'renown', label: '⭐ Renown' },
              { tab: 'logs', label: '📋 Logs' },
            ].map(t => (
              <a key={t.tab} href={`/?tab=${t.tab}${worldId ? `&worldId=${worldId}` : ''}`} style={{ textDecoration: 'none' }}>
                <button style={s.navTab}>{t.label}</button>
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {worlds.length > 1 && (
              <select style={{ ...s.select, margin: 0, fontSize: 11, padding: '3px 8px' }} value={worldId || ''} onChange={e => {
                const w = worlds.find((x: any) => x.id === e.target.value)
                if (!w) return
                setWorldId(w.id)
                setMapImageUrl(w.map_image_url || '')
                setCanonText(w.canon_text || '')
                setSelectedPin(null)
                setEditingPin(false)
                setNewPinPos(null)
                setAddingPin(false)
                setLocMessages([])
                setLocInput('')
                setLocLastExchange(null)
                setLocPinLore('')
                setLocCanonPreview(null)
                setLocCanonMsg('')
              }}>
                {worlds.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <button
              style={{ ...s.btnSm, ...(addingPin ? { background: 'rgba(201,147,58,0.2)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
              onClick={() => { setAddingPin(!addingPin); setNewPinPos(null); setSelectedPin(null) }}>
              {addingPin ? '✕ Cancel' : '+ Add Pin'}
            </button>
                        <a href="/dm/chronicle" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <button style={s.btnSm}>📜 Chronicle</button>
            </a>
            <a href="/dm/gm-chat" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <button style={s.btnSm}>🔮 GM Assistant</button>
            </a>
            <button style={s.btnSm} onClick={() => getSupabaseBrowser().auth.signOut()}>Sign Out</button>
          </div>
        </nav>
        
        {isDM && mapImageUrl && (
          <div style={{ margin: '12px 16px', padding: '10px 14px', background: '#1a1206', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={{ ...s.btnSm, ...(measureMode ? { background: 'rgba(201,147,58,0.2)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
              onClick={() => { setMeasureMode(m => !m); setAddingPin(false); setSelectedPin(null); setMeasurePts([]); setMeasureCur(null) }}>
              {measureMode ? '✕ Stop Measuring' : '📏 Measure'}
            </button>
            <label style={{ fontSize: 11, color: '#7a6a50' }}>Miles across full map width:</label>
            <input style={{ ...s.select, width: 90, margin: 0 }} value={mapScale} onChange={e => setMapScale(e.target.value)} placeholder="e.g. 800" />
            <button style={s.btnSm} onClick={saveScale}>💾 Save</button>
            {measureMode && <span style={{ fontSize: 12, color: '#7a6a50' }}>Click-drag on the map. Right-click adds a bend. Release to clear.</span>}
            {mapGuideMsg && <span style={{ fontSize: 12, color: mapGuideMsg.startsWith('✓') ? '#5aaa5a' : '#c04040' }}>{mapGuideMsg}</span>}
          </div>
        )}

        <div style={s.layout}>
          {/* MAP */}
          <div style={s.mapWrap}>
            {addingPin && (
              <div style={s.addingBanner}>Click anywhere on the map to place a pin</div>
            )}

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
              style={{ ...s.mapContainer, cursor: addingPin ? 'crosshair' : measureMode ? 'crosshair' : (draggingId || grabbing) ? 'grabbing' : 'grab' }}
              onClick={handleMapClick}
              onMouseDown={e => {
                if (e.button !== 0 || addingPin || measureMode || draggingId) return
                panningRef.current = true
                panMovedRef.current = false
                panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
                setGrabbing(true)
              }}
              onMouseMove={e => {
                if (draggingId && wrapRef.current) {
                  dragHappenedRef.current = true
                  const rect = wrapRef.current.getBoundingClientRect()
                  const x = Math.min(100, Math.max(0, ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100))
                  const y = Math.min(100, Math.max(0, ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100))
                  setLocations(prev => prev.map(l => l.id === draggingId ? { ...l, x_percent: x, y_percent: y } : l))
                  return
                }
                if (panningRef.current) {
                  const dx = e.clientX - panStartRef.current.mx
                  const dy = e.clientY - panStartRef.current.my
                  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMovedRef.current = true
                  setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy })
                }
              }}
              onMouseUp={async e => {
                if (draggingId && wrapRef.current) {
                  const rect = wrapRef.current.getBoundingClientRect()
                  const x = Math.min(100, Math.max(0, ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100))
                  const y = Math.min(100, Math.max(0, ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100))
                  await fetch('/api/dm/map', {
                    method: 'PATCH', headers: authH,
                    body: JSON.stringify({ locationId: draggingId, xPercent: x, yPercent: y })
                  })
                  setDraggingId(null)
                  return
                }
                panningRef.current = false
                setGrabbing(false)
              }}
              onMouseLeave={() => { setDraggingId(null); panningRef.current = false; setGrabbing(false) }}>

              {/* Pan/zoom transform layer — image + pins move/scale together */}
              <div ref={wrapRef} style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center', transition: panningRef.current ? 'none' : 'transform 0.08s ease-out' }}>
                {mapImageUrl
                  ? <img ref={imgRef} src={mapImageUrl} alt="World Map" style={s.mapImg} draggable={false} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a4a30', fontStyle: 'italic' }}>No map image set. Add a map URL in the World tab.</div>
                }

                {/* Existing pins */}
                {locations.map(loc => {
                  const revealCount = getRevealedPlayerCount(loc.id)
                  const isSelected = selectedPin?.id === loc.id
                  const isDragging = draggingId === loc.id
                  return (
                    <div key={loc.id}
                      style={{
                        ...s.pin,
                        left: `${loc.x_percent}%`,
                        top: `${loc.y_percent}%`,
                        transform: `translate(-50%, -100%) scale(${loc.pin_scale ?? 1}) rotate(${loc.pin_rotation ?? 0}deg)`,
                        ...(isSelected ? s.pinSelected : {}),
                        ...(isDragging ? { opacity: 0.7, cursor: 'grabbing' } : { cursor: 'grab' })
                      }}
                      onClick={e => {
                        if (dragHappenedRef.current) return
                        e.stopPropagation()
                        if (selectedPin?.id === loc.id) {
                          setSelectedPin(null)
                          setEditingPin(false)
                        } else {
                          setSelectedPin(loc)
                          setEditingPin(false)
                          setEditName(loc.name)
                          setEditLore(loc.lore || '')
                          setRevealMsg('')
                          setNewPinPos(null)
                        }
                      }}
                      onMouseDown={e => {
                        if (addingPin) return
                        e.stopPropagation()
                        e.preventDefault()
                        dragHappenedRef.current = false
                        const rect = wrapRef.current!.getBoundingClientRect()
                        const pinX = (loc.x_percent / 100) * rect.width
                        const pinY = (loc.y_percent / 100) * rect.height
                        setDragOffset({
                          x: e.clientX - rect.left - pinX,
                          y: e.clientY - rect.top - pinY
                        })
                        setDraggingId(loc.id)
                      }}>
                      <div style={s.pinDot} />
                      <div style={s.pinLabel}>
                        {loc.name}
                        {revealCount > 0 && <span style={s.revealBadge}>{revealCount}</span>}
                      </div>
                    </div>
                  )
                })}

                {/* New pin placement */}
                {newPinPos && (
                  <div style={{ ...s.pin, left: `${newPinPos.x}%`, top: `${newPinPos.y}%` }}>
                    <div style={{ ...s.pinDot, background: '#5aaa5a' }} />
                    <div style={{ ...s.pinLabel, color: '#5aaa5a' }}>New pin</div>
                  </div>
                )}
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
                    const milesAcross = parseFloat(mapScale)
                    const cont = mapRef.current
                    const img = imgRef.current
                    let dw = cont ? cont.clientWidth : 1
                    if (cont && img && img.naturalWidth) {
                      const sc = Math.min(cont.clientWidth / img.naturalWidth, cont.clientHeight / img.naturalHeight)
                      dw = img.naturalWidth * sc
                    }
                    // dw is the unzoomed contain-fit width; multiply by zoom for on-screen pixels.
                    const miles = milesAcross > 0 ? Math.round(px * (milesAcross / (dw * zoom))) : null
                    return (
                      <>
                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                          <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#e8b86d" strokeWidth={2} />
                          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#c04040" />)}
                        </svg>
                        <div style={{ position: 'absolute', left: measureCur.x + 10, top: measureCur.y - 28, background: '#1a1208', color: '#e8b86d', border: '1px solid #c9933a', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                          {miles !== null ? `${miles} mi` : 'set scale first'}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* SIDEBAR */}
          <div style={{ ...s.sidebar, width: newPinPos ? 380 : 300 }}>

            {/* New pin form — Peekaboo chat */}
            {newPinPos && (
              <div style={s.panel}>
                <div style={s.panelTitle}>📍 New Location</div>

                {/* Name input + canon indicator */}
                <input style={s.input} value={newPinName}
                  onChange={e => { setNewPinName(e.target.value); setLocMessages([]); setLocLastExchange(null); setLocPinLore(''); setLocCanonPreview(null); setLocCanonMsg(''); setLocExists(false) }}
                  placeholder="Location name" autoFocus />
                {newPinName.length > 2 && canonText && (
                  <div style={{ fontSize: 11, marginBottom: 8, marginTop: -6 }}>
                    {canonText.toLowerCase().includes(newPinName.toLowerCase())
                      ? <span style={{ color: '#c9933a' }}>📜 Found in canon — Peekaboo will work within established lore</span>
                      : <span style={{ color: '#5a4a30' }}>✦ New location — Peekaboo will help you build it</span>
                    }
                  </div>
                )}

                {/* Peekaboo chat */}
                <div style={{ background: '#0d0a07', border: '1px solid rgba(201,147,58,0.18)', borderRadius: 8, display: 'flex', flexDirection: 'column' as any, height: 260, marginBottom: 10 }}>
                  <div style={{ flex: 1, overflowY: 'auto' as any, display: 'flex', flexDirection: 'column' as any, gap: 8, padding: '10px 10px 8px' }}>
                    {locMessages.length === 0 && (
                      <p style={{ fontSize: 12, color: '#5a4a30', fontStyle: 'italic', textAlign: 'center' as any, padding: '20px 4px' }}>
                        Tell Peekaboo about this location, or ask him to pull in information about this location from your existing world canon.
                      </p>
                    )}
                    {locMessages.map((m, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, flexDirection: m.role === 'user' ? 'row-reverse' as any : 'row' as any, alignItems: 'flex-start' }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, background: m.role === 'user' ? 'rgba(201,147,58,0.15)' : 'rgba(224,96,154,0.15)', border: `1px solid ${m.role === 'user' ? 'rgba(201,147,58,0.3)' : 'rgba(224,96,154,0.4)'}`, color: m.role === 'user' ? '#e8b86d' : '#e0609a' }}>
                          {m.role === 'user' ? 'DM' : 'PB'}
                        </div>
                        <div style={{ maxWidth: '85%', padding: '7px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, background: m.role === 'user' ? 'rgba(201,147,58,0.09)' : '#1a1206', border: `1px solid ${m.role === 'user' ? 'rgba(201,147,58,0.2)' : 'rgba(224,96,154,0.15)'}`, color: '#e8dcc8', whiteSpace: 'pre-wrap' as any }}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {locLoading && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, background: 'rgba(224,96,154,0.15)', border: '1px solid rgba(224,96,154,0.4)', color: '#e0609a' }}>PB</div>
                        <div style={{ padding: '7px 10px', borderRadius: 8, fontSize: 12, background: '#1a1206', border: '1px solid rgba(224,96,154,0.15)', color: '#5a4a30', fontStyle: 'italic' }}>Thinking...</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: '0 8px 8px', borderTop: '1px solid rgba(201,147,58,0.1)', paddingTop: 8 }}>
                    <textarea
                      style={{ ...s.input, margin: 0, flex: 1, height: 36, resize: 'none' as any, fontSize: 12, padding: '8px 10px' }}
                      value={locInput}
                      onChange={e => setLocInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendLocMessage() } }}
                      placeholder={newPinName.trim() ? `Tell Peekaboo about ${newPinName}...` : 'Enter a location name first...'}
                      disabled={locLoading || !newPinName.trim()}
                    />
                    <button style={{ ...s.btnSm, padding: '0 10px', height: 36 }} onClick={sendLocMessage} disabled={locLoading || !newPinName.trim() || !locInput.trim()}>➤</button>
                  </div>
                </div>

                {/* Pin lore extraction */}
                {locMessages.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: '#7a6a50', textTransform: 'uppercase' as any, letterSpacing: '0.1em' }}>Pin Lore (shown to players)</div>
                      <button style={s.btnSm} onClick={extractPinLore} disabled={locExtracting}>
                        {locExtracting ? '...' : '⟳ Extract'}
                      </button>
                    </div>
                    <textarea
                      style={{ ...s.input, height: 72, resize: 'vertical' as any, fontSize: 12, margin: 0, fontStyle: locPinLore ? 'normal' : 'italic' }}
                      value={locPinLore}
                      onChange={e => setLocPinLore(e.target.value)}
                      placeholder="Click ⟳ Extract to generate lore from chat, or type it directly..."
                    />
                  </div>
                )}

                {/* Canon commit section */}
                {locLastExchange && (
                  <div style={{ marginBottom: 10 }}>
                    <button style={{ ...s.btnSm, width: '100%', marginBottom: 6, textAlign: 'center' as any }}
                      onClick={previewLocCanon} disabled={locCanonPreviewLoading}>
                      {locCanonPreviewLoading ? 'Extracting lore...' : '📋 Preview Canon Commit'}
                    </button>
                    {locCanonPreview && locCanonPreview.length > 0 && (
                      <div style={{ background: '#1a1206', border: '1px solid rgba(201,147,58,0.18)', borderRadius: 8, padding: '10px 12px', marginBottom: 6 }}>
                        {locCanonPreview.map((entry: any, i: number) => (
                          <div key={i} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: '#c9933a', letterSpacing: '0.1em', textTransform: 'uppercase' as any, marginBottom: 4 }}>
                              {entry.section.replace('## ', '')}
                            </div>
                            <textarea
                              style={{ ...s.input, height: 60, resize: 'vertical' as any, fontSize: 11, fontFamily: 'monospace', margin: 0 }}
                              value={entry.content}
                              onChange={e => setLocCanonPreview((prev: any) => prev.map((p: any, pi: number) => pi === i ? { ...p, content: e.target.value } : p))}
                            />
                          </div>
                        ))}
                        <button style={{ ...s.btnPrimary, fontSize: 11, padding: '8px 14px' }} onClick={saveLocCanon} disabled={locCanonSaving}>
                          {locCanonSaving ? 'Committing...' : '✨ Commit to World Canon'}
                        </button>
                      </div>
                    )}
                    {locCanonPreview && locCanonPreview.length === 0 && (
                      <p style={{ fontSize: 11, color: '#c04040', fontStyle: 'italic' }}>No concrete lore found. Keep chatting and try again.</p>
                    )}
                    {locCanonMsg && <p style={{ fontSize: 12, color: '#5aaa5a', marginTop: 4 }}>{locCanonMsg}</p>}
                  </div>
                )}

                {/* Save / Cancel */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnPrimary} onClick={saveNewPin} disabled={!newPinName.trim()}>Save Pin</button>
                  <button style={s.btnSm} onClick={() => { setNewPinPos(null); setAddingPin(false) }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Selected pin */}
            {selectedPin && !newPinPos && (
              <div style={s.panel}>
                {editingPin ? (
                  <>
                    <div style={s.panelTitle}>✏️ Edit Location</div>
                    <input style={s.input} value={editName} onChange={e => setEditName(e.target.value)} />
                    <textarea style={{ ...s.input, height: 100, resize: 'vertical' as any }} value={editLore} onChange={e => setEditLore(e.target.value)} placeholder="Location lore..." />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={s.btnPrimary} onClick={saveEditPin}>Save</button>
                      <button style={s.btnSm} onClick={() => setEditingPin(false)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ ...s.panelTitle, cursor: 'pointer' }} title="Click to close" onClick={() => { setSelectedPin(null); setEditingPin(false) }}>📍 {selectedPin.name}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={s.btnSm} onClick={() => setEditingPin(true)}>Edit</button>
                        <button style={{ ...s.btnSm, color: '#c04040', borderColor: '#8b2020' }} onClick={deletePin}>✕</button>
                      </div>
                    </div>

                    <div style={s.loreBox}>
                      {selectedPin.lore
                        ? <p style={{ fontSize: 13, color: '#b8a888', lineHeight: 1.7 }}>{selectedPin.lore}</p>
                        : <p style={{ fontSize: 13, color: '#5a4a30', fontStyle: 'italic' }}>No lore added yet.</p>
                      }
                    </div>

                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(201,147,58,0.15)', paddingTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ ...s.panelTitle, marginBottom: 0 }}>🎚 Pin Appearance</div>
                        <button style={s.btnSm} onClick={() => { previewPinStyle(1, 0); savePinStyle(1, 0) }}>Reset</button>
                      </div>
                      <label style={{ fontSize: 11, color: '#7a6a50', display: 'block', marginBottom: 4 }}>
                        Size — {Math.round((selectedPin.pin_scale ?? 1) * 100)}%
                      </label>
                      <input type="range" min={0.5} max={3} step={0.1}
                        value={selectedPin.pin_scale ?? 1}
                        onChange={e => previewPinStyle(parseFloat(e.target.value), selectedPin.pin_rotation ?? 0)}
                        onMouseUp={e => savePinStyle(parseFloat((e.target as HTMLInputElement).value), selectedPin.pin_rotation ?? 0)}
                        onTouchEnd={e => savePinStyle(parseFloat((e.target as HTMLInputElement).value), selectedPin.pin_rotation ?? 0)}
                        style={{ width: '100%', marginBottom: 14, accentColor: '#c9933a' }} />
                      <label style={{ fontSize: 11, color: '#7a6a50', display: 'block', marginBottom: 4 }}>
                        Rotation — {Math.round(selectedPin.pin_rotation ?? 0)}°
                      </label>
                      <input type="range" min={-180} max={180} step={5}
                        value={selectedPin.pin_rotation ?? 0}
                        onChange={e => previewPinStyle(selectedPin.pin_scale ?? 1, parseFloat(e.target.value))}
                        onMouseUp={e => savePinStyle(selectedPin.pin_scale ?? 1, parseFloat((e.target as HTMLInputElement).value))}
                        onTouchEnd={e => savePinStyle(selectedPin.pin_scale ?? 1, parseFloat((e.target as HTMLInputElement).value))}
                        style={{ width: '100%', accentColor: '#c9933a' }} />
                    </div>

                                        <div style={{ marginTop: 14, borderTop: '1px solid rgba(201,147,58,0.15)', paddingTop: 14 }}>
                      <div style={s.panelTitle}>🔓 Reveal Lore To</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <button style={{ ...s.btnSm, ...(revealTarget === 'player' ? { background: 'rgba(201,147,58,0.15)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
                          onClick={() => setRevealTarget('player')}>Player</button>
                        <button style={{ ...s.btnSm, ...(revealTarget === 'party' ? { background: 'rgba(201,147,58,0.15)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
                          onClick={() => setRevealTarget('party')}>Party</button>
                      </div>

                      {revealTarget === 'player' && (
                        <select style={s.select} value={revealPlayer} onChange={e => setRevealPlayer(e.target.value)}>
                          <option value="">Select player...</option>
                          {players.map(p => {
                            const revealed = isPinRevealed(selectedPin.id, p.id)
                            return <option key={p.id} value={p.id}>{p.character_name || p.name}{revealed ? ' ✓' : ''}</option>
                          })}
                        </select>
                      )}

                      {revealTarget === 'party' && (
                        <select style={s.select} value={revealParty} onChange={e => setRevealParty(e.target.value)}>
                          <option value="">Select party...</option>
                          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}

                      <button style={s.btnPrimary} onClick={revealLore} disabled={!selectedPin.lore}>
                        🔓 Reveal Lore
                      </button>
                      {!selectedPin.lore && <p style={{ fontSize: 11, color: '#5a4a30', fontStyle: 'italic', marginTop: 4 }}>Add lore to this pin before revealing.</p>}
                      {revealMsg && <p style={{ fontSize: 13, color: revealMsg.startsWith('✓') ? '#5aaa5a' : '#c04040', marginTop: 8 }}>{revealMsg}</p>}

                      {reveals.filter(r => r.location_id === selectedPin.id).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 11, color: '#7a6a50', textTransform: 'uppercase' as any, letterSpacing: '0.1em', marginBottom: 6 }}>Revealed To</div>
                          {players.filter(p => isPinRevealed(selectedPin.id, p.id)).map(p => (
                            <div key={p.id} style={{ fontSize: 12, color: '#5aaa5a', marginBottom: 3 }}>✓ {p.character_name || p.name}</div>
                          ))}
                        </div>
                      )}
                    </div>

                  </>
                )}
              </div>
            )}

            {/* Location list — always visible when not placing a new pin */}
            {!newPinPos && (
              <div style={s.panel}>
                <div style={s.panelTitle}>🗺 {selectedPin ? 'All Locations' : 'World Map'}</div>
                {!selectedPin && (
                  <p style={{ fontSize: 13, color: '#7a6a50', fontStyle: 'italic', marginBottom: 10 }}>
                    {addingPin ? 'Click on the map to place a pin.' : 'Click a pin or name below to view its lore. Click again or click the map to close.'}
                  </p>
                )}
                <div style={{ marginTop: selectedPin ? 0 : 4 }}>
                  <div style={{ fontSize: 11, color: '#7a6a50', textTransform: 'uppercase' as any, letterSpacing: '0.1em', marginBottom: 8 }}>All Locations ({locations.length})</div>
                  {locations.length === 0 && <p style={{ fontSize: 13, color: '#5a4a30', fontStyle: 'italic' }}>No locations yet. Use "+ Add Pin" to place locations on the map.</p>}
                  {locations.map(loc => (
                    <div key={loc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(201,147,58,0.08)', cursor: 'pointer', fontSize: 13 }}
                      onClick={() => {
                        if (selectedPin?.id === loc.id) {
                          setSelectedPin(null)
                          setEditingPin(false)
                        } else {
                          setSelectedPin(loc); setEditName(loc.name); setEditLore(loc.lore || ''); setRevealMsg('')
                        }
                      }}>
                      <span style={{ color: selectedPin?.id === loc.id ? '#c9933a' : '#e8dcc8' }}>{loc.name}</span>
                      <span style={{ color: '#5a4a30', fontSize: 11 }}>{getRevealedPlayerCount(loc.id)} revealed</span>
                    </div>
                  ))}
                </div>
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
  navTab: { background: 'transparent', border: 'none', color: '#9a8a70', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, transition: 'color 0.15s' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60, borderBottom: '1px solid rgba(201,147,58,0.2)', background: 'rgba(13,10,7,0.95)', position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 },
  logo: { fontSize: 20, fontWeight: 700, color: '#e8b86d' },
  layout: { display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 60px)' },
  mapWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  addingBanner: { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(201,147,58,0.9)', color: '#0d0a07', padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, zIndex: 10, pointerEvents: 'none' },
  zoomBar: { position: 'absolute', top: 16, right: 16, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'rgba(13,10,7,0.92)', border: '1px solid rgba(201,147,58,0.3)', borderRadius: 8, padding: 6 },
  zoomBtn: { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#e8b86d', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 6, fontSize: 18, lineHeight: 1, cursor: 'pointer', fontFamily: 'Georgia, serif' },
  zoomLabel: { fontSize: 10, color: '#9a8a70', minWidth: 30, textAlign: 'center', letterSpacing: '0.05em' },
  mapContainer: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  mapImg: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' },
   pin: { position: 'absolute', transform: 'translate(-50%, -100%)', transformOrigin: 'bottom center', cursor: 'pointer', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  pinDot: { width: 12, height: 12, borderRadius: '50%', background: '#c9933a', border: '2px solid #f5d49a', boxShadow: '0 0 6px rgba(201,147,58,0.6)' },
  pinLabel: { background: 'rgba(13,10,7,0.85)', border: '1px solid rgba(201,147,58,0.4)', borderRadius: 4, padding: '2px 6px', fontSize: 11, color: '#e8b86d', whiteSpace: 'nowrap', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 },
  revealBadge: { background: '#5aaa5a', color: '#0d0a07', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 },
  sidebar: { width: 300, borderLeft: '1px solid rgba(201,147,58,0.2)', background: '#0d0a07', overflowY: 'auto', flexShrink: 0, height: '100%', boxSizing: 'border-box' as any },
  panel: { padding: '1.25rem', borderBottom: '1px solid rgba(201,147,58,0.1)' },
  panelTitle: { fontSize: 12, letterSpacing: '0.12em', color: '#e8b86d', marginBottom: 12, textTransform: 'uppercase' },
  loreBox: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.15)', borderRadius: 8, padding: '10px 12px', minHeight: 60, maxHeight: 280, overflowY: 'auto', overflowWrap: 'break-word' },
  input: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  select: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '8px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  btnPrimary: { background: '#c9933a', color: '#0d0a07', border: 'none', borderRadius: 6, padding: '10px 20px', fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', width: '100%' },
  btnSm: { background: 'transparent', color: '#c9933a', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 5, padding: '4px 10px', fontFamily: 'Georgia, serif', fontSize: 11, cursor: 'pointer' },
}
