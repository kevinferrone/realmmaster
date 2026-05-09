import { useState, useEffect } from 'react'
import Head from 'next/head'
import { getSupabaseBrowser } from '../lib/supabase'

const KNOWLEDGE_CATEGORIES = ['location', 'npc', 'faction', 'event', 'secret', 'item', 'lore']

const RENOWN_LEVELS = [
  { points: 0, level: 'Unknown', description: 'Only known by immediate circle of friends and family' },
  { points: 20, level: 'Noticed', description: 'People occasionally glance your way; someone noticed something unusual or brave' },
  { points: 40, level: 'Known', description: 'Word of your actions is spreading; locals whisper your name' },
  { points: 80, level: 'Notable', description: 'Your reputation is taking hold; mentioned in small crowds' },
  { points: 160, level: 'Respected', description: 'Communities trust you; people listen when you speak' },
  { points: 320, level: 'Celebrated', description: "You're the talk of the town; fans and rivals seek you out" },
  { points: 640, level: 'Famous', description: 'Songs and plays retell your deeds; villains take note' },
  { points: 1000, level: 'Illustrious', description: 'Your name shines across the realm; inspires courage or jealousy' },
  { points: 1500, level: 'Heroic', description: 'You are a symbol; monuments and murals bear your likeness' },
  { points: 2000, level: 'Legendary', description: 'Living legend; your decisions alter world events' },
  { points: 3000, level: 'Mythic', description: "You've transcended fame; some believe you a god or myth" },
]

