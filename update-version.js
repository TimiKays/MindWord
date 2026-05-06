/**
 * 版本号更新脚本
 * 发布时运行：node update-version.js
 * 
 * 功能：
 * 1. 更新 version.json 中的版本号
 * 2. 更新 sw.js 中的 SW_VERSION
 * 3. 给所有HTML中的业务代码引用添加版本号参数
 */

const fs = require('fs');
const path = require('path');

const VERSION_FILE = 'version.json';
const SW_FILE = 'sw.js';
const HTML_FILES = [
    'index.html',
    'app.html',
    'auth.html',
    'auth-leancloud.html',
    'feedback-supabase.html',
    'reset-password.html',
    'auth-callback.html',
    'privacy.html',
    'jsmind/mindmap.html',
    'editor/editor.html',
    'md2word/md2word.html',
    'changelog/changelog.html',
    'supoort/support.html',
    'ai/newai/AIServiceModal.html',
    'ai/newai/user-template-manager.html'
];

const SKIP_PATTERNS = [
    /local-deps\//,
    /jsmind-local\//,
    /bootstrap/,
    /jquery/,
    /font-awesome/,
    /dom-to-image/,
    /jszip/,
    /pizzip/,
    /FileSaver/,
    /markdown-it/,
    /av-min/,
    /tailwind-compiled/,
    /google/,
    /adsbygoogle/,
    /googletagmanager/,
    /cdn\./,
    /unpkg\.com/,
    /jsdelivr\.net/
];

function generateVersion() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day}.${hour}${minute}`;
}

function updateVersionFile(version) {
    const versionData = {
        version: version,
        buildTime: new Date().toISOString(),
        swVersion: `v${version.replace(/\./g, '')}`
    };

    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2));
    console.log(`✅ 已更新 ${VERSION_FILE}: ${version}`);
    return versionData.swVersion;
}

function updateSwVersion(swVersion) {
    let swContent = fs.readFileSync(SW_FILE, 'utf8');
    swContent = swContent.replace(
        /const SW_VERSION = 'v\d+';/,
        `const SW_VERSION = '${swVersion}';`
    );
    fs.writeFileSync(SW_FILE, swContent);
    console.log(`✅ 已更新 ${SW_FILE}: ${swVersion}`);
}

function shouldSkip(url) {
    return SKIP_PATTERNS.some(pattern => pattern.test(url));
}

function addVersionToHtml(filePath, version) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    content = content.replace(
        /<(script|link)[^>]*(?:src|href)="([^"]+\.(js|css))(\?v=[^"]*)?"/g,
        (match, tag, url, ext, existingVersion) => {
            if (shouldSkip(url)) {
                return match;
            }

            if (existingVersion) {
                const newMatch = match.replace(/\?v=[^"]*/, `?v=${version}`);
                if (newMatch !== match) changed = true;
                return newMatch;
            } else {
                const newMatch = match.replace(`"${url}"`, `"${url}?v=${version}"`);
                changed = true;
                return newMatch;
            }
        }
    );

    const metaVersionPattern = /<meta name="mindword-version" content="[^"]*">/;
    if (metaVersionPattern.test(content)) {
        const newContent = content.replace(
            metaVersionPattern,
            `<meta name="mindword-version" content="${version}">`
        );
        if (newContent !== content) {
            content = newContent;
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`✅ 已更新 ${filePath}`);
    } else {
        console.log(`⏭️  跳过 ${filePath} (无变化)`);
    }
}

function main() {
    console.log('🚀 开始更新版本号...\n');
    
    const version = generateVersion();
    console.log(`📦 新版本号: ${version}\n`);
    
    const swVersion = updateVersionFile(version);
    updateSwVersion(swVersion);
    
    console.log('\n📝 更新HTML文件中的版本号...');
    HTML_FILES.forEach(file => {
        const fullPath = path.join(__dirname, file);
        if (fs.existsSync(fullPath)) {
            addVersionToHtml(fullPath, version);
        } else {
            console.log(`⚠️  文件不存在: ${file}`);
        }
    });
    
    console.log('\n✨ 版本更新完成！');
    console.log('\n📌 发布步骤：');
    console.log('1. 提交代码到Git');
    console.log('2. 推送到远程仓库');
    console.log('3. 等待部署完成');
    console.log('4. 用户打开页面时会自动获取最新版本');
}

main();
