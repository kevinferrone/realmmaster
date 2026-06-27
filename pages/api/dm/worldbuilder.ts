import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

const CANON_SECTIONS = [
  '## GEOGRAPHY & LOCATIONS',
  '## FACTIONS & ORGANIZATIONS',
  '## NPCS & CHARACTERS',
  '## HISTORY & TIMELINE',
  '## MAGIC & MECHANICS',
  '## CULTURE & SOCIETY',
  '## GM ONLY — SECRETS & MYSTERIES',
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  // POST: send a message to the world builder
  if (req.method === 'POST') {
    const { worldId, message, history } = req.body
    if (!worldId || !message) return res.status(400).json({ error: 'worldId and message required' })

    const { data: world } = await db
      .from('worlds')
      .select('name, description, canon_text')
      .eq('id', worldId)
      .eq('dm_id', user.id)
      .single()

    if (!world) return res.status(403).json({ error: 'Forbidden' })

    const canonContext = world.canon_text?.trim()
      ? `EXISTING WORLD CANON:\n${world.canon_text}`
      : 'No canon has been written yet. Help the DM build this world from scratch.'

    const systemPrompt = `You are a creative world-building collaborator helping a Dungeon Master develop their tabletop RPG world called "${world.name}".

YOUR ROLE:
- Help the DM develop rich, consistent, interesting lore
- Ask probing questions to flesh out details
- Suggest implications and connections to existing lore
- Flag any conflicts with existing canon
- Be additive — build on what exists, don't contradict it
- After developing something interesting, remind the DM they can commit it to lore

CANON SECTIONS AVAILABLE:
${CANON_SECTIONS.join('\n')}

IMPORTANT: After any exchange that produces something worth keeping, end your response with:
"💡 Worth committing? Click 'Commit to Lore' to save this to your world canon."

${canonContext}

Respond conversationally. Be creative, enthusiastic, and collaborative. Ask one good follow-up question at the end of each response to keep the world-building going.`

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
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })
    })

    const data = await response.json()
    const reply = data.content?.[0]?.text || ''

    return res.json({ reply })
  }

  return res.status(405).end()
}
