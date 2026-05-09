import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

const CANON_SECTIONS = [
  '## GEOGRAPHY & LOCATIONS',
  '## FACTIONS & ORGANIZATIONS',
  '## NPCS & CHARACTERS',
  '## HISTORY & TIMELINE',
  '## MAGIC & MECHANICS',
  '## CULTURE & SOCIETY',
  '## DM ONLY — SECRETS & MYSTERIES',
]

function ensureSections(canonText: string): string {
  let text = canonText || ''
  for (const section of CANON_SECTIONS) {
    if (!text.includes(section)) {
      text = text + `\n\n${section}\n`
    }
  }
  return text
}

function appendToSection(canonText: string, section: string, newContent: string): string {
  const text = ensureSections(canonText)
  const sectionIndex = text.indexOf(section)
  if (sectionIndex === -1) return text + `\n\n${section}\n${newContent}`

  const afterSection = text.slice(sectionIndex + section.length)
  const nextSectionMatch = afterSection.search(/\n## /)

  if (nextSectionMatch === -1) {
    return text + `\n${newContent}`
  } else {
    const insertPoint = sectionIndex + section.length + nextSectionMatch
    return text.slice(0, insertPoint) + `\n${newContent}` + text.slice(insertPoint)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  if (req.method === 'POST') {
    const { worldId, lastUserMessage, lastAssistantMessage, action, previewData } = req.body
    if (!worldId) return res.status(400).json({ error: 'worldId required' })

    const { data: world } = await db
      .from('worlds')
      .select('name, canon_text')
      .eq('id', worldId)
      .eq('dm_id', user.id)
      .single()
    if (!world) return res.status(403).json({ error: 'Forbidden' })

    // Save previewed lore to canon
    if (action === 'save' && previewData) {
      let updatedCanon = world.canon_text || ''
      for (const entry of previewData) {
        updatedCanon = appendToSection(updatedCanon, entry.section, entry.content)
      }
      await db.from('worlds').update({
        canon_text: updatedCanon,
        updated_at: new Date().toISOString()
      }).eq('id', worldId)
      return res.json({ success: true, canonText: updatedCanon })
    }

    // Extract lore from the last exchange
    if (!lastUserMessage || !lastAssistantMessage) {
      return res.status(400).json({ error: 'lastUserMessage and lastAssistantMessage required' })
    }

    const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are extracting world-building lore from a conversation to add to a D&D world canon.

AVAILABLE CANON SECTIONS:
${CANON_SECTIONS.join('\n')}

THE EXCHANGE:
DM: ${lastUserMessage}
