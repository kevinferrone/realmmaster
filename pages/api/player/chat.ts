import type { NextApiRequest, NextApiResponse } from 'next'
import { buildPlayerMemory, buildSystemPrompt } from '../../../lib/memory'
import { getSupabaseAdmin } from '../../../lib/supabase'

// Lets a player record backstory/character facts by telling the chat. Appended to the
// read-only recall prompt; the endpoint parses the block and writes the ledger entry.
const REMEMBER_INSTRUCTION = `

ADDING TO THE LEDGER:
If the player TELLS you something new about their own character — backstory, past deeds, people or places from their history, things they personally did or experienced — record it. To save it, end your reply with a fenced block exactly like this:
\`\`\`remember
[{"category": "lore", "title": "Short label", "content": "What to remember, 1-2 sentences."}]
\`\`\`
Rules:
- Only include a remember block when the player is TELLING you something to remember — never when they are only asking a question.
- Pick category from: location, faction, npc, item, event, lore, secret.
- You may include multiple entries if they told you several things.
- After the block, confirm in one sentence what you recorded. (The remember block does not count toward your sentence limit.)`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { token, message, sessionId } = req.body
  if (!token || !message) return res.status(400).json({ error: 'token and message required' })

  const db = getSupabaseAdmin()
  const memory = await buildPlayerMemory(token)
  if (!memory) return res.status(404).json({ error: 'Invalid invite link' })

  const { player, world } = memory

  let currentSessionId = sessionId
  if (!currentSessionId) {
    const { data: newSession } = await db.from('sessions').insert({
      player_id: player.id,
      world_id: world.id
    }).select().single()
    currentSessionId = newSession?.id
  }

  const { data: priorMsgs } = await db
    .from('messages')
    .select('role, content')
    .eq('session_id', currentSessionId)
    .order('created_at', { ascending: true })
    .limit(20)

  await db.from('messages').insert({
    player_id: player.id,
    world_id: world.id,
    session_id: currentSessionId,
    role: 'user',
    content: message
  })

  const conversationMessages = [
    ...(priorMsgs || []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: message }
  ]

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system: buildSystemPrompt(memory) + REMEMBER_INSTRUCTION,
      messages: conversationMessages
    })
  })

  const responseText = await anthropicRes.text()
  if (!anthropicRes.ok) {
    return res.status(500).json({ error: 'Anthropic API error', status: anthropicRes.status, details: responseText })
  }

  const data = JSON.parse(responseText)
  const raw = data.content?.[0]?.text || ''

  // If the model emitted a remember-block, actually save it to this player's ledger.
  const blockMatch = raw.match(/```remember\s*([\s\S]*?)```/)
  let reply = raw
  if (blockMatch) {
    try {
      const entries = JSON.parse(blockMatch[1].trim())
      const rows = (Array.isArray(entries) ? entries : [])
        .map((e: any) => ({
          player_id: player.id,
          world_id: world.id,
          category: e.category || 'lore',
          title: e.title,
          content: e.content,
          source: 'auto_extracted',
          is_active: true
        }))
        .filter((r: any) => r.title && r.content)
      if (rows.length) await db.from('character_knowledge').insert(rows)
    } catch {}
    reply = raw.replace(/```remember\s*[\s\S]*?```/, '').trim()
  }

  await db.from('messages').insert({
    player_id: player.id,
    world_id: world.id,
    session_id: currentSessionId,
    role: 'assistant',
    content: reply
  })

  return res.json({ reply, sessionId: currentSessionId })
}
