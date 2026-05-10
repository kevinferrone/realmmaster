import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

const KNOWLEDGE_CATEGORIES = ['location', 'faction', 'npc', 'item', 'event', 'lore', 'secret']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method !== 'POST') return res.status(405).end()

  const db = getSupabaseAdmin()
  const { worldId, message, history, players } = req.body
  if (!worldId || !message) return res.status(400).json({ error: 'worldId and message required' })

  const { data: world } = await db
    .from('worlds')
    .select('name, canon_text')
    .eq('id', worldId)
    .eq('dm_id', user.id)
    .single()
  if (!world) return res.status(403).json({ error: 'Forbidden' })

  const canonText = world.canon_text?.trim() || 'No canon has been written yet.'
  const playerList = (players || [])
    .map((p: any) => `- ${p.character_name || p.name}${p.character_class ? ` (${p.character_class})` : ''}`)
    .join('\n')

  const systemPrompt = `You are Peekaboo, helping a Dungeon Master manage what their player characters know in the world "${world.name}".

YOUR ONLY JOB HERE: Help the DM decide what knowledge to grant to players, then propose entries for their review.

WHAT YOU CAN DO:
- Search the world canon and answer questions about locations, NPCs, factions, etc.
- Propose player-facing knowledge entries for the DM to review and grant

WHAT YOU CANNOT DO:
- Add anything to world canon or lore — that is only possible in the Worlds tab or Map tab
- If the DM asks to add to canon or world lore, tell them clearly: "To add to world canon, use the Worlds tab or the Map tab."
- Never claim to have saved, stored, or added anything

CURRENT PLAYERS:
${playerList || 'No players added yet.'}

KNOWLEDGE CATEGORIES: ${KNOWLEDGE_CATEGORIES.join(', ')}

WORLD CANON (read-only reference):
${canonText}

WHEN PROPOSING KNOWLEDGE TO GRANT, include this block at the end of your reply:
\`\`\`suggestions
[
  {
    "category": "location",
    "title": "Entry Title",
    "content": "What the character knows, written from their in-world perspective. 2-4 sentences. No DM secrets."
  }
]
\`\`\`
Then say: "Review the entries in the panel and choose who to grant them to."

If the request is vague, ask one clarifying question before proposing entries.`

  const messages = [
    ...(history || []),
    { role: 'user', content: message }
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: systemPrompt,
      messages
    })
  })

  const data = await response.json()
  const raw = data.content?.[0]?.text || ''

  const suggestionsMatch = raw.match(/```suggestions\n([\s\S]*?)```/)
  let suggestions: any[] = []
  if (suggestionsMatch) {
    try { suggestions = JSON.parse(suggestionsMatch[1].trim()) } catch {}
  }

  const reply = raw.replace(/```suggestions\n[\s\S]*?```/, '').trim()

  return res.json({ reply, suggestions })
}
