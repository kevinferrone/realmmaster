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
      setSheetText(d.player.character_sheet_text || '')
      setTab('chat')
      setMessages([{ role: 'assistant', content: `Welcome back, ${d.player.character_name}. The world of ${d.world?.name || 'the realm'} holds many secrets. What would you know?`, id: 'welcome' }])
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
      setMessages(prev => [...prev, { role: 'assistant', content: 'The arcane connection falters... please try again.', id: 'err-' + Date.now() }]), id:
