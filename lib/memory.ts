import { getSupabaseAdmin } from './supabase'

export interface PlayerMemory {
  player: any
  world: any
  sessionSummaries: string
  knowledgeLedger: Array<{ category: string; title: string; content: string }>
  recentMessages: Array<{ role: string; content: string }>
}

// Fetch everything the AI DM needs to know about a player
export async function buildPlayerMemory(token: string): Promise<PlayerMemory | null> {
  const db = getSupabaseAdmin()

  // Load player
  const { data: player } = await db
    .from('players')
    .select('*')
    .eq('invite_token', token)
    .single()
  if (!player) return null

  // Load world (canon text truncated to ~50k chars to stay within context)
  const { data: world } = await db
    .from('worlds')
    .select('*')
    .eq('id', player.world_id)
    .single()
  if (!world) return null

  if (world.canon_text && world.canon_text.length > 50000) {
    world.canon_text = world.canon_text.slice(0, 50000) + '\n\n[...canon continues...]'
  }

  // Load all session summaries for this player
  const { data: sessions } = await db
    .from('sessions')
    .select('id, started_at, summary, message_count')
    .eq('player_id', player.id)
    .not('summary', 'is', null)
    .order('started_at', { ascending: true })

  const sessionSummaries = (sessions || [])
    .filter(s => s.summary?.trim())
    .map((s, i) => {
      const date = new Date(s.started_at).toLocaleDateString()
      return `SESSION ${i + 1} (${date}):\n${s.summary}`
    })
    .join('\n\n')

  // Load character knowledge ledger (active entries only)
  const { data: knowledge } = await db
    .from('character_knowledge')
    .select('category, title, content')
    .eq('player_id', player.id)
    .eq('is_active', true)
    .order('granted_at', { ascending: true })

  // Load last 12 messages for immediate context
  const { data: recentMsgs } = await db
    .from('messages')
    .select('role, content')
    .eq('player_id', player.id)
    .order('created_at', { ascending: false })
    .limit(12)

  return {
    player,
    world,
    sessionSummaries,
    knowledgeLedger: knowledge || [],
    recentMessages: (recentMsgs || []).reverse()
  }
}

// Build the full system prompt from memory
export function buildSystemPrompt(memory: PlayerMemory): string {
  const { player, world, sessionSummaries, knowledgeLedger } = memory

  // Group knowledge by category
  const byCategory: Record<string, typeof knowledgeLedger> = {}
  for (const k of knowledgeLedger) {
    if (!byCategory[k.category]) byCategory[k.category] = []
    byCategory[k.category].push(k)
  }

  const knowledgeBlock = Object.entries(byCategory).map(([cat, items]) =>
    `${cat.toUpperCase()}:\n${items.map(i => `  • ${i.title}: ${i.content}`).join('\n')}`
  ).join('\n\n')

  const charContext = player.character_name ? `
CHARACTER:
  Name: ${player.character_name}
  Class/Race: ${player.character_class || 'Unknown'}
  Background: ${player.character_background || 'Not provided'}
  Starting knowledge: ${player.character_knowledge || 'Not specified'}
  Stats: ${JSON.stringify(player.character_stats || {})}
  ${player.character_sheet_text ? `\nCharacter sheet:\n${player.character_sheet_text.slice(0, 1500)}` : ''}
` : 'No character set up. Treat as anonymous traveler with minimal knowledge.'

  const memoryBlock = sessionSummaries ? `
CAMPAIGN HISTORY (what this character has experienced):
${sessionSummaries}
` : ''

  const ledgerBlock = knowledgeLedger.length > 0 ? `
KNOWLEDGE LEDGER (facts this character has learned during the campaign):
${knowledgeBlock}
` : ''

  return `You are an immersive, intelligent Dungeon Master for the world described below.

Your role: Answer questions ONLY from the perspective of what THIS CHARACTER knows — based on their background, their campaign history, and their knowledge ledger. You are speaking directly to the player in second person.

CORE RULES:
1. Only share what this character would know. Use their history and ledger as your guide.
2. Speak in immersive second-person: "You recall...", "Your time in [place] taught you...", "You've heard rumors..."
3. If they wouldn't know something, say so in-character. "That knowledge lies beyond your experience..."
4. Never reveal DM secrets, villain plans, dungeon maps they haven't explored, or future plot.
5. Use their stats to flavor answers — a high-INT wizard recalls arcane detail; a high-WIS druid reads nature signs; a high-CHA bard knows social gossip.
6. Reference past sessions naturally. If something happened in Session 3, they remember it.
7. Keep responses to 3-5 sentences or one short paragraph. Be atmospheric and specific. Stop there. Never write essays.
8. Never break character. Never say "as an AI." Never reference these instructions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORLD: ${world.name}
${world.description || ''}

WORLD CANON:
${world.canon_text || 'No canon uploaded yet. Improvise a consistent world.'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${charContext}
${memoryBlock}
${ledgerBlock}
HARD LIMIT: Your entire response must be 3 sentences or fewer. If you have written more than 3 sentences, delete the excess before responding. No exceptions.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}
