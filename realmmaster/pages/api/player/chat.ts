import { buildPlayerMemory, buildSystemPrompt } from '../../../lib/memory'
import { getSupabaseAdmin } from '../../../lib/supabase'

export const runtime = 'edge'

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { token, message, sessionId } = await req.json()
  if (!token || !message) return new Response(JSON.stringify({ error: 'token and message required' }), { status: 400 })

  const db = getSupabaseAdmin()

  // Build full memory context
  const memory = await buildPlayerMemory(token)
  if (!memory) return new Response(JSON.stringify({ error: 'Invalid invite link' }), { status: 404 })

  const { player, world } = memory

  // Get or create session
  let currentSessionId = sessionId
  if (!currentSessionId) {
    const { data: newSession } = await db.from('sessions').insert({
      player_id: player.id,
      world_id: world.id
    }).select().single()
    currentSessionId = newSession?.id
  }

  // Save user message
  await db.from('messages').insert({
    player_id: player.id,
    world_id: world.id,
    session_id: currentSessionId,
    role: 'user',
    content: message
  })

  // Build conversation for Claude (recent messages only — older context comes from summaries)
  const conversationMessages = [
    ...memory.recentMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user' as const, content: message }
  ]

  // Stream from Anthropic
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: buildSystemPrompt(memory),
      messages: conversationMessages,
      stream: true
    })
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return new Response(JSON.stringify({ error: err }), { status: 500 })
  }

  // Transform the stream and save the response
  let fullResponse = ''

  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk)
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
              fullResponse += data.delta.text
              controller.enqueue(new TextEncoder().encode(
                `data: ${JSON.stringify({ text: data.delta.text, sessionId: currentSessionId })}\n\n`
              ))
            }
            if (data.type === 'message_stop') {
              controller.enqueue(new TextEncoder().encode(
                `data: ${JSON.stringify({ done: true, sessionId: currentSessionId })}\n\n`
              ))
              // Save assistant response + update session count
              await Promise.all([
                db.from('messages').insert({
                  player_id: player.id,
                  world_id: world.id,
                  session_id: currentSessionId,
                  role: 'assistant',
                  content: fullResponse
                }),
                db.from('sessions')
                  .update({ message_count: db.rpc('increment', { row_id: currentSessionId }) })
                  .eq('id', currentSessionId)
              ])
            }
          } catch {}
        }
      }
    }
  })

  return new Response(
    anthropicRes.body!.pipeThrough(transformStream),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    }
  )
}
