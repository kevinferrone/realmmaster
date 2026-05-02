import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  if (req.method === 'GET') {
    const playerId = req.query.playerId as string
    if (!playerId) return res.status(400).json({ error: 'playerId required' })

    const { data: player } = await db
      .from('players').select('world_id').eq('id', playerId).single()
    if (!player) return res.status(404).json({ error: 'Not found' })

    const { data: world } = await db
      .from('worlds').select('id').eq('id', player.world_id).eq('dm_id', user.id).single()
    if (!world) return res.status(403).json({ error: 'Forbidden' })

    const [{ data: knowledge }, { data: sessions }] = await Promise.all([
      db.from('character_knowledge')
        .select('*')
        .eq('player_id', playerId)
        .order('granted_at', { ascending: true }),
      db.from('sessions')
        .select('id, started_at, ended_at, summary, message_count')
        .eq('player_id', playerId)
        .order('started_at', { ascending: false })
    ])

    return res.json({ knowledge: knowledge || [], sessions: sessions || [] })
  }

  if (req.method === 'POST') {
    const { playerId, partyId, category, title, content } = req.body

    // Grant to a single player
    if (playerId) {
      const { data: player } = await db
        .from('players').select('world_id').eq('id', playerId).single()
      if (!player) return res.status(404).json({ error: 'Not found' })

      const { data: world } = await db
        .from('worlds').select('id').eq('id', player.world_id).eq('dm_id', user.id).single()
      if (!world) return res.status(403).json({ error: 'Forbidden' })

      const { data: entry, error } = await db.from('character_knowledge').insert({
        player_id: playerId,
        world_id: player.world_id,
        category,
        title,
        content,
        source: 'dm_granted'
      }).select().single()

      if (error) return res.status(500).json({ error: error.message })
      return res.json({ entry, grantedTo: 1 })
    }

    // Grant to entire party
    if (partyId) {
      const { data: party } = await db
        .from('parties').select('world_id').eq('id', partyId).eq('dm_id', user.id).single()
      if (!party) return res.status(403).json({ error: 'Forbidden' })

      const { data: members } = await db
        .from('party_members')
        .select('player_id')
        .eq('party_id', partyId)

      if (!members || members.length === 0) {
        return res.status(400).json({ error: 'Party has no members' })
      }

      const entries = members.map(m => ({
        player_id: m.player_id,
        world_id: party.world_id,
        category,
        title,
        content,
        source: 'dm_granted'
      }))

      const { error } = await db.from('character_knowledge').insert(entries)
      if (error) return res.status(500).json({ error: error.message })

      return res.json({ success: true, grantedTo: members.length })
    }

    return res.status(400).json({ error: 'playerId or partyId required' })
  }

  if (req.method === 'PATCH') {
    const { entryId, title, content, category, is_active } = req.body
    const updates: any = {}
    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (category !== undefined) updates.category = category
    if (is_active !== undefined) updates.is_active = is_active
    await db.from('character_knowledge').update(updates).eq('id', entryId)
    return res.json({ success: true })
  }

  if (req.method === 'DELETE') {
    const { entryId } = req.body
    await db.from('character_knowledge').delete().eq('id', entryId)
    return res.json({ success: true })
  }

  return res.status(405).end()
}
