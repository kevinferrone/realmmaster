import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()
  const { locationId, playerId, partyId } = req.body

  if (!locationId) return res.status(400).json({ error: 'locationId required' })

  // Get location details
  const { data: location } = await db
    .from('map_locations')
    .select('*')
    .eq('id', locationId)
    .single()

  if (!location) return res.status(404).json({ error: 'Location not found' })

  // Resolve player list
  let playerIds: string[] = []

  if (playerId) {
    playerIds = [playerId]
  } else if (partyId) {
    const { data: members } = await db
      .from('party_members')
      .select('player_id')
      .eq('party_id', partyId)
    playerIds = (members || []).map(m => m.player_id)
  } else {
    return res.status(400).json({ error: 'playerId or partyId required' })
  }

  if (playerIds.length === 0) {
    return res.status(400).json({ error: 'No players found' })
  }

  let revealedCount = 0

  for (const pid of playerIds) {
    // Insert reveal (ignore if already revealed)
    const { error: revealError } = await db
      .from('location_reveals')
      .upsert(
        { location_id: locationId, player_id: pid, world_id: location.world_id },
        { onConflict: 'location_id,player_id', ignoreDuplicates: true }
      )

    if (!revealError) {
      revealedCount++

      // Auto-add to knowledge ledger if lore exists
      if (location.lore?.trim()) {
        const { data: existing } = await db
          .from('character_knowledge')
          .select('id')
          .eq('player_id', pid)
          .eq('title', location.name)
          .single()

        if (!existing) {
          await db.from('character_knowledge').insert({
            player_id: pid,
            world_id: location.world_id,
            category: 'location',
            title: location.name,
            content: location.lore,
            source: 'dm_granted'
          })
        }
      }
    }
  }

  return res.json({ success: true, revealedTo: playerIds.length })
}
