import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import { getUserFromHeader } from '../../../lib/auth'
import Busboy from 'busboy'

export const config = { api: { bodyParser: false } }

function parseMultipart(req: NextApiRequest): Promise<{ fields: Record<string, string>, fileBuffer: Buffer, filename: string, mimetype: string }> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers })
    const fields: Record<string, string> = {}
    let fileBuffer: Buffer = Buffer.alloc(0)
    let filename = ''
    let mimetype = ''
    const chunks: Buffer[] = []

    bb.on('field', (name, val) => { fields[name] = val })
    bb.on('file', (_name, stream, info) => {
      filename = info.filename
      mimetype = info.mimeType
      stream.on('data', chunk => chunks.push(chunk))
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks) })
    })
    bb.on('close', () => resolve({ fields, fileBuffer, filename, mimetype }))
    bb.on('error', reject)
    req.pipe(bb)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getUserFromHeader(req.headers.authorization || null)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { fields, fileBuffer, filename, mimetype } = await parseMultipart(req)
  const worldId = fields.worldId
  if (!worldId) return res.status(400).json({ error: 'worldId required' })
  if (!fileBuffer.length) return res.status(400).json({ error: 'No file received' })

  const db = getSupabaseAdmin()

  // Verify DM owns this world
  const { data: world } = await db
    .from('worlds').select('id').eq('id', worldId).eq('dm_id', user.id).single()
  if (!world) return res.status(403).json({ error: 'Forbidden' })

  // Upload to Supabase Storage
  const storageKey = `${worldId}/map-${Date.now()}-${filename}`
  const { error: uploadError } = await db.storage
    .from('maps')
    .upload(storageKey, fileBuffer, { contentType: mimetype, upsert: true })

  if (uploadError) return res.status(500).json({ error: uploadError.message })

  // Get public URL
  const { data: urlData } = db.storage.from('maps').getPublicUrl(storageKey)
  const publicUrl = urlData.publicUrl

  // Save to world record
  await db.from('worlds').update({ map_image_url: publicUrl }).eq('id', worldId)

  return res.json({ success: true, url: publicUrl })
}
