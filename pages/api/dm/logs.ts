import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()
  const worldId = req.query.worldId as string
  const playerId = req.query.playerId as string
  const limit = parseInt(req.query.limit as string || '100')

  if (!worldId) return res.status(400).json({ error: 'worldId required' })

  const { data: world } = await db
    .from('worlds').select('id').eq('id', worldId).eq('dm_id', user.id).single()
  if (!world) return res.status(403).json({ error: 'Forbidden' })

  let query = db
    .from('messages')
    .select('id, role, content, created_at, player_id, session_id, players(name, character_name, character_class)')
    .eq('world_id', worldId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (playerId) query = query.eq('player_id', playerId)

  const { data: messages } = await query
  return res.json({ messages: messages || [] })
}
