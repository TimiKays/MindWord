// Supabase Edge Function: 迁移用户并自动确认邮箱
// 部署命令: supabase functions deploy migrate-user

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req) => {
  // 设置 CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 创建 Supabase Admin 客户端（使用 service_role key）
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 获取请求数据
    const { email, password, userData } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: '缺少邮箱或密码' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 检查用户是否已存在
    const { data: existingUser } = await supabaseAdmin
      .from('user_data')
      .select('user_id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: '用户已存在' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 使用 Admin API 创建用户，并自动确认邮箱
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // 关键：自动确认邮箱！
      user_metadata: {
        migrated_from_leancloud: true,
        migrated_at: new Date().toISOString()
      }
    })

    if (authError) {
      throw authError
    }

    const userId = authData.user.id

    // 迁移用户数据
    const now = Date.now()
    const { error: insertError } = await supabaseAdmin
      .from('user_data')
      .upsert({
        user_id: userId,
        email: email,
        docs: userData?.docs || [],
        ai_config: userData?.aiConfig || {},
        prompt_templates: userData?.promptTemplates || [],
        my_prompt_templates: userData?.myPromptTemplates || [],
        ai_config_hash: userData?.aiConfigHash || null,
        prompt_templates_hash: userData?.promptTemplatesHash || null,
        my_prompt_templates_hash: userData?.myPromptTemplatesHash || null,
        doc_updated_at: userData?.docUpdatedAt || now,
        config_updated_at: userData?.configUpdatedAt || now,
        template_updated_at: userData?.templateUpdatedAt || now,
        my_prompt_template_updated_at: userData?.myPromptTemplateUpdatedAt || now,
        updated_at_ms: now
      }, { onConflict: 'user_id' })

    if (insertError) {
      throw insertError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userId,
        message: '用户创建成功并已自动确认邮箱'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
