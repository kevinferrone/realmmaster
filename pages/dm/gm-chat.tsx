import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { getSupabaseBrowser } from '../../lib/supabase'

export default function GMChatPage() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [worlds, setWorlds] = useState<any[]>([])
  const [worldId, setWorldId] = useState('')
  const [players, setPlayers] = useState<any[]>([])
  const [parties, setParties] = useState<any[]>([])
  const [focus, setFocus] = useState('world')   // 'world' | `party:<id>` | `player:<id>`
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, sess) => setSession(sess))
    return () => subscription.unsubscribe()
  }, [])

  const token = session?.access_token
  const authH: any = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {}

  useEffect(() => {
    if (!token) return
    fetch('/api/dm/worlds', { headers: authH })
      .then(r => r.json())
      .then(d => { setWorlds(d.worlds || []); if ((d.worlds || [])[0]) setWorldId(d.worlds[0].id) })
      .catch(() => {})
  }, [token])

  // Load the chosen world's characters and parties so the GM can focus on one.
  useEffect(() => {
    if (!token || !worldId) { setPlayers([]); setParties([]); return }
    fetch(`/api/dm/players?worldId=${worldId}`, { headers: authH }).then(r => r.json()).then(d => setPlayers(d.players || [])).catch(() => {})
    fetch(`/api/dm/parties?worldId=${worldId}`, { headers: authH }).then(r => r.json()).then(d => setParties(d.parties || [])).catch(() => {})
  }, [token, worldId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function send() {
    if (!input.trim() || busy || !worldId) return
    const userMsg = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next); setInput(''); setBusy(true)
    try {
      const [focusType, focusId] = focus === 'world' ? ['world', ''] : focus.split(':')
      const r = await fetch('/api/dm/gm-chat', {
        method: 'POST', headers: authH,
        body: JSON.stringify({ worldId, message: userMsg.content, history: messages.slice(-10), focusType, focusId })
      })
      const d = await r.json()
      setMessages([...next, { role: 'assistant', content: r.ok ? d.reply : ('Error: ' + (d.error || 'failed')) }])
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: 'Error: ' + e.message }])
    }
    setBusy(false)
  }

  const hints = [
    'Build an encounter that brings back a memorable NPC, scaled for a level 5 party',
    'Write a handout that an NPC would hand the players',
    'What item would one of my players love to find next?',
    'Recap what has happened in the campaign so far',
  ]

  if (loading) return <div style={s.page}><p style={{ color: '#999' }}>Loading…</p></div>
  if (!session) return <div style={s.page}><p style={{ color: '#ddd' }}>Please log in on the <a href="/" style={{ color: '#e08a8a' }}>main portal</a> first.</p></div>

  return (
    <div style={s.page}>
      <Head><title>GM Assistant — RealmMaster</title></Head>
      <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span> · GM Assistant</div>
      <p style={s.sub}>Ask anything about your campaign, or have it build encounters, NPCs, items, and handouts — grounded in everything your party has done.</p>

      <select style={s.input} value={worldId} onChange={e => { setWorldId(e.target.value); setFocus('world'); setMessages([]) }}>
        <option value="">Select a world…</option>
        {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      {worldId && (
        <select style={s.input} value={focus} onChange={e => { setFocus(e.target.value); setMessages([]) }}>
          <option value="world">🌍 Whole world — full campaign</option>
          {parties.length > 0 && (
            <optgroup label="Focus on a party">
              {parties.map(p => <option key={p.id} value={`party:${p.id}`}>🛡 {p.name}</option>)}
            </optgroup>
          )}
          {players.length > 0 && (
            <optgroup label="Focus on a character">
              {players.map(p => <option key={p.id} value={`player:${p.id}`}>{p.character_name || p.name}</option>)}
            </optgroup>
          )}
        </select>
      )}

      {messages.length === 0 && (
        <div style={s.hints}>
          {hints.map(h => <button key={h} style={s.hint} onClick={() => setInput(h)}>{h}</button>)}
        </div>
      )}

      <div style={s.thread}>
        {messages.map((m, i) => (
          <div key={i} style={{ ...s.msg, ...(m.role === 'user' ? s.msgUser : s.msgAsst) }}>
            {m.content.split('\n').map((line: string, j: number, arr: string[]) => <span key={j}>{line}{j < arr.length - 1 ? <br /> : null}</span>)}
          </div>
        ))}
        {busy && <div style={{ ...s.msg, ...s.msgAsst, opacity: 0.6 }}>Consulting the campaign…</div>}
        <div ref={endRef} />
      </div>

      <div style={s.inputRow}>
        <textarea style={s.chatInput} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask your campaign anything, or ask it to create something…" />
        <button style={s.send} onClick={send} disabled={busy || !worldId}>➤</button>
      </div>
    </div>
  )
}

const s: any = {
  page: { minHeight: '100vh', background: '#1a1a1d', color: '#e8e6e1', fontFamily: 'system-ui, sans-serif', padding: '32px 20px', maxWidth: 820, margin: '0 auto' },
  logo: { fontSize: 24, fontWeight: 600 },
  sub: { color: '#999', marginTop: 4, marginBottom: 18 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #3a3a3f', background: '#232327', color: '#e8e6e1', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' },
  hints: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 },
  hint: { textAlign: 'left', background: '#232327', border: '1px solid #3a3a3f', borderRadius: 8, color: '#c9b89a', fontSize: 13, padding: '10px 12px', cursor: 'pointer' },
  thread: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 },
  msg: { borderRadius: 10, padding: '10px 14px', fontSize: 14, lineHeight: 1.6, maxWidth: '90%', whiteSpace: 'pre-wrap' as any },
  msgUser: { alignSelf: 'flex-end', background: '#3a2a2a', color: '#f0d8d8' },
  msgAsst: { alignSelf: 'flex-start', background: '#232327', border: '1px solid #3a3a3f', color: '#e8e6e1' },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end', position: 'sticky' as any, bottom: 16 },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 160, padding: '12px', borderRadius: 10, border: '1px solid #3a3a3f', background: '#232327', color: '#e8e6e1', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' as any },
  send: { background: '#c04040', color: '#fff', border: 'none', borderRadius: 10, width: 48, height: 44, fontSize: 18, cursor: 'pointer' },
}
