import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export const runtime = 'edge'

export default async function handler(req: Request) {
  const user = await getUserFromHeader(req.headers.get('authorization'))
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const db = getSupabaseAdmin()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const worldId = url.searchParams.get('worldId')
    if (!worldId) return new Response(JSON.stringify({ error: 'worldId required' }), { status: 400 })

    const { data: players } = await db
      .from('players')
      .select('id, name, email, invite_token, character_name, character_class, created_at')
      .eq('world_id', worldId)
      .eq('dm_id', user.id)
      .order('created_at', { ascending: true })

    // Get message counts
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

    return new Response(JSON.stringify({
      players: (players || []).map(p => ({ ...p, messageCount: messageCounts[p.id] || 0 }))
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    const { worldId, name, email } = await req.json()
    const { data: world } = await db
      .from('worlds').select('id').eq('id', worldId).eq('dm_id', user.id).single()
    if (!world) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

    const { data: player, error } = await db
      .from('players')
      .insert({ world_id: worldId, dm_id: user.id, name, email: email || null })
      .select().single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    return new Response(JSON.stringify({ player }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'DELETE') {
    const { playerId } = await req.json()
    await db.from('players').delete().eq('id', playerId).eq('dm_id', user.id)
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405 })
}
