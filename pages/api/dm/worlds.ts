import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export const runtime = 'edge'

export default async function handler(req: Request) {
  const user = await getUserFromHeader(req.headers.get('authorization'))
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const db = getSupabaseAdmin()

  if (req.method === 'GET') {
    const { data: worlds } = await db
      .from('worlds')
      .select('id, name, description, created_at, updated_at')
      .eq('dm_id', user.id)
      .order('updated_at', { ascending: false })
    return new Response(JSON.stringify({ worlds: worlds || [] }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (req.method === 'POST') {
    const { name, description, canonText } = await req.json()
    const { data: world, error } = await db
      .from('worlds')
      .insert({ dm_id: user.id, name, description, canon_text: canonText || '' })
      .select().single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    return new Response(JSON.stringify({ world }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PATCH') {
    const { worldId, name, description, canonText } = await req.json()
    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (canonText !== undefined) updates.canon_text = canonText
    updates.updated_at = new Date().toISOString()

    await db.from('worlds').update(updates).eq('id', worldId).eq('dm_id', user.id)
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405 })
}
