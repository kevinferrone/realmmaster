import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'
import { buildExtractionSystemPrompt, parseExtraction, RosterMember } from '../../../lib/chronicle'

// Vercel Pro honors this (up to 300). Hobby caps at 10s regardless — long full-session
// transcripts will need the background worker (a later build step); short ones are fine here.
export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).end()

  const { worldId, partyId, transcript, title } = req.body
  if (!worldId || !transcript) return res.status(400).json({ error: 'worldId and transcript required' })

  const db = getSupabaseAdmin()

  // DM must own the world (same check pattern as knowledge-builder).
  const { data: world } = await db
    .from('worlds').select('id, name, canon_text')
    .eq('id', worldId).eq('dm_id', user.id).single()
  if (!world) return res.status(403).json({ error: 'Forbidden' })

  // Roster = party members if a party is given, else all players in the world.
  let roster: RosterMember[] = []
  if (partyId) {
    const { data } = await db
      .from('party_members')
      .select('player_id, players(id, name, character_name, character_class)')
      .eq('party_id', partyId)
    roster = (data || []).map((m: any) => ({
      player_id: m.player_id,
      character_name: m.players?.character_name || m.players?.name || 'Unknown',
      character_class: m.players?.character_class
    }))
  } else {
    const { data } = await db
      .from('players').select('id, name, character_name, character_class')
      .eq('world_id', worldId)
    roster = (data || []).map((p: any) => ({
      player_id: p.id,
      character_name: p.character_name || p.name || 'Unknown',
      character_class: p.character_class
    }))
  }

  const systemPrompt = buildExtractionSystemPrompt(world.name, world.canon_text || '', roster)

  const aRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Extract the knowledge from this session transcript:\n\n${transcript}` }]
    })
  })

  const text = await aRes.text()
  if (!aRes.ok) return res.status(500).json({ error: 'Anthropic API error', status: aRes.status, details: text })

  let extraction
  try {
    extraction = parseExtraction(JSON.parse(text).content?.[0]?.text || '')
  } catch (e: any) {
    return res.status(502).json({ error: 'Could not parse extraction', details: e.message })
  }

  // Stage the draft session. Nothing reaches players until /chronicle-commit.
  const { data: playSession, error } = await db
    .from('play_sessions')
    .insert({
      world_id: worldId,
      party_id: partyId || null,
      title: title || null,
      transcript,
      summary: extraction.summary,
      status: 'draft'
    })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })

  return res.json({
    playSessionId: playSession?.id,
    summary: extraction.summary,
    items: extraction.items,
    roster
  })
}
