import { getSupabaseAdmin } from '../../../lib/supabase'

export const runtime = 'edge'

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { token, sessionId } = await req.json()
  if (!token || !sessionId) return new Response(JSON.stringify({ error: 'token and sessionId required' }), { status: 400 })

  const db = getSupabaseAdmin()

  // Verify player
  const { data: player } = await db
    .from('players').select('*').eq('invite_token', token).single()
  if (!player) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 404 })

  // Load world name
  const { data: world } = await db
    .from('worlds').select('name, description').eq('id', player.world_id).single()

  // Load all messages from this session
  const { data: messages } = await db
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .eq('player_id', player.id)
    .order('created_at', { ascending: true })

  if (!messages || messages.length < 2) {
    // Not enough content to summarize
    await db.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
    return new Response(JSON.stringify({ success: true, summarized: false }))
  }

  const transcript = messages.map(m =>
    `${m.role === 'user' ? player.character_name || 'Player' : 'DM'}: ${m.content}`
  ).join('\n\n')

  // Load existing knowledge to avoid duplicates
  const { data: existingKnowledge } = await db
    .from('character_knowledge')
    .select('title')
    .eq('player_id', player.id)

  const existingTitles = (existingKnowledge || []).map(k => k.title.toLowerCase())

  // Ask Claude to summarize and extract new knowledge
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
        content: `You are summarizing a D&D session for the campaign memory system of world "${world?.name}".

CHARACTER: ${player.character_name || 'Unknown'} (${player.character_class || 'Unknown class'})

SESSION TRANSCRIPT:
${transcript.slice(0, 8000)}

EXISTING KNOWLEDGE TITLES (don't duplicate these):
${existingTitles.join(', ') || 'none yet'}

Please respond with ONLY valid JSON in this exact format:
{
  "summary": "A 3-5 sentence narrative summary of what happened this session, written from the character's perspective. What did they learn, do, discover, or experience?",
  "new_knowledge": [
    {
      "category": "one of: location|npc|faction|event|secret|item|lore",
      "title": "Short label (e.g. 'The Sunken Temple', 'Commander Vex', 'Order of the Veil')",
      "content": "1-3 sentences of what the character now knows about this"
    }
  ]
}

Only include knowledge entries for genuinely new facts the character learned this session that aren't already in existing knowledge. If nothing new was learned, return empty array.`
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
      // If JSON parse fails, use raw text as summary
      summary = text.slice(0, 500)
    }
  }

  // Save everything
  await db.from('sessions').update({
    ended_at: new Date().toISOString(),
    summary,
    summary_generated_at: new Date().toISOString(),
    message_count: messages.length
  }).eq('id', sessionId)

  // Save new knowledge entries
  if (newKnowledge.length > 0) {
    const entries = newKnowledge
      .filter(k => k.title && k.content && !existingTitles.includes(k.title.toLowerCase()))
      .map(k => ({
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

  return new Response(JSON.stringify({
    success: true,
    summarized: true,
    summary,
    newKnowledgeCount: newKnowledge.length
  }), { headers: { 'Content-Type': 'application/json' } })
}
