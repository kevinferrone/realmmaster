import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

// Receives the GM-reviewed items and writes them into character_knowledge.
// scope "party" → one row per party member (fan-out). scope [player_id,...] → those only.
// is_active=true means it's live in the player's chat immediately; the DM can revoke later.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).end()

  const { worldId, playSessionId, partyId, items } = req.body
  if (!worldId || !Array.isArray(items)) return res.status(400).json({ error: 'worldId and items required' })

  const db = getSupabaseAdmin()
  const { data: world } = await db.from('worlds').select('id').eq('id', worldId).eq('dm_id', user.id).single()
  if (!world) return res.status(403).json({ error: 'Forbidden' })

  // Resolve the full party once, for "party"-scoped facts.
  let partyPlayerIds: string[] = []
  if (partyId) {
    const { data } = await db.from('party_members').select('player_id').eq('party_id', partyId)
    partyPlayerIds = (data || []).map((m: any) => m.player_id)
  } else {
    const { data } = await db.from('players').select('id').eq('world_id', worldId)
    partyPlayerIds = (data || []).map((p: any) => p.id)
  }

  const rows: any[] = []
  for (const item of items) {
    if (item.skip) continue   // GM deleted it in review
    const targets = item.scope === 'party'
      ? partyPlayerIds
      : (Array.isArray(item.scope) ? item.scope : [])
    for (const playerId of targets) {
      rows.push({
        player_id: playerId,
        world_id: worldId,
        category: item.category,
        title: item.title,
        content: item.content,
        source: 'auto_extracted',
        play_session_id: playSessionId || null,
        is_active: true
      })
    }
  }

  if (rows.length) {
    const { error } = await db.from('character_knowledge').insert(rows)
    if (error) return res.status(500).json({ error: error.message })
  }

  if (playSessionId) {
    await db.from('play_sessions').update({ status: 'committed' }).eq('id', playSessionId)
  }

  return res.json({ committed: rows.length, knowledgeRows: rows.length })
}
