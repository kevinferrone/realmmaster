import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

const RENOWN_LEVELS = [
  { points: 0, level: 'Unknown', description: 'Only known by immediate circle of friends and family' },
  { points: 20, level: 'Noticed', description: 'People occasionally glance your way; someone noticed something unusual or brave' },
  { points: 40, level: 'Known', description: 'Word of your actions is spreading; locals whisper your name' },
  { points: 60, level: 'Notable', description: 'Your reputation is taking hold; mentioned in small crowds' },
  { points: 90, level: 'Respected', description: 'Communities trust you; people listen when you speak' },
  { points: 120, level: 'Celebrated', description: "You're the talk of the town; fans and rivals seek you out" },
  { points: 150, level: 'Famous', description: 'Songs and plays retell your deeds; villains take note' },
  { points: 190, level: 'Illustrious', description: 'Your name shines across the realm; inspires courage or jealousy' },
  { points: 230, level: 'Heroic', description: 'You are a symbol; monuments and murals bear your likeness' },
  { points: 270, level: 'Legendary', description: 'Living legend; your decisions alter world events' },
  { points: 320, level: 'Mythic', description: "You've transcended fame; some believe you a god or myth" },
]

export function getRenownLevel(totalUsed: number) {
  let current = RENOWN_LEVELS[0]
  for (const tier of RENOWN_LEVELS) {
    if (totalUsed >= tier.points) current = tier
    else break
  }
  const currentIndex = RENOWN_LEVELS.indexOf(current)
  const next = RENOWN_LEVELS[currentIndex + 1] || null
  return { ...current, next, totalUsed }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  // GET: fetch renown for all players in a world
  if (req.method === 'GET') {
    const worldId = req.query.worldId as string
    if (!worldId) return res.status(400).json({ error: 'worldId required' })

    const { data: renown } = await db
      .from('renown')
      .select('*')
      .eq('world_id', worldId)

    return res.json({ renown: renown || [] })
  }

  // POST: grant renown to a player or party
  if (req.method === 'POST') {
    const { playerId, partyId, points, reason } = req.body
    if (!points || points <= 0) return res.status(400).json({ error: 'points must be positive' })

    // Resolve player list
    let playerIds: string[] = []
    let worldId: string = ''

    if (playerId) {
      const { data: player } = await db
        .from('players').select('id, world_id').eq('id', playerId).single()
      if (!player) return res.status(404).json({ error: 'Player not found' })
      playerIds = [player.id]
      worldId = player.world_id
    } else if (partyId) {
      const { data: party } = await db
        .from('parties').select('world_id').eq('id', partyId).eq('dm_id', user.id).single()
      if (!party) return res.status(403).json({ error: 'Forbidden' })
      worldId = party.world_id
      const { data: members } = await db
        .from('party_members').select('player_id').eq('party_id', partyId)
      playerIds = (members || []).map(m => m.player_id)
    }

    if (playerIds.length === 0) return res.status(400).json({ error: 'No players found' })

    // Grant renown to each player
    for (const pid of playerIds) {
      // Upsert renown record
      const { data: existing } = await db
        .from('renown').select('*').eq('player_id', pid).single()

      if (existing) {
        await db.from('renown').update({
          total_earned: existing.total_earned + points,
          updated_at: new Date().toISOString()
        }).eq('player_id', pid)
      } else {
        await db.from('renown').insert({
          player_id: pid,
          world_id: worldId,
          total_earned: points,
          total_used: 0
        })
      }

      // Log transaction
      await db.from('renown_transactions').insert({
        player_id: pid,
        world_id: worldId,
        type: 'earned',
        points,
        reason: reason || 'Granted by DM',
        granted_by: user.id
      })
    }

    return res.json({ success: true, grantedTo: playerIds.length })
  }

  return res.status(405).end()
}
