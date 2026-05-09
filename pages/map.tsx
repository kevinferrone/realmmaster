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

  const mapRef = useRef<HTMLDivElement>(null)
  const isDM = !!session

  const token = session?.access_token
  const authH = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {} as any

  useEffect(() => { if (session) loadWorlds() }, [session])
  useEffect(() => { if (worldId) { loadMap(); if (isDM) { loadPlayers(); loadParties() } } }, [worldId])

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
    if (!isDM || !addingPin) return
    const rect = mapRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setNewPinPos({ x, y })
    setNewPinName('')
    setNewPinLore('')
  }

  async function saveNewPin() {
    if (!newPinName.trim() || !newPinPos || !worldId) return
    const r = await fetch('/api/dm/map', {
      method: 'POST', headers: authH,
      body: JSON.stringify({ worldId, name: newPinName, lore: newPinLore, xPercent: newPinPos.x, yPercent: newPinPos.y })
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {worlds.length > 1 && (
              <select style={s.select} value={worldId || ''} onChange={e => {
                setWorldId(e.target.value)
                const w = worlds.find(x => x.id === e.target.value)
                setMapImageUrl(w?.map_image_url || '')
              }}>
                {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <button
              style={{ ...s.btnSm, ...(addingPin ? { background: 'rgba(201,147,58,0.2)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
              onClick={() => { setAddingPin(!addingPin); setNewPinPos(null); setSelectedPin(null) }}>
              {addingPin ? '✕ Cancel' : '+ Add Pin'}
            </button>
            <button style={s.btnSm} onClick={() => getSupabaseBrowser().auth.signOut()}>Sign Out</button>
          </div>
        </nav>

        <div style={s.layout}>
          {/* MAP */}
          <div style={s.mapWrap}>
            {addingPin && (
              <div style={s.addingBanner}>Click anywhere on the map to place a pin</div>
            )}
            <div ref={mapRef} style={{ ...s.mapContainer, cursor: addingPin ? 'crosshair' : draggingId ? 'grabbing' : 'default' }}
              onClick={handleMapClick}
              onMouseMove={e => {
                if (!draggingId || !mapRef.current) return
                const rect = mapRef.current.getBoundingClientRect()
                const x = Math.min(100, Math.max(0, ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100))
                const y = Math.min(100, Math.max(0, ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100))
                setLocations(prev => prev.map(l => l.id === draggingId ? { ...l, x_percent: x, y_percent: y } : l))
              }}
              onMouseUp={async e => {
                if (!draggingId) return
                const rect = mapRef.current!.getBoundingClientRect()
                const x = Math.min(100, Math.max(0, ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100))
                const y = Math.min(100, Math.max(0, ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100))
                await fetch('/api/dm/map', {
                  method: 'PATCH', headers: authH,
                  body: JSON.stringify({ locationId: draggingId, xPercent: x, yPercent: y })
                })
                setDraggingId(null)
              }}
              onMouseLeave={() => setDraggingId(null)}>
              {mapImageUrl
                ? <img src={mapImageUrl} alt="World Map" style={s.mapImg} draggable={false} />
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
                      ...(isSelected ? s.pinSelected : {}),
                      ...(isDragging ? { opacity: 0.7, cursor: 'grabbing' } : { cursor: 'grab' })
                    }}
                    onClick={e => {
                      if (draggingId) return
                      e.stopPropagation()
                      setSelectedPin(loc)
                      setEditingPin(false)
                      setEditName(loc.name)
                      setEditLore(loc.lore || '')
                      setRevealMsg('')
                      setNewPinPos(null)
                    }}
                    onMouseDown={e => {
                      if (addingPin) return
                      e.stopPropagation()
                      e.preventDefault()
                      const rect = mapRef.current!.getBoundingClientRect()
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
          </div>

          {/* SIDEBAR */}
          <div style={s.sidebar}>

            {/* New pin form */}
            {newPinPos && (
              <div style={s.panel}>
                <div style={s.panelTitle}>📍 New Location</div>
                <input style={s.input} value={newPinName} onChange={e => setNewPinName(e.target.value)} placeholder="Location name" autoFocus />
                <textarea style={{ ...s.input, height: 80, resize: 'vertical' as any }} value={newPinLore} onChange={e => setNewPinLore(e.target.value)} placeholder="Location lore (revealed to players later)..." />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnPrimary} onClick={saveNewPin}>Save Pin</button>
                  <button style={s.btnSm} onClick={() => setNewPinPos(null)}>Cancel</button>
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
                      <div style={s.panelTitle}>📍 {selectedPin.name}</div>
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

            {!selectedPin && !newPinPos && (
              <div style={s.panel}>
                <div style={s.panelTitle}>🗺 World Map</div>
                <p style={{ fontSize: 13, color: '#7a6a50', fontStyle: 'italic' }}>
                  {addingPin ? 'Click on the map to place a pin.' : 'Click a pin to view or reveal its lore. Use "+ Add Pin" to place new locations.'}
                </p>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#7a6a50', textTransform: 'uppercase' as any, letterSpacing: '0.1em', marginBottom: 8 }}>All Locations ({locations.length})</div>
                  {locations.map(loc => (
                    <div key={loc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(201,147,58,0.08)', cursor: 'pointer', fontSize: 13 }}
                      onClick={() => { setSelectedPin(loc); setEditName(loc.name); setEditLore(loc.lore || '') }}>
                      <span style={{ color: '#e8dcc8' }}>{loc.name}</span>
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
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60, borderBottom: '1px solid rgba(201,147,58,0.2)', background: 'rgba(13,10,7,0.95)', position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 },
  logo: { fontSize: 20, fontWeight: 700, color: '#e8b86d' },
  layout: { display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 60px)' },
  mapWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  addingBanner: { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(201,147,58,0.9)', color: '#0d0a07', padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, zIndex: 10, pointerEvents: 'none' },
  mapContainer: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  mapImg: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' },
  pin: { position: 'absolute', transform: 'translate(-50%, -100%)', cursor: 'pointer', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  pinSelected: { zIndex: 6 },
  pinDot: { width: 12, height: 12, borderRadius: '50%', background: '#c9933a', border: '2px solid #f5d49a', boxShadow: '0 0 6px rgba(201,147,58,0.6)' },
  pinLabel: { background: 'rgba(13,10,7,0.85)', border: '1px solid rgba(201,147,58,0.4)', borderRadius: 4, padding: '2px 6px', fontSize: 11, color: '#e8b86d', whiteSpace: 'nowrap', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 },
  revealBadge: { background: '#5aaa5a', color: '#0d0a07', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 },
  sidebar: { width: 300, borderLeft: '1px solid rgba(201,147,58,0.2)', background: '#0d0a07', overflowY: 'auto', flexShrink: 0 },
  panel: { padding: '1.25rem', borderBottom: '1px solid rgba(201,147,58,0.1)' },
  panelTitle: { fontSize: 12, letterSpacing: '0.12em', color: '#e8b86d', marginBottom: 12, textTransform: 'uppercase' },
  loreBox: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.15)', borderRadius: 8, padding: '10px 12px', minHeight: 60 },
  input: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  select: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '8px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  btnPrimary: { background: '#c9933a', color: '#0d0a07', border: 'none', borderRadius: 6, padding: '10px 20px', fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', width: '100%' },
  btnSm: { background: 'transparent', color: '#c9933a', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 5, padding: '4px 10px', fontFamily: 'Georgia, serif', fontSize: 11, cursor: 'pointer' },
}
