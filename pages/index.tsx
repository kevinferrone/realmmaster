import { useState, useEffect } from 'react'
import Head from 'next/head'
import { getSupabaseBrowser } from '../lib/supabase'

const KNOWLEDGE_CATEGORIES = ['location', 'npc', 'faction', 'event', 'secret', 'item', 'lore']

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
  const [tab, setTab] = useState<'world' | 'players' | 'knowledge' | 'logs'>('world')

  // World state
  const [worlds, setWorlds] = useState<any[]>([])
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null)
  const [worldName, setWorldName] = useState('')
  const [worldDesc, setWorldDesc] = useState('')
  const [canonText, setCanonText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Player state
  const [players, setPlayers] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Knowledge state
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null)
  const [knowledge, setKnowledge] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [newKnow, setNewKnow] = useState({ category: 'lore', title: '', content: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ title: '', content: '', category: 'lore' })
  const [knowledgeTab, setKnowledgeTab] = useState<'ledger' | 'sessions'>('ledger')

  // Log state
  const [logs, setLogs] = useState<any[]>([])
  const [logFilter, setLogFilter] = useState('all')

  const token = session?.access_token
  const authH = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {} as any

  useEffect(() => { if (session) loadWorlds() }, [session])
  useEffect(() => { if (activeWorldId) { loadPlayers(); loadLogs() } }, [activeWorldId])

  async function loadWorlds() {
    const r = await fetch('/api/dm/worlds', { headers: authH })
    const d = await r.json()
    setWorlds(d.worlds || [])
    if (d.worlds?.length && !activeWorldId) {
      const w = d.worlds[0]
      setActiveWorldId(w.id); setWorldName(w.name); setWorldDesc(w.description || '')
    }
  }

  async function saveWorld() {
    setSaving(true); setSaveMsg('')
    if (!worldName.trim()) { setSaveMsg('World name required'); setSaving(false); return }
    if (activeWorldId) {
      await fetch('/api/dm/worlds', { method: 'PATCH', headers: authH, body: JSON.stringify({ worldId: activeWorldId, name: worldName, description: worldDesc, canonText: canonText || undefined }) })
      setSaveMsg('✓ Saved')
    } else {
      const r = await fetch('/api/dm/worlds', { method: 'POST', headers: authH, body: JSON.stringify({ name: worldName, description: worldDesc, canonText }) })
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
    if (!confirm('Remove this player? All their messages will be deleted.')) return
    await fetch('/api/dm/players', { method: 'DELETE', headers: authH, body: JSON.stringify({ playerId: id }) })
    setPlayers(p => p.filter(x => x.id !== id))
  }

  async function loadPlayerKnowledge(player: any) {
    setSelectedPlayer(player)
    const r = await fetch(`/api/dm/knowledge?playerId=${player.id}`, { headers: authH })
    const d = await r.json()
    setKnowledge(d.knowledge || [])
    setSessions(d.sessions || [])
  }

  async function grantKnowledge() {
    if (!newKnow.title.trim() || !newKnow.content.trim() || !selectedPlayer) return
    const r = await fetch('/api/dm/knowledge', { method: 'POST', headers: authH, body: JSON.stringify({ playerId: selectedPlayer.id, ...newKnow }) })
    const d = await r.json()
    if (d.entry) { setKnowledge(k => [...k, d.entry]); setNewKnow({ category: 'lore', title: '', content: '' }) }
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
    { id: 'knowledge', label: '🧠 Knowledge' },
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
            <button style={s.btnSm} onClick={() => getSupabaseBrowser().auth.signOut()}>Sign Out</button>
          </div>
        </nav>

        <main style={s.main}>

          {/* ── WORLD TAB ── */}
          {tab === 'world' && (
            <div>
              <h1 style={s.pageTitle}>World Canon</h1>
              <p style={s.pageSub}>Your world's lore is the AI DM's source of truth. Paste or type it here.</p>
              <div style={s.grid2}>
                <div style={s.card}>
                  <div style={s.cardTitle}>🌍 World Settings</div>
                  {worlds.length > 0 && (
                    <>
                      <label style={s.label}>Active World</label>
                      <select style={s.select} value={activeWorldId || ''}
                        onChange={e => {
                          if (e.target.value === 'new') { setActiveWorldId(null); setWorldName(''); setWorldDesc(''); setCanonText('') }
                          else { setActiveWorldId(e.target.value); const w = worlds.find(x => x.id === e.target.value); if (w) { setWorldName(w.name); setWorldDesc(w.description || '') } }
                        }}>
                        {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        <option value="new">+ New world</option>
                      </select>
                    </>
                  )}
                  <label style={s.label}>World Name</label>
                  <input style={s.input} value={worldName} onChange={e => setWorldName(e.target.value)} placeholder="e.g. Sorasula" />
                  <label style={s.label}>Description</label>
                  <textarea style={{ ...s.input, height: 64, resize: 'vertical' }} value={worldDesc} onChange={e => setWorldDesc(e.target.value)} placeholder="Brief description for the AI DM..." />
                </div>

                <div style={s.card}>
                  <div style={s.cardTitle}>📊 Campaign Stats</div>
                  <div style={s.statGrid}>
                    <div style={s.statBox}><div style={s.statVal}>{worlds.length}</div><div style={s.statLabel}>Worlds</div></div>
                    <div style={s.statBox}><div style={s.statVal}>{players.length}</div><div style={s.statLabel}>Players</div></div>
                    <div style={s.statBox}><div style={s.statVal}>{totalMessages}</div><div style={s.statLabel}>Messages</div></div>
                  </div>
                  {activeWorld && <p style={{ fontSize: 12, color: '#5a4a30', marginTop: 12, fontStyle: 'italic' }}>Last updated: {new Date(activeWorld.updated_at).toLocaleDateString()}</p>}
                </div>
              </div>

              <div style={{ ...s.card, marginTop: 16 }}>
                <div style={s.cardTitle}>📜 World Canon Text</div>
                <p style={{ fontSize: 13, color: '#7a6a50', fontStyle: 'italic', marginBottom: 10 }}>
                  Paste your world lore here. History, factions, locations, NPCs, secrets. The AI DM reads all of this but only shares what each character would know.
                </p>
                <textarea style={{ ...s.input, height: 320, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                  value={canonText}
                  onChange={e => setCanonText(e.target.value)}
                  placeholder={`WORLD: Sorasula\n\nGEOGRAPHY\nSorasula is a floating archipelago...\n\nFACTIONS\nThe Order of the Amber Disc...\n\nSECRETS (DM only)\n...`}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                  <button style={s.btnPrimary} onClick={saveWorld} disabled={saving}>
                    {saving ? 'Saving...' : activeWorldId ? '💾 Save World' : '✨ Create World'}
                  </button>
                  {saveMsg && <span style={{ fontSize: 13, color: saveMsg.startsWith('✓') ? '#5aaa5a' : '#c04040' }}>{saveMsg}</span>}
                </div>
              </div>
            </div>
          )}

          {/* ── PLAYERS TAB ── */}
          {tab === 'players' && (
            <div>
              <h1 style={s.pageTitle}>Players</h1>
              <p style={s.pageSub}>Add players and share their unique portal links.</p>
              {!activeWorldId && <div style={s.warning}>⚠ Create a world first before adding players.</div>}
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
                            onClick={() => { setSelectedPlayer(p); setTab('knowledge'); loadPlayerKnowledge(p) }}>
                            🧠
                          </button>
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
                    Each link is unique to that player. They don't need accounts — just the link.
                  </p>
                  {players.length === 0
                    ? <p style={s.empty}>Links appear as you add players.</p>
                    : players.map(p => (
                      <div key={p.id} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: '#c9933a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{p.name}</div>
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

          {/* ── KNOWLEDGE TAB ── */}
          {tab === 'knowledge' && (
            <div>
              <h1 style={s.pageTitle}>Character Knowledge Manager</h1>
              <p style={s.pageSub}>Grant, edit, or revoke what each character knows. This updates in real time — the AI DM uses it immediately.</p>

              {players.length === 0 && <div style={s.warning}>⚠ Add players first.</div>}

              <div style={s.grid2}>
                {/* Player selector */}
                <div>
                  <div style={s.card}>
                    <div style={s.cardTitle}>Select Character</div>
                    {players.map(p => (
                      <div key={p.id} style={{ ...s.playerRow, cursor: 'pointer', ...(selectedPlayer?.id === p.id ? { border: '1px solid rgba(201,147,58,0.5)', background: '#231a0a' } : {}) }}
                        onClick={() => loadPlayerKnowledge(p)}>
                        <div style={s.playerAvatar}>{p.name.slice(0, 2).toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{p.character_name || p.name}</div>
                          <div style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic' }}>{p.character_class || 'No class set'}</div>
                        </div>
                        <span style={{ fontSize: 12, color: '#7a6a50' }}>{knowledge.filter(k => !selectedPlayer || selectedPlayer.id === p.id).length} entries</span>
                      </div>
                    ))}
                  </div>

                  {selectedPlayer && (
                    <div style={{ ...s.card, marginTop: 14 }}>
                      <div style={s.cardTitle}>➕ Grant Knowledge</div>
                      <label style={s.label}>Category</label>
                      <select style={s.select} value={newKnow.category} onChange={e => setNewKnow(n => ({ ...n, category: e.target.value }))}>
                        {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                      </select>
                      <label style={s.label}>Title</label>
                      <input style={s.input} value={newKnow.title} onChange={e => setNewKnow(n => ({ ...n, title: e.target.value }))} placeholder="e.g. The Vault of Keth" />
                      <label style={s.label}>What they know</label>
                      <textarea style={{ ...s.input, height: 72, resize: 'vertical' }} value={newKnow.content} onChange={e => setNewKnow(n => ({ ...n, content: e.target.value }))} placeholder="Describe what the character knows about this..." />
                      <button style={s.btnPrimary} onClick={grantKnowledge}>Grant Knowledge</button>
                    </div>
                  )}
                </div>

                {/* Knowledge ledger + sessions */}
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
                            ? <p style={s.empty}>No knowledge entries yet. Grant some above, or they'll be auto-added after sessions.</p>
                            : knowledge.map(k => (
                              <div key={k.id} style={{ ...s.card, marginBottom: 10, opacity: k.is_active ? 1 : 0.45 }}>
                                {editingId === k.id ? (
                                  <div>
                                    <select style={{ ...s.select, marginBottom: 6 }} value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))}>
                                      {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input style={{ ...s.input, marginBottom: 6 }} value={editData.title} onChange={e => setEditData(d => ({ ...d, title: e.target.value }))} />
                                    <textarea style={{ ...s.input, height: 64, resize: 'vertical' }} value={editData.content} onChange={e => setEditData(d => ({ ...d, content: e.target.value }))} />
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
                                        <button style={{ ...s.btnSm }} onClick={() => toggleKnowledge(k.id, !k.is_active)}>
                                          {k.is_active ? 'Hide' : 'Show'}
                                        </button>
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
                            ? <p style={s.empty}>No sessions yet. Summaries are auto-generated when players end a session.</p>
                            : sessions.map((sess, i) => (
                              <div key={sess.id} style={{ ...s.card, marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <span style={{ fontFamily: 'Georgia, serif', fontSize: 12, color: '#e8b86d', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                    Session {sessions.length - i}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#5a4a30', fontStyle: 'italic' }}>
                                    {new Date(sess.started_at).toLocaleDateString()} · {sess.message_count} messages
                                  </span>
                                </div>
                                {sess.summary
                                  ? <p style={{ fontSize: 13, color: '#b8a888', lineHeight: 1.7 }}>{sess.summary}</p>
                                  : <p style={{ fontSize: 13, color: '#5a4a30', fontStyle: 'italic' }}>Session in progress or no summary generated.</p>
                                }
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ ...s.card, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                      <p style={{ color: '#5a4a30', fontStyle: 'italic', fontSize: 15 }}>← Select a character to manage their knowledge</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── LOGS TAB ── */}
          {tab === 'logs' && (
            <div>
              <h1 style={s.pageTitle}>Session Logs</h1>
              <p style={s.pageSub}>Every question and answer, across all players and sessions.</p>
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
                        <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, color: '#e8b86d', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          {m.players?.character_name || m.players?.name || '?'}{m.players?.character_class ? ` · ${m.players.character_class}` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 10, padding: '2px 6px', background: m.role === 'user' ? 'rgba(201,147,58,0.1)' : 'rgba(139,32,32,0.1)', border: `1px solid ${m.role === 'user' ? 'rgba(201,147,58,0.3)' : 'rgba(192,64,64,0.3)'}`, borderRadius: 4, color: m.role === 'user' ? '#c9933a' : '#c04040' }}>
                            {m.role === 'user' ? 'Player' : 'DM'}
                          </span>
                          <span style={{ fontSize: 11, color: '#5a4a30', fontStyle: 'italic' }}>{new Date(m.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <p style={{ fontSize: 14, color: '#b8a888', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.content}</p>
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
  input: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' as any },
  select: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '8px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' as any },
  label: { display: 'block', fontSize: 11, color: '#7a6a50', letterSpacing: '0.1em', textTransform: 'uppercase' as any, marginBottom: 4 },
  btnPrimary: { background: '#c9933a', color: '#0d0a07', border: 'none', borderRadius: 6, padding: '10px 20px', fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' as any, width: '100%' },
  btnSm: { background: 'transparent', color: '#c9933a', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 5, padding: '4px 10px', fontFamily: 'Georgia, serif', fontSize: 11, cursor: 'pointer' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  statBox: { background: '#231a0a', border: '1px solid rgba(201,147,58,0.12)', borderRadius: 8, padding: 10, textAlign: 'center' as any },
  statVal: { fontSize: 24, fontWeight: 700, color: '#e8b86d' },
  statLabel: { fontSize: 11, color: '#7a6a50', fontStyle: 'italic' as any, marginTop: 2 },
  playerRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: '#161008', border: '1px solid rgba(201,147,58,0.12)', borderRadius: 8, marginBottom: 8 },
  playerAvatar: { width: 38, height: 38, borderRadius: '50%', background: '#231a0a', border: '1.5px solid rgba(201,147,58,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#e8b86d', flexShrink: 0 },
  badgeGreen: { fontSize: 10, padding: '2px 7px', border: '1px solid #3a7a3a', borderRadius: 4, color: '#5aaa5a' },
  badgeRed: { fontSize: 10, padding: '2px 7px', border: '1px solid #8b2020', borderRadius: 4, color: '#c04040' },
  linkBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#231a0a', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6 },
  linkUrl: { fontFamily: 'monospace', fontSize: 12, color: '#c9933a', wordBreak: 'break-all' as any, marginRight: 10 },
  subTab: { fontSize: 12, padding: '8px 16px', border: 'none', background: 'transparent', color: '#7a6a50', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1 },
  subTabActive: { color: '#e8b86d', borderBottomColor: '#e8b86d' },
  catBadge: { fontSize: 10, padding: '2px 7px', border: '1px solid rgba(201,147,58,0.3)', borderRadius: 4, color: '#c9933a', textTransform: 'uppercase' as any },
  logEntry: { padding: '12px 0', borderBottom: '1px solid rgba(201,147,58,0.08)' },
  warning: { padding: '10px 14px', background: 'rgba(139,32,32,0.1)', border: '1px solid rgba(192,64,64,0.3)', borderRadius: 8, fontSize: 13, color: '#c04040', marginBottom: 16 },
  empty: { fontSize: 13, color: '#7a6a50', fontStyle: 'italic' as any },
}
