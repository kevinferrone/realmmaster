import type { NextApiRequest, NextApiResponse } from 'next'
import { buildPlayerMemory, buildSystemPrompt } from '../../../lib/memory'
import { getSupabaseAdmin } from '../../../lib/supabase'

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

  await db.from('messages').insert({
    player_id: player.id,
    world_id: world.id,
    session_id: currentSessionId,
    role: 'user',
    content: message
  })

  const conversationMessages = [
    ...memory.recentMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
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
      max_tokens: 1024,
      system: buildSystemPrompt(memory),
      messages: conversationMessages
    })
  })

  const responseText = await anthropicRes.text()

  if (!anthropicRes.ok) {
    return res.status(500).json({ 
      error: 'Anthropic API error', 
      status: anthropicRes.status,
      details: responseText
    })
  }

  const data = JSON.parse(responseText)
  const reply = data.content?.[0]?.text || ''

  await db.from('messages').insert({
    player_id: player.id,
    world_id: world.id,
    session_id: currentSessionId,
    role: 'assistant',
    content: reply
  })

  return res.json({ reply, sessionId: currentSessionId })
}
