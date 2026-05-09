import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getSupabaseAdmin()

  if (req.method === 'GET') {
    const token = req.query.token as string
    if (!token) return res.status(400).json({ error: 'token required' })

    const { data: player } = await db
      .from('players')
      .select('id, name, character_name, character_class, character_background, character_knowledge, character_stats, character_sheet_text, world_id, invite_token')
      .eq('invite_token', token)
      .single()

    if (!player) return res.status(404).json({ error: 'Invalid invite link' })

    const { data: world } = await db
      .from('worlds')
      .select('name, description, map_image_url')
      .eq('id', player.world_id)
      .single()

    return res.json({ player, world })
  }

  if (req.method === 'POST') {
    const { token, characterName, characterClass, characterBackground,
            characterKnowledge, stats, sheetText } = req.body

    if (!token) return res.status(400).json({ error: 'token required' })

    const { data: player } = await db
      .from('players')
      .select('id, world_id')
      .eq('invite_token', token)
      .single()

    if (!player) return res.status(404).json({ error: 'Invalid token' })

    await db.from('players').update({
      character_name: characterName,
      character_class: characterClass,
      character_background: characterBackground,
      character_knowledge: characterKnowledge,
      character_stats: stats || {},
      character_sheet_text: sheetText || ''
    }).eq('id', player.id)

    if (characterKnowledge?.trim()) {
      const { data: existing } = await db
        .from('character_knowledge')
        .select('id')
        .eq('player_id', player.id)
        .eq('source', 'character_sheet')
        .single()

      if (!existing) {
        await db.from('character_knowledge').insert({
          player_id: player.id,
          world_id: player.world_id,
          category: 'lore',
          title: 'Starting Knowledge',
          content: characterKnowledge,
          source: 'character_sheet'
        })
      }
    }

    return res.json({ success: true })
  }

  return res.status(405).end()
}
