/**
 * MindWord 懒加载器
 * 实现智能资源懒加载，提升首屏加载速度
 */

class MindWordLazyLoader {
    constructor() {
        this.resources = new Map();
        this.observer = null;
        this.loadedResources = new Set();
        this.init();
    }

    init() {
        this.setupIntersectionObserver();
        this.setupResourceQueue();
        this.startLazyLoading();
    }

    /**
     * 设置Intersection Observer用于视口检测
     */
    setupIntersectionObserver() {
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadResource(entry.target);
                        this.observer.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '50px 0px',
                threshold: 0.1
            });
        }
    }

    /**
     * 设置资源队列
     */
    setupResourceQueue() {
        // 定义需要懒加载的资源
        this.resources.set('bootstrap', {
            type: 'script',
            url: '/local-deps/bootstrap.bundle.min.js',
            priority: 'low',
            condition: () => document.querySelector('[data-toggle="modal"]') !== null
        });

        this.resources.set('ai-modal', {
            type: 'script',
            url: 'ai-modal.js',
            priority: 'medium',
            condition: () => true // 总是需要
        });

        this.resources.set('leancloud-extra', {
            type: 'script',
            url: 'leancloud-extra.js',
            priority: 'low',
            condition: () => window.LeanCloud !== undefined
        });

        this.resources.set('editor-enhance', {
            type: 'script',
            url: 'editor-enhance.js',
            priority: 'medium',
            condition: () => document.querySelector('#editor-iframe') !== null
        });
    }

    /**
     * 开始懒加载
     */
    startLazyLoading() {
        // 延迟加载非关键资源
        setTimeout(() => {
            this.loadLowPriorityResources();
        }, 2000);

        // 监听用户交互，提前加载可能需要的资源
        this.setupUserInteractionListeners();

        // 监听iframe加载，按需加载相关资源
        this.setupIframeListeners();
    }

    /**
     * 加载资源
     */
    loadResource(element) {
        const resourceId = element?.dataset?.lazyLoad;
        if (resourceId && this.resources.has(resourceId)) {
            const resource = this.resources.get(resourceId);
            this.loadScript(resource.url, resourceId);
        }
    }

    /**
     * 加载脚本
     */
    loadScript(url, id) {
        if (this.loadedResources.has(id)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => {
                this.loadedResources.add(id);
                console.log(`MindWord: 资源 ${id} 加载完成`);
                resolve();
            };
            script.onerror = () => {
                console.error(`MindWord: 资源 ${id} 加载失败`);
                reject(new Error(`Failed to load script: ${url}`));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * 加载低优先级资源
     */
    loadLowPriorityResources() {
        this.resources.forEach((resource, id) => {
            if (resource.priority === 'low' && resource.condition() && !this.loadedResources.has(id)) {
                this.loadScript(resource.url, id);
            }
        });
    }

    /**
     * 设置用户交互监听器
     */
    setupUserInteractionListeners() {
        const interactions = ['click', 'touchstart', 'mouseover'];

        interactions.forEach(event => {
            document.addEventListener(event, () => {
                // 用户开始交互，加载中等优先级资源
                this.resources.forEach((resource, id) => {
                    if (resource.priority === 'medium' && resource.condition() && !this.loadedResources.has(id)) {
                        this.loadScript(resource.url, id);
                    }
                });
            }, { once: true });
        });
    }

    /**
     * 设置iframe监听器
     */
    setupIframeListeners() {
        // 监听editor iframe的加载
        const checkEditorIframe = () => {
            const editorIframe = document.querySelector('#editor-iframe');
            if (editorIframe && !this.loadedResources.has('editor-enhance')) {
                this.loadScript('editor-enhance.js', 'editor-enhance');
            }
        };

        // 定期检查
        setInterval(checkEditorIframe, 1000);

        // 使用MutationObserver监听DOM变化
        if ('MutationObserver' in window) {
            const observer = new MutationObserver(checkEditorIframe);
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    /**
     * 预加载关键资源
     */
    preloadCriticalResources() {
        const criticalResources = [
            'init.js',
            'three-iframes.js',
            'documents.js'
        ];

        criticalResources.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = url;
            link.as = 'script';
            document.head.appendChild(link);
        });
    }

    /**
     * 获取加载统计
     */
    getStats() {
        return {
            total: this.resources.size,
            loaded: this.loadedResources.size,
            pending: this.resources.size - this.loadedResources.size,
            loadedList: Array.from(this.loadedResources)
        };
    }
}

// 初始化懒加载器
window.mindWordLazyLoader = new MindWordLazyLoader();

// 导出API
window.MindWordLazyLoader = {
    loadScript: (url, id) => window.mindWordLazyLoader.loadScript(url, id),
    getStats: () => window.mindWordLazyLoader.getStats(),
    preloadCritical: () => window.mindWordLazyLoader.preloadCriticalResources()
};