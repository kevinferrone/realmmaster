import { useState, useEffect } from 'react'
import Head from 'next/head'
import { getSupabaseBrowser } from '../../lib/supabase'

// Chronicle review screen: paste a session transcript -> extract -> review/re-scope -> save.
// Saved knowledge writes into character_knowledge, so it shows up in the player chat.

export default function ChroniclePage() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [worlds, setWorlds] = useState<any[]>([])
  const [worldId, setWorldId] = useState('')
  const [parties, setParties] = useState<any[]>([])
  const [partyId, setPartyId] = useState('')

  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const [playSessionId, setPlaySessionId] = useState('')
  const [roster, setRoster] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [committed, setCommitted] = useState<number | null>(null)

  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const token = session?.access_token
  const authH: any = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {}

  useEffect(() => {
    if (!token) return
    fetch('/api/dm/worlds', { headers: authH })
      .then(r => r.json()).then(d => setWorlds(d.worlds || [])).catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token || !worldId) { setParties([]); setPartyId(''); return }
    fetch(`/api/dm/parties?worldId=${worldId}`, { headers: authH })
      .then(r => r.json()).then(d => { setParties(d.parties || []); setPartyId((d.parties || [])[0]?.id || '') }).catch(() => {})
  }, [token, worldId])

  async function extract() {
    setError(''); setCommitted(null); setItems([]); setSummary(''); setBusy(true)
    try {
      const r = await fetch('/api/dm/chronicle-extract', {
        method: 'POST', headers: authH,
        body: JSON.stringify({ worldId, partyId: partyId || undefined, transcript, title: title || undefined })
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Extraction failed'); setBusy(false); return }
      setPlaySessionId(d.playSessionId); setSummary(d.summary || ''); setRoster(d.roster || [])
      setItems((d.items || []).map((it: any, i: number) => ({ ...it, _id: i })))
    } catch (e: any) { setError(e.message) }
    setBusy(false)
  }

  function isParty(it: any) { return it.scope === 'party' }
  function knows(it: any, pid: string) { return it.scope === 'party' || (Array.isArray(it.scope) && it.scope.includes(pid)) }

  function setScopeParty(id: number) {
    setItems(items.map(it => it._id === id ? { ...it, scope: 'party' } : it))
  }
  function toggleChar(id: number, pid: string) {
    setItems(items.map(it => {
      if (it._id !== id) return it
      let arr: string[] = it.scope === 'party' ? roster.map(r => r.player_id) : [...(it.scope || [])]
      arr = arr.includes(pid) ? arr.filter(x => x !== pid) : [...arr, pid]
      const scope = arr.length === roster.length ? 'party' : arr
      return { ...it, scope }
    }))
  }
  function edit(id: number, field: string, val: string) {
    setItems(items.map(it => it._id === id ? { ...it, [field]: val } : it))
  }
  function remove(id: number) { setItems(items.filter(it => it._id !== id)) }

  async function commit() {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/dm/chronicle-commit', {
        method: 'POST', headers: authH,
        body: JSON.stringify({ worldId, playSessionId, partyId: partyId || undefined, items })
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Save failed'); setBusy(false); return }
      setCommitted(d.committed); setItems([])
    } catch (e: any) { setError(e.message) }
    setBusy(false)
  }

  const flagged = items.filter(it => it.needs_review).length

  if (loading) return <div style={s.page}><p style={{ color: '#999' }}>Loading…</p></div>
  if (!session) return <div style={s.page}><p style={{ color: '#ddd' }}>Please log in on the <a href="/" style={{ color: '#e08a8a' }}>main portal</a> first, then return here.</p></div>

  return (
    <div style={s.page}>
      <Head><title>Chronicle — Session Review</title></Head>
      <div style={s.logo}>⚔ Realm<span style={{ color: '#c04040' }}>Master</span> · Chronicle</div>
      <p style={s.sub}>Paste a session transcript, review what was learned, then save it to your players.</p>

      <div style={s.row}>
        <select style={s.input} value={worldId} onChange={e => setWorldId(e.target.value)}>
          <option value="">Select a world…</option>
          {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select style={s.input} value={partyId} onChange={e => setPartyId(e.target.value)} disabled={!parties.length}>
          {!parties.length && <option value="">(no parties — uses all players in world)</option>}
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <input style={s.input} placeholder="Session title (optional)" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea style={s.textarea} placeholder="Paste the session transcript here…" value={transcript} onChange={e => setTranscript(e.target.value)} />

      <button style={s.btnPrimary} onClick={extract} disabled={busy || !worldId || !transcript.trim()}>
        {busy ? 'Working…' : 'Extract knowledge'}
      </button>

      {error && <p style={{ color: '#e08a8a', marginTop: 12 }}>{error}</p>}
      {committed !== null && <p style={{ color: '#6fd08a', marginTop: 12 }}>✓ Saved {committed} knowledge entr{committed === 1 ? 'y' : 'ies'} to your players. They can now recall it in their chat.</p>}

      {summary && (
        <div style={s.summaryBox}>
          <div style={s.label}>Session summary</div>
          <p style={{ margin: 0, color: '#ddd' }}>{summary}</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div style={s.reviewHead}>
            <span>{items.length} item{items.length === 1 ? '' : 's'} extracted{flagged ? ` · ${flagged} flagged for review` : ''}</span>
            <button style={s.btnPrimary} onClick={commit} disabled={busy}>Approve &amp; save</button>
          </div>

          {items.map(it => (
            <div key={it._id} style={{ ...s.card, ...(it.needs_review ? s.cardFlag : {}) }}>
              <div style={s.cardTop}>
                <span style={s.cat}>{it.category}</span>
                {it.needs_review && <span style={s.flag}>⚠ {it.review_reason || 'check this'}</span>}
                <button style={s.remove} onClick={() => remove(it._id)}>remove</button>
              </div>
              <input style={s.titleInput} value={it.title || ''} onChange={e => edit(it._id, 'title', e.target.value)} />
              <textarea style={s.contentInput} value={it.content || ''} onChange={e => edit(it._id, 'content', e.target.value)} />
              {it.source_quote && <div style={s.quote}>“{it.source_quote}”</div>}
              <div style={s.scopeRow}>
                <span style={s.scopeLabel}>Known by</span>
                <button style={{ ...s.chip, ...(isParty(it) ? s.chipOn : {}) }} onClick={() => setScopeParty(it._id)}>Party</button>
                {roster.map(r => (
                  <button key={r.player_id}
                    style={{ ...s.chip, ...(knows(it, r.player_id) ? s.chipOn : {}) }}
                    onClick={() => toggleChar(it._id, r.player_id)}>
                    {r.character_name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

const s: any = {
  page: { minHeight: '100vh', background: '#1a1a1d', color: '#e8e6e1', fontFamily: 'system-ui, sans-serif', padding: '32px 20px', maxWidth: 820, margin: '0 auto' },
  logo: { fontSize: 24, fontWeight: 600 },
  sub: { color: '#999', marginTop: 4, marginBottom: 20 },
  row: { display: 'flex', gap: 10 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #3a3a3f', background: '#232327', color: '#e8e6e1', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 160, padding: '10px 12px', borderRadius: 8, border: '1px solid #3a3a3f', background: '#232327', color: '#e8e6e1', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', fontFamily: 'inherit' },
  btnPrimary: { background: '#c04040', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  summaryBox: { background: '#232327', border: '1px solid #3a3a3f', borderRadius: 10, padding: '12px 16px', marginTop: 18 },
  label: { fontSize: 12, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 12px', color: '#bbb', fontSize: 14 },
  card: { background: '#232327', border: '1px solid #3a3a3f', borderRadius: 10, padding: 14, marginBottom: 12 },
  cardFlag: { borderColor: '#a87a2a', background: '#2a2620' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  cat: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#e08a8a', border: '1px solid #5a3030', borderRadius: 6, padding: '2px 8px' },
  flag: { fontSize: 12, color: '#d8b25a', flex: 1 },
  remove: { marginLeft: 'auto', background: 'none', border: 'none', color: '#777', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' },
  titleInput: { width: '100%', background: 'transparent', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 6, boxSizing: 'border-box' },
  contentInput: { width: '100%', background: '#1d1d20', border: '1px solid #34343a', borderRadius: 6, color: '#ddd', fontSize: 14, padding: 8, minHeight: 54, boxSizing: 'border-box', fontFamily: 'inherit' },
  quote: { fontSize: 12.5, color: '#888', fontStyle: 'italic', margin: '8px 0' },
  scopeRow: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
  scopeLabel: { fontSize: 12, color: '#999', marginRight: 4 },
  chip: { fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#999', cursor: 'pointer' },
  chipOn: { background: '#3a2a2a', color: '#e08a8a', borderColor: '#7a4040' },
}
