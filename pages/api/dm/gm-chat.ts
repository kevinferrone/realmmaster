import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export const config = { maxDuration: 60 }

// GM Assistant — DM-only chat with full, unrestricted campaign knowledge. Can answer
// history questions AND generate encounters/NPCs/handouts/items grounded in the campaign.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).end()

  const { worldId, message, history, focusType, focusId } = req.body
  if (!worldId || !message) return res.status(400).json({ error: 'worldId and message required' })

  const db = getSupabaseAdmin()
  const { data: world } = await db
    .from('worlds').select('name, description, canon_text')
    .eq('id', worldId).eq('dm_id', user.id).single()
  if (!world) return res.status(403).json({ error: 'Forbidden' })

  // Optional focus: scope campaign knowledge to a single character or a whole party.
  let focusLabel = ''
  let focusPlayerIds: string[] | null = null
  if (focusType === 'player' && focusId) {
    const { data: p } = await db
      .from('players').select('character_name, name')
      .eq('id', focusId).eq('world_id', worldId).single()
    if (p) { focusLabel = p.character_name || p.name; focusPlayerIds = [focusId] }
  } else if (focusType === 'party' && focusId) {
    const { data: party } = await db
      .from('parties').select('name').eq('id', focusId).eq('world_id', worldId).single()
    const { data: mem } = await db
      .from('party_members').select('player_id').eq('party_id', focusId)
    if (party) { focusLabel = party.name; focusPlayerIds = (mem || []).map((m: any) => m.player_id) }
  }

  const { data: players } = await db
    .from('players').select('character_name, name, character_class, character_background')
    .eq('world_id', worldId)
  const roster = (players || []).map((p: any) =>
    `- ${p.character_name || p.name}${p.character_class ? ` (${p.character_class})` : ''}${p.character_background ? ` — ${String(p.character_background).slice(0, 200)}` : ''}`
  ).join('\n')

  let kq = db
    .from('character_knowledge').select('category, title, content')
    .eq('world_id', worldId).eq('is_active', true)
  if (focusPlayerIds) kq = kq.in('player_id', focusPlayerIds)
  const { data: knowledge } = await kq
  const seen = new Set<string>()
  const byCat: Record<string, string[]> = {}
  for (const k of (knowledge || [])) {
    const key = `${k.title || ''}|${k.content || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!byCat[k.category]) byCat[k.category] = []
    byCat[k.category].push(`  - ${k.title}: ${k.content}`)
  }
  const knowledgeBlock = Object.entries(byCat)
    .map(([c, items]) => `${c.toUpperCase()}:\n${items.join('\n')}`)
    .join('\n\n') || 'No campaign knowledge recorded yet.'

  const { data: playSessions } = await db
    .from('play_sessions').select('title, summary, created_at')
    .eq('world_id', worldId).eq('status', 'committed')
    .order('created_at', { ascending: true })
  const recaps = (playSessions || [])
    .filter((s: any) => s.summary)
    .map((s: any, i: number) => `SESSION ${i + 1}${s.title ? ` — ${s.title}` : ''}:\n${s.summary}`)
    .join('\n\n') || 'No session recaps yet.'

  const canon = (world.canon_text || '').slice(0, 60000)

  const focusNote = focusLabel
    ? `\nCURRENT FOCUS: ${focusLabel}. The GM has scoped this conversation to ${focusLabel}. The CAMPAIGN KNOWLEDGE below is limited to what ${focusLabel} knows. Center your answers, encounters, hooks, and items on ${focusLabel}; use WORLD CANON and SESSION RECAPS for grounding, but don't assume ${focusLabel} knows things outside their knowledge below or general world canon.\n`
    : ''
  const knowledgeHeading = focusLabel
    ? `CAMPAIGN KNOWLEDGE (everything ${focusLabel} has learned so far)`
    : 'CAMPAIGN KNOWLEDGE (everything the party has learned so far)'

  const systemPrompt = `You are the Game Master's creative assistant and campaign oracle for the world "${world.name}". You sit behind the GM screen and have full, unrestricted knowledge of the campaign.${focusNote}

WHAT YOU DO:
- Answer questions about campaign history, NPCs, places, items, and events — accurately, from the data below.
- Generate encounters that tie back to established NPCs, threads, and places. If the GM gives a party level, scale to it.
- Create new NPCs, handouts (written in an NPC's voice), items, and plot hooks — consistent with the established world.
- Suggest content tailored to a specific character using their class, background, and what they've done.

RULES:
- Ground everything in the campaign data below. When you reference something that already exists, get it right.
- You MAY invent new content when the GM asks you to create something — keep it consistent with the world, and note when something is newly invented.
- This is the GM's private tool: you may discuss secrets and anything in the world. Be concise and table-ready.

WORLD: ${world.name}
${world.description || ''}

CHARACTERS:
${roster || 'No characters yet.'}

${knowledgeHeading}:
${knowledgeBlock}

SESSION RECAPS:
${recaps}

WORLD CANON:
${canon || 'No canon written yet.'}`

  const messages = [...(Array.isArray(history) ? history : []), { role: 'user', content: message }]

  const aRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1500, system: systemPrompt, messages })
  })

  const text = await aRes.text()
  if (!aRes.ok) return res.status(500).json({ error: 'Anthropic API error', status: aRes.status, details: text })
  const data = JSON.parse(text)
  return res.json({ reply: data.content?.[0]?.text || '' })
}
