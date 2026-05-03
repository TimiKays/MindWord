-- ============================================
-- MindWord Supabase 数据库初始化脚本
-- 
-- 使用方法：
-- 1. 登录 Supabase 控制台 (https://supabase.com)
-- 2. 进入 SQL Editor
-- 3. 新建查询，粘贴此脚本
-- 4. 点击 Run
-- ============================================

-- ============================================
-- 1. 创建用户数据同步表
-- 对应原 LeanCloud MWData 类
-- ============================================
CREATE TABLE IF NOT EXISTS user_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- 文档数据（JSONB 格式，存储文档数组）
    docs JSONB DEFAULT '[]'::jsonb,
    
    -- AI 配置
    ai_config JSONB DEFAULT '{}'::jsonb,
    ai_config_hash TEXT,
    
    -- 提示词模板
    prompt_templates JSONB DEFAULT '[]'::jsonb,
    prompt_templates_hash TEXT,
    
    -- 我的提示词模板
    my_prompt_templates JSONB DEFAULT '[]'::jsonb,
    my_prompt_templates_hash TEXT,
    
    -- 时间戳（用于同步冲突判断）
    doc_updated_at BIGINT DEFAULT 0,
    config_updated_at BIGINT DEFAULT 0,
    template_updated_at BIGINT DEFAULT 0,
    my_prompt_template_updated_at BIGINT DEFAULT 0,
    updated_at_ms BIGINT DEFAULT 0,
    
    -- 系统时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为用户ID创建索引，提高查询速度
CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data(user_id);

-- 创建更新时间戳自动更新函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为 user_data 表添加自动更新触发器
DROP TRIGGER IF EXISTS update_user_data_updated_at ON user_data;
CREATE TRIGGER update_user_data_updated_at
    BEFORE UPDATE ON user_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. 创建用户反馈表
-- 对应原 LeanCloud Feedback 类
-- ============================================
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 反馈者邮箱
    email TEXT NOT NULL,
    
    -- 反馈类型: bug/feature/other
    type TEXT NOT NULL,
    
    -- 反馈内容
    content TEXT NOT NULL,
    
    -- 处理状态: pending/processing/resolved/rejected
    status TEXT DEFAULT 'pending',
    
    -- 管理员回复
    reply TEXT,
    
    -- 系统时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为反馈表添加自动更新触发器
DROP TRIGGER IF EXISTS update_feedback_updated_at ON feedback;
CREATE TRIGGER update_feedback_updated_at
    BEFORE UPDATE ON feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. 启用行级安全（RLS）
-- ============================================

-- user_data 表：用户只能访问自己的数据
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略（避免重复创建报错）
DROP POLICY IF EXISTS "Users can only access their own data" ON user_data;
DROP POLICY IF EXISTS "Users can insert their own data" ON user_data;
DROP POLICY IF EXISTS "Users can update their own data" ON user_data;
DROP POLICY IF EXISTS "Users can delete their own data" ON user_data;

-- 创建统一的数据访问策略
CREATE POLICY "Users can only access their own data"
ON user_data FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- feedback 表：任何人可以提交，但只有管理员可以查看
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略
DROP POLICY IF EXISTS "Anyone can create feedback" ON feedback;
DROP POLICY IF EXISTS "Only admins can view feedback" ON feedback;

-- 允许匿名用户提交反馈
CREATE POLICY "Anyone can create feedback"
ON feedback FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 允许已登录用户查看自己的反馈（通过邮箱匹配）
-- 注意：实际生产环境建议用 user_id 关联
CREATE POLICY "Users can view their own feedback"
ON feedback FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ============================================
-- 4. 创建存储桶（用于图片存储，如果需要）
-- 注意：当前版本图片仍用 base64 存于 docs 中，此步骤可选
-- ============================================

-- 插入存储桶配置（如果不存在）
INSERT INTO storage.buckets (id, name, public)
VALUES ('mindword-images', 'mindword-images', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. 验证创建结果
-- ============================================
SELECT 'user_data 表创建成功' as status, count(*) as column_count 
FROM information_schema.columns 
WHERE table_name = 'user_data';

SELECT 'feedback 表创建成功' as status, count(*) as column_count 
FROM information_schema.columns 
WHERE table_name = 'feedback';

SELECT 'RLS 策略创建成功' as status, count(*) as policy_count 
FROM pg_policies 
WHERE tablename IN ('user_data', 'feedback');
