import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'

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
  return { ...current, next }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getSupabaseAdmin()

  // GET: fetch renown for a player by token
  if (req.method === 'GET') {
    const token = req.query.token as string
    if (!token) return res.status(400).json({ error: 'token required' })

    const { data: player } = await db
      .from('players').select('id, world_id').eq('invite_token', token).single()
    if (!player) return res.status(404).json({ error: 'Invalid token' })

    const { data: renown } = await db
      .from('renown').select('*').eq('player_id', player.id).single()

    const totals = renown || { total_earned: 0, total_used: 0 }
    const level = getRenownLevel(totals.total_used)

    const { data: transactions } = await db
      .from('renown_transactions')
      .select('*')
      .eq('player_id', player.id)
      .order('created_at', { ascending: false })
      .limit(20)

    return res.json({
      total_earned: totals.total_earned,
      total_used: totals.total_used,
      available: totals.total_earned - totals.total_used,
      level,
      transactions: transactions || []
    })
  }

  // POST: player spends renown points
  if (req.method === 'POST') {
    const { token, points, reason } = req.body
    if (!token || !points || points <= 0) {
      return res.status(400).json({ error: 'token and points required' })
    }

    const { data: player } = await db
      .from('players').select('id, world_id').eq('invite_token', token).single()
    if (!player) return res.status(404).json({ error: 'Invalid token' })

    const { data: renown } = await db
      .from('renown').select('*').eq('player_id', player.id).single()

    if (!renown) return res.status(400).json({ error: 'No renown earned yet' })

    const available = renown.total_earned - renown.total_used
    if (points > available) {
      return res.status(400).json({ error: `Not enough renown. You have ${available} points available.` })
    }

    const newUsed = renown.total_used + points
    const oldLevel = getRenownLevel(renown.total_used)
    const newLevel = getRenownLevel(newUsed)
    const leveledUp = newLevel.level !== oldLevel.level

    await db.from('renown').update({
      total_used: newUsed,
      updated_at: new Date().toISOString()
    }).eq('player_id', player.id)

    await db.from('renown_transactions').insert({
      player_id: player.id,
      world_id: player.world_id,
      type: 'spent',
      points,
      reason: reason || 'Spent by player'
    })

    return res.json({
      success: true,
      total_earned: renown.total_earned,
      total_used: newUsed,
      available: renown.total_earned - newUsed,
      level: newLevel,
      leveledUp,
      previousLevel: leveledUp ? oldLevel.level : null
    })
  }

  return res.status(405).end()
}
