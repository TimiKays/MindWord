/**
 * Protects a local-data reset from late iframe saves during page unload.
 */
(function initializeLocalDataReset() {
    'use strict';

    const RESET_KEY = 'mw_local_reset_pending';
    const RESET_TTL_MS = 10000;

    function readMarker() {
        try {
            const raw = localStorage.getItem(RESET_KEY);
            if (!raw) return null;
            const marker = JSON.parse(raw);
            if (!marker || Number(marker.expiresAt || 0) <= Date.now()) {
                localStorage.removeItem(RESET_KEY);
                return null;
            }
            return marker;
        } catch (_) {
            // A malformed marker is still safer than allowing an old iframe to save.
            return { malformed: true };
        }
    }

    function isPending() {
        return !!readMarker();
    }

    function clearPreservingMarker() {
        const marker = localStorage.getItem(RESET_KEY);
        const clearedCount = Math.max(0, localStorage.length - (marker ? 1 : 0));
        localStorage.clear();
        if (marker) localStorage.setItem(RESET_KEY, marker);
        return clearedCount;
    }

    function begin() {
        const marker = JSON.stringify({
            startedAt: Date.now(),
            expiresAt: Date.now() + RESET_TTL_MS
        });
        localStorage.setItem(RESET_KEY, marker);
        return clearPreservingMarker();
    }

    function finish() {
        try {
            localStorage.removeItem(RESET_KEY);
        } catch (_) { }
    }

    function finishAfterFreshLoad() {
        if (!isPending()) return;

        // Run once more in the fresh document in case an iframe was still unloading.
        clearPreservingMarker();

        const release = function () {
            window.setTimeout(finish, 500);
        };
        if (document.readyState === 'complete') {
            release();
        } else {
            window.addEventListener('load', release, { once: true });
        }
        window.setTimeout(finish, RESET_TTL_MS);
    }

    window.MW_LOCAL_DATA_RESET = Object.freeze({
        begin,
        finish,
        isPending,
        clearPreservingMarker
    });

    finishAfterFreshLoad();
})();
