/**
 * MindWord - Supabase 配置文件
 * 
 * 说明：
 * 1. 此文件用于配置 Supabase 连接信息
 * 2. 需要从 Supabase 控制台获取 URL 和 Anon Key
 * 3. 替换完成后，LeanCloud 配置可保留作为备份
 * 
 * 获取方式：
 * 1. 登录 https://supabase.com
 * 2. 创建新项目
 * 3. 进入 Project Settings → API
 * 4. 复制 Project URL 和 anon public 的 key
 */

(function () {
    'use strict';

    // ============================================
    // Supabase 配置 - 需要替换为你的实际配置
    // ============================================
    const SUPABASE_CONFIG = {
        // 替换为：Project Settings → API → Project URL
        url: 'https://ohvsfqdbcelmokkslqlw.supabase.co',

        // 替换为：Project Settings → API → anon public
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9odnNmcWRiY2VsbW9ra3NscWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MDg0MTYsImV4cCI6MjA5MzA4NDQxNn0.t3uTrr5aikTiTFKAK_mNKZCdKcpy3dkpM7JShnXrBEk'
    };

    // ============================================
    // 表名配置（对应 Supabase 数据库表）
    // ============================================
    const TABLE_NAMES = {
        userData: 'user_data',      // 用户数据同步表
        feedback: 'feedback'        // 用户反馈表
    };

    // ============================================
    // 初始化 Supabase 客户端
    // ============================================
    let supabaseClient = null;

    function initSupabase() {
        if (supabaseClient) return supabaseClient;

        if (typeof supabase === 'undefined') {
            console.error('[Supabase] SDK 未加载，请先引入 supabase-js');
            return null;
        }

        // 检查配置是否有效
        if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
            console.warn('[Supabase] 配置无效，请检查 supabase-config.js 中的配置');
            return null;
        }

        try {
            // 确保 anonKey 是有效的字符串
            const anonKey = String(SUPABASE_CONFIG.anonKey).trim();
            if (!anonKey || anonKey.length < 10) {
                console.error('[Supabase] anonKey 格式无效');
                return null;
            }

            supabaseClient = supabase.createClient(
                SUPABASE_CONFIG.url,
                anonKey,
                {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: true
                    },
                    global: {
                        headers: {
                            'apikey': anonKey
                        }
                    }
                }
            );
            console.log('[Supabase] 客户端初始化成功');
            console.log('[Supabase] URL:', SUPABASE_CONFIG.url);
            console.log('[Supabase] API Key 长度:', anonKey.length);
            console.log('[Supabase] API Key 前10位:', anonKey.substring(0, 10) + '...');
            return supabaseClient;
        } catch (error) {
            console.error('[Supabase] 初始化失败:', error);
            return null;
        }
    }

    // ============================================
    // 获取 Supabase 客户端（懒加载）
    // ============================================
    window.getSupabase = function () {
        if (!supabaseClient) {
            supabaseClient = initSupabase();
        }
        return supabaseClient;
    };

    // ============================================
    // 检查 Supabase 是否可用
    // ============================================
    window.isSupabaseAvailable = function () {
        const client = window.getSupabase();
        return !!client;
    };

    // ============================================
    // 获取表名配置
    // ============================================
    window.getSupabaseTables = function () {
        return TABLE_NAMES;
    };

    // ============================================
    // 配置信息（只读）
    // ============================================
    window.getSupabaseConfig = function () {
        return {
            url: SUPABASE_CONFIG.url,
            tables: TABLE_NAMES
            // 注意：不返回 anonKey，避免泄露
        };
    };

    console.log('[Supabase] 配置模块已加载');
})();
