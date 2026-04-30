import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export const runtime = 'edge'

export default async function handler(req: Request) {
  const user = await getUserFromHeader(req.headers.get('authorization'))
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const db = getSupabaseAdmin()
  const url = new URL(req.url)

  // GET: fetch all knowledge + sessions for a player
  if (req.method === 'GET') {
    const playerId = url.searchParams.get('playerId')
    if (!playerId) return new Response(JSON.stringify({ error: 'playerId required' }), { status: 400 })

    // Verify DM owns this player
    const { data: player } = await db
      .from('players').select('world_id').eq('id', playerId).single()
    if (!player) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    const { data: world } = await db
      .from('worlds').select('id').eq('id', player.world_id).eq('dm_id', user.id).single()
    if (!world) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

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

    return new Response(JSON.stringify({ knowledge: knowledge || [], sessions: sessions || [] }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // POST: DM grants new knowledge to a character
  if (req.method === 'POST') {
    const { playerId, category, title, content } = await req.json()

    const { data: player } = await db
      .from('players').select('world_id').eq('id', playerId).single()
    if (!player) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    const { data: world } = await db
      .from('worlds').select('id').eq('id', player.world_id).eq('dm_id', user.id).single()
    if (!world) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

    const { data: entry, error } = await db.from('character_knowledge').insert({
      player_id: playerId,
      world_id: player.world_id,
      category,
      title,
      content,
      source: 'dm_granted'
    }).select().single()

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    return new Response(JSON.stringify({ entry }), { headers: { 'Content-Type': 'application/json' } })
  }

  // PATCH: edit a knowledge entry or toggle active
  if (req.method === 'PATCH') {
    const { entryId, title, content, category, is_active } = await req.json()

    const updates: any = {}
    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (category !== undefined) updates.category = category
    if (is_active !== undefined) updates.is_active = is_active

    await db.from('character_knowledge').update(updates).eq('id', entryId)
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  // DELETE: remove a knowledge entry
  if (req.method === 'DELETE') {
    const { entryId } = await req.json()
    await db.from('character_knowledge').delete().eq('id', entryId)
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405 })
}
