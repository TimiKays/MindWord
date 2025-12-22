export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      console.log(`收到请求: ${request.method} ${url.pathname}`);

      // 确保数据库和表都存在
      await ensureDatabaseReady(env);

      if (url.pathname === '/api/likes' || url.pathname === '/') {
        if (request.method === 'GET') {
          return await handleGetLikes(env, headers);
        }

        if (request.method === 'POST') {
          const clientIP = request.headers.get('CF-Connecting-IP') ||
            request.headers.get('X-Forwarded-For')?.split(',')[0] ||
            'unknown';
          return await handlePostLikes(env, headers, clientIP);
        }
      }

      return new Response(JSON.stringify({
        error: 'Not Found',
        path: url.pathname
      }), {
        status: 404,
        headers
      });

    } catch (error) {
      console.error('Worker错误:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers
      });
    }
  }
};

// 确保数据库准备就绪
async function ensureDatabaseReady(env) {
  try {
    console.log('检查数据库状态...');

    // 检查表是否存在
    const tableExists = await checkTableExists(env, 'likes');
    console.log('likes表存在:', tableExists);

    if (!tableExists) {
      console.log('创建likes表...');
      await createLikesTable(env);
    }

    // 检查是否有数据
    const hasData = await checkHasData(env);
    console.log('是否有初始数据:', hasData);

    if (!hasData) {
      console.log('插入初始数据...');
      await insertInitialData(env);
    }

  } catch (error) {
    console.error('数据库准备失败:', error);
    throw error;
  }
}

// 检查表是否存在
async function checkTableExists(env, tableName) {
  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).bind(tableName).first();

    return !!result;
  } catch (error) {
    console.error('检查表存在失败:', error);
    return false;
  }
}

// 创建likes表
async function createLikesTable(env) {
  try {
    await env.DB.exec(`
      CREATE TABLE likes (
        id INTEGER PRIMARY KEY,
        count INTEGER DEFAULT 0
      )
    `);
    console.log('likes表创建成功');
  } catch (error) {
    console.error('创建likes表失败:', error);
    throw error;
  }
}

// 检查是否有数据
async function checkHasData(env) {
  try {
    const result = await env.DB.prepare('SELECT COUNT(*) as total FROM likes').first();
    return result && result.total > 0;
  } catch (error) {
    console.error('检查数据失败:', error);
    return false;
  }
}

// 插入初始数据
async function insertInitialData(env) {
  try {
    await env.DB.prepare('INSERT INTO likes (id, count) VALUES (1, 0)').run();
    console.log('初始数据插入成功');
  } catch (error) {
    console.error('插入初始数据失败:', error);
    // 可能是数据已存在，忽略错误
  }
}

// 获取点赞数
async function handleGetLikes(env, headers) {
  try {
    const result = await env.DB.prepare('SELECT count FROM likes WHERE id = 1').first();
    const count = result?.count || 0;

    return new Response(JSON.stringify({
      count,
      status: 'success'
    }), { headers });

  } catch (error) {
    console.error('获取点赞数失败:', error);
    return new Response(JSON.stringify({
      count: 0,
      error: error.message,
      status: 'error'
    }), { headers });
  }
}

// 增加点赞数
async function handlePostLikes(env, headers, clientIP) {
  try {
    console.log(`收到点赞请求，IP: ${clientIP}`);

    // 更新点赞数
    await env.DB.prepare('UPDATE likes SET count = count + 1 WHERE id = 1').run();

    // 获取更新后的数量
    const result = await env.DB.prepare('SELECT count FROM likes WHERE id = 1').first();
    const newCount = result?.count || 0;

    console.log('新的点赞数:', newCount);

    return new Response(JSON.stringify({
      count: newCount,
      message: '点赞成功',
      status: 'success'
    }), { headers });

  } catch (error) {
    console.error('点赞失败:', error);
    return new Response(JSON.stringify({
      error: '点赞失败',
      message: error.message,
      status: 'error'
    }), {
      status: 500,
      headers
    });
  }
}