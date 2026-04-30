import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

interface Message { role: 'user' | 'assistant'; content: string; id: string }

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
  const [stats, setStats] = useState({ STR: '', DEX: '', INT: '', WIS: '', CHA: '', CON: '' })
  const [sheetText, setSheetText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')

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
      setStats(d.player.character_stats || { STR: '', DEX: '', INT: '', WIS: '', CHA: '', CON: '' })
      setTab('chat')
      setMessages([{ role: 'assistant', content: `Welcome back, ${d.player.character_name}. The world of ${d.world?.name || 'the realm'} awaits. What would you know?`, id: 'welcome' }])
    }
    setLoading(false)
  }

  async function saveCharacter() {
    if (!charName.trim()) { setSaveStatus('Enter your character name.'); return }
    setSaving(true); setSaveStatus('Saving...')
    const r = await fetch('/api/player/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, characterName: charName, characterClass: charClass, characterBackground: charBg, characterKnowledge: charKnow, stats, sheetText })
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

  return (
    <>
      <Head><title>{world?.name || 'RealmMaster'} — {charName || 'Player Portal'}</title></Head>
      <div style={s.root}>
        <nav style={s.nav}>
          <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span></div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ ...s.tab, ...(tab === 'setup' ? s.tabActive : {}) }} onClick={() => setTab('setup')}>🧙 Character</button>
            <button style={{ ...s.tab, ...(tab === 'chat' ? s.tabActive : {}) }} onClick={() => setTab('chat')}>💬 Chat</button>
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
              <p style={s.sub}>The AI DM will only answer through the lens of your character's knowledge.</p>
              <div style={s.grid2}>
                <div style={s.card}>
                  <div style={s.cardTitle}>🧙 Identity</div>
                  <input style={s.input} value={charName} onChange={e => setCharName(e.target.value)} placeholder="Character name" />
                  <input style={s.input} value={charClass} onChange={e => setCharClass(e.target.value)} placeholder="Class & race (e.g. Half-Elf Ranger, Lv. 5)" />
                  <textarea style={{ ...s.input, height: 90, resize: 'vertical' as any }} value={charBg} onChange={e => setCharBg(e.target.value)} placeholder="Your background & history..." />
                  <textarea style={{ ...s.input, height: 90, resize: 'vertical' as any }} value={charKnow} onChange={e => setCharKnow(e.target.value)} placeholder="What does your character know about this world at campaign start?" />
                </div>
                <div>
                  <div style={s.card}>
                    <div style={s.cardTitle}>📄 Character Sheet</div>
                    <textarea style={{ ...s.input, height: 120, resize: 'vertical' as any, fontFamily: 'monospace', fontSize: 12 }} value={sheetText} onChange={e => setSheetText(e.target.value)} placeholder="Paste character sheet contents here..." />
                  </div>
                  <div style={{ ...s.card, marginTop: 14 }}>
                    <div style={s.cardTi