function getRenownLevel(totalUsed: number) {
  let current = RENOWN_LEVELS[0]
  for (const tier of RENOWN_LEVELS) {
    if (totalUsed >= tier.points) current = tier
    else break
  }
  return current
}

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

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true); setError('')
    const sb = getSupabaseBrowser()
    const fn = mode === 'login'
      ? sb.auth.signInWithPassword({ email, password })
      : sb.auth.signUp({ email, password })
    const { error: e } = await fn
    if (e) setError(e.message)
    setLoading(false)
  }

  return (
    <div style={s.center}>
      <div style={s.authCard}>
        <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span></div>
        <p style={s.authSub}>Dungeon Master Portal</p>
        <input style={s.input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" />
        <input style={s.input} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} type="password" onKeyDown={e => e.key === 'Enter' && submit()} />
        {error && <p style={{ color: '#c04040', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button style={s.btnPrimary} onClick={submit} disabled={loading}>
          {loading ? '...' : mode === 'login' ? 'Enter the Portal' : 'Create Account'}
        </button>
        <p style={{ fontSize: 12, color: '#7a6a50', marginTop: 12, cursor: 'pointer' }} onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in'}
        </p>
      </div>
    </div>
  )
}

export default function DMPortal() {
  const { session, loading } = useAuth()
  const [tab, setTab] = useState<'world' | 'players' | 'parties' | 'knowledge' | 'renown' | 'logs'>('world')

  const [worlds, setWorlds] = useState<any[]>([])
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null)
  const [worldName, setWorldName] = useState('')
  const [worldDesc, setWorldDesc] = useState('')
  const [worldMap, setWorldMap] = useState('')
  const [mapUploading, setMapUploading] = useState(false)
  const [canonText, setCanonText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [players, setPlayers] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [parties, setParties] = useState<any[]>([])
  const [newPartyName, setNewPartyName] = useState('')
  const [newPartyDesc, setNewPartyDesc] = useState('')

  const [selectedPlayer, setSelectedPlayer] = useState<any>(null)
  const [knowledge, setKnowledge] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [newKnow, setNewKnow] = useState({ category: 'lore', title: '', content: '' })
  const [grantTarget, setGrantTarget] = useState<'player' | 'party'>('player')
  const [selectedPartyForGrant, setSelectedPartyForGrant] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ title: '', content: '', category: 'lore' })
  const [knowledgeTab, setKnowledgeTab] = useState<'ledger' | 'sessions'>('ledger')
  const [grantMsg, setGrantMsg] = useState('')

  const [renownMap, setRenownMap] = useState<Record<string, any>>({})
  const [newRenown, setNewRenown] = useState({ points: '', reason: '' })
  const [renownTarget, setRenownTarget] = useState<'player' | 'party'>('player')
  const [selectedPartyForRenown, setSelectedPartyForRenown] = useState('')
  const [renownGrantPlayer, setRenownGrantPlayer] = useState('')
  const [renownMsg, setRenownMsg] = useState('')

  const [logs, setLogs] = useState<any[]>([])
  const [logFilter, setLogFilter] = useState('all')

  const token = session?.access_token
  const authH = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {} as any

  useEffect(() => { if (session) loadWorlds() }, [session])
  useEffect(() => { if (activeWorldId) { loadPlayers(); loadLogs(); loadParties(); loadRenown() } }, [activeWorldId])

  async function loadWorlds() {
    const r = await fetch('/api/dm/worlds', { headers: authH })
    const d = await r.json()
    setWorlds(d.worlds || [])
    if (d.worlds?.length && !activeWorldId) {
      const w = d.worlds[0]
      setActiveWorldId(w.id); setWorldName(w.name); setWorldDesc(w.description || ''); setCanonText(w.canon_text || ''); setWorldMap(w.map_image_url || '')
    }
  }

  async function saveWorld() {
    setSaving(true); setSaveMsg('')
    if (!worldName.trim()) { setSaveMsg('World name required'); setSaving(false); return }
    if (activeWorldId) {
      await fetch('/api/dm/worlds', { method: 'PATCH', headers: authH, body: JSON.stringify({ worldId: activeWorldId, name: worldName, description: worldDesc, canonText: canonText || undefined, mapImageUrl: worldMap || undefined }) })
      setSaveMsg('✓ Saved')
    } else {
      const r = await fetch('/api/dm/worlds', { method: 'POST', headers: authH, body: JSON.stringify({ name: worldName, description: worldDesc, canonText, mapImageUrl: worldMap }) })
      const d = await r.json()
      setActiveWorldId(d.world.id)
      setSaveMsg('✓ World created')
      await loadWorlds()
    }
    setSaving(false)
  }

  async function loadPlayers() {
    if (!activeWorldId) return
    const r = await fetch(`/api/dm/players?worldId=${activeWorldId}`, { headers: authH })
    const d = await r.json()
    setPlayers(d.players || [])
  }

  async function addPlayer() {
    if (!newName.trim() || !activeWorldId) return
    const r = await fetch('/api/dm/players', { method: 'POST', headers: authH, body: JSON.stringify({ worldId: activeWorldId, name: newName, email: newEmail }) })
    const d = await r.json()
    if (d.player) { setPlayers(p => [...p, { ...d.player, messageCount: 0 }]); setNewName(''); setNewEmail('') }
  }

  async function deletePlayer(id: string) {
    if (!confirm('Remove this player?')) return
    await fetch('/api/dm/players', { method: 'DELETE', headers: authH, body: JSON.stringify({ playerId: id }) })
    setPlayers(p => p.filter(x => x.id !== id))
  }

  async function loadParties() {
    if (!activeWorldId) return
    const r = await fetch(`/api/dm/parties?worldId=${activeWorldId}`, { headers: authH })
    const d = await r.json()
    setParties(d.parties || [])
  }

  async function addParty() {
    if (!newPartyName.trim() || !activeWorldId) return
    const r = await fetch('/api/dm/parties', { method: 'POST', headers: authH, body: JSON.stringify({ worldId: activeWorldId, name: newPartyName, description: newPartyDesc }) })
    const d = await r.json()
    if (d.party) { setParties(p => [...p, d.party]); setNewPartyName(''); setNewPartyDesc('') }
  }

  async function deleteParty(id: string) {
    if (!confirm('Delete this party?')) return
    await fetch('/api/dm/parties', { method: 'DELETE', headers: authH, body: JSON.stringify({ partyId: id }) })
    setParties(p => p.filter(x => x.id !== id))
  }

  async function togglePartyMember(partyId: string, playerId: string, isMember: boolean) {
    await fetch('/api/dm/parties', { method: 'PATCH', headers: authH, body: JSON.stringify({ partyId, playerId, action: isMember ? 'remove' : 'add' }) })
    await loadParties()
  }

  async function loadPlayerKnowledge(player: any) {
    setSelectedPlayer(player)
    const r = await fetch(`/api/dm/knowledge?playerId=${player.id}`, { headers: authH })
    const d = await r.json()
    setKnowledge(d.knowledge || [])
    setSessions(d.sessions || [])
  }

  async function grantKnowledge() {
    if (!newKnow.title.trim() || !newKnow.content.trim()) return
    setGrantMsg('')
    const body: any = { ...newKnow }
    if (grantTarget === 'player' && selectedPlayer) {
      body.playerId = selectedPlayer.id
    } else if (grantTarget === 'party' && selectedPartyForGrant) {
      body.partyId = selectedPartyForGrant
    } else {
      setGrantMsg('Select a character or party.')
      return
    }
    const r = await fetch('/api/dm/knowledge', { method: 'POST', headers: authH, body: JSON.stringify(body) })
    const d = await r.json()
    if (d.error) {
      setGrantMsg('Error: ' + d.error)
    } else {
      const count = d.grantedTo || 1
      setGrantMsg(`✓ Granted to ${count} character${count > 1 ? 's' : ''}`)
      setNewKnow({ category: 'lore', title: '', content: '' })
      if (grantTarget === 'player' && selectedPlayer) await loadPlayerKnowledge(selectedPlayer)
    }
  }

  async function toggleKnowledge(entryId: string, is_active: boolean) {
    await fetch('/api/dm/knowledge', { method: 'PATCH', headers: authH, body: JSON.stringify({ entryId, is_active }) })
    setKnowledge(k => k.map(e => e.id === entryId ? { ...e, is_active } : e))
  }

  async function saveEdit() {
    if (!editingId) return
    await fetch('/api/dm/knowledge', { method: 'PATCH', headers: authH, body: JSON.stringify({ entryId: editingId, ...editData }) })
    setKnowledge(k => k.map(e => e.id === editingId ? { ...e, ...editData } : e))
    setEditingId(null)
  }

  async function deleteKnowledge(entryId: string) {
    await fetch('/api/dm/knowledge', { method: 'DELETE', headers: authH, body: JSON.stringify({ entryId }) })
    setKnowledge(k => k.filter(e => e.id !== entryId))
  }

  async function loadRenown() {
    if (!activeWorldId) return
    const r = await fetch(`/api/dm/renown?worldId=${activeWorldId}`, { headers: authH })
    const d = await r.json()
    const map: Record<string, any> = {}
    for (const entry of d.renown || []) map[entry.player_id] = entry
    setRenownMap(map)
  }

  async function grantRenown() {
    const points = parseInt(newRenown.points)
    if (!points || points <= 0) { setRenownMsg('Enter a valid point amount.'); return }
    setRenownMsg('')
    const body: any = { points, reason: newRenown.reason }
    if (renownTarget === 'player' && renownGrantPlayer) {
      body.playerId = renownGrantPlayer
    } else if (renownTarget === 'party' && selectedPartyForRenown) {
      body.partyId = selectedPartyForRenown
    } else {
      setRenownMsg('Select a player or party.')
      return
    }
    const r = await fetch('/api/dm/renown', { method: 'POST', headers: authH, body: JSON.stringify(body) })
    const d = await r.json()
    if (d.success) {
      setRenownMsg(`✓ Granted ${points} renown to ${d.grantedTo} character${d.grantedTo > 1 ? 's' : ''}`)
      setNewRenown({ points: '', reason: '' })
      loadRenown()
    } else {
      setRenownMsg('Error: ' + d.error)
    }
  }

  async function loadLogs() {
    if (!activeWorldId) return
    const pid = logFilter !== 'all' ? `&playerId=${logFilter}` : ''
    const r = await fetch(`/api/dm/logs?worldId=${activeWorldId}${pid}`, { headers: authH })
    const d = await r.json()
    setLogs(d.messages || [])
  }

  const activeWorld = worlds.find(w => w.id === activeWorldId)
  const totalMessages = players.reduce((a, p) => a + (p.messageCount || 0), 0)

  if (loading) return <div style={s.center}><span style={{ color: '#c9933a' }}>Loading...</span></div>
  if (!session) return <AuthScreen />

  const TABS = [
    { id: 'world', label: '📜 World' },
    { id: 'players', label: '⚔ Players' },
    { id: 'parties', label: '🛡 Parties' },
    { id: 'knowledge', label: '🧠 Knowledge' },
    { id: 'renown', label: '⭐ Renown' },
    { id: 'logs', label: '📋 Logs' },
  ] as const

  return (
    <>
      <Head><title>RealmMaster — DM Portal</title></Head>
      <div style={s.root}>
        <nav style={s.nav}>
          <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span></div>
          <div style={{ display: 'flex', gap: 3 }}>
            {TABS.map(t => (
              <button key={t.id} style={{ ...s.navTab, ...(tab === t.id ? s.navTabActive : {}) }}
                onClick={() => { setTab(t.id as any); if (t.id === 'logs') loadLogs() }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeWorld && <span style={s.worldBadge}>{activeWorld.name}</span>}
            <a href={`/map?worldId=${activeWorldId || ''}`} style={{ textDecoration: 'none' }}>
              <button style={s.btnSm}>🗺 Map</button>
            </a>
            <button style={s.btnSm} onClick={() => getSupabaseBrowser().auth.signOut()}>Sign Out</button>
          </div>
        </nav>

        <main style={s.main}>

          {tab === 'world' && (
            <div>
              <h1 style={s.pageTitle}>World Canon</h1>
              <p style={s.pageSub}>Your world lore is the AI DM's source of truth.</p>
              <div style={s.grid2}>
                <div style={s.card}>
                  <div style={s.cardTitle}>🌍 World Settings</div>
                  {worlds.length > 0 && (
                    <>
                      <label style={s.label}>Active World</label>
                      <select style={s.select} value={activeWorldId || ''}
                        onChange={e => {
                          if (e.target.value === 'new') { setActiveWorldId(null); setWorldName(''); setWorldDesc(''); setCanonText('') }
                          else { setActiveWorldId(e.target.value); const w = worlds.find(x => x.id === e.target.value); if (w) { setWorldName(w.name); setWorldDesc(w.description || ''); setCanonText(w.canon_text || ''); setWorldMap(w.map_image_url || '') } }
                        }}>
                        {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        <option value="new">+ New world</option>
                      </select>
                    </>
                  )}
                  <label style={s.label}>World Name</label>
                  <input style={s.input} value={worldName} onChange={e => setWorldName(e.target.value)} placeholder="e.g. Sorasula" />
                  <label style={s.label}>Description</label>
                  <textarea style={{ ...s.input, height: 64, resize: 'vertical' as any }} value={worldDesc} onChange={e => setWorldDesc(e.target.value)} placeholder="Brief description for the AI DM..." />
                <label style={s.label}>World Map Image</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <input style={{ ...s.input, margin: 0, flex: 1 }} value={worldMap} onChange={e => setWorldMap(e.target.value)} placeholder="Map image URL (auto-filled on upload)" />
                    <button style={s.btnSm} onClick={() => document.getElementById('mapUpload')?.click()}>
                      {mapUploading ? 'Uploading...' : '📎 Upload'}
                    </button>
                    <input type="file" id="mapUpload" accept="image/*" style={{ display: 'none' }}
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file || !activeWorldId) return
                        setMapUploading(true)
                        const form = new FormData()
                        form.append('worldId', activeWorldId)
                        form.append('file', file)
                        const r = await fetch('/api/dm/upload-map', {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                          body: form
                        })
                        const d = await r.json()
                        if (d.url) {
                          setWorldMap(d.url)
                          setSaveMsg('✓ Map uploaded!')
                        } else {
                          setSaveMsg('Error uploading map: ' + d.error)
                        }
                        setMapUploading(false)
                      }} />
                  </div>
                  {worldMap && <img src={worldMap} alt="Map preview" style={{ width: '100%', borderRadius: 6, border: '1px solid rgba(201,147,58,0.2)', marginBottom: 10 }} />}
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>📊 Campaign Stats</div>
                  <div style={s.statGrid}>
                    <div style={s.statBox}><div style={s.statVal}>{worlds.length}</div><div style={s.statLabel}>Worlds</div></div>
                    <div style={s.statBox}><div style={s.statVal}>{players.length}</div><div style={s.statLabel}>Players</div></div>
                    <div style={s.statBox}><div style={s.statVal}>{totalMessages}</div><div style={s.statLabel}>Messages</div></div>
                  </div>
                  <div style={{ ...s.statGrid, marginTop: 8 }}>
                    <div style={s.statBox}><div style={s.statVal}>{parties.length}</div><div style={s.statLabel}>Parties</div></div>
                  </div>
                  {activeWorld && <p style={{ fontSize: 12, color: '#5a4a30', marginTop: 12, fontStyle: 'italic' }}>Last updated: {new Date(activeWorld.updated_at).toLocaleDateString()}</p>}
                </div>
              </div>
              <div style={{ ...s.card, marginTop: 16 }}>
                <div style={s.cardTitle}>📜 World Canon Text</div>
                <p style={{ fontSize: 13, color: '#7a6a50', fontStyle: 'italic', marginBottom: 10 }}>
                  Paste your world lore here. The AI DM reads all of this but only shares what each character would know.
                </p>
                <textarea style={{ ...s.input, height: 320, resize: 'vertical' as any, fontFamily: 'monospace', fontSize: 13 }}
                  value={canonText} onChange={e => setCanonText(e.target.value)}
                  placeholder="Paste your world canon here..." />
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                  <button style={s.btnPrimary} onClick={saveWorld} disabled={saving}>
                    {saving ? 'Saving...' : activeWorldId ? '💾 Save World' : '✨ Create World'}
                  </button>
                  {saveMsg && <span style={{ fontSize: 13, color: saveMsg.startsWith('✓') ? '#5aaa5a' : '#c04040' }}>{saveMsg}</span>}
                </div>
              </div>
            </div>
          )}

          {tab === 'players' && (
            <div>
              <h1 style={s.pageTitle}>Players</h1>
              <p style={s.pageSub}>Add players and share their unique portal links.</p>
              {!activeWorldId && <div style={s.warning}>⚠ Create a world first.</div>}
              <div style={s.grid2}>
                <div>
                  <div style={s.card}>
                    <div style={s.cardTitle}>⚔ Add Player</div>
                    <input style={s.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Player name" />
                    <input style={s.input} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email (optional)" />
                    <button style={s.btnPrimary} onClick={addPlayer} disabled={!activeWorldId}>+ Create Player Link</button>
                  </div>
                  <div style={{ ...s.card, marginTop: 14 }}>
                    <div style={s.cardTitle}>🧙 Active Players ({players.length})</div>
                    {players.length === 0
                      ? <p style={s.empty}>No players yet.</p>
                      : players.map(p => (
                        <div key={p.id} style={s.playerRow}>
                          <div style={s.playerAvatar}>{p.name.slice(0, 2).toUpperCase()}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic' }}>
                              {p.character_name ? `${p.character_name} · ${p.character_class || ''}` : 'No character yet'}
                              {' · '}{p.messageCount || 0} msgs
                            </div>
                          </div>
                          <span style={p.character_name ? s.badgeGreen : s.badgeRed}>{p.character_name ? 'Ready' : 'Pending'}</span>
                          <button style={{ ...s.btnSm, marginLeft: 8 }}
                            onClick={() => { setSelectedPlayer(p); setTab('knowledge'); loadPlayerKnowledge(p) }}>🧠</button>
                          <button style={{ ...s.btnSm, color: '#c04040', borderColor: '#8b2020', marginLeft: 4 }}
                            onClick={() => deletePlayer(p.id)}>✕</button>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>🔗 Player Links</div>
                  <p style={{ fontSize: 13, color: '#7a6a50', fontStyle: 'italic', marginBottom: 12 }}>
                    Each link is unique. Players do not need accounts — just the link.
                  </p>
                  {players.length === 0
                    ? <p style={s.empty}>Links appear as you add players.</p>
                    : players.map(p => (
                      <div key={p.id} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: '#c9933a', letterSpacing: '0.1em', textTransform: 'uppercase' as any, marginBottom: 4 }}>{p.name}</div>
                        <div style={s.linkBox}>
                          <span style={s.linkUrl}>{typeof window !== 'undefined' ? `${window.location.origin}/play/${p.invite_token}` : `/play/${p.invite_token}`}</span>
                          <button style={s.btnSm} onClick={async e => {
                            await navigator.clipboard.writeText(`${window.location.origin}/play/${p.invite_token}`)
                            const b = e.target as HTMLButtonElement; b.textContent = '✓'; setTimeout(() => b.textContent = 'Copy', 1500)
                          }}>Copy</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          )}

          {tab === 'parties' && (
            <div>
              <h1 style={s.pageTitle}>Parties</h1>
              <p style={s.pageSub}>Group characters into parties to grant knowledge or renown to everyone at once.</p>
              {!activeWorldId && <div style={s.warning}>⚠ Create a world first.</div>}
              <div style={s.grid2}>
                <div style={s.card}>
                  <div style={s.cardTitle}>🛡 Create Party</div>
                  <input style={s.input} value={newPartyName} onChange={e => setNewPartyName(e.target.value)} placeholder="Party name (e.g. The Sorasula Five)" />
                  <textarea style={{ ...s.input, height: 60, resize: 'vertical' as any }} value={newPartyDesc} onChange={e => setNewPartyDesc(e.target.value)} placeholder="Description (optional)" />
                  <button style={s.btnPrimary} onClick={addParty} disabled={!activeWorldId || !newPartyName.trim()}>+ Create Party</button>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>📋 All Parties ({parties.length})</div>
                  {parties.length === 0
                    ? <p style={s.empty}>No parties yet.</p>
                    : parties.map(party => (
                      <div key={party.id} style={{ ...s.card, marginBottom: 12, padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{party.name}</div>
                            {party.description && <div style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic' }}>{party.description}</div>}
                          </div>
                          <button style={{ ...s.btnSm, color: '#c04040', borderColor: '#8b2020' }} onClick={() => deleteParty(party.id)}>✕</button>
                        </div>
                        <div style={s.cardTitle}>Members</div>
                        {players.map(p => {
                          const isMember = (party.members || []).some((m: any) => m?.id === p.id)
                          return (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <input type="checkbox" checked={isMember}
                                onChange={() => togglePartyMember(party.id, p.id, isMember)}
                                style={{ accentColor: '#c9933a', width: 16, height: 16 }} />
                              <span style={{ fontSize: 14 }}>{p.name}</span>
                              {p.character_name && <span style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic' }}>({p.character_name})</span>}
                            </div>
                          )
                        })}
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          )}

          {tab === 'knowledge' && (
            <div>
              <h1 style={s.pageTitle}>Character Knowledge Manager</h1>
              <p style={s.pageSub}>Grant knowledge to a single character or an entire party at once.</p>
              <div style={s.grid2}>
                <div>
                  <div style={s.card}>
                    <div style={s.cardTitle}>➕ Grant Knowledge</div>
                    <label style={s.label}>Grant To</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <button style={{ ...s.btnSm, ...(grantTarget === 'player' ? { background: 'rgba(201,147,58,0.15)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
                        onClick={() => setGrantTarget('player')}>Single Character</button>
                      <button style={{ ...s.btnSm, ...(grantTarget === 'party' ? { background: 'rgba(201,147,58,0.15)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
                        onClick={() => setGrantTarget('party')}>Entire Party</button>
                    </div>
                    {grantTarget === 'player' && (
                      <>
                        <label style={s.label}>Character</label>
                        <select style={s.select} value={selectedPlayer?.id || ''}
                          onChange={e => { const p = players.find(x => x.id === e.target.value); if (p) loadPlayerKnowledge(p) }}>
                          <option value="">Select character...</option>
                          {players.map(p => <option key={p.id} value={p.id}>{p.character_name || p.name}</option>)}
                        </select>
                      </>
                    )}
                    {grantTarget === 'party' && (
                      <>
                        <label style={s.label}>Party</label>
                        <select style={s.select} value={selectedPartyForGrant} onChange={e => setSelectedPartyForGrant(e.target.value)}>
                          <option value="">Select party...</option>
                          {parties.map(p => <option key={p.id} value={p.id}>{p.name} ({(p.members || []).length} members)</option>)}
                        </select>
                      </>
                    )}
                    <label style={s.label}>Category</label>
                    <select style={s.select} value={newKnow.category} onChange={e => setNewKnow(n => ({ ...n, category: e.target.value }))}>
                      {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                    <label style={s.label}>Title</label>
                    <input style={s.input} value={newKnow.title} onChange={e => setNewKnow(n => ({ ...n, title: e.target.value }))} placeholder="e.g. The Vault of Keth" />
                    <label style={s.label}>What they know</label>
                    <textarea style={{ ...s.input, height: 80, resize: 'vertical' as any }} value={newKnow.content} onChange={e => setNewKnow(n => ({ ...n, content: e.target.value }))} placeholder="What the character(s) know about this..." />
                    <button style={s.btnPrimary} onClick={grantKnowledge}>Grant Knowledge</button>
                    {grantMsg && <p style={{ fontSize: 13, color: grantMsg.startsWith('✓') ? '#5aaa5a' : '#c04040', marginTop: 8 }}>{grantMsg}</p>}
                  </div>
                  <div style={{ ...s.card, marginTop: 14 }}>
                    <div style={s.cardTitle}>Select Character to View</div>
                    {players.map(p => (
                      <div key={p.id} style={{ ...s.playerRow, cursor: 'pointer', ...(selectedPlayer?.id === p.id ? { border: '1px solid rgba(201,147,58,0.5)', background: '#231a0a' } : {}) }}
                        onClick={() => loadPlayerKnowledge(p)}>
                        <div style={s.playerAvatar}>{p.name.slice(0, 2).toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{p.character_name || p.name}</div>
                          <div style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic' }}>{p.character_class || 'No class set'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  {selectedPlayer ? (
                    <>
                      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(201,147,58,0.2)', marginBottom: 14 }}>
                        <button style={{ ...s.subTab, ...(knowledgeTab === 'ledger' ? s.subTabActive : {}) }} onClick={() => setKnowledgeTab('ledger')}>
                          Knowledge Ledger ({knowledge.length})
                        </button>
                        <button style={{ ...s.subTab, ...(knowledgeTab === 'sessions' ? s.subTabActive : {}) }} onClick={() => setKnowledgeTab('sessions')}>
                          Session History ({sessions.length})
                        </button>
                      </div>
                      {knowledgeTab === 'ledger' && (
                        <div>
                          {knowledge.length === 0
                            ? <p style={s.empty}>No knowledge entries yet.</p>
                            : knowledge.map(k => (
                              <div key={k.id} style={{ ...s.card, marginBottom: 10, opacity: k.is_active ? 1 : 0.45 }}>
                                {editingId === k.id ? (
                                  <div>
                                    <select style={{ ...s.select, marginBottom: 6 }} value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))}>
                                      {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input style={{ ...s.input, marginBottom: 6 }} value={editData.title} onChange={e => setEditData(d => ({ ...d, title: e.target.value }))} />
                                    <textarea style={{ ...s.input, height: 64, resize: 'vertical' as any }} value={editData.content} onChange={e => setEditData(d => ({ ...d, content: e.target.value }))} />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button style={s.btnPrimary} onClick={saveEdit}>Save</button>
                                      <button style={s.btnSm} onClick={() => setEditingId(null)}>Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                      <div>
                                        <span style={s.catBadge}>{k.category}</span>
                                        <span style={{ fontWeight: 600, fontSize: 14, marginLeft: 8 }}>{k.title}</span>
                                        {k.source === 'dm_granted' && <span style={{ fontSize: 10, color: '#c9933a', marginLeft: 8 }}>DM</span>}
                                        {k.source === 'auto_extracted' && <span style={{ fontSize: 10, color: '#5a8a5a', marginLeft: 8 }}>AUTO</span>}
                                      </div>
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button style={s.btnSm} onClick={() => { setEditingId(k.id); setEditData({ title: k.title, content: k.content, category: k.category }) }}>Edit</button>
                                        <button style={s.btnSm} onClick={() => toggleKnowledge(k.id, !k.is_active)}>{k.is_active ? 'Hide' : 'Show'}</button>
                                        <button style={{ ...s.btnSm, color: '#c04040', borderColor: '#8b2020' }} onClick={() => deleteKnowledge(k.id)}>✕</button>
                                      </div>
                                    </div>
                                    <p style={{ fontSize: 13, color: '#b8a888', lineHeight: 1.6 }}>{k.content}</p>
                                  </div>
                                )}
                              </div>
                            ))
                          }
                        </div>
                      )}
                      {knowledgeTab === 'sessions' && (
                        <div>
                          {sessions.length === 0
                            ? <p style={s.empty}>No sessions yet.</p>
                            : sessions.map((sess, i) => (
                              <div key={sess.id} style={{ ...s.card, marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <span style={{ fontFamily: 'Georgia, serif', fontSize: 12, color: '#e8b86d', letterSpacing: '0.1em', textTransform: 'uppercase' as any }}>
                                    Session {sessions.length - i}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#5a4a30', fontStyle: 'italic' }}>
                                    {new Date(sess.started_at).toLocaleDateString()} · {sess.message_count} messages
                                  </span>
                                </div>
                                {sess.summary
                                  ? <p style={{ fontSize: 13, color: '#b8a888', lineHeight: 1.7 }}>{sess.summary}</p>
                                  : <p style={{ fontSize: 13, color: '#5a4a30', fontStyle: 'italic' }}>No summary yet.</p>
                                }
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ ...s.card, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                      <p style={{ color: '#5a4a30', fontStyle: 'italic', fontSize: 15 }}>← Select a character to view their ledger</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'renown' && (
            <div>
              <h1 style={s.pageTitle}>Renown</h1>
              <p style={s.pageSub}>Grant renown points to players or parties. Players spend them to gain renown levels.</p>
              <div style={s.grid2}>
                <div style={s.card}>
                  <div style={s.cardTitle}>⭐ Grant Renown</div>
                  <label style={s.label}>Grant To</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button style={{ ...s.btnSm, ...(renownTarget === 'player' ? { background: 'rgba(201,147,58,0.15)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
                      onClick={() => setRenownTarget('player')}>Single Player</button>
                    <button style={{ ...s.btnSm, ...(renownTarget === 'party' ? { background: 'rgba(201,147,58,0.15)', borderColor: '#c9933a', color: '#e8b86d' } : {}) }}
                      onClick={() => setRenownTarget('party')}>Entire Party</button>
                  </div>
                  {renownTarget === 'player' && (
                    <>
                      <label style={s.label}>Player</label>
                      <select style={s.select} value={renownGrantPlayer} onChange={e => setRenownGrantPlayer(e.target.value)}>
                        <option value="">Select player...</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.character_name || p.name}</option>)}
                      </select>
                    </>
                  )}
                  {renownTarget === 'party' && (
                    <>
                      <label style={s.label}>Party</label>
                      <select style={s.select} value={selectedPartyForRenown} onChange={e => setSelectedPartyForRenown(e.target.value)}>
                        <option value="">Select party...</option>
                        {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </>
                  )}
                  <label style={s.label}>Points to Grant</label>
                  <input style={s.input} type="number" value={newRenown.points} onChange={e => setNewRenown(n => ({ ...n, points: e.target.value }))} placeholder="e.g. 20" />
                  <label style={s.label}>Reason</label>
                  <input style={s.input} value={newRenown.reason} onChange={e => setNewRenown(n => ({ ...n, reason: e.target.value }))} placeholder="e.g. Defeated the Mongrelfolk ambush" />
                  <button style={s.btnPrimary} onClick={grantRenown}>⭐ Grant Renown</button>
                  {renownMsg && <p style={{ fontSize: 13, color: renownMsg.startsWith('✓') ? '#5aaa5a' : '#c04040', marginTop: 8 }}>{renownMsg}</p>}
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>📊 Player Renown Status</div>
                  {players.length === 0
                    ? <p style={s.empty}>No players yet.</p>
                    : players.map(p => {
                      const r = renownMap[p.id] || { total_earned: 0, total_used: 0 }
                      const available = r.total_earned - r.total_used
                      const level = getRenownLevel(r.total_used)
                      return (
                        <div key={p.id} style={{ ...s.card, marginBottom: 10, padding: '0.875rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.character_name || p.name}</div>
                              <div style={{ fontSize: 12, color: '#c9933a', fontStyle: 'italic' }}>{level.level}</div>
                            </div>
                            <div style={{ textAlign: 'right' as any, fontSize: 12, color: '#7a6a50' }}>
                              <div>Earned: <span style={{ color: '#5aaa5a' }}>{r.total_earned}</span></div>
                              <div>Used: <span style={{ color: '#c9933a' }}>{r.total_used}</span></div>
                              <div>Available: <span style={{ color: '#e8b86d', fontWeight: 600 }}>{available}</span></div>
                            </div>
                          </div>
                          <div style={{ height: 4, background: 'rgba(201,147,58,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#c9933a', borderRadius: 2, width: `${Math.min(100, (r.total_used / 320) * 100)}%` }} />
                          </div>
                          <div style={{ fontSize: 11, color: '#5a4a30', marginTop: 4, fontStyle: 'italic' }}>{level.description}</div>
                        </div>
                      )
                    })
                  }
                </div>
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div>
              <h1 style={s.pageTitle}>Session Logs</h1>
              <p style={s.pageSub}>Every question and answer across all players.</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <select style={{ ...s.select, width: 220 }} value={logFilter} onChange={e => { setLogFilter(e.target.value); loadLogs() }}>
                  <option value="all">All players</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.character_name || 'no char'})</option>)}
                </select>
                <button style={s.btnSm} onClick={loadLogs}>↻ Refresh</button>
              </div>
              <div style={s.card}>
                {logs.length === 0
                  ? <p style={s.empty}>No messages yet.</p>
                  : logs.map(m => (
                    <div key={m.id} style={s.logEntry}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, color: '#e8b86d', letterSpacing: '0.1em', textTransform: 'uppercase' as any }}>
                          {m.players?.character_name || m.players?.name || '?'}{m.players?.character_class ? ` · ${m.players.character_class}` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 10, padding: '2px 6px', background: m.role === 'user' ? 'rgba(201,147,58,0.1)' : 'rgba(139,32,32,0.1)', border: `1px solid ${m.role === 'user' ? 'rgba(201,147,58,0.3)' : 'rgba(192,64,64,0.3)'}`, borderRadius: 4, color: m.role === 'user' ? '#c9933a' : '#c04040' }}>
                            {m.role === 'user' ? 'Player' : 'DM'}
                          </span>
                          <span style={{ fontSize: 11, color: '#5a4a30', fontStyle: 'italic' }}>{new Date(m.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <p style={{ fontSize: 14, color: '#b8a888', lineHeight: 1.7, whiteSpace: 'pre-wrap' as any }}>{m.content}</p>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { background: '#0d0a07', minHeight: '100vh', color: '#e8dcc8', fontFamily: 'Georgia, serif' },
  center: { background: '#0d0a07', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  authCard: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 12, padding: '2rem', width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  logo: { fontSize: 22, fontWeight: 700, color: '#e8b86d', letterSpacing: '0.1em', marginBottom: 4 },
  authSub: { fontSize: 13, color: '#7a6a50', fontStyle: 'italic', marginBottom: 24 },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60, borderBottom: '1px solid rgba(201,147,58,0.2)', background: 'rgba(13,10,7,0.95)', position: 'sticky', top: 0, zIndex: 100, gap: 12 },
  navTab: { fontSize: 12, padding: '6px 13px', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: '#7a6a50', cursor: 'pointer' },
  navTabActive: { background: '#1a1206', color: '#e8b86d', border: '1px solid rgba(201,147,58,0.3)' },
  worldBadge: { fontSize: 11, padding: '3px 10px', border: '1px solid rgba(201,147,58,0.3)', borderRadius: 4, color: '#c9933a' },
  main: { maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' },
  pageTitle: { fontSize: 26, fontWeight: 700, color: '#f5d49a', marginBottom: 4 },
  pageSub: { fontSize: 15, color: '#7a6a50', fontStyle: 'italic', marginBottom: 24 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
  card: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.18)', borderRadius: 10, padding: '1.25rem' },
  cardTitle: { fontSize: 12, letterSpacing: '0.12em', color: '#e8b86d', marginBottom: 14, textTransform: 'uppercase' },
  input: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  select: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '8px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 11, color: '#7a6a50', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 },
  btnPrimary: { background: '#c9933a', color: '#0d0a07', border: 'none', borderRadius: 6, padding: '10px 20px', fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', width: '100%' },
  btnSm: { background: 'transparent', color: '#c9933a', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 5, padding: '4px 10px', fontFamily: 'Georgia, serif', fontSize: 11, cursor: 'pointer' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  statBox: { background: '#231a0a', border: '1px solid rgba(201,147,58,0.12)', borderRadius: 8, padding: 10, textAlign: 'center' },
  statVal: { fontSize: 24, fontWeight: 700, color: '#e8b86d' },
  statLabel: { fontSize: 11, color: '#7a6a50', fontStyle: 'italic', marginTop: 2 },
  playerRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: '#161008', border: '1px solid rgba(201,147,58,0.12)', borderRadius: 8, marginBottom: 8 },
  playerAvatar: { width: 38, height: 38, borderRadius: '50%', background: '#231a0a', border: '1.5px solid rgba(201,147,58,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#e8b86d', flexShrink: 0 },
  badgeGreen: { fontSize: 10, padding: '2px 7px', border: '1px solid #3a7a3a', borderRadius: 4, color: '#5aaa5a' },
  badgeRed: { fontSize: 10, padding: '2px 7px', border: '1px solid #8b2020', borderRadius: 4, color: '#c04040' },
  linkBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#231a0a', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6 },
  linkUrl: { fontFamily: 'monospace', fontSize: 12, color: '#c9933a', wordBreak: 'break-all', marginRight: 10 },
  subTab: { fontSize: 12, padding: '8px 16px', border: 'none', background: 'transparent', color: '#7a6a50', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1 },
  subTabActive: { color: '#e8b86d', borderBottomColor: '#e8b86d' },
  catBadge: { fontSize: 10, padding: '2px 7px', border: '1px solid rgba(201,147,58,0.3)', borderRadius: 4, color: '#c9933a', textTransform: 'uppercase' },
  logEntry: { padding: '12px 0', borderBottom: '1px solid rgba(201,147,58,0.08)' },
  warning: { padding: '10px 14px', background: 'rgba(139,32,32,0.1)', border: '1px solid rgba(192,64,64,0.3)', borderRadius: 8, fontSize: 13, color: '#c04040', marginBottom: 16 },
  empty: { fontSize: 13, color: '#7a6a50', fontStyle: 'italic' },
}
