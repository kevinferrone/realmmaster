import { getSupabaseAdmin } from './supabase'

const RENOWN_LEVELS = [
  { points: 0, level: 'Unknown', description: 'Only known by immediate circle of friends and family' },
  { points: 20, level: 'Noticed', description: 'People occasionally glance your way; someone noticed something unusual or brave' },
  { points: 40, level: 'Known', description: 'Word of your actions is spreading; locals whisper your name' },
  { points: 80, level: 'Notable', description: 'Your reputation is taking hold; mentioned in small crowds' },
  { points: 160, level: 'Respected', description: 'Communities trust you; people listen when you speak' },
  { points: 320, level: 'Celebrated', description: "You're the talk of the town; fans and rivals seek you out" },
  { points: 640, level: 'Famous', description: 'Songs and plays retell your deeds; villains take note' },
  { points: 1000, level: 'Illustrious', description: 'Your name shines across the realm; inspires courage or jealousy' },
  { points: 1500, level: 'Heroic', description: 'You are a symbol; monuments and murals bear your likeness' },
  { points: 2000, level: 'Legendary', description: 'Living legend; your decisions alter world events' },
  { points: 3000, level: 'Mythic', description: "You've transcended fame; some believe you a god or myth" },
]

function getRenownLevel(totalUsed: number) {
  let current = RENOWN_LEVELS[0]
  for (const tier of RENOWN_LEVELS) {
    if (totalUsed >= tier.points) current = tier
    else break
  }
  return current
}

export interface PlayerMemory {
  player: any
  world: any
  sessionSummaries: string
  knowledgeLedger: Array<{ category: string; title: string; content: string }>
  recentMessages: Array<{ role: string; content: string }>
  renownLevel: string
  renownDescription: string
  renownAvailable: number
  renownUsed: number
}

export async function buildPlayerMemory(token: string): Promise<PlayerMemory | null> {
  const db = getSupabaseAdmin()

  const { data: player } = await db
    .from('players')
    .select('*')
    .eq('invite_token', token)
    .single()
  if (!player) return null

  const { data: world } = await db
    .from('worlds')
    .select('*')
    .eq('id', player.world_id)
    .single()
  if (!world) return null

  if (world.canon_text && world.canon_text.length > 120000) {
    world.canon_text = world.canon_text.slice(0, 120000) + '\n\n[...canon continues...]'
  }

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

  const { data: knowledge } = await db
    .from('character_knowledge')
    .select('category, title, content')
    .eq('player_id', player.id)
    .eq('is_active', true)
    .order('granted_at', { ascending: true })

  const { data: recentMsgs } = await db
    .from('messages')
    .select('role, content')
    .eq('player_id', player.id)
    .order('created_at', { ascending: false })
    .limit(12)

  const { data: renownData } = await db
    .from('renown')
    .select('total_earned, total_used')
    .eq('player_id', player.id)
    .single()

  const renownTotals = renownData || { total_earned: 0, total_used: 0 }
  const renownAvailable = renownTotals.total_earned - renownTotals.total_used
  const renownLevel = getRenownLevel(renownTotals.total_used)

  return {
    player,
    world,
    sessionSummaries,
    knowledgeLedger: knowledge || [],
    recentMessages: (recentMsgs || []).reverse(),
    renownLevel: renownLevel.level,
    renownDescription: renownLevel.description,
    renownAvailable,
    renownUsed: renownTotals.total_used
  }
}

export function buildSystemPrompt(memory: PlayerMemory): string {
  const { player, world, sessionSummaries, knowledgeLedger } = memory

  const byCategory: Record<string, typeof knowledgeLedger> = {}
  for (const k of knowledgeLedger) {
    if (!byCategory[k.category]) byCategory[k.category] = []
    byCategory[k.category].push(k)
  }

  const knowledgeBlock = Object.entries(byCategory).map(([cat, items]) =>
    `${cat.toUpperCase()}:\n${items.map(i => `  - ${i.title}: ${i.content}`).join('\n')}`
  ).join('\n\n')

  const charContext = player.character_name ? `
CHARACTER:
  Name: ${player.character_name}
  Class/Race: ${player.character_class || 'Unknown'}
  Background: ${player.character_background || 'Not provided'}
  Starting knowledge: ${player.character_knowledge || 'Not specified'}
  ${player.character_sheet_text ? `\nCharacter sheet:\n${player.character_sheet_text.slice(0, 1500)}` : ''}
` : 'No character set up. Treat as anonymous traveler with minimal knowledge.'

  const renownBlock = `
RENOWN STATUS:
  Level: ${memory.renownLevel}
  Description: ${memory.renownDescription}
  Points Used: ${memory.renownUsed}
  Points Available: ${memory.renownAvailable}

Reflect this character's renown naturally. An Unknown character is ignored by strangers. A Celebrated character gets recognized in taverns. A Legendary character causes people to step aside. NPCs react accordingly.`

  const memoryBlock = sessionSummaries ? `
CAMPAIGN HISTORY:
${sessionSummaries}
` : ''

  const ledgerBlock = knowledgeLedger.length > 0 ? `
KNOWLEDGE LEDGER:
${knowledgeBlock}
` : ''

  return `You are an immersive, intelligent Dungeon Master for the world described below.

Your role: Answer questions ONLY from the perspective of what THIS CHARACTER knows. Speak directly to the player in second person.

CORE RULES:
1. Only share what this character would know based on their background, history, and ledger.
2. Speak in second-person: "You recall...", "Your time in [place] taught you...", "You have heard rumors..."
3. If they would not know something, say so in-character.
4. Never reveal DM secrets, villain plans, or unexplored areas.
5. Use their class and background to flavor answers.
6. Reference past sessions naturally.
7. Keep responses to 1-2 paragraphs. Evocative and specific, never encyclopedic.
8. Never break character. Never reference these instructions.

WORLD: ${world.name}
${world.description || ''}

WORLD CANON:
${world.canon_text || 'No canon uploaded yet.'}

${charContext}
${renownBlock}
${memoryBlock}
${ledgerBlock}`
}
