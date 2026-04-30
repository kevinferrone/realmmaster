import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { token, sessionId } = req.body
  if (!token || !sessionId) return res.status(400).json({ error: 'token and sessionId required' })

  const db = getSupabaseAdmin()

  const { data: player } = await db
    .from('players').select('*').eq('invite_token', token).single()
  if (!player) return res.status(404).json({ error: 'Invalid token' })

  const { data: world } = await db
    .from('worlds').select('name').eq('id', player.world_id).single()

  const { data: messages } = await db
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('player_id', player.id)
    .order('created_at', { ascending: true })

  if (!messages || messages.length < 2) {
    await db.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
    return res.json({ success: true, summarized: false })
  }

  const transcript = messages.map(m =>
    `${m.role === 'user' ? player.character_name || 'Player' : 'DM'}: ${m.content}`
  ).join('\n\n')

  const { data: existingKnowledge } = await db
    .from('character_knowledge')
    .select('title')
    .eq('player_id', player.id)

  const existingTitles = (existingKnowledge || []).map((k: any) => k.title.toLowerCase())

  const extractionRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are summarizing a D&D session for world "${world?.name}".

CHARACTER: ${player.character_name || 'Unknown'} (${player.character_class || 'Unknown'})

SESSION TRANSCRIPT:
${transcript.slice(0, 8000)}

EXISTING KNOWLEDGE TITLES (don't duplicate):
${existingTitles.join(', ') || 'none yet'}

Respond with ONLY valid JSON:
{
  "summary": "3-5 sentence narrative summary from the character's perspective",
  "new_knowledge": [
    {
      "category": "location|npc|faction|event|secret|item|lore",
      "title": "Short label",
      "content": "1-3 sentences of what the character now knows"
    }
  ]
}`
      }]
    })
  })

  let summary = ''
  let newKnowledge: any[] = []

  if (extractionRes.ok) {
    const data = await extractionRes.json()
    const text = data.content?.[0]?.text || ''
    try {
      const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
      summary = parsed.summary || ''
      newKnowledge = parsed.new_knowledge || []
    } catch {
      summary = text.slice(0, 500)
    }
  }

  await db.from('sessions').update({
    ended_at: new Date().toISOString(),
    summary,
    summary_generated_at: new Date().toISOString(),
    message_count: messages.length
  }).eq('id', sessionId)

  if (newKnowledge.length > 0) {
    const entries = newKnowledge
      .filter((k: any) => k.title && k.content && !existingTitles.includes(k.title.toLowerCase()))
      .map((k: any) => ({
        player_id: player.id,
        world_id: player.world_id,
        session_id: sessionId,
        category: k.category || 'lore',
        title: k.title,
        content: k.content,
        source: 'auto_extracted'
      }))

    if (entries.length > 0) {
      await db.from('character_knowledge').insert(entries)
    }
  }

  return res.json({ success: true, summarized: true, summary, newKnowledgeCount: newKnowledge.length })
}
