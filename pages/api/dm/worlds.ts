import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  if (req.method === 'GET') {
    const { data: worlds } = await db
      .from('worlds')
      .select('id, name, description, canon_text, map_image_url, created_at, updated_at')
      .eq('dm_id', user.id)
      .order('updated_at', { ascending: false })
    return res.json({ worlds: worlds || [] })
  }

  if (req.method === 'POST') {
    const { name, description, canonText } = req.body
    const { data: world, error } = await db
      .from('worlds')
      .insert({ dm_id: user.id, name, description, canon_text: canonText || '' })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ world })
  }

  if (req.method === 'PATCH') {
    const { worldId, name, description, canonText, mapImageUrl } = req.body
    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (canonText !== undefined) updates.canon_text = canonText
    if (mapImageUrl !== undefined) updates.map_image_url = mapImageUrl
    updates.updated_at = new Date().toISOString()
    await db.from('worlds').update(updates).eq('id', worldId).eq('dm_id', user.id)
    return res.json({ success: true })
  }

  return res.status(405).end()
}
