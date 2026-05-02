import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '../../../lib/supabase'
import Busboy from 'busboy'

export const config = { api: { bodyParser: false } }

async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text || ''
  } catch (e) {
    console.error('PDF parse error:', e)
    return ''
  }
}

function parseMultipart(req: NextApiRequest): Promise<{ fields: Record<string, string>, fileBuffer: Buffer, filename: string }> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers })
    const fields: Record<string, string> = {}
    let fileBuffer: Buffer = Buffer.alloc(0)
    let filename = ''
    const chunks: Buffer[] = []

    bb.on('field', (name, val) => { fields[name] = val })
    bb.on('file', (_name, stream, info) => {
      filename = info.filename
      stream.on('data', chunk => chunks.push(chunk))
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks) })
    })
    bb.on('close', () => resolve({ fields, fileBuffer, filename }))
    bb.on('error', reject)
    req.pipe(bb)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { fields, fileBuffer, filename } = await parseMultipart(req)
    const token = fields.token
    if (!token) return res.status(400).json({ error: 'token required' })

    const db = getSupabaseAdmin()
    const { data: player } = await db
      .from('players')
      .select('id, world_id')
      .eq('invite_token', token)
      .single()

    if (!player) return res.status(404).json({ error: 'Invalid token' })

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No file received' })
    }

    // Parse PDF text
    const sheetText = await parsePDF(fileBuffer)
    if (!sheetText) return res.status(400).json({ error: 'Could not extract text from PDF' })

    // Save to player record
    await db.from('players').update({
      character_sheet_text: sheetText
    }).eq('id', player.id)

    // Return first 500 chars as preview
    return res.json({
      success: true,
      preview: sheetText.slice(0, 500),
      length: sheetText.length
    })

  } catch (e: any) {
    console.error('Upload error:', e)
    return res.status(500).json({ error: e.message })
  }
}
