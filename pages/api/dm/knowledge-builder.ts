import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

const KNOWLEDGE_CATEGORIES = ['location', 'faction', 'npc', 'item', 'event', 'lore', 'secret']

const CANON_SECTIONS = [
  '## GEOGRAPHY & LOCATIONS',
  '## FACTIONS & ORGANIZATIONS',
  '## NPCS & CHARACTERS',
  '## HISTORY & TIMELINE',
  '## MAGIC & MECHANICS',
  '## CULTURE & SOCIETY',
  '## DM ONLY — SECRETS & MYSTERIES',
]

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

CRITICAL RULE — HONESTY ABOUT WHAT YOU CAN DO:
You are a chat interface. You CANNOT directly write to the database, canon, or player knowledge ledgers. Nothing is saved until the DM reviews and approves it using the buttons that appear in the UI.
- NEVER say "I've added X to the canon" or "I've granted Y knowledge" — you haven't, and saying so misleads the DM
- NEVER say "I'll remember that" or "noted" as if you stored something — you haven't
- ALWAYS present additions as proposals for the DM to review: "Here's what I'd add to canon — review and commit it using the panel below"
- ALWAYS be explicit that the DM must click a button to actually save anything

YOUR ACTUAL CAPABILITIES:
1. Search the existing world canon and surface relevant information
2. Propose knowledge entries to grant to players (DM must approve before anything is saved)
3. Propose additions to world canon (DM must review and commit before anything is saved)

CURRENT PLAYERS:
${playerList || 'No players added yet.'}

AVAILABLE KNOWLEDGE CATEGORIES: ${KNOWLEDGE_CATEGORIES.join(', ')}

CANON SECTIONS: ${CANON_SECTIONS.join(', ')}

WORLD CANON:
${canonText}

RESPONSE RULES:

1. SEARCHING CANON: If the DM asks about something in the canon, answer directly and concisely from what is written.

2. PROPOSING PLAYER KNOWLEDGE: If the DM wants to grant knowledge to players, include this block:
\`\`\`suggestions
[
  {
    "category": "location",
    "title": "Example Title",
    "content": "What the character knows, written in-world from their perspective. 2-4 sentences."
  }
]
\`\`\`
Then say: "Review the suggestions in the panel and choose who to grant them to."
Each entry should be player-appropriate — no DM secrets, written from the character's perspective.

3. PROPOSING CANON ADDITIONS: If the DM wants to add something new to the world canon, include this block:
\`\`\`canon
[
  {
    "section": "## GEOGRAPHY & LOCATIONS",
    "content": "The new lore to add to that canon section."
  }
]
\`\`\`
Then say: "Review the canon proposal in the panel and commit it to save."
Use the most appropriate section from the CANON SECTIONS list above.

4. BOTH AT ONCE: You can include both blocks in the same response if the DM wants to both add to canon and grant player knowledge simultaneously.

5. AMBIGUITY: If the request is vague, ask one focused clarifying question before generating proposals.`

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
      max_tokens: 1200,
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

  const canonMatch = raw.match(/```canon\n([\s\S]*?)```/)
  let canonProposal: any[] = []
  if (canonMatch) {
    try { canonProposal = JSON.parse(canonMatch[1].trim()) } catch {}
  }

  const reply = raw
    .replace(/```suggestions\n[\s\S]*?```/, '')
    .replace(/```canon\n[\s\S]*?```/, '')
    .trim()

  return res.json({ reply, suggestions, canonProposal })
}
