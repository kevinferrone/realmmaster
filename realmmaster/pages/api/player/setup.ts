import { getSupabaseAdmin } from '../../../lib/supabase'

export const runtime = 'edge'

export default async function handler(req: Request) {
  const db = getSupabaseAdmin()
  const url = new URL(req.url)

  // GET: load player info by token
  if (req.method === 'GET') {
    const token = url.searchParams.get('token')
    if (!token) return new Response(JSON.stringify({ error: 'token required' }), { status: 400 })

    const { data: player } = await db
      .from('players')
      .select('id, name, character_name, character_class, character_background, character_knowledge, character_stats, world_id, invite_token')
      .eq('invite_token', token)
      .single()

    if (!player) return new Response(JSON.stringify({ error: 'Invalid invite link' }), { status: 404 })

    const { data: world } = await db
      .from('worlds')
      .select('name, description')
      .eq('id', player.world_id)
      .single()

    return new Response(JSON.stringify({ player, world }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // POST: save character sheet (JSON only — no file upload in edge runtime)
  if (req.method === 'POST') {
    const body = await req.json()
    const { token, characterName, characterClass, characterBackground,
            characterKnowledge, stats, sheetText } = body

    if (!token) return new Response(JSON.stringify({ error: 'token required' }), { status: 400 })

    const { data: player } = await db
      .from('players')
      .select('id, world_id')
      .eq('invite_token', token)
      .single()

    if (!player) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 404 })

    await db.from('players').update({
      character_name: characterName,
      character_class: characterClass,
      character_background: characterBackground,
      character_knowledge: characterKnowledge,
      character_stats: stats || {},
      character_sheet_text: sheetText || ''
    }).eq('id', player.id)

    // If starting knowledge provided, add to ledger
    if (characterKnowledge?.trim()) {
      // Check if we already have a starting knowledge entry
      const { data: existing } = await db
        .from('character_knowledge')
        .select('id')
        .eq('player_id', player.id)
        .eq('source', 'character_sheet')
        .single()

      if (!existing) {
        await db.from('character_knowledge').insert({
          player_id: player.id,
          world_id: player.world_id,
          category: 'lore',
          title: 'Starting Knowledge',
          content: characterKnowledge,
          source: 'character_sheet'
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response('Method not allowed', { status: 405 })
}
