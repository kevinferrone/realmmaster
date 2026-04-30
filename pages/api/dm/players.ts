import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  if (req.method === 'GET') {
    const worldId = req.query.worldId as string
    if (!worldId) return res.status(400).json({ error: 'worldId required' })

    const { data: players } = await db
      .from('players')
      .select('id, name, email, invite_token, character_name, character_class, created_at')
      .eq('world_id', worldId)
      .eq('dm_id', user.id)
      .order('created_at', { ascending: true })

    const playerIds = (players || []).map(p => p.id)
    const messageCounts: Record<string, number> = {}
    if (playerIds.length > 0) {
      const { data: msgs } = await db
        .from('messages')
        .select('player_id')
        .in('player_id', playerIds)
        .eq('role', 'user')
      for (const m of msgs || []) {
        messageCounts[m.player_id] = (messageCounts[m.player_id] || 0) + 1
      }
    }

    return res.json({
      players: (players || []).map(p => ({ ...p, messageCount: messageCounts[p.id] || 0 }))
    })
  }

  if (req.method === 'POST') {
    const { worldId, name, email } = req.body
    const { data: world } = await db
      .from('worlds').select('id').eq('id', worldId).eq('dm_id', user.id).single()
    if (!world) return res.status(403).json({ error: 'Forbidden' })

    const { data: player, error } = await db
      .from('players')
      .insert({ world_id: worldId, dm_id: user.id, name, email: email || null })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ player })
  }

  if (req.method === 'DELETE') {
    const { playerId } = req.body
    await db.from('players').delete().eq('id', playerId).eq('dm_id', user.id)
    return res.json({ success: true })
  }

  return res.status(405).end()
}
