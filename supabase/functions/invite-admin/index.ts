import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
    if (profileError || profile?.role !== 'superadmin' || profile.active === false) throw new Error('Hanya Superadmin aktif yang dapat membuat Admin.')

    const body = await request.json() as { email: string; fullName: string; password: string; classIds: string[] }
    if (!body.email || !body.fullName || !body.password || body.password.length < 8 || !Array.isArray(body.classIds) || !body.classIds.length) throw new Error('Data Admin belum lengkap.')

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.fullName, role: 'admin', must_change_password: true },
    })
    if (createError || !created.user) throw createError ?? new Error('Gagal membuat user.')

    try {
      const { error: assignmentError } = await adminClient.from('admin_class_assignments').insert(body.classIds.map((classId) => ({ admin_id: created.user.id, class_id: classId })))
      if (assignmentError) throw assignmentError
      await adminClient.from('profiles').update({ active: true, must_change_password: true }).eq('id', created.user.id)
    } catch (cause) {
      await adminClient.auth.admin.deleteUser(created.user.id)
      throw cause
    }

    return new Response(JSON.stringify({ id: created.user.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 201 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Terjadi kesalahan.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})
