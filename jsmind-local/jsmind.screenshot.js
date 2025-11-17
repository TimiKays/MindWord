/**
 * @license BSD
 * @copyright 2014-2025 hizzgdev@163.com
 * 
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 */

(function ($w) {
    'use strict';
    // console.warn("The version is outdated. see details: https://hizzgdev.github.io/jsmind/es6/")
    var __name__ = 'jsMind';
    var jsMind = $w[__name__];
    if (!jsMind) { return; }
    if (typeof jsMind.screenshot != 'undefined') { return; }

    var $d = $w.document;
    var $c = function (tag) { return $d.createElement(tag); };

    var css = function (cstyle, property_name) {
        return cstyle.getPropertyValue(property_name);
    };
    var is_visible = function (cstyle) {
        var visibility = css(cstyle, 'visibility');
        var display = css(cstyle, 'display');
        return (visibility !== 'hidden' && display !== 'none');
    };
    var jcanvas = {};
    jcanvas.rect = function (ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
    };

    jcanvas.text_multiline = function (ctx, text, x, y, w, h, lineheight) {
        var line = '';
        var text_len = text.length;
        var chars = text.split('');
        var test_line = null;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (var i = 0; i < text_len; i++) {
            test_line = line + chars[i];
            if (ctx.measureText(test_line).width > w && i > 0) {
                ctx.fillText(line, x, y);
                line = chars[i];
                y += lineheight;
            } else {
                line = test_line;
            }
        }
        ctx.fillText(line, x, y);
    };

    jcanvas.text_ellipsis = function (ctx, text, x, y, w, h) {
        var center_y = y + h / 2;
        var text = jcanvas.fittingString(ctx, text, w);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, center_y, w);
    };

    jcanvas.fittingString = function (ctx, text, max_width) {
        var width = ctx.measureText(text).width;
        var ellipsis = '…';
        var ellipsis_width = ctx.measureText(ellipsis).width;
        if (width <= max_width || width <= ellipsis_width) {
            return text;
        } else {
            var len = text.length;
            while (width >= max_width - ellipsis_width && len-- > 0) {
                text = text.substring(0, len);
                width = ctx.measureText(text).width;
            }
            return text + ellipsis;
        }
    };

    jcanvas.image = function (ctx, url, x, y, w, h, r, rotation, callback) {
        var img = new Image();
        img.onload = function () {
            ctx.save();
            ctx.translate(x, y);
            ctx.save();
            ctx.beginPath();
            jcanvas.rect(ctx, 0, 0, w, h, r);
            ctx.closePath();
            ctx.clip();
            ctx.translate(w / 2, h / 2);
            ctx.rotate(rotation * Math.PI / 180);
            ctx.drawImage(img, -w / 2, -h / 2);
            ctx.restore();
            ctx.restore();
            !!callback && callback();
        }
        img.src = url;
    };

    jsMind.screenshot = function (jm) {
        this.jm = jm;
        this.canvas_elem = null;
        this.canvas_ctx = null;
        this._inited = false;
    };

    jsMind.screenshot.prototype = {
        init: function () {
            if (this._inited) { return; }
            console.log('init');
            var c = $c('canvas');
            var ctx = c.getContext('2d');

            this.canvas_elem = c;
            this.canvas_ctx = ctx;
            // 隐藏截图画布，避免覆盖界面显示
            this.canvas_elem.style.display = 'none';
            this.canvas_elem.style.pointerEvents = 'none';
            this.jm.view.e_panel.appendChild(c);
            this._inited = true;
            this.resize();
        },

        // 保存所有节点的展开状态
        _saveExpandStates: function () {
            var states = {};
            var nodes = this.jm.mind.nodes;
            for (var nodeid in nodes) {
                states[nodeid] = nodes[nodeid].expanded;
            }
            return states;
        },

        // 恢复所有节点的展开状态
        _restoreExpandStates: function (states) {
            for (var nodeid in states) {
                var node = this.jm.mind.nodes[nodeid];
                if (node && node.expanded !== states[nodeid]) {
                    if (states[nodeid]) {
                        this.jm.expand_node(node);
                    } else {
                        this.jm.collapse_node(node);
                    }
                }
            }
        },

        shoot: function (callback) {
            this.init();
            this._draw(function () {
                !!callback && callback();
                this.clean();
            }.bind(this));
            // 禁用水印以避免影响自动裁剪范围
        },

        // 根据模式截图：'visible' 仅可见节点，'all' 包含全部节点
        shootWithMode: function (mode, callback) {
            var originalStates = null;
            var self = this;

            if (mode === 'all') {
                // 保存原始展开状态
                originalStates = this._saveExpandStates();
                // 展开所有节点
                this.jm.expand_all();

                // 等待DOM更新完成后再截图
                setTimeout(function () {
                    self.shoot(function () {
                        // 恢复原始状态
                        if (originalStates) {
                            self._restoreExpandStates(originalStates);
                        }
                        callback && callback();
                    });
                }, 100);
            } else {
                // 仅可见节点模式，直接截图
                this.shoot(callback);
            }
        },

        shootDownload: function (customName, mode) {
            var self = this;
            var downloadFn = function () {
                self._download(customName);
            };

            if (mode === 'all') {
                this.shootWithMode('all', downloadFn);
            } else {
                this.shoot(downloadFn);
            }
        },

        shootAsDataURL: function (callback) {
            this.shoot(function () {
                !!callback && callback(this._getCroppedDataURL());
            }.bind(this));
        },

        resize: function () {
            if (this._inited) {
                this.canvas_elem.width = this.jm.view.size.w;
                this.canvas_elem.height = this.jm.view.size.h;
            }
        },

        clean: function () {
            var c = this.canvas_elem;
            this.canvas_ctx.clearRect(0, 0, c.width, c.height);
        },

        _draw: function (callback) {
            var ctx = this.canvas_ctx;
            var c = this.canvas_elem;

            // 使用透明背景，清空画布
            ctx.clearRect(0, 0, c.width, c.height);

            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            this._draw_lines(function () {
                this._draw_nodes(callback);
            }.bind(this));
        },

        _watermark: function () {
            var c = this.canvas_elem;
            var ctx = this.canvas_ctx;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#000';
            ctx.font = '11px Verdana,Arial,Helvetica,sans-serif';
            ctx.fillText('github.com/hizzgdev/jsmind', c.width - 5.5, c.height - 2.5);
            ctx.textAlign = 'left';
            ctx.fillText($w.location, 5.5, c.height - 2.5);
        },

        _draw_lines: function (callback) {
            this.jm.view.graph.copy_to(this.canvas_ctx, callback);
        },

        _draw_nodes: function (callback) {
            var nodes = this.jm.mind.nodes;
            var node;
            for (var nodeid in nodes) {
                node = nodes[nodeid];
                this._draw_node(node);
            }

            function check_nodes_ready() {
                console.log('check_node_ready' + new Date());
                var allOk = true;
                for (var nodeid in nodes) {
                    node = nodes[nodeid];
                    allOk = allOk & node.ready;
                }

                if (!allOk) {
                    $w.setTimeout(check_nodes_ready, 200);
                } else {
                    $w.setTimeout(callback, 200);
                }
            }
            check_nodes_ready();
        },

        _draw_node: function (node) {
            var ctx = this.canvas_ctx;
            var view_data = node._data.view;
            var node_element = view_data.element;
            var ncs = getComputedStyle(node_element);
            if (!is_visible(ncs)) {
                node.ready = true;
                return;
            }

            var bgcolor = css(ncs, 'background-color');
            var round_radius = parseInt(css(ncs, 'border-top-left-radius'));
            var color = css(ncs, 'color');
            var padding_left = parseInt(css(ncs, 'padding-left'));
            var padding_right = parseInt(css(ncs, 'padding-right'));
            var padding_top = parseInt(css(ncs, 'padding-top'));
            var padding_bottom = parseInt(css(ncs, 'padding-bottom'));
            var text_overflow = css(ncs, 'text-overflow');
            var font = css(ncs, 'font-style') + ' ' +
                css(ncs, 'font-variant') + ' ' +
                css(ncs, 'font-weight') + ' ' +
                css(ncs, 'font-size') + '/' + css(ncs, 'line-height') + ' ' +
                css(ncs, 'font-family');

            var rb = {
                x: view_data.abs_x,
                y: view_data.abs_y,
                w: view_data.width + 1,
                h: view_data.height + 1
            };
            var tb = {
                x: rb.x + padding_left,
                y: rb.y + padding_top,
                w: rb.w - padding_left - padding_right,
                h: rb.h - padding_top - padding_bottom
            };

            ctx.font = font;
            ctx.fillStyle = bgcolor;
            ctx.beginPath();
            jcanvas.rect(ctx, rb.x, rb.y, rb.w, rb.h, round_radius);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = color;
            if ('background-image' in node.data) {
                var backgroundUrl = css(ncs, 'background-image').slice(5, -2);
                node.ready = false;
                var rotation = 0;
                if ('background-rotation' in node.data) {
                    rotation = node.data['background-rotation'];
                }
                jcanvas.image(ctx, backgroundUrl, rb.x, rb.y, rb.w, rb.h, round_radius, rotation,
                    function () {
                        node.ready = true;
                    });
            }
            if (!!node.topic) {
                if (text_overflow === 'ellipsis') {
                    jcanvas.text_ellipsis(ctx, node.topic, tb.x, tb.y, tb.w, tb.h);
                } else {
                    var line_height = parseInt(css(ncs, 'line-height'));
                    jcanvas.text_multiline(ctx, node.topic, tb.x, tb.y, tb.w, tb.h, line_height);
                }
            }
            if (!!view_data.expander) {
                this._draw_expander(view_data.expander);
            }
            if (!('background-image' in node.data)) {
                node.ready = true;
            }
        },

        _draw_expander: function (expander) {
            var ctx = this.canvas_ctx;
            var ncs = getComputedStyle(expander);
            if (!is_visible(ncs)) { return; }

            var style_left = css(ncs, 'left');
            var style_top = css(ncs, 'top');
            var font = css(ncs, 'font');
            var left = parseInt(style_left);
            var top = parseInt(style_top);
            var is_plus = expander.innerHTML === '+';

            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.arc(left + 7, top + 7, 5, 0, Math.PI * 2, true);
            ctx.moveTo(left + 10, top + 7);
            ctx.lineTo(left + 4, top + 7);
            if (is_plus) {
                ctx.moveTo(left + 7, top + 4);
                ctx.lineTo(left + 7, top + 10);
            }
            ctx.closePath();
            ctx.stroke();
        },

        // 计算非透明像素的最小外接矩形并返回裁剪后的 DataURL
        _getCroppedDataURL: function (padding, mime, quality) {
            try {
                var c = this.canvas_elem;
                var ctx = this.canvas_ctx;
                var w = c.width, h = c.height;
                if (!w || !h) return c.toDataURL(mime || 'image/png', quality);

                var img = ctx.getImageData(0, 0, w, h);
                var data = img.data;
                var minX = w, minY = h, maxX = -1, maxY = -1;

                for (var y = 0; y < h; y++) {
                    var rowStart = y * w * 4;
                    for (var x = 0; x < w; x++) {
                        var i = rowStart + x * 4;
                        var a = data[i + 3];
                        if (a !== 0) {
                            if (x < minX) minX = x;
                            if (y < minY) minY = y;
                            if (x > maxX) maxX = x;
                            if (y > maxY) maxY = y;
                        }
                    }
                }

                // 全透明或未找到内容，返回整张
                if (maxX < minX || maxY < minY) {
                    return c.toDataURL(mime || 'image/png', quality);
                }

                var pad = typeof padding === 'number' ? Math.max(0, Math.floor(padding)) : 2; // 默认留 2px 缓冲
                var sx = Math.max(0, minX - pad);
                var sy = Math.max(0, minY - pad);
                var sw = Math.min(w - sx, (maxX - minX + 1) + pad * 2);
                var sh = Math.min(h - sy, (maxY - minY + 1) + pad * 2);

                var nc = $c('canvas');
                nc.width = sw;
                nc.height = sh;
                var nctx = nc.getContext('2d');

                // 可选白底
                if (this.whiteBackground) {
                    nctx.fillStyle = '#ffffff';
                    nctx.fillRect(0, 0, sw, sh);
                }

                nctx.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);

                return nc.toDataURL(mime || 'image/png', quality);
            } catch (e) {
                // 失败则回退
                try { return this.canvas_elem.toDataURL(mime || 'image/png', quality); } catch (e2) { return ''; }
            }
        },

        _download: function (customName) {
            var c = this.canvas_elem;
            var name = customName || (this.jm.mind.name + '.png');

            if (navigator.msSaveBlob && (!!c.msToBlob)) {
                var dataurl = this._getCroppedDataURL();
                try {
                    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
                    while (n--) u8arr[n] = bstr.charCodeAt(n);
                    var blob = new Blob([u8arr], { type: mime });
                    navigator.msSaveBlob(blob, name);
                } catch (e) {
                    // 回退：如果转换失败，直接跳转 dataURL
                    location.href = dataurl;
                }
            } else {
                var bloburl = this._getCroppedDataURL();
                var anchor = $c('a');
                if ('download' in anchor) {
                    anchor.style.visibility = 'hidden';
                    anchor.href = bloburl;
                    anchor.download = name;
                    $d.body.appendChild(anchor);
                    var evt = $d.createEvent('MouseEvents');
                    evt.initEvent('click', true, true);
                    anchor.dispatchEvent(evt);
                    $d.body.removeChild(anchor);
                } else {
                    location.href = bloburl;
                }
            }
        },

        jm_event_handle: function (type, data) {
            if (type === jsMind.event_type.resize) {
                this.resize();
            }
        }
    };

    var screenshot_plugin = new jsMind.plugin('screenshot', function (jm) {
        var jss = new jsMind.screenshot(jm);
        jm.screenshot = jss;
        // 允许外部设置导出是否白底（默认透明）
        jss.whiteBackground = false;
        jss.setWhiteBackground = function (b) { this.whiteBackground = !!b; };
        jm.shoot = function () {
            jss.shoot();
        };
        jm.add_event_listener(function (type, data) {
            jss.jm_event_handle.call(jss, type, data);
        });
    });

    jsMind.register_plugin(screenshot_plugin);

})(window);
