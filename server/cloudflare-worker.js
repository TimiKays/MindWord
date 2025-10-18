// Cloudflare Worker - MindWord Cloud Sync (R2)
// 功能：整包双向同步，仅保留 latest.zip / latest.json，每用户容量上限 10MB
// 依赖：绑定 R2（env.BUCKET），环境变量 LEANCLOUD_APP_ID, LEANCLOUD_APP_KEY, LEANCLOUD_SERVER_URL
// 安全：使用会话令牌 + LeanCloud REST 验证，不使用 Master Key

export default {
  async fetch(request, env, ctx) {
    // CORS 处理
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, '');

      if (pathname === '/sync/latest-meta' && request.method === 'GET') {
        const user = await authenticate(request, env);
        return await handleGetLatestMeta(user, env, request);
      }
      if (pathname === '/sync/download-latest' && request.method === 'POST') {
        const user = await authenticate(request, env);
        return await handleDownloadLatest(user, env, request);
      }
      if (pathname === '/sync/upload-latest' && request.method === 'POST') {
        const user = await authenticate(request, env);
        return await handleUploadLatest(user, env, request);
      }
      if (pathname === '/sync/clear' && request.method === 'POST') {
        const user = await authenticate(request, env);
        return await handleClear(user, env, request);
      }

      return respondJSON(404, { error: 'Not Found' }, request);
    } catch (e) {
      console.warn('[Worker] error', e);
      const status = (e && e.status) || 500;
      const msg = (e && e.message) || 'Internal Error';
      return respondJSON(status, { error: msg }, request);
    }
  }
};

// ===== 工具与通用逻辑 =====
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
function respondJSON(status, obj, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
  });
}
function respondZip(status, body, request) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/zip', ...corsHeaders(request) }
  });
}

// 认证：从 Authorization: LeanCloud <token> 提取 token，并通过 LeanCloud REST 验证
async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^\s*LeanCloud\s+(.+)\s*$/i);
  if (!m) throw Object.assign(new Error('缺少鉴权信息'), { status: 401 });
  const sessionToken = m[1];

  const appId = env.LEANCLOUD_APP_ID;
  const appKey = env.LEANCLOUD_APP_KEY;
  const serverURL = (env.LEANCLOUD_SERVER_URL || '').replace(/\/$/, '');
  if (!appId || !appKey || !serverURL) {
    throw Object.assign(new Error('服务端未配置 LeanCloud 环境变量'), { status: 500 });
  }

  const resp = await fetch(`${serverURL}/1.1/users/me`, {
    method: 'GET',
    headers: {
      'X-LC-Id': appId,
      'X-LC-Key': appKey,
      'X-LC-Session': sessionToken
    }
  });
  if (resp.status === 401 || resp.status === 403) {
    throw Object.assign(new Error('会话令牌无效或已过期'), { status: 401 });
  }
  if (!resp.ok) {
    throw Object.assign(new Error(`LeanCloud 校验失败(${resp.status})`), { status: 502 });
  }
  const data = await resp.json();
  const userId = data && (data.objectId || data.id);
  if (!userId) throw Object.assign(new Error('无法识别用户'), { status: 401 });
  return { userId, username: data.username || data.email || '' };
}

function userKeys(userId) {
  const base = `users/${userId}`;
  return {
    latestZipKey: `${base}/latest.zip`,
    latestMetaKey: `${base}/latest.json`
  };
}

// ===== 路由处理 =====
async function handleGetLatestMeta(user, env, request) {
  const { latestMetaKey } = userKeys(user.userId);
  const obj = await env.BUCKET.get(latestMetaKey);
  if (!obj) return respondJSON(404, { error: 'No backup' }, request);
  const text = await obj.text();
  try {
    const meta = JSON.parse(text);
    return respondJSON(200, meta, request);
  } catch {
    return respondJSON(200, { raw: text }, request);
  }
}

async function handleDownloadLatest(user, env, request) {
  const { latestZipKey } = userKeys(user.userId);
  const obj = await env.BUCKET.get(latestZipKey);
  if (!obj || !obj.body) return respondJSON(404, { error: 'No backup' }, request);
  return respondZip(200, obj.body, request);
}

