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

  const systemPrompt = `You are Peekaboo, a world-building companion helping a Dungeon Master manage what their players know in the tabletop RPG world "${world.name}".

YOUR CAPABILITIES:
1. Search the world canon and surface relevant information about locations, NPCs, factions, items, history, etc.
2. Suggest specific knowledge entries to grant to players — formatted and ready to approve

CURRENT PLAYERS:
${playerList || 'No players added yet.'}

AVAILABLE KNOWLEDGE CATEGORIES: ${KNOWLEDGE_CATEGORIES.join(', ')}

WORLD CANON:
${canonText}

RESPONSE RULES:
- If the DM asks about something in the canon (e.g. "what do we know about Aryn Sora?"), answer from the canon directly and concisely
- If the DM asks to grant knowledge (e.g. "grant the party knowledge of the Crystal Mountains" or "let Kira know about the Azure Sharks"), respond with a brief message AND include a JSON block of knowledge suggestions
- If suggesting knowledge to grant, format it EXACTLY like this at the end of your message:

\`\`\`suggestions
[
  {
    "category": "location",
    "title": "The Crystal Mountains",
    "content": "The Crystal Mountains form an impassable western barrier across Sorasula. Their peaks are riddled with enormous crystal formations that interfere with arcane magic, making the range treacherous for spellcasters."
  }
]
\`\`\`

- Each suggestion should be player-appropriate — no DM secrets, no spoilers
- Content should be atmospheric and written from the character's perspective (what they've heard or observed), not omniscient
- Keep each knowledge entry focused and digestible — 2-4 sentences
- You can suggest multiple entries for one request
- If the DM's request is vague or ambiguous, ask one clarifying question before generating suggestions`

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

  // Parse out suggestions block if present
  const suggestionsMatch = raw.match(/```suggestions\n([\s\S]*?)```/)
  let suggestions: any[] = []
  let reply = raw

  if (suggestionsMatch) {
    try {
      suggestions = JSON.parse(suggestionsMatch[1].trim())
    } catch (e) {
      suggestions = []
    }
    // Strip the suggestions block from the chat reply
    reply = raw.replace(/```suggestions\n[\s\S]*?```/, '').trim()
  }

  return res.json({ reply, suggestions })
}
