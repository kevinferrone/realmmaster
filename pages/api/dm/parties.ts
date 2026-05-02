import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const db = getSupabaseAdmin()

  // GET: fetch all parties for a world with their members
  if (req.method === 'GET') {
    const worldId = req.query.worldId as string
    if (!worldId) return res.status(400).json({ error: 'worldId required' })

    const { data: parties } = await db
      .from('parties')
      .select('id, name, description, created_at')
      .eq('world_id', worldId)
      .eq('dm_id', user.id)
      .order('created_at', { ascending: true })

    // Get members for each party
    const partyIds = (parties || []).map(p => p.id)
    const { data: members } = await db
      .from('party_members')
      .select('party_id, player_id, players(id, name, character_name, character_class)')
      .in('party_id', partyIds.length > 0 ? partyIds : ['none'])

    const partiesWithMembers = (parties || []).map(party => ({
      ...party,
      members: (members || [])
        .filter(m => m.party_id === party.id)
        .map(m => m.players)
    }))

    return res.json({ parties: partiesWithMembers })
  }

  // POST: create a party
  if (req.method === 'POST') {
    const { worldId, name, description } = req.body
    if (!worldId || !name) return res.status(400).json({ error: 'worldId and name required' })

    const { data: party, error } = await db
      .from('parties')
      .insert({ world_id: worldId, dm_id: user.id, name, description: description || '' })
      .select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ party: { ...party, members: [] } })
  }

  // PATCH: add or remove a member
  if (req.method === 'PATCH') {
    const { partyId, playerId, action } = req.body

    if (action === 'add') {
      await db.from('party_members').insert({ party_id: partyId, player_id: playerId })
    } else if (action === 'remove') {
      await db.from('party_members').delete()
        .eq('party_id', partyId).eq('player_id', playerId)
    }

    return res.json({ success: true })
  }

  // DELETE: delete a party
  if (req.method === 'DELETE') {
    const { partyId } = req.body
    await db.from('parties').delete().eq('id', partyId).eq('dm_id', user.id)
    return res.json({ success: true })
  }

  return res.status(405).end()
}
