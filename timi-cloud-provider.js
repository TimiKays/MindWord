/**
 * MindWord 的 TimiAuth / TimiCloud 适配层。
 * 只在 account_mode=unified 的内部试用标签页中访问统一服务。
 */
(function initMindWordTimiCloudProvider() {
    'use strict';

    const PRODUCT = 'mindword';
    const DATA_KEY = 'workspace_v1';
    const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
    const REQUEST_HEADROOM_BYTES = 64 * 1024;
    const SAFE_REQUEST_BYTES = MAX_REQUEST_BYTES - REQUEST_HEADROOM_BYTES;
    const CLOUD_STATUS_CACHE_TTL = 300000;
    const SENSITIVE_KEY_RE = /(?:api[_-]?key|access[_-]?key|secret|password|passphrase|private[_-]?key|auth(?:orization)?|bearer|token)$/i;
    const SENSITIVE_VALUE_RE = /(?:^|[?&\s])(?:api[_-]?key|access[_-]?token|token|secret|key)=\S+|\bbearer\s+\S+|\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,})/i;
    let lastCloudUpdatedAt = 0;
    let cachedCloudStatus = null;
    let cloudStatusCheckedAt = 0;

    function isUnifiedMode() {
        return !!(window.MW_ACCOUNT_MODE && window.MW_ACCOUNT_MODE.isUnified());
    }

    async function ensureReady() {
        if (!isUnifiedMode()) throw new Error('统一账户内部试用未启用');
        try {
            await window.MW_ACCOUNT_MODE.ready;
        } catch (_) {
            throw new Error('统一账户服务暂时不可用，本地编辑不受影响');
        }
        if (!window.TimiAuth || !window.TimiCloud) {
            throw new Error('统一账户服务暂时不可用，本地编辑不受影响');
        }
    }

    function cloneValue(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function sanitizeSecrets(value) {
        if (typeof value === 'string' && SENSITIVE_VALUE_RE.test(value)) return undefined;
        if (Array.isArray(value)) {
            return value.map(function (item) {
                const sanitized = sanitizeSecrets(item);
                return sanitized === undefined ? null : sanitized;
            });
        }
        if (!value || typeof value !== 'object') return value;

        const result = {};
        Object.keys(value).forEach(function (key) {
            const child = value[key];
            const sensitiveKey = SENSITIVE_KEY_RE.test(key)
                && child !== null
                && child !== undefined
                && String(child).trim() !== '';
            if (sensitiveKey) return;
            const sanitized = sanitizeSecrets(child);
            if (sanitized !== undefined) result[key] = sanitized;
        });
        return result;
    }

    function restoreLocalSecrets(localValue, cloudValue) {
        if (typeof localValue === 'string' && SENSITIVE_VALUE_RE.test(localValue)) return localValue;
        if (Array.isArray(localValue)) {
            const cloudArray = Array.isArray(cloudValue) ? cloudValue : [];
            const length = Math.max(localValue.length, cloudArray.length);
            const result = [];
            for (let index = 0; index < length; index += 1) {
                const localChild = localValue[index];
                const cloudChild = cloudArray[index];
                if (typeof localChild === 'string' && SENSITIVE_VALUE_RE.test(localChild)) {
                    result[index] = localChild;
                } else if (localChild && typeof localChild === 'object') {
                    result[index] = restoreLocalSecrets(localChild, cloudChild);
                } else if (cloudChild !== undefined && cloudChild !== null) {
                    result[index] = cloneValue(cloudChild);
                } else if (localChild !== undefined) {
                    result[index] = cloneValue(localChild);
                } else {
                    result[index] = null;
                }
            }
            return result;
        }

        const localObject = localValue && typeof localValue === 'object' ? localValue : {};
        const cloudObject = cloudValue && typeof cloudValue === 'object' && !Array.isArray(cloudValue)
            ? cloudValue
            : {};
        const result = cloneValue(cloudObject) || {};
        Object.keys(localObject).forEach(function (key) {
            const localChild = localObject[key];
            const sensitiveKey = SENSITIVE_KEY_RE.test(key)
                && localChild !== null
                && localChild !== undefined
                && String(localChild).trim() !== '';
            const sensitiveValue = typeof localChild === 'string' && SENSITIVE_VALUE_RE.test(localChild);
            if (sensitiveKey || sensitiveValue) {
                result[key] = cloneValue(localChild);
            } else if (localChild && typeof localChild === 'object') {
                result[key] = restoreLocalSecrets(localChild, cloudObject[key]);
            }
        });
        return result;
    }

    function emptyCloudData() {
        return {
            docs: [],
            aiConfig: {},
            promptTemplates: [],
            myPromptTemplates: [],
            docUpdatedAt: 0,
            configUpdatedAt: 0,
            templateUpdatedAt: 0,
            myPromptTemplateUpdatedAt: 0,
            aiConfigHash: null,
            promptTemplatesHash: null,
            myPromptTemplatesHash: null,
            updatedAtMs: 0
        };
    }

    function parseWorkspaceItem(item) {
        if (!item) return emptyCloudData();
        let workspace = item.data_value;
        if (typeof workspace === 'string') {
            try {
                workspace = JSON.parse(workspace);
            } catch (_) {
                throw new Error('云端工作区格式异常，为保护本地数据，已停止同步');
            }
        }
        if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace) || workspace.schemaVersion !== 1) {
            throw new Error('云端工作区版本异常，为保护本地数据，已停止同步');
        }
        if (!Array.isArray(workspace.docs)
            || !Array.isArray(workspace.promptTemplates)
            || !Array.isArray(workspace.myPromptTemplates)
            || !workspace.aiConfig
            || typeof workspace.aiConfig !== 'object'
            || Array.isArray(workspace.aiConfig)) {
            throw new Error('云端工作区内容不完整，为保护本地数据，已停止同步');
        }

        lastCloudUpdatedAt = Number(item.updated_at || workspace.sourceUpdatedAtMs || 0);
        return {
            id: DATA_KEY,
            docs: workspace.docs,
            aiConfig: workspace.aiConfig,
            promptTemplates: workspace.promptTemplates,
            myPromptTemplates: workspace.myPromptTemplates,
            docUpdatedAt: Number(workspace.docUpdatedAt || 0),
            configUpdatedAt: Number(workspace.aiConfigLastModified || 0),
            templateUpdatedAt: Number(workspace.promptTemplatesLastModified || 0),
            myPromptTemplateUpdatedAt: Number(workspace.myPromptTemplatesLastModified || 0),
            aiConfigHash: workspace.aiConfigHash || null,
            promptTemplatesHash: workspace.promptTemplatesHash || null,
            myPromptTemplatesHash: workspace.myPromptTemplatesHash || null,
            updatedAtMs: lastCloudUpdatedAt
        };
    }

    function buildWorkspace(target) {
        const originalConfig = target.aiConfig || {};
        const sanitizedConfig = sanitizeSecrets(originalConfig) || {};
        const removedSecrets = JSON.stringify(sanitizedConfig) !== JSON.stringify(originalConfig);
        return {
            schemaVersion: 1,
            docs: Array.isArray(target.docs) ? target.docs : [],
            aiConfig: sanitizedConfig,
            promptTemplates: Array.isArray(target.promptTemplates) ? target.promptTemplates : [],
            myPromptTemplates: Array.isArray(target.myPromptTemplates) ? target.myPromptTemplates : [],
            docUpdatedAt: Number(target.docUpdatedAt || 0),
            aiConfigLastModified: Number(target.aiConfigLastModified || 0),
            promptTemplatesLastModified: Number(target.promptTemplatesLastModified || 0),
            myPromptTemplatesLastModified: Number(target.myPromptTemplatesLastModified || 0),
            aiConfigHash: removedSecrets ? null : (target.aiConfigHash || null),
            promptTemplatesHash: target.promptTemplatesHash || null,
            myPromptTemplatesHash: target.myPromptTemplatesHash || null,
            sourceUpdatedAtMs: Date.now()
        };
    }

    function requestByteLength(workspace) {
        const requestBody = JSON.stringify({ product: PRODUCT, key: DATA_KEY, value: workspace });
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(requestBody).byteLength;
        return unescape(encodeURIComponent(requestBody)).length;
    }

    function valueByteLength(value) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(serialized).byteLength;
        return unescape(encodeURIComponent(serialized)).length;
    }

    function countActiveDocs(docs) {
        return (Array.isArray(docs) ? docs : []).filter(function (doc) {
            return doc && !doc.deletedAt;
        }).length;
    }

    function emptyCloudStatus() {
        return {
            exists: false,
            docCount: 0,
            sizeBytes: 0,
            limitBytes: MAX_REQUEST_BYTES,
            updatedAt: 0
        };
    }

    function buildCloudStatus(item, parsedWorkspace) {
        if (!item) return emptyCloudStatus();
        const cloudData = parsedWorkspace || parseWorkspaceItem(item);
        const reportedSize = Number(item.data_size);
        return {
            exists: true,
            docCount: countActiveDocs(cloudData.docs),
            sizeBytes: Number.isFinite(reportedSize) && reportedSize >= 0
                ? reportedSize
                : valueByteLength(item.data_value),
            limitBytes: MAX_REQUEST_BYTES,
            updatedAt: Number(item.updated_at || cloudData.updatedAtMs || 0)
        };
    }

    function cacheCloudStatus(status) {
        cachedCloudStatus = { ...status };
        cloudStatusCheckedAt = Date.now();
        lastCloudUpdatedAt = Number(status.updatedAt) || 0;
        return { ...cachedCloudStatus };
    }

    async function getCurrentUser() {
        await ensureReady();
        return window.TimiAuth.checkSession();
    }

    async function downloadWorkspace() {
        await ensureReady();
        const items = await window.TimiCloud.pull(PRODUCT);
        const item = items.find(function (candidate) { return candidate.data_key === DATA_KEY; });
        const parsedWorkspace = parseWorkspaceItem(item || null);
        cacheCloudStatus(buildCloudStatus(item || null, parsedWorkspace));
        return parsedWorkspace;
    }

    async function uploadWorkspace(target) {
        await ensureReady();
        const user = await window.TimiAuth.checkSession();
        if (!user) throw new Error('请先登录后再同步');
        const workspace = buildWorkspace(target || {});
        const bytes = requestByteLength(workspace);
        if (bytes > SAFE_REQUEST_BYTES) {
            const sizeInMB = (bytes / 1024 / 1024).toFixed(1);
            throw new Error(`云备份大小接近或超过10MB限制（当前${sizeInMB}MB），请先删除部分图片或文档`);
        }
        const result = await window.TimiCloud.push(DATA_KEY, workspace, PRODUCT);
        lastCloudUpdatedAt = Number(result && result.updated_at) || Date.now();
        cacheCloudStatus({
            exists: true,
            docCount: countActiveDocs(workspace.docs),
            sizeBytes: Number(result && result.size) || valueByteLength(workspace),
            limitBytes: MAX_REQUEST_BYTES,
            updatedAt: lastCloudUpdatedAt
        });
        return result;
    }

    async function clearWorkspace() {
        await ensureReady();
        const user = await window.TimiAuth.checkSession();
        if (!user) throw new Error('请先登录后再操作');
        const result = await window.TimiCloud.remove(DATA_KEY, PRODUCT);
        lastCloudUpdatedAt = 0;
        cacheCloudStatus(emptyCloudStatus());
        return result;
    }

    async function getCloudStatus(options) {
        const force = !!(options && options.force);
        const now = Date.now();
        if (!force && cachedCloudStatus && (now - cloudStatusCheckedAt) < CLOUD_STATUS_CACHE_TTL) {
            return { ...cachedCloudStatus };
        }
        await ensureReady();
        const user = await window.TimiAuth.checkSession();
        if (!user) throw new Error('请先登录后查看云端状态');
        const items = await window.TimiCloud.pull(PRODUCT);
        const item = items.find(function (candidate) { return candidate.data_key === DATA_KEY; });
        return cacheCloudStatus(buildCloudStatus(item || null));
    }

    async function getLastCloudUpdatedAt() {
        const status = await getCloudStatus();
        return Number(status.updatedAt) || 0;
    }

    window.MW_TIMI_CLOUD = Object.freeze({
        product: PRODUCT,
        dataKey: DATA_KEY,
        isEnabled: isUnifiedMode,
        ensureReady: ensureReady,
        getCurrentUser: getCurrentUser,
        downloadWorkspace: downloadWorkspace,
        uploadWorkspace: uploadWorkspace,
        clearWorkspace: clearWorkspace,
        getCloudStatus: getCloudStatus,
        getLastCloudUpdatedAt: getLastCloudUpdatedAt,
        restoreLocalSecrets: restoreLocalSecrets,
        sanitizeSecrets: sanitizeSecrets,
        buildWorkspace: buildWorkspace,
        parseWorkspaceItem: parseWorkspaceItem,
        requestByteLength: requestByteLength,
        valueByteLength: valueByteLength
    });
})();
