import { getSupabase } from './supabase'

export async function getUserFromHeader(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}
