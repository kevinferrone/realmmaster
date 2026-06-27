import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

interface Message { role: 'user' | 'assistant'; content: string; id: string }

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
  const idx = RENOWN_LEVELS.indexOf(current)
  const next = RENOWN_LEVELS[idx + 1] || null
  return { ...current, next }
}

export default function PlayerPortal() {
  const router = useRouter()
  const { token } = router.query as { token: string }

  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<any>(null)
  const [world, setWorld] = useState<any>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'setup' | 'chat'>('setup')

  const [charName, setCharName] = useState('')
  const [charClass, setCharClass] = useState('')
  const [charBg, setCharBg] = useState('')
  const [charKnow, setCharKnow] = useState('')
  const [sheetText, setSheetText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')

  const [renown, setRenown] = useState<any>(null)
  const [spendPoints, setSpendPoints] = useState('')
  const [spendReason, setSpendReason] = useState('')
  const [spendMsg, setSpendMsg] = useState('')
  const [spending, setSpending] = useState(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionEnding, setSessionEnding] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (token) loadPlayer() }, [token])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadPlayer() {
    const r = await fetch(`/api/player/setup?token=${token}`)
    if (!r.ok) { setError('Invalid or expired invite link.'); setLoading(false); return }
    const d = await r.json()
    setPlayer(d.player); setWorld(d.world)
    if (d.player.character_name) {
      setCharName(d.player.character_name || '')
      setCharClass(d.player.character_class || '')
      setCharBg(d.player.character_background || '')
      setCharKnow(d.player.character_knowledge || '')
      setSheetText(d.player.character_sheet_text || '')
      setTab('chat')
      setMessages([{ role: 'assistant', content: `Welcome back, ${d.player.character_name}. The world of ${d.world?.name || 'the realm'} holds many secrets. What would you know?`, id: 'welcome' }])
    }
    setLoading(false)
    loadRenown()
  }

  async function loadRenown() {
    const r = await fetch(`/api/player/renown?token=${token}`)
    if (r.ok) {
      const d = await r.json()
      setRenown(d)
    }
  }

  async function saveCharacter() {
    if (!charName.trim()) { setSaveStatus('Enter your character name.'); return }
    setSaving(true); setSaveStatus('Saving...')
    const r = await fetch('/api/player/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, characterName: charName, characterClass: charClass, characterBackground: charBg, characterKnowledge: charKnow, sheetText })
    })
    const d = await r.json()
    if (d.success) {
      setSaveStatus('✓ Saved!')
      setMessages([{ role: 'assistant', content: `Welcome, ${charName}. I know your history and your path. Ask me anything about ${world?.name || 'this world'}.`, id: 'w2' }])
      setTimeout(() => setTab('chat'), 600)
    } else {
      setSaveStatus('Error: ' + d.error)
    }
    setSaving(false)
  }

  async function spendRenown() {
    const pts = parseInt(spendPoints)
    if (!pts || pts <= 0) { setSpendMsg('Enter a valid number of points.'); return }
    if (!spendReason.trim()) { setSpendMsg('Please enter a reason for spending.'); return }
    setSpending(true); setSpendMsg('')
    const r = await fetch('/api/player/renown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, points: pts, reason: spendReason })
    })
    const d = await r.json()
    if (d.success) {
      setRenown(d)
      setSpendPoints('')
      setSpendReason('')
      if (d.leveledUp) {
        setSpendMsg(`✓ Spent ${pts} points! You are now ${d.level.level}!`)
      } else {
        setSpendMsg(`✓ Spent ${pts} renown points.`)
      }
    } else {
      setSpendMsg('Error: ' + d.error)
    }
    setSpending(false)
  }

  async function sendMessage() {
    if (!input.trim() || chatLoading) return
    const text = input.trim()
    setInput('')
    setChatLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: text, id: Date.now().toString() }])

    const r = await fetch('/api/player/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, message: text, sessionId })
    })

    const d = await r.json()
    if (d.reply) {
      setMessages(prev => [...prev, { role: 'assistant', content: d.reply, id: 'dm-' + Date.now() }])
      if (d.sessionId && !sessionId) setSessionId(d.sessionId)
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: 'The arcane connection falters... please try again.', id: 'err-' + Date.now() }])
    }
    setChatLoading(false)
  }

  async function endSession() {
    if (!sessionId || sessionEnding) return
    setSessionEnding(true)
    const r = await fetch('/api/player/end-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, sessionId })
    })
    const d = await r.json()
    setSessionEnded(true)
    setSessionEnding(false)
    if (d.summary) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `*— Session concluded —*\n\n${d.summary}\n\n${d.newKnowledgeCount > 0 ? `📚 ${d.newKnowledgeCount} new knowledge ${d.newKnowledgeCount === 1 ? 'entry has' : 'entries have'} been added to your character's ledger.` : ''}`,
        id: 'session-end'
      }])
    }
  }

  function newSession() {
    setSessionId(null)
    setSessionEnded(false)
    setMessages([{ role: 'assistant', content: `A new session begins, ${charName}. What would you know?`, id: 'new-' + Date.now() }])
  }

  if (loading) return <div style={s.center}>✦ Entering the realm...</div>
  if (error) return <div style={s.center}><p style={{ color: '#c04040' }}>{error}</p></div>

  const renownLevel = renown ? getRenownLevel(renown.total_used) : getRenownLevel(0)
  const nextLevel = renownLevel.next
  const progressPct = nextLevel
    ? Math.round(((renown?.total_used || 0) - renownLevel.points) / (nextLevel.points - renownLevel.points) * 100)
    : 100

  return (
    <>
      <Head><title>{world?.name || 'RealmMaster'} — {charName || 'Player Portal'}</title></Head>
      <div style={s.root}>
        <nav style={s.nav}>
          <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span></div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ ...s.tab, ...(tab === 'setup' ? s.tabActive : {}) }} onClick={() => setTab('setup')}>🧙 Character</button>
            <button style={{ ...s.tab, ...(tab === 'chat' ? s.tabActive : {}) }} onClick={() => setTab('chat')}>💬 Chat</button>
            <a href={`/world-map?token=${token}`} style={{ textDecoration: 'none' }}>
              <button style={s.tab}>🗺 Map</button>
            </a>
          </div>
          <div style={{ textAlign: 'right' as any }}>
            <div style={{ fontSize: 13, color: '#c9933a' }}>{world?.name}</div>
            <div style={{ fontSize: 11, color: '#7a6a50', fontStyle: 'italic' }}>{player?.name}</div>
          </div>
        </nav>

        <main style={s.main}>

          {tab === 'setup' && (
            <div>
              <h1 style={s.title}>Your Character</h1>
              <p style={s.sub}>The AI DM answers only through the lens of your character's knowledge.</p>

              <div style={s.grid2}>
                <div>
                  <div style={s.card}>
                    <div style={s.cardTitle}>🧙 Identity</div>
                    <input style={s.input} value={charName} onChange={e => setCharName(e.target.value)} placeholder="Character name" />
                    <input style={s.input} value={charClass} onChange={e => setCharClass(e.target.value)} placeholder="Class & race (e.g. Half-Elf Ranger, Lv. 5)" />
                    <textarea style={{ ...s.input, height: 90, resize: 'vertical' as any }} value={charBg} onChange={e => setCharBg(e.target.value)} placeholder="Your background and history..." />
                    <textarea style={{ ...s.input, height: 90, resize: 'vertical' as any }} value={charKnow} onChange={e => setCharKnow(e.target.value)} placeholder="What does your character know about this world at campaign start?" />
                  </div>

                  <div style={{ ...s.card, marginTop: 14 }}>
                    <div style={s.cardTitle}>📄 Character Sheet</div>
                    <textarea style={{ ...s.input, height: 120, resize: 'vertical' as any, fontFamily: 'monospace', fontSize: 12 }} value={sheetText} onChange={e => setSheetText(e.target.value)} placeholder="Paste character sheet contents here..." />
                  </div>

                  {saveStatus && <p style={{ fontSize: 13, color: saveStatus.startsWith('✓') ? '#5aaa5a' : '#c04040', margin: '8px 0' }}>{saveStatus}</p>}
                  <button style={{ ...s.btnPrimary, marginTop: 14, width: '100%' }} onClick={saveCharacter} disabled={saving}>
                    {saving ? 'Saving...' : '⚡ Save & Enter the World'}
                  </button>
                </div>

                <div>
                                    {/* Renown Card */}
                  <div style={s.card}>
                    <div style={s.cardTitle}>⭐ Renown</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                      <div style={s.statBox}>
                        <div style={s.statVal}>{renown?.total_earned || 0}</div>
                        <div style={s.statLabel}>Earned</div>
                      </div>
                      <div style={s.statBox}>
                        <div style={s.statVal}>{renown?.total_used || 0}</div>
                        <div style={s.statLabel}>Used</div>
                      </div>
                      <div style={s.statBox}>
                        <div style={s.statVal}>{renown?.available || 0}</div>
                        <div style={s.statLabel}>Available</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#e8b86d' }}>{renownLevel.level}</span>
                        {nextLevel && <span style={{ fontSize: 12, color: '#7a6a50' }}>{nextLevel.level} at {nextLevel.points} pts used</span>}
                      </div>
                      <div style={{ height: 6, background: 'rgba(201,147,58,0.15)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', background: '#c9933a', borderRadius: 3, width: `${progressPct}%`, transition: 'width 0.5s ease' }} />
                      </div>
                      <p style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic' }}>{renownLevel.description}</p>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(201,147,58,0.15)', paddingTop: 14 }}>
                      <div style={s.cardTitle}>Spend Renown Points</div>
                      <p style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic', marginBottom: 10 }}>
                        Spend points to gain renown levels and unlock benefits granted by your DM.
                      </p>
                      <input style={s.input} type="number" value={spendPoints} onChange={e => setSpendPoints(e.target.value)} placeholder="Points to spend" />
                      <input style={s.input} value={spendReason} onChange={e => setSpendReason(e.target.value)} placeholder="What are you spending them on?" />
                      <button style={s.btnPrimary} onClick={spendRenown} disabled={spending || !renown?.available}>
                        {spending ? 'Spending...' : 'Spend Renown'}
                      </button>
                      {spendMsg && <p style={{ fontSize: 13, color: spendMsg.startsWith('✓') ? '#5aaa5a' : '#c04040', marginTop: 8 }}>{spendMsg}</p>}
                    </div>

                    {renown?.transactions?.length > 0 && (
                      <div style={{ borderTop: '1px solid rgba(201,147,58,0.15)', paddingTop: 14, marginTop: 14 }}>
                        <div style={s.cardTitle}>Recent Transactions</div>
                        {renown.transactions.slice(0, 5).map((t: any) => (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(201,147,58,0.08)', fontSize: 12 }}>
                            <span style={{ color: t.type === 'earned' ? '#5aaa5a' : '#c9933a' }}>
                              {t.type === 'earned' ? '+' : '-'}{t.points} — {t.reason}
                            </span>
                            <span style={{ color: '#5a4a30' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid rgba(201,147,58,0.15)', paddingTop: 14, marginTop: 14 }}>
                      <div style={s.cardTitle}>🏆 Renown Levels</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: '#7a6a50' }}>
                            <th style={{ padding: '5px 6px' }}>Level</th>
                            <th style={{ padding: '5px 6px' }}>Used to reach</th>
                            <th style={{ padding: '5px 6px' }}>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {RENOWN_LEVELS.map(l => (
                            <tr key={l.level} style={{ borderTop: '1px solid rgba(201,147,58,0.12)', ...(l.level === renownLevel.level ? { background: 'rgba(201,147,58,0.12)' } : {}) }}>
                              <td style={{ padding: '5px 6px', color: '#e8b86d', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.level}</td>
                              <td style={{ padding: '5px 6px', color: '#c9933a' }}>{l.points}</td>
                              <td style={{ padding: '5px 6px', color: '#b8a888' }}>{l.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                    <div style={{ borderTop: '1px solid rgba(201,147,58,0.15)', paddingTop: 14 }}>
                      <div style={s.cardTitle}>Spend Renown Points</div>
                      <p style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic', marginBottom: 10 }}>
                        Spend points to gain renown levels and unlock benefits granted by your DM.
                      </p>
                      <input style={s.input} type="number" value={spendPoints} onChange={e => setSpendPoints(e.target.value)} placeholder="Points to spend" />
                      <input style={s.input} value={spendReason} onChange={e => setSpendReason(e.target.value)} placeholder="What are you spending them on?" />
                      <button style={s.btnPrimary} onClick={spendRenown} disabled={spending || !renown?.available}>
                        {spending ? 'Spending...' : 'Spend Renown'}
                      </button>
                      {spendMsg && <p style={{ fontSize: 13, color: spendMsg.startsWith('✓') ? '#5aaa5a' : '#c04040', marginTop: 8 }}>{spendMsg}</p>}
                    </div>

                    {renown?.transactions?.length > 0 && (
                      <div style={{ borderTop: '1px solid rgba(201,147,58,0.15)', paddingTop: 14, marginTop: 14 }}>
                        <div style={s.cardTitle}>Recent Transactions</div>
                        {renown.transactions.slice(0, 5).map((t: any) => (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(201,147,58,0.08)', fontSize: 12 }}>
                            <span style={{ color: t.type === 'earned' ? '#5aaa5a' : '#c9933a' }}>
                              {t.type === 'earned' ? '+' : '-'}{t.points} — {t.reason}
                            </span>
                            <span style={{ color: '#5a4a30' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <h1 style={s.title}>Speak with the World</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {renown && (
                    <span style={{ fontSize: 12, color: '#c9933a', fontStyle: 'italic' }}>
                      ⭐ {renownLevel.level} · {renown.available} pts available
                    </span>
                  )}
        
                </div>
              </div>
              <p style={s.sub}>Answering as <em>{charName || 'an unnamed adventurer'}</em> — only what your character would know.</p>

              <div style={s.chatWrap}>
                <div style={s.chatHeader}>
                  <div style={s.chatAvatar}>🎲</div>
                  <div>
                    <div style={{ fontSize: 14, color: '#e8b86d' }}>The Dungeon Master</div>
                    <div style={{ fontSize: 12, color: '#7a6a50', fontStyle: 'italic' }}>
                      {chatLoading ? 'Consulting the ancient lore...' : sessionEnded ? 'Session concluded' : 'Ready'}
                    </div>
                  </div>
                </div>

                <div style={s.messages}>
                  {messages.map(m => (
                    <div key={m.id} style={{ ...s.msg, ...(m.role === 'user' ? s.msgUser : {}) }}>
                      <div style={{ ...s.avatar, ...(m.role === 'user' ? s.avatarUser : s.avatarDm) }}>
                        {m.role === 'user' ? (charName?.slice(0, 2).toUpperCase() || 'ME') : 'DM'}
                      </div>
                      <div style={{ ...s.bubble, ...(m.role === 'user' ? s.bubbleUser : s.bubbleDm) }}>
                        {m.content.split('\n').map((line, i) => <span key={i}>{line}{i < m.content.split('\n').length - 1 ? <br /> : ''}</span>)}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={s.msg}>
                      <div style={{ ...s.avatar, ...s.avatarDm }}>DM</div>
                      <div style={{ ...s.bubble, ...s.bubbleDm, opacity: 0.5 }}>▌</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div style={s.inputRow}>
                  <textarea style={{ ...s.chatInput, opacity: sessionEnded ? 0.5 : 1 }} value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder={sessionEnded ? 'Start a new session to continue...' : 'Ask the DM a question as your character...'}
                    disabled={chatLoading || sessionEnded} />
                  <button style={{ ...s.sendBtn, opacity: chatLoading || sessionEnded ? 0.4 : 1 }} onClick={sendMessage} disabled={chatLoading || sessionEnded}>➤</button>
                </div>
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
  center: { background: '#0d0a07', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9933a', fontSize: 18 },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60, borderBottom: '1px solid rgba(201,147,58,0.2)', background: 'rgba(13,10,7,0.95)', position: 'sticky', top: 0, zIndex: 100 },
  logo: { fontSize: 20, fontWeight: 700, color: '#e8b86d' },
  tab: { fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: '#7a6a50', cursor: 'pointer' },
  tabActive: { background: '#1a1206', color: '#e8b86d', border: '1px solid rgba(201,147,58,0.3)' },
  main: { maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' },
  title: { fontSize: 26, fontWeight: 700, color: '#f5d49a', marginBottom: 4 },
  sub: { fontSize: 15, color: '#7a6a50', fontStyle: 'italic', marginBottom: 24 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
  card: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.18)', borderRadius: 10, padding: '1.25rem' },
  cardTitle: { fontSize: 12, letterSpacing: '0.12em', color: '#e8b86d', marginBottom: 12, textTransform: 'uppercase' },
  input: { width: '100%', background: '#0d0a07', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  btnPrimary: { background: '#c9933a', color: '#0d0a07', border: 'none', borderRadius: 6, padding: '11px 20px', fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' },
  btnSm: { background: 'transparent', color: '#c9933a', border: '1px solid rgba(201,147,58,0.35)', borderRadius: 5, padding: '5px 12px', fontFamily: 'Georgia, serif', fontSize: 11, cursor: 'pointer' },
  statBox: { background: '#231a0a', border: '1px solid rgba(201,147,58,0.12)', borderRadius: 8, padding: 10, textAlign: 'center' },
  statVal: { fontSize: 22, fontWeight: 700, color: '#e8b86d' },
  statLabel: { fontSize: 11, color: '#7a6a50', fontStyle: 'italic', marginTop: 2 },
  chatWrap: { background: '#1a1206', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 520 },
  chatHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid rgba(201,147,58,0.12)', background: '#231a0a' },
  chatAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#4a0a0a', border: '1.5px solid #8b2020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 },
  messages: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  msg: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  msgUser: { flexDirection: 'row-reverse' },
  avatar: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2 },
  avatarDm: { background: '#4a0a0a', border: '1px solid #8b2020', color: '#ff9090' },
  avatarUser: { background: 'rgba(201,147,58,0.15)', border: '1px solid rgba(201,147,58,0.3)', color: '#e8b86d' },
  bubble: { maxWidth: '78%', padding: '10px 14px', borderRadius: 10, fontSize: 14, lineHeight: 1.7 },
  bubbleDm: { background: '#231a0a', border: '1px solid rgba(201,147,58,0.1)', borderBottomLeftRadius: 2, color: '#e8dcc8' },
  bubbleUser: { background: 'rgba(201,147,58,0.09)', border: '1px solid rgba(201,147,58,0.22)', borderBottomRightRadius: 2, color: '#e8dcc8' },
  inputRow: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(201,147,58,0.12)', background: '#231a0a' },
  chatInput: { flex: 1, background: '#0d0a07', border: '1px solid rgba(201,147,58,0.18)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Georgia, serif', fontSize: 14, color: '#e8dcc8', outline: 'none', resize: 'none', height: 42 },
  sendBtn: { width: 42, height: 42, borderRadius: 6, border: '1px solid rgba(201,147,58,0.35)', background: 'rgba(201,147,58,0.08)', color: '#c9933a', cursor: 'pointer', fontSize: 16, flexShrink: 0 },
}
