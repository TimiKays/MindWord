/**
 * 将节点树的子节点插入到指定父节点下
 * 核心功能：智能插入、去重、层级管理、并发控制
 * 
 * @param {string} parentId - 目标父节点ID
 * @param {Object} ntNode - 包含子节点的节点树对象
 * @param {string} requestId - 请求ID，用于并发控制
 * 
 * 主要特性：
 * 1. 并发安全：使用双重锁机制防止冲突
 * 2. 智能去重：避免重复插入相同主题节点
 * 3. 层级管理：自动计算和维护节点层级
 * 4. 错误恢复：单个节点失败不影响整体
 * 5. 数据规范化：自动调整格式和层级
 */
function insertNodeTreeChildren(parentId, ntNode, requestId) {
  ntNode = ntNode.data;
  // 参数验证：空节点直接返回
  if (!ntNode) return;

  // ===== 并发控制：双重锁机制 =====
  // 初始化请求级别的锁映射表
  try { window._mw_ai_inserting_requests = window._mw_ai_inserting_requests || {}; } catch (e) { window._mw_ai_inserting_requests = {}; }

  // 请求级别锁：同一请求ID只能有一个实例运行
  if (requestId && window._mw_ai_inserting_requests[requestId]) return;

  // 设置请求级别锁
  if (requestId) { try { window._mw_ai_inserting_requests[requestId] = true; } catch (_) { window._mw_ai_inserting_requests[requestId] = true; } }
  // 全局锁：无请求ID时的后备保护
  else { try { if (window.__mw_ai_inserting) return; } catch (_) { } try { window.__mw_ai_inserting = true; } catch (_) { } }

  try {
    // ===== 数据提取与验证 =====
    // 从节点树中提取子节点列表，支持多种数据结构
    var children = ntNode.children || (ntNode.data && ntNode.data.children) || [];

    // 如果ntNode本身有topic（不是系统自动生成的root），说明这是一个有效的根节点
    // 我们需要确保这个根节点被正确处理，而不是被忽略
    var rootNode = null;
    if (ntNode.topic && ntNode.topic.trim() != "Root") {
      rootNode = ntNode;
    }

    if (!Array.isArray(children)) return; // 验证子节点是否为数组

    // ===== 层级计算：确定目标层级 =====
    // 尝试多种方式获取父节点的层级信息
    var targetLevel = null;
    try {
      // 方式1：通过jsmind核心API获取节点对象
      var targetNodeObj = (parentId && jm.get_node) ? jm.get_node(parentId) : null;

      // 方式2：从节点数据中提取层级信息（兼容多层嵌套结构）
      if (targetNodeObj) {
        // 优先级：node.data.level → node.data.data.level → node.level
        if (targetNodeObj.data && typeof targetNodeObj.data.level !== 'undefined') {
          targetLevel = parseInt(targetNodeObj.data.level, 10);
        } else if (targetNodeObj.data && targetNodeObj.data.data && typeof targetNodeObj.data.data.level !== 'undefined') {
          targetLevel = parseInt(targetNodeObj.data.data.level, 10);
        } else if (typeof targetNodeObj.level !== 'undefined') {
          targetLevel = parseInt(targetNodeObj.level, 10);
        }
      }
      // 方式3：使用全局的getNodeLevel函数
      else if (typeof window.getNodeLevel === 'function') {
        targetLevel = window.getNodeLevel(targetNodeObj) || null;
      }
    } catch (e) { targetLevel = null; }

    // 默认层级为1（如果无法确定）
    if (targetLevel === null || isNaN(targetLevel)) targetLevel = 1;

    // ===== 辅助函数：同级节点去重检查 =====
    /**
     * 检查指定父节点下是否已存在相同主题的子节点
     * 用于智能去重，避免重复插入相同内容的节点
     * 
     * @param {string} pid - 父节点ID
     * @param {string} topic - 子节点主题
     * @returns {boolean} - 是否存在相同主题的同级节点
     */
    function siblingExists(pid, topic) {
      try {
        // 参数验证
        if (!pid || !topic) return false;

        // 获取父节点对象
        var pObj = jm.get_node ? jm.get_node(pid) : null;
        // 获取父节点的所有子节点
        var kids = (pObj && Array.isArray(pObj.children)) ? pObj.children : [];

        // 遍历检查是否存在相同主题的节点
        for (var i = 0; i < kids.length; i++) {
          var c = kids[i];
          if (!c) continue; // 跳过空节点

          try {
            // 字符串比较（去除前后空格）
            if (String((c.topic || '')).trim() === String(topic).trim()) return true;
          } catch (e) { }
        }
      } catch (e) { }
      return false;
    }

    // ===== 核心递归插入函数 =====
    /**
     * 递归插入节点及其子节点
     * 处理单个节点的完整生命周期：提取主题→去重检查→创建节点→设置层级→递归子节点
     * 
     * @param {string} pid - 父节点ID
     * @param {Array} nodes - 要插入的节点数组
     * @param {number} depthOffset - 深度偏移量，用于层级计算
     */
    function _insert(pid, nodes, depthOffset) {
      // 参数验证
      if (!Array.isArray(nodes) || nodes.length === 0) return;

      // 遍历处理每个子节点
      nodes.forEach(function (child) {
        try {
          // ===== 主题提取：多种数据源兼容 =====
          // 优先级：child.topic > child.data.topic > child.data.title > child.title
          var topic = child.topic || (child.data && (child.data.topic || child.data.title)) || (child.title || '');

          // 备用方案：从raw数据中提取第一行作为主题
          if (!topic && child.data && child.data.raw) {
            var fl = String(child.data.raw || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
            topic = fl.length > 120 ? fl.slice(0, 120) + '...' : fl; // 超长截断
          }

          // ===== 备注提取：多种数据源兼容 =====
          // 优先级：child.notes > child.data.notes > child.data.remark > child.remark
          var notes = child.notes || (child.data && (child.data.notes || child.data.remark)) || (child.remark || '');

          // 检查子节点情况
          var hasChildren = Array.isArray(child.children) && child.children.length > 0;

          // 无主题但有子节点：直接递归处理子节点，跳过当前节点
          if (!topic && hasChildren) { _insert(pid, child.children, depthOffset); return; }
          // 无主题且无子节点：跳过此节点
          if (!topic && !hasChildren) return;

          // ===== 智能去重：避免重复插入 =====
          if (siblingExists(pid, topic)) {
            // 如果已存在相同主题的节点，合并其子节点而不是创建新节点
            try {
              var pObj = jm.get_node ? jm.get_node(pid) : null;
              var existKid = null;

              // 查找已存在的同级节点
              if (pObj && Array.isArray(pObj.children)) {
                for (var ii = 0; ii < pObj.children.length; ii++) {
                  var kk = pObj.children[ii];
                  if (kk && String((kk.topic || '')).trim() === String(topic).trim()) {
                    existKid = kk;
                    break;
                  }
                }
              }

              // 如果找到已存在节点且有子节点需要合并
              if (existKid) {
                var existId = existKid.id;
                if (hasChildren) {
                  // 递归将子节点插入到已存在的节点下
                  _insert(existId, child.children, depthOffset + 1);
                }
              }
            } catch (e) { }
            return; // 跳过当前节点的创建
          }

          // ===== 节点创建：生成新节点 =====
          // 生成唯一节点ID（随机字符串）
          var nid = 'n_' + Math.random().toString(36).slice(2, 9);

          // 准备节点数据对象
          var nodeData = {};
          try {
            if (child.data) nodeData = Object.assign({}, child.data);
          } catch (_) {
            nodeData = {};
          }

          // 添加备注信息到节点数据中
          if (notes && notes.trim()) {
            nodeData.notes = notes.trim();
          }

          // 数据清理：移除过长的raw内容（超过600字符）
          try {
            if (nodeData.raw && typeof nodeData.raw === 'string' && nodeData.raw.length > 600) {
              delete nodeData.raw;
            }
          } catch (_) { }

          // ===== 层级调整：基于目标层级重新计算 =====
          try {
            if (nodeData.level !== undefined && nodeData.level !== null) {
              // 如果节点数据中有层级信息，将其作为相对偏移量
              var requested = parseInt(nodeData.level, 10) || 0;
              nodeData.level = Math.max(1, targetLevel + requested);
            } else {
              // 不强制设置层级，留给后续的setNodeLevel或normalize处理
            }
          } catch (e) { }

          // ===== 节点添加：调用jsmind核心API =====
          // 优先使用带数据的添加方式，失败时降级到简单添加
          try {
            if (Object.keys(nodeData).length > 0) {
              jm.add_node(pid, nid, topic, nodeData);
            } else {
              jm.add_node(pid, nid, topic);
            }
          } catch (e) {
            // 降级处理：尝试简单添加
            try {
              jm.add_node(pid, nid, topic);
            } catch (e2) {
              return; // 添加失败则跳过此节点
            }
          }

          // 设置节点备注属性以保持兼容性
          if (notes && notes.trim()) {
            try {
              var newNode = jm.get_node ? jm.get_node(nid) : null;
              if (newNode) {
                newNode.notes = notes.trim();
              }
            } catch (e) {
              // 忽略设置备注时的错误
            }
          }

          // ===== 后期处理：层级设置和类型应用 =====
          // 调用外部函数进行节点后期处理（如果存在）
          try {
            // 设置节点层级：优先使用节点数据中的层级，否则基于深度偏移计算
            if (typeof window.setNodeLevel === 'function') {
              if (nodeData && nodeData.level !== undefined && nodeData.level !== null) {
                // 使用节点数据中指定的层级
                try { window.setNodeLevel(nid, nodeData.level); } catch (_) { }
              } else {
                // 基于目标层级和深度偏移计算层级
                try { window.setNodeLevel(nid, Math.max(1, targetLevel + (depthOffset || 0))); } catch (_) { }
              }
            }

            // 应用兄弟节点或父节点类型（如果函数存在）
            if (typeof window.applySiblingOrParentType === 'function') {
              try { window.applySiblingOrParentType(nid); } catch (_) { }
            }
          } catch (e) { }

          // ===== 递归处理子节点 =====
          if (hasChildren) {
            // 递归插入子节点，深度偏移+1
            _insert(nid, child.children, (depthOffset || 0) + 1);
          }

        } catch (e) {
          // ignore single child insert error
        }
      });
    } // end _insert

    // ===== 执行递归插入 =====
    // 如果存在根节点，先创建根节点，然后将其子节点插入到根节点下
    if (rootNode) {
      // 创建根节点
      var rootTopic = rootNode.topic || (rootNode.data && rootNode.data.topic) || '';
      var rootNotes = rootNode.notes || (rootNode.data && (rootNode.data.notes || rootNode.data.remark)) || '';
      var rootData = {};

      try {
        if (rootNode.data) rootData = Object.assign({}, rootNode.data);
        if (rootNotes && rootNotes.trim()) rootData.notes = rootNotes.trim();

        var rootId = 'n_' + Math.random().toString(36).slice(2, 9);

        // 创建根节点
        if (Object.keys(rootData).length > 0) {
          jm.add_node(parentId, rootId, rootTopic, rootData);
        } else {
          jm.add_node(parentId, rootId, rootTopic);
        }

        // 设置根节点的备注
        if (rootNotes && rootNotes.trim()) {
          var newRootNode = jm.get_node ? jm.get_node(rootId) : null;
          if (newRootNode) newRootNode.notes = rootNotes.trim();
        }

        // 递归插入根节点的子节点到根节点下
        _insert(rootId, children, 1);
      } catch (e) {
        console.error('创建根节点失败:', e);
        // 如果根节点创建失败，退回到原来的处理方式
        _insert(parentId, children, 1);
      }
    } else {
      // 没有根节点，直接处理子节点
      _insert(parentId, children, 1);
    }

    // ===== 最终规范化处理 =====
    // 调用外部规范化函数（如果存在）
    try {
      // 调整子节点的标题层级
      if (typeof window.adjustChildrenHeadingLevel === 'function') {
        try { window.adjustChildrenHeadingLevel(parentId); } catch (e) { }
      }
      // 标准化列表下的子树结构
      if (typeof window.normalizeSubtreeUnderList === 'function') {
        try { window.normalizeSubtreeUnderList(parentId); } catch (e) { }
      }
    } catch (e) { }

    // ===== 自动保存 =====
    try {
      if (typeof debouncedSave === 'function') {
        debouncedSave(); // 触发防抖保存
      }
    } catch (_) { }

  } finally {
    // ===== 清理：释放锁资源 =====
    // 释放请求级别锁
    try {
      if (requestId) delete window._mw_ai_inserting_requests[requestId];
    } catch (e) { }
    // 释放全局锁
    try {
      delete window.__mw_ai_inserting;
    } catch (e) {
      console.debug(e);
    }
  }
} // end insertNodeTreeChildren
