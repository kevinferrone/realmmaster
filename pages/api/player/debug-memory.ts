import type { NextApiRequest, NextApiResponse } from 'next'
import { buildPlayerMemory, buildSystemPrompt } from '../../../lib/memory'

// TEMPORARY debug endpoint — remove after we diagnose.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = (req.query.token as string) || ''
  if (!token) return res.status(400).json({ error: 'token required' })
  const memory = await buildPlayerMemory(token)
  if (!memory) return res.status(404).json({ error: 'invalid token' })
  const prompt = buildSystemPrompt(memory)
  const ledgerStart = prompt.indexOf('KNOWLEDGE LEDGER')
  return res.json({
    knowledgeCount: memory.knowledgeLedger.length,
    promptLength: prompt.length,
    containsOldIssa: prompt.includes('Old Issa'),
    containsAshmar: prompt.includes('Ashmar'),
    oldIssaPosition: prompt.indexOf('Old Issa'),
    ledgerExcerpt: ledgerStart >= 0 ? prompt.slice(ledgerStart, ledgerStart + 600) : 'NO LEDGER SECTION IN PROMPT',
  })
}
