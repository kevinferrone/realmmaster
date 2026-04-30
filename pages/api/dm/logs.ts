import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export const runtime = 'edge'

export default async function handler(req: Request) {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const user = await getUserFromHeader(req.headers.get('authorization'))
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const worldId = url.searchParams.get('worldId')
  const playerId = url.searchParams.get('playerId')
  const limit = parseInt(url.searchParams.get('limit') || '100')

  if (!worldId) return new Response(JSON.stringify({ error: 'worldId required' }), { status: 400 })

  const { data: world } = await db
    .from('worlds').select('id').eq('id', worldId).eq('dm_id', user.id).single()
  if (!world) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

  let query = db
    .from('messages')
    .select('id, role, content, created_at, player_id, session_id, players(name, character_name, character_class)')
    .eq('world_id', worldId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (playerId) query = query.eq('player_id', playerId)

  const { data: messages } = await query
  return new Response(JSON.stringify({ messages: messages || [] }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
