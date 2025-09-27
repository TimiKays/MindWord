/**
 * @license BSD
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 * 
 * Modified version to fix HTTPS insecure connection warning
 * Uses Blob URLs instead of data URLs for better security
 * 
 * This is a standalone version that doesn't use ES6 imports
 */

(function () {
    'use strict';

    // Check dependencies
    if (typeof jsMind === 'undefined') {
        throw new Error('jsMind is not defined');
    }

    if (typeof domtoimage === 'undefined') {
        throw new Error('dom-to-image is required');
    }

    const $ = jsMind.$;

    /**
     * Default options for screenshot plugin.
     */
    const DEFAULT_OPTIONS = {
        filename: null,
        // watermark: {
        //     left: $.w.location,
        //     right: 'https://github.com/hizzgdev/jsmind',
        // },
        background: '#ffffff', // 将背景改为白色
    };

    /**
     * Screenshot plugin for jsMind - Fixed version for HTTPS
     */
    function JmScreenshot(jm, options) {
        var opts = {};
        jsMind.util.json.merge(opts, DEFAULT_OPTIONS);
        jsMind.util.json.merge(opts, options);

        this.version = '0.2.0';
        this.jm = jm;
        this.options = opts;
        this.dpr = jm.view.device_pixel_ratio;
    }

    /**
     * Take a screenshot of the mind map.
     */
    JmScreenshot.prototype.shoot = function () {
        var self = this;
        var c = self.create_canvas();
        var ctx = c.getContext('2d');
        ctx.scale(self.dpr, self.dpr);

        Promise.resolve(ctx)
            .then(function (ctx) { return self.draw_background(ctx); })
            .then(function (ctx) { return self.draw_lines(ctx); })
            .then(function (ctx) { return self.draw_nodes(ctx); })
            // .then(function (ctx) { return self.draw_watermark(c, ctx); })
            .then(function (ctx) { return self.download(c); })
            .then(function () { self.clear(c); })
            .catch(function (error) {
                console.error('Screenshot failed:', error);
                self.clear(c);
            });
    };

    /**
     * Create canvas for screenshot.
     */
    JmScreenshot.prototype.create_canvas = function () {
        var c = $.c('canvas');
        var w = this.jm.view.size.w;
        var h = this.jm.view.size.h;
        c.width = w * this.dpr;
        c.height = h * this.dpr;
        c.style.width = w + 'px';
        c.style.height = h + 'px';

        c.style.visibility = 'hidden';
        this.jm.view.e_panel.appendChild(c);
        return c;
    };

    /**
     * Clean up canvas element.
     */
    JmScreenshot.prototype.clear = function (c) {
        c.parentNode.removeChild(c);
    };

    /**
     * Draw background on canvas.
     */
    JmScreenshot.prototype.draw_background = function (ctx) {
        var self = this;
        return new Promise(function (resolve) {
            var bg = self.options.background;
            if (bg && bg !== 'transparent') {
                ctx.fillStyle = self.options.background;
                ctx.fillRect(0, 0, self.jm.view.size.w, self.jm.view.size.h);
            }
            resolve(ctx);
        });
    };

    /**
     * Draw connection lines on canvas by copying from view graph.
     */
    JmScreenshot.prototype.draw_lines = function (ctx) {
        var self = this;
        return new Promise(function (resolve) {
            self.jm.view.graph.copy_to(ctx, function () {
                resolve(ctx);
            });
        });
    };

    /**
     * Draw node DOM into canvas via SVG snapshot.
     */
    JmScreenshot.prototype.draw_nodes = function (ctx) {
        var self = this;
        return domtoimage
            .toSvg(self.jm.view.e_nodes, { style: { zoom: 1 } })
            .then(function (url) { return self.load_image(url); })
            .then(function (img) {
                ctx.drawImage(img, 0, 0);
                return ctx;
            });
    };

    // /**
    //  * Draw watermark text on canvas.
    //  */
    // JmScreenshot.prototype.draw_watermark = function (c, ctx) {
    //     ctx.textBaseline = 'bottom';
    //     ctx.fillStyle = '#000';
    //     ctx.font = '11px Verdana,Arial,Helvetica,sans-serif';
    //     if (this.options.watermark.left) {
    //         ctx.textAlign = 'left';
    //         ctx.fillText(this.options.watermark.left, 5.5, c.height - 2.5);
    //     }
    //     if (this.options.watermark.right) {
    //         ctx.textAlign = 'right';
    //         ctx.fillText(this.options.watermark.right, c.width - 5.5, c.height - 2.5);
    //     }
    //     return ctx;
    // };

    /**
     * Load image from URL and resolve img element.
     */
    JmScreenshot.prototype.load_image = function (url) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    };

    /**
     * Trigger download of canvas content as PNG - Fixed version for HTTPS
     */
    JmScreenshot.prototype.download = function (c) {
        var self = this;
        var name = (self.options.filename || self.jm.mind.name) + '.png';

        if (navigator.msSaveBlob && c.msToBlob) {
            // IE/Edge
            var blob = c.msToBlob();
            navigator.msSaveBlob(blob, name);
        } else {
            // Modern browsers - use Blob URL instead of data URL
            try {
                // Convert canvas to Blob
                c.toBlob(function (blob) {
                    if (blob) {
                        // Create a Blob URL (temporary, secure)
                        var blob_url = URL.createObjectURL(blob);

                        var anchor = $.c('a');
                        if ('download' in anchor) {
                            anchor.style.visibility = 'hidden';
                            anchor.href = blob_url;
                            anchor.download = name;
                            $.d.body.appendChild(anchor);
                            var evt = $.d.createEvent('MouseEvents');
                            evt.initEvent('click', true, true);
                            anchor.dispatchEvent(evt);
                            $.d.body.removeChild(anchor);

                            // Clean up the Blob URL after a short delay
                            setTimeout(function () {
                                URL.revokeObjectURL(blob_url);
                            }, 1000);
                        } else {
                            // Fallback for browsers without download attribute
                            location.href = blob_url;
                            setTimeout(function () {
                                URL.revokeObjectURL(blob_url);
                            }, 1000);
                        }
                    } else {
                        console.error('Failed to create blob from canvas');
                        // Fallback to original method
                        self.fallbackDownload(c, name);
                    }
                }, 'image/png');
            } catch (error) {
                console.error('toBlob failed:', error);
                // Fallback to original method
                self.fallbackDownload(c, name);
            }
        }
    };

    /**
     * Fallback download method using data URL (original implementation)
     */
    JmScreenshot.prototype.fallbackDownload = function (c, name) {
        var blob_url = c.toDataURL();
        var anchor = $.c('a');
        if ('download' in anchor) {
            anchor.style.visibility = 'hidden';
            anchor.href = blob_url;
            anchor.download = name;
            $.d.body.appendChild(anchor);
            var evt = $.d.createEvent('MouseEvents');
            evt.initEvent('click', true, true);
            anchor.dispatchEvent(evt);
            $.d.body.removeChild(anchor);
        } else {
            location.href = blob_url;
        }
    };

    /**
     * Register the screenshot plugin
     */
    function registerScreenshotPlugin() {
        var screenshot_plugin = new jsMind.plugin('screenshot', function (jm, options) {
            var jmss = new JmScreenshot(jm, options);
            jm.screenshot = jmss;
            jm.shoot = function () {
                jmss.shoot();
            };
        });

        jsMind.register_plugin(screenshot_plugin);
    }

    // Register the plugin when the script loads
    if (typeof jsMind !== 'undefined') {
        registerScreenshotPlugin();
    }

    // Make it available globally
    window.JmScreenshot = JmScreenshot;

})();