import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getSupabaseAdmin()
  const url = new URL(req.url!, `http://${req.headers.host}`)

  // GET: fetch all locations for a world with reveal status per player
  if (req.method === 'GET') {
    const worldId = url.searchParams.get('worldId')
    if (!worldId) return res.status(400).json({ error: 'worldId required' })

    const { data: locations } = await db
      .from('map_locations')
      .select('*')
      .eq('world_id', worldId)
      .order('created_at', { ascending: true })

    const { data: reveals } = await db
      .from('location_reveals')
      .select('location_id, player_id')
      .eq('world_id', worldId)

    return res.json({ locations: locations || [], reveals: reveals || [] })
  }

  // Auth required for everything below
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  // POST: create a new location pin
  if (req.method === 'POST') {
    const { worldId, name, lore, xPercent, yPercent } = req.body
    if (!worldId || !name || xPercent === undefined || yPercent === undefined) {
      return res.status(400).json({ error: 'worldId, name, xPercent, yPercent required' })
    }

    const { data: location, error } = await db
      .from('map_locations')
      .insert({
        world_id: worldId,
        dm_id: user.id,
        name,
        lore: lore || '',
        x_percent: xPercent,
        y_percent: yPercent
      })
      .select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ location })
  }

  // PATCH: update location name/lore
  if (req.method === 'PATCH') {
    const { locationId, name, lore, xPercent, yPercent } = req.body
    const updates: any = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (lore !== undefined) updates.lore = lore
    if (xPercent !== undefined) updates.x_percent = xPercent
    if (yPercent !== undefined) updates.y_percent = yPercent

    await db.from('map_locations').update(updates)
      .eq('id', locationId).eq('dm_id', user.id)
    return res.json({ success: true })
  }

  // DELETE: remove a location pin
  if (req.method === 'DELETE') {
    const { locationId } = req.body
    await db.from('map_locations').delete()
      .eq('id', locationId).eq('dm_id', user.id)
    return res.json({ success: true })
  }

  return res.status(405).end()
}
