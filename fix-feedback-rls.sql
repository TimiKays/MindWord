-- ============================================
-- 修复 feedback 表的 RLS 策略
-- ============================================

-- 删除旧策略
DROP POLICY IF EXISTS "Anyone can create feedback" ON feedback;
DROP POLICY IF EXISTS "Users can view their own feedback" ON feedback;

-- 为匿名用户创建插入策略
CREATE POLICY "Anonymous users can insert feedback"
ON feedback FOR INSERT
TO anon
WITH CHECK (true);

-- 为已登录用户创建插入策略
CREATE POLICY "Authenticated users can insert feedback"
ON feedback FOR INSERT
TO authenticated
WITH CHECK (true);

-- 为已登录用户创建查看策略
CREATE POLICY "Authenticated users can view feedback"
ON feedback FOR SELECT
TO authenticated
USING (true);

-- 验证策略
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'feedback';
