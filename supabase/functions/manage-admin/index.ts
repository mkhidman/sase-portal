import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RequestBody =
  | { action: 'replace_assignments'; adminId: string; classIds: string[] }
  | { action: 'transfer_assignments'; sourceAdminId: string; targetAdminId: string; classIds: string[] }
  | { action: 'set_active'; adminId: string; active: boolean; replacementAdminId?: string | null; classIds?: string[] }
  | { action: 'reset_password'; adminId: string; temporaryPassword: string }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metode tidak diizinkan.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 })
  }

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) throw new Error('Token tidak ditemukan.')

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) throw new Error('Sesi tidak valid.')

    const adminClient = createClient(url, serviceRoleKey)
    const { data: profile, error: profileError } = await adminClient.from('profiles').select('role,active').eq('id', authData.user.id).single()
    if (profileError || profile?.role !== 'superadmin' || profile.active === false) throw new Error('Hanya Superadmin aktif yang dapat mengelola akun Admin.')

    const body = await request.json() as RequestBody
    if (!body?.action) throw new Error('Tindakan belum dipilih.')

    if (body.action === 'replace_assignments') {
      if (!body.adminId || !Array.isArray(body.classIds)) throw new Error('Data penugasan belum lengkap.')
      const { error } = await adminClient.rpc('replace_admin_assignments', {
        requesting_user_id: authData.user.id,
        target_admin_id: body.adminId,
        target_class_ids: body.classIds,
      })
      if (error) throw error
    }

    if (body.action === 'transfer_assignments') {
      if (!body.sourceAdminId || !body.targetAdminId || !Array.isArray(body.classIds)) throw new Error('Data pemindahan belum lengkap.')
      const { error } = await adminClient.rpc('transfer_admin_assignments', {
        requesting_user_id: authData.user.id,
        source_admin_id: body.sourceAdminId,
        target_admin_id: body.targetAdminId,
        target_class_ids: body.classIds,
      })
      if (error) throw error
    }

    if (body.action === 'set_active') {
      if (!body.adminId || typeof body.active !== 'boolean') throw new Error('Data status akun belum lengkap.')
      if (body.active) {
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(body.adminId, { ban_duration: 'none' })
        if (authUpdateError) throw authUpdateError
      }
      const { error } = await adminClient.rpc('set_admin_active_status', {
        requesting_user_id: authData.user.id,
        target_admin_id: body.adminId,
        new_active: body.active,
        replacement_admin_id: body.replacementAdminId ?? null,
        reactivation_class_ids: body.classIds ?? [],
      })
      if (error) throw error
      if (!body.active) {
        const { error: banError } = await adminClient.auth.admin.updateUserById(body.adminId, { ban_duration: '876000h' })
        if (banError) throw banError
      }
    }

    if (body.action === 'reset_password') {
      if (!body.adminId || !body.temporaryPassword || body.temporaryPassword.length < 8) throw new Error('Password sementara minimal 8 karakter.')
      const { error } = await adminClient.rpc('mark_admin_password_reset', {
        requesting_user_id: authData.user.id,
        target_admin_id: body.adminId,
      })
      if (error) throw error
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(body.adminId, { password: body.temporaryPassword })
      if (passwordError) throw passwordError
    }

    if (!['replace_assignments', 'transfer_assignments', 'set_active', 'reset_password'].includes(body.action)) {
      throw new Error('Tindakan tidak dikenali.')
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Terjadi kesalahan.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})
