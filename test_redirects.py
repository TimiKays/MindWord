#!/usr/bin/env python3
"""
测试重定向规则是否存在循环重定向问题
"""
import requests
from urllib.parse import urljoin

# 测试URL列表
BASE_URL = "http://localhost:8080"
TEST_URLS = [
    "/app.html",
    "/app",
    "/index.html",
    "/"
]

def test_redirect(url, max_redirects=5):
    """测试单个URL的重定向情况"""
    print(f"\n测试URL: {url}")
    try:
        response = requests.get(urljoin(BASE_URL, url), allow_redirects=True, timeout=5)
        print(f"最终URL: {response.url}")
        print(f"状态码: {response.status_code}")
        print(f"重定向次数: {len(response.history)}")
        
        if len(response.history) > max_redirects:
            print(f"❌ 警告: 重定向次数过多 ({len(response.history)}次)，可能存在循环重定向")
        
        # 打印完整重定向链
        if response.history:
            print("重定向链:")
            for i, hist in enumerate(response.history):
                print(f"  {i+1}. {hist.url} -> {hist.status_code}")
            print(f"  最终: {response.url} -> {response.status_code}")
        
        return len(response.history)
    except requests.exceptions.RequestException as e:
        print(f"❌ 请求失败: {e}")
        return -1

def main():
    """主函数"""
    print("=== 重定向规则测试 ===")
    print(f"测试基础URL: {BASE_URL}")
    
    total_redirects = 0
    for url in TEST_URLS:
        redirects = test_redirect(url)
        if redirects == -1:
            print(f"\n❌ 测试失败: {url}")
        elif redirects > 5:
            print(f"\n❌ 循环重定向警告: {url}")
        else:
            print(f"\n✅ 测试通过: {url}")
        total_redirects += redirects
    
    print(f"\n=== 测试汇总 ===")
    print(f"总重定向次数: {total_redirects}")
    if total_redirects > 10:
        print("❌ 警告: 总重定向次数过多，可能存在循环重定向")
    else:
        print("✅ 测试通过: 没有发现明显的循环重定向问题")

if __name__ == "__main__":
    main()