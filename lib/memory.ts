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
  let earnedLevels: typeof RENOWN_LEVELS = []
  for (const tier of RENOWN_LEVELS) {
    if (totalUsed >= tier.points) {
      current = tier
      earnedLevels.push(tier)
    } else break
  }
  return { current, earnedLevels }
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
  renownTransactions: string[]
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

  const { data: renownTransactions } = await db
    .from('renown_transactions')
    .select('points, reason, type, created_at')
    .eq('player_id', player.id)
    .eq('type', 'earned')
    .order('created_at', { ascending: true })

  const renownTotals = renownData || { total_earned: 0, total_used: 0 }
  const renownAvailable = renownTotals.total_earned - renownTotals.total_used
  const { current: renownLevel, earnedLevels } = getRenownLevel(renownTotals.total_used)

  return {
    player,
    world,
    sessionSummaries,
    knowledgeLedger: knowledge || [],
    recentMessages: (recentMsgs || []).reverse(),
    renownLevel: renownLevel.level,
    renownDescription: earnedLevels.map(l => `${l.level}: ${l.description}`).join(' → '),
    renownAvailable,
    renownUsed: renownTotals.total_used,
    renownTransactions: (renownTransactions || []).map(t => `+${t.points} pts: ${t.reason}`)
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

  const charContext = player.character_name ? `CHARACTER:
  Name: ${player.character_name}
  Class/Race: ${player.character_class || 'Unknown'}
  Background: ${player.character_background || 'Not provided'}
  Starting knowledge: ${player.character_knowledge || 'Not specified'}
  ${player.character_sheet_text ? `\nCharacter sheet:\n${player.character_sheet_text.slice(0, 1500)}` : ''}` : 'No character set up.'

  const renownTransactionLog = memory.renownTransactions.length > 0
    ? `\n  Deeds that earned renown:\n${memory.renownTransactions.map(t => `    - ${t}`).join('\n')}`
    : ''

  const renownBlock = `RENOWN STATUS:
  Level: ${memory.renownLevel}
  Description: ${memory.renownDescription}
  Points Used: ${memory.renownUsed}
  Points Available: ${memory.renownAvailable}${renownTransactionLog}`

  const memoryBlock = sessionSummaries ? `CAMPAIGN HISTORY:\n${sessionSummaries}` : ''

  const ledgerBlock = knowledgeLedger.length > 0
    ? `KNOWLEDGE LEDGER (everything your character has learned through play — THIS IS YOUR PRIMARY SOURCE):\n${knowledgeBlock}`
    : 'KNOWLEDGE LEDGER: (empty — nothing recorded yet)'

  const canon = world.canon_text || ''
  const splitMarker = '## DM ONLY'
  const publicCanon = canon.includes(splitMarker) ? canon.split(splitMarker)[0].trim() : canon

  return `You are a READ-ONLY knowledge reference for a D&D character. You do NOT run scenes, tell stories, or act as a game master.

YOUR ONLY JOB: When the player asks what their character knows, look it up in the sections below and report it in 1-3 short sentences.

HOW TO ANSWER:
- To answer "who/what/where is X" or "tell me about X", SEARCH the CHARACTER, KNOWLEDGE LEDGER, CAMPAIGN HISTORY, and RENOWN sections below and report what they say. These are the authoritative record of what this character personally knows.
- Match by meaning, not exact wording (a question about "Old Issa" matches a ledger entry titled "Old Issa (Hermit)").
- Only respond "Your character has no record of that." if X genuinely does NOT appear in any of those sections. Never say this if a matching entry exists.

HARD RULES — violating these is a failure:
- Do NOT narrate scenes or describe what the character sees or experiences.
- Do NOT invent, infer, or extrapolate anything not in the sections below.
- Do NOT ask the player questions or suggest what they should do.
- Do NOT write more than 3 sentences.

=== THE AUTHORITATIVE RECORD OF WHAT YOUR CHARACTER KNOWS ===

${charContext}

${ledgerBlock}

${memoryBlock}

${renownBlock}

=== WORLD CANON — BACKGROUND REFERENCE ONLY ===
Do NOT use this to decide whether the character knows something. A place or person existing in canon does NOT mean this character knows it — only the sections above count. Use canon only to keep wording consistent with established lore, and never reveal canon the character hasn't learned above.
WORLD: ${world.name}
${world.description || ''}

${publicCanon || 'No canon uploaded yet.'}`
}
