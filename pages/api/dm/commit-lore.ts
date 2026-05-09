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

  // Find where this section ends (next section starts)
  const afterSection = text.slice(sectionIndex + section.length)
  const nextSectionMatch = afterSection.search(/\n## /)
  
  if (nextSectionMatch === -1) {
    // This is the last section — append at end
    return text + `\n${newContent}`
  } else {
    // Insert before the next section
    const insertPoint = sectionIndex + section.length + nextSectionMatch
    return text.slice(0, insertPoint) + `\n${newContent}` + text.slice(insertPoint)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  // POST: extract lore from last exchange and return preview
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

    // If action is 'save', apply the previewed lore to canon
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

    // Otherwise extract lore from the exchange
    const extractionPrompt = `You are extracting world-building lore from a conversation between a DM and their world-building assistant.

AVAILABLE CANON SECTIONS:
${CANON_SECTIONS.join('\n')}

THE EXCHANGE TO EXTRACT FROM:
DM: ${lastUserMessage}
