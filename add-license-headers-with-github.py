#!/usr/bin/env python3
"""
批量为源码文件添加包含GitHub项目地址的Apache License 2.0许可证声明
"""

import os
import re
from datetime import datetime

def get_license_header(file_extension):
    """根据文件类型返回相应的许可证声明模板"""
    year = datetime.now().year
    
    # JavaScript文件的许可证声明
    if file_extension in ['.js']:
        return f"""/**
 * MindWord - 树心 | 像画图一样写文档的思维导图写作工具
 * GitHub: https://github.com/TimiKays/MindWord
 * 
 * Copyright {year} Timi Kays
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"""
    
    # HTML文件的许可证声明
    elif file_extension in ['.html']:
        return f"""<!--
 * MindWord - 树心 | 像画图一样写文档的思维导图写作工具
 * GitHub: https://github.com/TimiKays/MindWord
 * 
 * Copyright {year} Timi Kays
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
-->

"""
    
    # CSS文件的许可证声明
    elif file_extension in ['.css']:
        return f"""/**
 * MindWord - 树心 | 像画图一样写文档的思维导图写作工具
 * GitHub: https://github.com/TimiKays/MindWord
 * 
 * Copyright {year} Timi Kays
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"""
    
    return None

def has_license_header(content, file_extension):
    """检查文件是否已包含许可证声明"""
    
    # 检查是否包含第三方库的许可证声明（如jsmind）
    third_party_patterns = [
        r'@license\s+BSD',
        r'@copyright.*hizzgdev',
        r'https://github\.com/hizzgdev/jsmind',
        r'copyright.*2014-2025.*hizzgdev@163\.com'
    ]
    
    for pattern in third_party_patterns:
        if re.search(pattern, content, re.IGNORECASE):
            return True  # 第三方库文件，不应修改
    
    # 检查我们自己的许可证声明
    our_patterns = [
        r'MindWord\s+-\s+树心.*GitHub:\s*https://github\.com/TimiKays/MindWord',
        r'Copyright\s+2025\s+Timi Kays.*Licensed under the Apache License',
        r'http://www\.apache\.org/licenses/LICENSE-2\.0.*WITHOUT WARRANTIES OR CONDITIONS'
    ]
    
    # 检查是否包含我们自己的GitHub项目地址
    if 'https://github.com/TimiKays/MindWord' in content:
        return True
    
    # 检查是否包含我们自己的完整许可证声明块
    for pattern in our_patterns:
        if re.search(pattern, content, re.DOTALL):
            return True
    
    # 检查是否包含旧的许可证声明格式
    old_patterns = [
        r'Copyright\s+\d{4}\s+Timi Kays',
        r'Licensed under the Apache License.*Version 2\.0'
    ]
    
    old_pattern_count = 0
    for pattern in old_patterns:
        if re.search(pattern, content):
            old_pattern_count += 1
    
    # 如果检测到多个旧模式，认为已包含许可证声明
    if old_pattern_count >= 2:
        return True
        
    return False

def process_file(file_path):
    """处理单个文件"""
    try:
        # 获取文件扩展名
        _, ext = os.path.splitext(file_path)
        
        # 只处理支持的文件类型
        if ext not in ['.js', '.html', '.css']:
            return False, "不支持的文件类型"
        
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查文件长度
        if len(content) < 50:
            return False, "文件太短"
        
        # 检查是否已有许可证声明
        if has_license_header(content, ext):
            return False, "已包含许可证声明"
        
        # 获取许可证声明
        license_header = get_license_header(ext)
        if not license_header:
            return False, "不支持的文件类型"
        
        # 添加许可证声明
        new_content = license_header + content
        
        # 写回文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        return True, "成功添加许可证声明"
        
    except Exception as e:
        return False, f"处理失败: {str(e)}"

def main():
    """主函数"""
    # 定义要处理的文件和目录
    target_files = [
        'init.js',
        'user.js', 
        'leancloud-sync.js',
        'three-iframes.js',
        'language-switch.js',
        'documents.js',
        'notification-bridge.js',
        'styles.css',
        'app.html',
        'auth.html',
        'index.html'
    ]
    
    # 排除的目录
    exclude_dirs = {
        'node_modules',
        '.git',
        'playwright-report',
        'test-results',
        'server',
        'jsmind-local'  # 第三方库目录，不应修改其许可证
    }
    
    processed_count = 0
    skipped_count = 0
    error_count = 0
    
    print("🚀 开始为文件添加包含GitHub项目地址的许可证声明...")
    print("=" * 60)
    
    # 处理指定的文件
    for file_path in target_files:
        if os.path.exists(file_path):
            success, message = process_file(file_path)
            if success:
                print(f"✅ {file_path} - {message}")
                processed_count += 1
            else:
                if "已包含许可证声明" in message:
                    print(f"⏭️  {file_path} - {message}")
                    skipped_count += 1
                else:
                    print(f"❌ {file_path} - {message}")
                    error_count += 1
        else:
            print(f"⚠️  {file_path} - 文件不存在")
            error_count += 1
    
    # 递归处理目录中的文件
    for root, dirs, files in os.walk('.'):
        # 排除指定目录
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            file_path = os.path.join(root, file)
            
            # 只处理支持的文件类型
            _, ext = os.path.splitext(file)
            if ext not in ['.js', '.html', '.css']:
                continue
            
            # 跳过已经处理过的文件
            if os.path.basename(file_path) in target_files:
                continue
            
            # 跳过node_modules等目录
            if any(excluded in file_path for excluded in exclude_dirs):
                continue
            
            success, message = process_file(file_path)
            if success:
                print(f"✅ {file_path} - {message}")
                processed_count += 1
            else:
                if "已包含许可证声明" in message:
                    skipped_count += 1
                elif "文件太短" not in message and "不支持的文件类型" not in message:
                    # 只显示重要的跳过信息
                    pass
    
    print("\n" + "=" * 60)
    print(f"📊 处理完成！")
    print(f"✅ 成功添加: {processed_count} 个文件")
    print(f"⏭️  跳过处理: {skipped_count} 个文件") 
    print(f"❌ 处理失败: {error_count} 个文件")
    print("\n🎉 所有文件已更新为包含GitHub项目地址的许可证声明！")

if __name__ == '__main__':
    main()