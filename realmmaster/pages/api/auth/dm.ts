import { getSupabase } from '../../../lib/supabase'

export const runtime = 'edge'

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { action, email, password } = await req.json()
  const supabase = getSupabase()

  if (action === 'signup') {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 })
    return new Response(JSON.stringify({ user: data.user, session: data.session }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (action === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 })
    return new Response(JSON.stringify({ user: data.user, session: data.session }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 })
}
