import type { NextApiRequest, NextApiResponse } from 'next'
import { buildPlayerMemory } from '../../../lib/memory'

// TEMPORARY debug endpoint — remove after we diagnose the ledger issue.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = (req.query.token as string) || ''
  if (!token) return res.status(400).json({ error: 'token required' })
  const memory = await buildPlayerMemory(token)
  if (!memory) return res.status(404).json({ error: 'invalid token' })
  return res.json({
    player_id: memory.player.id,
    character_name: memory.player.character_name,
    world: memory.world?.name,
    knowledgeCount: memory.knowledgeLedger.length,
    titles: memory.knowledgeLedger.map((k: any) => k.title),
    sessionSummaryChars: memory.sessionSummaries.length,
  })
}
