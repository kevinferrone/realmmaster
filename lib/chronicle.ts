// Chronicle — extraction logic shared by the GM endpoints.
// Mirrors RealmMaster's existing knowledge-builder pattern (Claude emits a fenced JSON
// block, we parse it), extended with the v1 scope rule: party-default / explicit-split.

// Reuse RealmMaster's existing category set.
export const KNOWLEDGE_CATEGORIES = ['location', 'faction', 'npc', 'item', 'event', 'lore', 'secret'] as const

export interface RosterMember {
  player_id: string
  character_name: string
  character_class?: string | null
}

export interface ExtractedItem {
  category: string            // one of KNOWLEDGE_CATEGORIES
  title: string
  content: string
  scope: 'party' | string[]   // 'party' = all party members; else array of player_id
  source_quote: string
  salience: number            // 1-5 (5 = a thread worth calling back)
  needs_review: boolean
  review_reason?: string
}

export interface Extraction {
  summary: string
  items: ExtractedItem[]
}

export function buildExtractionSystemPrompt(worldName: string, canon: string, roster: RosterMember[]): string {
  const rosterBlock = roster.length
    ? roster.map(r => `- player_id ${r.player_id} = ${r.character_name}${r.character_class ? ` (${r.character_class})` : ''}`).join('\n')
    : 'No characters on the roster.'
  const canonRef = canon?.trim() ? canon.slice(0, 20000) : 'No canon provided.'

  return `You extract structured campaign knowledge from a tabletop RPG session transcript for the world "${worldName}".

ROSTER (use these exact player_id values when scoping):
${rosterBlock}

KNOWLEDGE CATEGORIES (pick exactly one per item): ${KNOWLEDGE_CATEGORIES.join(', ')}

THE SCOPE RULE — the only attribution logic:
- Every item defaults to scope "party" (known to all roster characters).
- Make an item character-specific ONLY when the transcript EXPLICITLY states a split or who is where (e.g. "Kael, you head to the docks; Lyra and Bracken, the cathedral"). Then set scope to an array of the player_id values for exactly those characters.
- Revert to "party" when the transcript says they regroup, OR when split information is shared aloud with the others — and promote only the specific facts that were actually verbalized.
- Do NOT infer private or secret knowledge. If it isn't said aloud, don't capture it.
- Never invent anything not supported by the transcript or on-screen text.

For anything uncertain — a guessed NPC/place name, an ambiguous partial-share, unclear presence — set "needs_review": true and explain briefly in "review_reason". The GM verifies these.

Output ONLY a fenced block, nothing before or after it:
\`\`\`extraction
{
  "summary": "2-4 sentence session summary.",
  "items": [
    {
      "category": "npc",
      "title": "Short label",
      "content": "What is known, written in-world. 1-3 sentences.",
      "scope": "party",
      "source_quote": "the exact transcript line(s) this came from",
      "salience": 3,
      "needs_review": false
    }
  ]
}
\`\`\`
"scope" is the string "party" OR an array of player_id strings from the roster. "salience" is an integer 1-5.

WORLD CANON (read-only, for disambiguating names against established lore):
${canonRef}`
}

export function parseExtraction(raw: string): Extraction {
  const m = raw.match(/```extraction\s*([\s\S]*?)```/)
  const json = (m ? m[1] : raw).trim()
  const data = JSON.parse(json)
  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    items: Array.isArray(data.items) ? data.items : []
  }
}