async function handleUploadLatest(user, env, request) {
  const MAX_BYTES = 10 * 1024 * 1024; // 10MB
  // 读取 ZIP 二进制
  const bodyArrayBuffer = await request.arrayBuffer();
  if (!bodyArrayBuffer || bodyArrayBuffer.byteLength === 0) {
    throw Object.assign(new Error('空内容'), { status: 400 });
  }
  if (bodyArrayBuffer.byteLength > MAX_BYTES) {
    return respondJSON(413, { error: '超过10MB容量上限' }, request);
  }

  // 统计 index.md 数量（扫描中央目录中的文件名，近似实现）
  const fileCount = countIndexMdInZip(bodyArrayBuffer);

  const { latestZipKey, latestMetaKey } = userKeys(user.userId);

  // 覆盖写入 latest.zip
  await env.BUCKET.put(latestZipKey, bodyArrayBuffer, {
    httpMetadata: { contentType: 'application/zip' }
  });

  // 写入 latest.json
  const updatedAt = new Date().toISOString();
  const meta = {
    userId: user.userId,
    updatedAt,
    sizeBytes: bodyArrayBuffer.byteLength,
    fileCount: fileCount,
    type: 'zip'
  };
  await env.BUCKET.put(latestMetaKey, JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json' }
  });

  return respondJSON(200, { ok: true, ...meta }, request);
}

async function handleClear(user, env, request) {
  const { latestZipKey, latestMetaKey } = userKeys(user.userId);
  try { await env.BUCKET.delete(latestZipKey); } catch (_) {}
  try { await env.BUCKET.delete(latestMetaKey); } catch (_) {}
  return respondJSON(200, { ok: true }, request);
}

// ===== ZIP 统计：粗略扫描中央目录中出现的 "index.md" 文件名次数 =====
function countIndexMdInZip(ab) {
  try {
    const bytes = new Uint8Array(ab);
    // 查找 End of Central Directory (EOCD) 签名 0x06054b50，从末尾向前搜索最多 64KB
    const sig = [0x50, 0x4b, 0x05, 0x06];
    const maxBack = Math.min(bytes.length, 65536);
    let eocdPos = -1;
    for (let i = bytes.length - 4; i >= bytes.length - maxBack; i--) {
      if (i < 0) break;
      if (bytes[i] === sig[0] && bytes[i + 1] === sig[1] && bytes[i + 2] === sig[2] && bytes[i + 3] === sig[3]) {
        eocdPos = i; break;
      }
    }
    if (eocdPos < 0) {
      // 非标准 ZIP（或过大），退化：全局扫描 ASCII "index.md" 次数
      return asciiScan(bytes, 'index.md');
    }
    // 从 EOCD 读取 central directory 起始偏移（相对）与总记录数
    // EOCD 结构：
    // offset + 10: total entries on this disk (2 bytes)
    // offset + 12: total entries (2 bytes)
    // offset + 16: size of central directory (4 bytes)
    // offset + 20: offset of central directory (4 bytes)
    const totalEntries = readUInt16LE(bytes, eocdPos + 12);
    const cdOffset = readUInt32LE(bytes, eocdPos + 20);
    let pos = cdOffset;
    let count = 0;
    // Central Directory File Header signature: 0x02014b50
    for (let n = 0; n < totalEntries; n++) {
      if (pos + 46 > bytes.length) break;
      if (!isSignature(bytes, pos, 0x02014b50)) break;
      const fileNameLen = readUInt16LE(bytes, pos + 28);
      const extraLen = readUInt16LE(bytes, pos + 30);
      const commentLen = readUInt16LE(bytes, pos + 32);
      const nameStart = pos + 46;
      const nameEnd = nameStart + fileNameLen;
      if (nameEnd > bytes.length) break;
      const name = asciiSlice(bytes, nameStart, nameEnd);
      // 仅统计以 "/index.md" 结尾的文件
      if (name.endsWith('/index.md') || name === 'index.md') count++;
      pos = nameEnd + extraLen + commentLen;
    }
    // 若遍历异常，则退化为全局扫描
    if (count === 0) count = asciiScan(bytes, 'index.md');
    return count;
  } catch (_) {
    return 0;
  }
}
function isSignature(bytes, pos, sig32) {
  const b0 = bytes[pos], b1 = bytes[pos + 1], b2 = bytes[pos + 2], b3 = bytes[pos + 3];
  const want = [sig32 & 0xff, (sig32 >> 8) & 0xff, (sig32 >> 16) & 0xff, (sig32 >> 24) & 0xff];
  return b0 === want[0] && b1 === want[1] && b2 === want[2] && b3 === want[3];
}
function readUInt16LE(bytes, pos) { return (bytes[pos] | (bytes[pos + 1] << 8)) >>> 0; }
function readUInt32LE(bytes, pos) { return (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0; }
function asciiSlice(bytes, start, end) {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
function asciiScan(bytes, needle) {
  const n = new TextEncoder().encode(needle);
  let count = 0;
  for (let i = 0; i <= bytes.length - n.length; i++) {
    let ok = true;
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) { ok = false; break; }
    if (ok) count++;
  }
  return count;
}
