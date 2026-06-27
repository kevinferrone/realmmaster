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

  if (req.method === 'POST') {
    const { worldId, locationName, message, history, action } = req.body
    if (!worldId || !locationName) return res.status(400).json({ error: 'worldId and locationName required' })

    const { data: world } = await db
      .from('worlds')
      .select('name, canon_text')
      .eq('id', worldId)
      .eq('dm_id', user.id)
      .single()
    if (!world) return res.status(403).json({ error: 'Forbidden' })

    const canonText = world.canon_text || ''

    // Check if this location name exists in canon (case-insensitive)
    const locationExists = canonText.toLowerCase().includes(locationName.toLowerCase())

    // Extract the canon lines most relevant to this location
    let locationCanonSnippet = ''
    if (locationExists) {
      const lines = canonText.split('\n')
      const relevant = lines.filter(line =>
        line.toLowerCase().includes(locationName.toLowerCase())
      )
      locationCanonSnippet = relevant.join('\n').trim()
    }

    // --- action: 'extract' — pull clean pin lore from conversation history ---
    if (action === 'extract') {
      if (!history || history.length === 0) {
        return res.json({ pinLore: '' })
      }

      const extractPrompt = [
        `You are extracting clean, player-facing lore for a specific location in a D&D world.`,
        `Location name: "${locationName}"`,
        `World: "${world.name}"`,
        ``,
        `CONVERSATION TO EXTRACT FROM:`,
        ...history.map((m: any) => `${m.role === 'user' ? 'DM' : 'Peekaboo'}: ${m.content}`),
        ``,
        `Write a single coherent paragraph of lore about "${locationName}" based only on what was established in this conversation.`,
        `Rules:`,
        `- Write in an evocative, atmospheric style appropriate for a fantasy setting`,
        `- Include only concrete, established facts — no suggestions, no questions, no meta-commentary`,
        `- Do not start with the location name as the first word`,
        `- Do not use phrases like "as we discussed" or "based on our conversation"`,
        `- If nothing concrete was established about the location, return exactly: NO_LORE`,
      ].join('\n')

      const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 512,
          messages: [{ role: 'user', content: extractPrompt }]
        })
      })

      const extractData = await extractRes.json()
      const raw = extractData.content?.[0]?.text?.trim() || ''
      const pinLore = raw === 'NO_LORE' ? '' : raw

      return res.json({ pinLore, locationExists })
    }

    // --- default action: chat ---
    if (!message) return res.status(400).json({ error: 'message required' })

    const canonContext = canonText.trim()
      ? `FULL WORLD CANON:\n${canonText}`
      : 'No canon has been written yet for this world.'

    const locationContext = locationExists
      ? `\n\nIMPORTANT — "${locationName}" ALREADY EXISTS IN CANON:\n${locationCanonSnippet}\n\nYou MUST work strictly within this established canon. Do not invent details that contradict what is already written. You CAN expand on existing details, add atmosphere, or suggest hooks — but flag any potential contradictions immediately and refuse to establish contradicting facts. If the DM proposes something that contradicts canon, push back clearly.`
      : `\n\nNOTE: "${locationName}" does not yet appear in the world canon. You are helping establish this location's lore for the first time. Stay consistent with the world's overall tone and existing lore from the canon below.`

    const systemPrompt = `You are Peekaboo, a world-building companion helping a Dungeon Master develop lore for a specific location in their tabletop RPG world called "${world.name}".

YOUR FOCUS: The location "${locationName}"

YOUR ROLE:
- Help the DM develop rich, internally consistent lore for this location
- Pull relevant information from world canon when asked, or proactively surface it when relevant
- Suggest interesting details, atmosphere, NPCs, history, and adventure hooks
- Keep all lore consistent with the existing world canon
- If "${locationName}" exists in canon, never allow the DM to contradict it — flag conflicts immediately
- After developing meaningful lore, remind the DM they can extract it as Pin Lore and optionally commit it to Canon
- Keep responses focused and concise — this is sidebar chat, not an essay

AVAILABLE CANON SECTIONS (for committing new lore):
${CANON_SECTIONS.join('\n')}
${locationContext}

${canonContext}`

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
        max_tokens: 800,
        system: systemPrompt,
        messages
      })
    })

    const data = await response.json()
    const reply = data.content?.[0]?.text || ''

    return res.json({ reply, locationExists, locationCanonSnippet })
  }

  return res.status(405).end()
}
