import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).end()

  const { worldId, mapScale } = req.body
  if (!worldId) return res.status(400).json({ error: 'worldId required' })

  const db = getSupabaseAdmin()
  const { data: world } = await db
    .from('worlds').select('id, name, map_image_url')
    .eq('id', worldId).eq('dm_id', user.id).single()
  if (!world) return res.status(403).json({ error: 'Forbidden' })
  if (!world.map_image_url) return res.status(400).json({ error: 'This world has no map image uploaded yet.' })

  const prompt = `You are reading a fantasy world map for the world "${world.name}". ${mapScale ? `The GM says the map scale is: ${mapScale}.` : ''}

Study the map image and write a "Map Guide" a Game Master can use to answer player questions about geography and travel. Include:
- Every readable text LABEL on the map (towns, cities, lakes, rivers, seas, mountains, forests, regions, landmarks). For each, give its approximate position (compass region, e.g. "south-west") and what it is near.
- Roads, paths, rivers, or routes you can see, and which places they connect.
- The major geographic features and general layout (where the mountains/water/forests sit).
${mapScale ? '- Using the scale, give rough distances between major locations where you can estimate them.' : ''}

Only describe what is actually visible on the map. Do not invent lore. Output just the guide.`

  const aRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: world.map_image_url } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  })

  const text = await aRes.text()
  if (!aRes.ok) return res.status(500).json({ error: 'Map analysis failed', details: text.slice(0, 400) })
  const data = JSON.parse(text)
  const mapDescription = data.content?.[0]?.text || ''

  await db.from('worlds')
    .update({ map_description: mapDescription, map_scale: mapScale || null })
    .eq('id', worldId).eq('dm_id', user.id)

  return res.json({ mapDescription })
}
