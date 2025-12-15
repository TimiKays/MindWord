/**
 * MindWord - 树心 | 像画图一样写文档的思维导图写作工具
 * GitHub: https://github.com/TimiKays/MindWord
 * 
 * Copyright 2025 Timi Kays
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

/**
 * 图片存储管理器 - IndexedDB + LeanCloud 混合存储方案
 * 
 * 功能：
 * 1. IndexedDB 本地存储 - 快速访问，大容量
 * 2. LeanCloud 云端同步 - 跨设备访问，数据备份
 * 3. 自动迁移 - 从 localStorage 迁移到 IndexedDB
 * 4. 降级支持 - IndexedDB 不可用时回退到 localStorage
 */

class ImageStorageManager {
    constructor() {
        this.dbName = 'mindword_storage';
        this.dbVersion = 1;
        this.storeName = 'images';
        this.db = null;
        this.isIndexedDBSupported = this._checkIndexedDBSupport();
        this.initPromise = null;
    }

    /**
     * 检查 IndexedDB 支持
     */
    _checkIndexedDBSupport() {
        try {
            return 'indexedDB' in window && window.indexedDB !== null;
        } catch (e) {
            console.warn('[ImageStorage] IndexedDB not supported:', e);
            return false;
        }
    }

    /**
     * 初始化数据库
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        // 如果已经初始化过，返回缓存的 Promise
        if (this.initPromise) {
            return this.initPromise;
        }

        // 如果不支持 IndexedDB，使用降级方案
        if (!this.isIndexedDBSupported) {
            console.warn('[ImageStorage] IndexedDB not supported, using localStorage fallback');
            this.initPromise = Promise.resolve(null);
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('[ImageStorage] Database failed to open:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                // console.log('[ImageStorage] Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 创建 images 对象存储
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });

                    // 创建索引
                    objectStore.createIndex('documentId', 'documentId', { unique: false });
                    objectStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    objectStore.createIndex('createdAt', 'createdAt', { unique: false });

                    // console.log('[ImageStorage] Object store created with indexes');
                }
            };
        });

        return this.initPromise;
    }

    /**
     * 生成图片 ID
     * @returns {string}
     */
    generateImageId() {
        return 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 保存图片到 IndexedDB
     * @param {string} id - 图片ID
     * @param {Blob} blob - 图片二进制数据
     * @param {Object} metadata - 元数据 {documentId, name, type}，documentId 为必需参数
     * @returns {Promise<void>}
     * @throws {Error} 如果 metadata.documentId 为空
     */
    async saveImage(id, blob, metadata = {}) {
        await this.init();
        // console.log(`[ImageStorage] Saving image: id=${id}, blobSize=${blob?.size || 'unknown'}, blobType=${blob?.type || 'unknown'}, metadataType=${metadata?.type || 'unknown'}, metadata=`, metadata);

        // documentId 不能为空，必须提供有效的文档ID
        if (!metadata.documentId) {
            throw new Error(`[ImageStorage] documentId is required for saving image ${id}`);
        }

        // 验证blob类型，必须是图片
        if (!blob.type || !blob.type.startsWith('image/')) {
            throw new Error(`[ImageStorage] Invalid image type: ${blob.type}. Only image types are allowed.`);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);

            // 使用blob的图片类型
            let imageType = blob.type;


            const imageData = {
                id: id,
                documentId: metadata.documentId,
                blob: blob,
                name: metadata.name || '',
                type: imageType,  // 使用验证后的类型
                size: blob.size,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                cloudUrl: metadata.cloudUrl || null,
                syncStatus: metadata.syncStatus || 'pending'
            };

            const request = objectStore.put(imageData);

            request.onsuccess = () => {
                // console.log('[ImageStorage] Image saved:', id);
                resolve();
            };

            request.onerror = () => {
                console.error('[ImageStorage] Failed to save image:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 获取图片
     * @param {string} id - 图片ID
     * @returns {Promise<Object|null>} 图片数据对象
     */
    async getImage(id) {
        await this.init();

        // 降级到 localStorage
        if (!this.db) {
            return this._getFromLocalStorage(id);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                console.error('[ImageStorage] Failed to get image:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 获取文档的所有图片
     * @param {string} documentId - 文档ID
     * @returns {Promise<Array>} 图片数组
     */
    async getAllImages(documentId = null) {
        await this.init();

        // 降级到 localStorage
        if (!this.db) {
            return this._getAllFromLocalStorage(documentId);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);

            let request;
            if (documentId) {
                const index = objectStore.index('documentId');
                request = index.getAll(documentId);
            } else {
                request = objectStore.getAll();
            }

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                console.error('[ImageStorage] Failed to get all images:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 删除图片
     * @param {string} id - 图片ID
     * @returns {Promise<void>}
     */
    async deleteImage(id) {
        await this.init();

        // 降级到 localStorage
        if (!this.db) {
            return this._deleteFromLocalStorage(id);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.delete(id);

            request.onsuccess = () => {
                // console.log('[ImageStorage] Image deleted:', id);
                resolve();
            };

            request.onerror = () => {
                console.error('[ImageStorage] Failed to delete image:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 清理未使用的图片
     * @param {Set<string>} referencedIds - 被引用的图片ID集合
     * @param {string} documentId - 文档ID (可选)
     * @returns {Promise<number>} 删除的图片数量
     */
    async cleanupUnusedImages(referencedIds, documentId = null) {
        await this.init();

        // 降级到 localStorage
        if (!this.db) {
            return this._cleanupFromLocalStorage(referencedIds, documentId);
        }

        const allImages = await this.getAllImages(documentId);
        let deletedCount = 0;

        for (const image of allImages) {
            if (!referencedIds.has(image.id)) {
                await this.deleteImage(image.id);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            // console.log(`[ImageStorage] Cleaned up ${deletedCount} unused images`);
        }

        return deletedCount;
    }

    /**
     * 删除指定文档的所有图片
     * @param {string} documentId - 文档ID
     * @returns {Promise<number>} 删除的图片数量
     */
    async deleteImagesByDocumentId(documentId) {
        await this.init();

        if (!this.db) {
            console.warn('[ImageStorage] Cannot delete images: IndexedDB not available');
            return 0;
        }

        const images = await this.getAllImages(documentId);
        let deletedCount = 0;

        for (const image of images) {
            try {
                await this.deleteImage(image.id);
                deletedCount++;
            } catch (error) {
                console.error(`[ImageStorage] Failed to delete image ${image.id}:`, error);
            }
        }

        if (deletedCount > 0) {
            // console.log(`[ImageStorage] Deleted ${deletedCount} images for document ${documentId}`);
        }

        return deletedCount;
    }

    /**
     * 删除所有图片
     * @returns {Promise<void>}
     */
    async clearAllImages() {
        await this.init();

        // 降级到 localStorage
        if (!this.db) {
            console.warn('[ImageStorage] IndexedDB not available, using localStorage fallback');
            // 清空 localStorage 中的所有图片相关数据
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('mindword_image_')) {
                    localStorage.removeItem(key);
                    i--; // 因为删除后索引会变化
                }
            }
            // console.log('[ImageStorage] Cleared all images from localStorage');
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.clear();

            request.onsuccess = () => {
                // console.log('[ImageStorage] All images cleared from IndexedDB');
                resolve();
            };

            request.onerror = () => {
                console.error('[ImageStorage] Failed to clear all images:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Blob 转 DataURL
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    async blobToDataUrl(blob) {
        if (!blob) {
            throw new Error('blobToDataUrl: blob is null or undefined');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result && reader.result.startsWith('data:')) {
                    resolve(reader.result);
                } else {
                    reject(new Error('blobToDataUrl: FileReader returned invalid data URL'));
                }
            };
            reader.onerror = () => {
                reject(new Error(`blobToDataUrl: FileReader failed - ${reader.error?.message || 'unknown error'}`));
            };
            reader.readAsDataURL(blob);
        });
    }

    /**
     * 检测Blob的真实内容类型
     * @param {Blob} blob - 要检测的Blob对象
     * @returns {Promise<string|null>} 检测到的MIME类型，如果检测失败返回null
     */
    async _detectBlobType(blob) {
        try {
            // 读取blob的前几个字节来检测文件类型
            const buffer = await blob.slice(0, 32).arrayBuffer(); // 读取更多字节以提高检测准确性
            const bytes = new Uint8Array(buffer);
            const textContent = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

            // 首先检查是否为HTML内容
            // 更全面的HTML检测：检查各种可能的HTML起始标记
            const htmlPatterns = [
                '<!DOCTYPE', '<html', '<HTML', '<body', '<BODY',
                '<head', '<HEAD', '<title', '<TITLE', '<div', '<DIV'
            ];
            const isHtml = htmlPatterns.some(pattern =>
                textContent.includes(pattern) || textContent.toLowerCase().includes(pattern.toLowerCase())
            );

            if (isHtml) {
                return 'text/html';
            }

            // 检查是否为文本内容（包含大量可打印字符且无图片签名）
            const printableChars = Array.from(bytes).filter(b => b >= 32 && b <= 126).length;
            if (printableChars / bytes.length > 0.8) {
                // 检查是否有图片文件签名
                const hasImageSignature = [
                    // PNG: 89 50 4E 47
                    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47,
                    // JPEG: FF D8 FF
                    bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF,
                    // GIF: 47 49 46
                    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46,
                    // BMP: 42 4D
                    bytes[0] === 0x42 && bytes[1] === 0x4D,
                    // WebP: 00 00 00 18 57 45 42 50
                    bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x18 &&
                    bytes[4] === 0x57 && bytes[5] === 0x45 && bytes[6] === 0x42 && bytes[7] === 0x50
                ].some(Boolean);

                if (!hasImageSignature) {
                    return 'text/plain';
                }
            }

            // 检查常见的图片文件头
            if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
                return 'image/png';
            }
            if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
                return 'image/jpeg';
            }
            if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
                return 'image/gif';
            }
            if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
                return 'image/bmp';
            }
            if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x18 &&
                bytes[4] === 0x57 && bytes[5] === 0x45 && bytes[6] === 0x42 && bytes[7] === 0x50) {
                return 'image/webp';
            }

            return null;
        } catch (e) {
            console.warn('[ImageStorage] Failed to detect blob type:', e);
            return null;
        }
    }

    /**
     * DataURL 转 Blob
     * @param {string} dataUrl - 必须是有效的DataURL格式
     * @returns {Promise<Blob>}
     */
    async dataUrlToBlob(dataUrl) {
        try {
            // 严格验证 dataUrl 参数
            if (typeof dataUrl !== 'string') {
                throw new Error(`dataUrl must be a string, got ${typeof dataUrl}`);
            }

            // 验证 dataUrl 格式
            if (!dataUrl || !dataUrl.startsWith('data:')) {
                throw new Error(`Invalid dataUrl format: ${dataUrl ? dataUrl.substring(0, 50) + '...' : 'null/undefined'}`);
            }

            const response = await fetch(dataUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch dataUrl: ${response.status} ${response.statusText}`);
            }

            const blob = await response.blob();

            // 严格验证转换后的blob
            // console.log(`[ImageStorage] dataUrlToBlob converted: type=${blob.type}, size=${blob.size}`);

            if (!blob.type || !blob.type.startsWith('image/')) {
                console.warn(`[ImageStorage] dataUrlToBlob produced non-image blob: ${blob.type}`);

                // 尝试检测真实类型
                const detectedType = await this._detectBlobType(blob);
                if (detectedType && detectedType.startsWith('image/')) {
                    // console.log(`[ImageStorage] dataUrlToBlob detected real image type: ${detectedType}`);
                    return new Blob([blob], { type: detectedType });
                } else {
                    console.error(`[ImageStorage] dataUrlToBlob failed: content is ${detectedType || 'unknown'}, not an image`);
                    throw new Error(`dataUrlToBlob failed: data URL does not contain valid image data (detected: ${detectedType || 'unknown'})`);
                }
            }

            return blob;
        } catch (e) {
            console.error('[ImageStorage] Failed to convert dataUrl to blob:', e);
            throw e;
        }
    }

    /**
     * 获取图片的 ObjectURL (用于渲染)
     * @param {string} id - 图片ID
     * @returns {Promise<string|null>} ObjectURL
     */
    async getImageObjectUrl(id) {
        const imageData = await this.getImage(id);
        if (!imageData || !imageData.blob) {
            return null;
        }
        return URL.createObjectURL(imageData.blob);
    }

    // ==================== LeanCloud 云同步功能 ====================

    /**
     * 上传图片到云端（已废弃 - 使用文档同步代替）
     * @deprecated 请使用 leancloud-sync.js 中的同步机制
     * @param {string} imageId - 图片ID
     * @returns {Promise<string>} 云端 URL
     */
    async uploadToCloud(imageId) {
        console.warn('[ImageStorage] uploadToCloud is deprecated. Use document sync instead.');
        throw new Error('Direct cloud upload is deprecated. Use document sync mechanism.');
    }

    /**
     * 从云端下载图片（已废弃 - 使用文档同步代替）
     * @deprecated 请使用 leancloud-sync.js 中的同步机制
     * @param {string} imageId - 图片ID
     * @param {string} cloudUrl - 云端 URL
     * @param {Object} metadata - 元数据
     * @returns {Promise<void>}
     */
    async downloadFromCloud(imageId, cloudUrl, metadata = {}) {
        console.warn('[ImageStorage] downloadFromCloud is deprecated. Use document sync instead.');
        throw new Error('Direct cloud download is deprecated. Use document sync mechanism.');
    }

    /**
     * 同步文档的所有图片到云端（已废弃 - 使用文档同步代替）
     * @deprecated 请使用 leancloud-sync.js 中的同步机制
     * @param {string} documentId - 文档ID
     * @returns {Promise<Array>} 上传结果数组
     */
    async syncAllToCloud(documentId) {
        console.warn('[ImageStorage] syncAllToCloud is deprecated. Use document sync instead.');
        return [];
    }

    /**
     * 从云端同步图片到本地（已废弃 - 使用文档同步代替）
     * @deprecated 请使用 leancloud-sync.js 中的同步机制
     * @param {Array} cloudImages - 云端图片信息数组 [{id, cloudUrl, name, type, documentId}]
     * @returns {Promise<Array>} 下载结果数组
     */
    async syncFromCloud(cloudImages) {
        console.warn('[ImageStorage] syncFromCloud is deprecated. Use document sync instead.');
        return [];
    }

    // ==================== 数据迁移功能 ====================

    /**
     * 从 localStorage 迁移到 IndexedDB
     * @returns {Promise<Object>} 迁移结果 {success, migratedCount, errors}
     */
    async migrateFromLocalStorage() {
        // 检查是否已迁移
        if (localStorage.getItem('image_migration_done') === 'true') {
            // console.log('[ImageStorage] Migration already completed');
            return { success: true, migratedCount: 0, alreadyMigrated: true };
        }

        await this.init();

        if (!this.db) {
            console.warn('[ImageStorage] Cannot migrate: IndexedDB not available');
            return { success: false, error: 'IndexedDB not available' };
        }

        try {
            const oldImagesStr = localStorage.getItem('markdown-images');
            if (!oldImagesStr) {
                // console.log('[ImageStorage] No images to migrate');
                localStorage.setItem('image_migration_done', 'true');
                return { success: true, migratedCount: 0 };
            }

            const oldImages = JSON.parse(oldImagesStr);
            let migratedCount = 0;
            const errors = [];

            // 尝试从文档中获取图片ID与文档ID的映射关系
            const imageToDocMap = this._buildImageToDocMap();

            // 迁移每张图片
            for (const [id, imageData] of oldImages) {
                try {
                    // 验证图片数据
                    if (!imageData.data || typeof imageData.data !== 'string') {
                        console.error(`[ImageStorage] Invalid data in localStorage for image ${id}:`, imageData.data);
                        continue;
                    }

                    // 将 base64 转换为 Blob
                    const blob = await this.dataUrlToBlob(imageData.data);

                    // 尝试从文档中找到对应的文档ID
                    const documentId = imageToDocMap.get(id) || null;

                    // 保存图片，设置找到的文档ID
                    await this.saveImage(id, blob, {
                        name: imageData.name,
                        type: imageData.type,
                        documentId: documentId, // 尝试从文档中找到的文档ID
                        syncStatus: 'pending' // 迁移后的图片需要同步到云端
                    });

                    migratedCount++;
                    if (documentId) {
                        console.log(`[ImageStorage] Migrated image ${id} with documentId ${documentId}`);
                    } else {
                        console.log(`[ImageStorage] Migrated image ${id} without documentId (not found in any document)`);
                    }
                } catch (e) {
                    console.error(`[ImageStorage] Failed to migrate image ${id}:`, e);
                    errors.push({ id, error: e.message });
                }
            }

            // 迁移完成，删除旧数据
            if (errors.length === 0) {
                localStorage.removeItem('markdown-images');
                localStorage.setItem('image_migration_done', 'true');
                // console.log(`[ImageStorage] Migration completed: ${migratedCount} images migrated`);
            } else {
                console.warn(`[ImageStorage] Migration completed with errors: ${migratedCount} migrated, ${errors.length} failed`);
            }

            return { success: true, migratedCount, errors };
        } catch (e) {
            console.error('[ImageStorage] Migration failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * 构建图片ID到文档ID的映射关系
     * @returns {Map<string, string>} 图片ID到文档ID的映射
     */
    _buildImageToDocMap() {
        const imageToDocMap = new Map();

        try {
            // 获取所有文档
            const docs = JSON.parse(localStorage.getItem('mw_documents') || '[]');

            // 遍历每个文档
            for (const doc of docs) {
                if (!doc.md || doc.deletedAt) continue;

                // 从文档内容中提取图片引用
                const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
                let match;

                while ((match = imageRegex.exec(doc.md)) !== null) {
                    const imageId = match[1];
                    if (imageId && !imageId.match(/^(https?:\/\/|data:)/)) {
                        // 找到图片引用，记录图片ID与文档ID的映射
                        imageToDocMap.set(imageId, doc.id);
                    }
                }

                // 同时检查文档中存储的图片列表
                if (doc.images && Array.isArray(doc.images)) {
                    for (const img of doc.images) {
                        if (img.id) {
                            imageToDocMap.set(img.id, doc.id);
                        }
                    }
                }
            }

            console.log(`[ImageStorage] Built image-to-document map for ${imageToDocMap.size} images`);
        } catch (e) {
            console.error('[ImageStorage] Failed to build image-to-document map:', e);
        }

        return imageToDocMap;
    }

    // ==================== localStorage 降级方案 ====================

    /**
     * 保存到 localStorage (降级方案)
     */
    async _saveToLocalStorage(id, blob, metadata) {
        try {
            const dataUrl = await this.blobToDataUrl(blob);
            const images = this._getLocalStorageImages();

            images.set(id, {
                name: metadata.name || '',
                data: dataUrl,
                type: blob.type || metadata.type || 'image/png',
                documentId: metadata.documentId || null
            });

            localStorage.setItem('markdown-images', JSON.stringify(Array.from(images.entries())));
            // console.log('[ImageStorage] Image saved to localStorage (fallback):', id);
        } catch (e) {
            console.error('[ImageStorage] Failed to save to localStorage:', e);
            throw e;
        }
    }

    /**
     * 从 localStorage 获取 (降级方案)
     */
    async _getFromLocalStorage(id) {
        const images = this._getLocalStorageImages();
        const imageData = images.get(id);

        if (!imageData) return null;

        // 验证图片数据
        if (!imageData.data || typeof imageData.data !== 'string') {
            console.error(`[ImageStorage] Invalid data in localStorage for image ${id}:`, imageData.data);
            return null;
        }

        try {
            // 转换为统一格式
            const blob = await this.dataUrlToBlob(imageData.data);
            return {
                id,
                blob,
                name: imageData.name,
                type: imageData.type,
                documentId: imageData.documentId
            };
        } catch (e) {
            console.error(`[ImageStorage] Failed to process image ${id} from localStorage:`, e);
            return null;
        }
    }

    /**
     * 从 localStorage 获取所有图片 (降级方案)
     */
    async _getAllFromLocalStorage(documentId) {
        const images = this._getLocalStorageImages();
        const result = [];

        for (const [id, imageData] of images.entries()) {
            if (!documentId || imageData.documentId === documentId) {
                // 验证图片数据
                if (!imageData.data || typeof imageData.data !== 'string') {
                    console.error(`[ImageStorage] Invalid data in localStorage for image ${id}:`, imageData.data);
                    continue;
                }

                try {
                    const blob = await this.dataUrlToBlob(imageData.data);
                    result.push({
                        id,
                        blob,
                        name: imageData.name,
                        type: imageData.type,
                        documentId: imageData.documentId
                    });
                } catch (e) {
                    console.error(`[ImageStorage] Failed to process image ${id} from localStorage:`, e);
                    continue;
                }
            }
        }

        return result;
    }

    /**
     * 从 localStorage 删除 (降级方案)
     */
    async _deleteFromLocalStorage(id) {
        const images = this._getLocalStorageImages();
        images.delete(id);
        localStorage.setItem('markdown-images', JSON.stringify(Array.from(images.entries())));
        // console.log('[ImageStorage] Image deleted from localStorage (fallback):', id);
    }

    /**
     * 清理 localStorage 中未使用的图片 (降级方案)
     */
    async _cleanupFromLocalStorage(referencedIds, documentId) {
        const images = this._getLocalStorageImages();
        let deletedCount = 0;

        for (const [id, imageData] of images.entries()) {
            if ((!documentId || imageData.documentId === documentId) && !referencedIds.has(id)) {
                images.delete(id);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            localStorage.setItem('markdown-images', JSON.stringify(Array.from(images.entries())));
            // console.log(`[ImageStorage] Cleaned up ${deletedCount} unused images from localStorage`);
        }

        return deletedCount;
    }

    /**
     * 获取 localStorage 中的图片 Map
     */
    _getLocalStorageImages() {
        try {
            const imagesStr = localStorage.getItem('markdown-images');
            if (!imagesStr) return new Map();

            const imagesArray = JSON.parse(imagesStr);
            return new Map(imagesArray);
        } catch (e) {
            console.error('[ImageStorage] Failed to parse localStorage images:', e);
            return new Map();
        }
    }

    /**
     * 批量保存图片（用于替换现有的 localStorage 操作）
     * @param {Map} imagesMap - 图片Map，格式: Map(id => {name, data, type, documentId})，documentId 为必需参数
     * @returns {Promise<void>}
     * @throws {Error} 如果任何图片数据缺少 documentId
     */
    async saveImages(imagesMap) {
        // console.log(`[ImageStorage] Starting to save ${imagesMap.size} images`);
        let savedCount = 0;
        let skippedCount = 0;

        for (const [id, imageData] of imagesMap.entries()) {
            try {
                // 检查图片数据是否包含必需的 documentId
                if (!imageData.documentId) {
                    throw new Error(`[ImageStorage] Image ${id} is missing required documentId`);
                }

                // 检查图片是否已存在且数据完整
                const existingImage = await this.getImage(id);
                if (existingImage && existingImage.blob && existingImage.type && existingImage.type.startsWith('image/')) {
                    // console.log(`[ImageStorage] Image ${id} already exists with correct type ${existingImage.type}, skipping save`);
                    skippedCount++;
                    continue;
                }

                // console.log(`[ImageStorage] Processing image ${id}:`, {
                //     name: imageData.name,
                //         type: imageData.type,
                //             hasBlob: !!imageData.blob,
                //                 hasData: !!imageData.data,
                //                     dataLength: imageData.data ? imageData.data.length : 0
                // });

                // 如果有blob直接用blob，否则转换dataUrl
                let blob;
                if (imageData.blob) {
                    blob = imageData.blob;
                    // console.log(`[ImageStorage] Using existing blob for ${id}, type: ${blob.type}, size: ${blob.size}`);

                    // 严格验证blob：检查类型和内容
                    if (!blob.type || !blob.type.startsWith('image/')) {
                        console.warn(`[ImageStorage] Invalid blob type ${blob.type} for ${id}, attempting to detect real type`);

                        // 尝试检测真实的内容类型
                        const detectedType = await this._detectBlobType(blob);
                        if (detectedType && detectedType.startsWith('image/')) {
                            // console.log(`[ImageStorage] Detected real type ${detectedType} for ${id}`);
                            blob = new Blob([blob], { type: detectedType });
                        } else {
                            console.error(`[ImageStorage] Blob for ${id} is not an image (type: ${blob.type}, detected: ${detectedType}), rejecting`);
                            throw new Error(`Invalid image blob for ${id}: type is ${blob.type}, content appears to be ${detectedType || 'non-image'}`);
                        }
                    }
                } else if (imageData.data) {
                    // 严格验证data字段：必须是有效的dataUrl
                    if (!imageData.data || typeof imageData.data !== 'string' || !imageData.data.startsWith('data:')) {
                        console.error(`[ImageStorage] Invalid dataUrl for ${id}: ${imageData.data ? imageData.data.substring(0, 50) + '...' : 'null/undefined'}`);
                        throw new Error(`Invalid dataUrl for image ${id}: must be a valid data URL starting with 'data:'`);
                    }
                    // console.log(`[ImageStorage] Converting dataUrl to blob for ${id}, dataUrl length: ${imageData.data.length}`);
                    blob = await this.dataUrlToBlob(imageData.data);
                    // console.log(`[ImageStorage] Converted blob type: ${blob.type}, size: ${blob.size}`);
                } else {
                    throw new Error(`No blob or data provided for image ${id}`);
                }

                await this.saveImage(id, blob, {
                    name: imageData.name,
                    documentId: imageData.documentId
                });
                // console.log(`[ImageStorage] Called saveImage with blob type: ${blob.type || 'null'}`);

                savedCount++;
                // console.log(`[ImageStorage] Successfully saved image ${id}`);
            } catch (e) {
                console.error(`[ImageStorage] Failed to save image ${id}:`, e);
                throw e;
            }
        }

        // console.log(`[ImageStorage] Completed saving ${savedCount} images, skipped ${skippedCount} existing images`);
    }

    /**
     * 获取图片为 Map 格式（用于兼容现有代码）
     * @param {string|null} documentId - 文档ID，仅获取该文档的图片
     * @returns {Promise<Map>} 图片Map，格式: Map(id => {name, data, type, documentId})
     */
    async getImagesMap(documentId = null) {
        const images = await this.getAllImages(documentId);
        const map = new Map();

        // console.log(`[ImageStorage] Found ${images.length} images in IndexedDB for document ${documentId || 'all'}`);

        for (const image of images) {
            try {
                // console.log(`[ImageStorage] Processing image: id=${image.id}, name=${image.name}, type=${image.type}, blobSize=${image.blob?.size || 'unknown'}, documentId=${image.documentId}`);

                // 验证图片数据完整性
                if (!image.blob) {
                    console.warn(`[ImageStorage] Image ${image.id} has no blob data, skipping`);
                    continue;
                }

                if (!image.type || !image.type.startsWith('image/')) {
                    console.warn(`[ImageStorage] Image ${image.id} has invalid type: ${image.type}, skipping`);
                    continue;
                }

                const dataUrl = await this.blobToDataUrl(image.blob);
                map.set(image.id, {
                    name: image.name,
                    dataUrl: dataUrl,
                    type: image.type,
                    documentId: image.documentId
                });

                // console.log(`[ImageStorage] Successfully processed image ${image.id}`);
            } catch (e) {
                console.error(`[ImageStorage] Failed to convert image ${image.id} to dataUrl:`, e);
                // 继续处理其他图片，而不是抛出错误
                continue;
            }
        }

        // console.log(`[ImageStorage] Returning ${map.size} valid images`);
        return map;
    }
}

// 创建全局单例
window.ImageStorageManager = ImageStorageManager;
window.imageStorage = new ImageStorageManager();

// console.log('[ImageStorage] Module loaded');
