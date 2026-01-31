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
    // 获取元素的实际背景色，处理各种情况
    var get_background_color = function (element, cstyle) {
        var bg = css(cstyle, 'background-color');
        // 如果 background-color 有效且不是透明，直接返回
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgba(0,0,0,0)') {
            return bg;
        }
        // 尝试从元素的 style 属性获取
        if (element.style && element.style.backgroundColor) {
            return element.style.backgroundColor;
        }
        // 尝试从元素的 style 属性获取 background 简写
        if (element.style && element.style.background) {
            var bgShort = element.style.background;
            // 如果是颜色值（不是渐变或图片）
            if (!bgShort.includes('gradient') && !bgShort.includes('url')) {
                return bgShort;
            }
        }
        return bg;
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

    // 解析 CSS linear-gradient 字符串并创建 Canvas 渐变
    // 支持格式: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
    // 也支持: linear-gradient(135deg, rgb(102, 126, 234) 0%, rgb(118, 75, 162) 100%)
    jcanvas.parseLinearGradient = function (ctx, cssGradient, x, y, w, h) {
        if (!cssGradient || !cssGradient.includes('linear-gradient')) {
            return null;
        }
        
        try {
            // 去掉 linear-gradient( 和最后的 )
            var inner = cssGradient.replace(/^linear-gradient\(/, '').replace(/\)$/, '');
            
            // 找到第一个逗号的位置，分割角度和颜色停止点
            var firstComma = inner.indexOf(',');
            if (firstComma === -1) return null;
            
            var angleStr = inner.substring(0, firstComma).trim();
            var stopsStr = inner.substring(firstComma + 1).trim();
            
            // 解析角度
            var angle = 180; // 默认从上到下
            if (angleStr.includes('deg')) {
                angle = parseFloat(angleStr);
            } else if (angleStr === 'to right') {
                angle = 90;
            } else if (angleStr === 'to left') {
                angle = 270;
            } else if (angleStr === 'to top') {
                angle = 0;
            } else if (angleStr === 'to bottom') {
                angle = 180;
            }
            
            // 将 CSS 角度转换为 Canvas 角度
            var rad = (angle - 90) * Math.PI / 180;
            var cx = x + w / 2;
            var cy = y + h / 2;
            var diagonal = Math.sqrt(w * w + h * h) / 2;
            
            var x1 = cx - diagonal * Math.cos(rad);
            var y1 = cy - diagonal * Math.sin(rad);
            var x2 = cx + diagonal * Math.cos(rad);
            var y2 = cy + diagonal * Math.sin(rad);
            
            var gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            
            // 解析颜色停止点 - 处理 rgb(r,g,b) 中的逗号
            // 使用更智能的分割方法
            var stops = [];
            var depth = 0;
            var current = '';
            for (var i = 0; i < stopsStr.length; i++) {
                var c = stopsStr[i];
                if (c === '(') depth++;
                else if (c === ')') depth--;
                else if (c === ',' && depth === 0) {
                    stops.push(current.trim());
                    current = '';
                    continue;
                }
                current += c;
            }
            if (current.trim()) stops.push(current.trim());
            
            // 解析每个停止点
            for (var i = 0; i < stops.length; i++) {
                var stop = stops[i];
                // 匹配颜色值和百分比
                // 支持: #667eea 0%, rgb(102, 126, 234) 0%, rgba(102, 126, 234, 0.5) 0%
                var stopMatch = stop.match(/^(.+?)\s+(\d+(?:\.\d+)?%)$/);
                if (stopMatch) {
                    var color = stopMatch[1].trim();
                    var position = parseFloat(stopMatch[2]) / 100;
                    gradient.addColorStop(position, color);
                } else if (stop) {
                    // 如果没有百分比，尝试推断位置
                    var inferredPos = i / (stops.length - 1 || 1);
                    gradient.addColorStop(inferredPos, stop.trim());
                }
            }
            
            return gradient;
        } catch (e) {
            console.warn('Failed to parse gradient:', cssGradient, e);
            return null;
        }
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

    // 将字体字符串转换为加粗版本
    // 字体字符串格式: "font-style font-variant font-weight font-size/line-height font-family"
    // 例如: "normal normal 400 14px/20px Arial"
    // 直接替换 font-weight 部分（第三个词，在 font-size 之前）
    var makeBoldFont = function (fontStr) {
        if (!fontStr) return fontStr;

        // 按空格分割字体字符串
        var parts = fontStr.split(/\s+/);

        // 查找包含 "px" 的部分（font-size）
        var sizeIndex = -1;
        for (var i = 0; i < parts.length; i++) {
            if (/\d+px/i.test(parts[i])) {
                sizeIndex = i;
                break;
            }
        }

        // 如果找到 font-size，它前面的部分应该是 font-weight
        if (sizeIndex > 0) {
            var weightIndex = sizeIndex - 1;
            // 检查是否是 font-weight 值（normal 或数字）
            if (weightIndex >= 0 && /^(normal|400|300|200|100|500|600|700|800|900)$/i.test(parts[weightIndex])) {
                parts[weightIndex] = 'bold';
                return parts.join(' ');
            }
        }

        // 如果无法通过位置识别，使用正则替换
        // 匹配在 font-size（数字px）之前的 normal 或数字
        var result = fontStr.replace(/\s+(normal|400|300|200|100|500|600|700|800|900)\s+(?=\d+px)/i, ' bold ');
        if (result !== fontStr) {
            return result;
        }

        // 最后的回退：替换第一个匹配的 normal 或数字
        return fontStr.replace(/\b(normal|400|300|200|100|500|600|700|800|900)\b/i, 'bold');
    };

    // 解析 HTML 文本并分段绘制，支持 <strong> 标签的加粗效果
    jcanvas.text_html = function (ctx, htmlText, x, y, w, h, lineheight, baseFont, boldFont) {
        if (!htmlText) return;

        // 提取纯文本并记录样式信息
        var segments = [];
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlText;

        function extractSegments(node, isBold) {
            if (node.nodeType === 3) { // 文本节点
                var text = node.textContent;
                if (text && text.trim()) {
                    segments.push({ text: text, bold: isBold });
                }
            } else if (node.nodeType === 1) { // 元素节点
                var tagName = node.tagName.toLowerCase();
                var childIsBold = isBold || (tagName === 'strong' || tagName === 'b');

                for (var i = 0; i < node.childNodes.length; i++) {
                    extractSegments(node.childNodes[i], childIsBold);
                }
            }
        }

        extractSegments(tempDiv, false);

        if (segments.length === 0) return;

        // 分段绘制文本
        var currentX = x;
        var currentY = y;
        var currentLine = '';
        var currentLineBold = false;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var words = seg.text.split(/(\s+)/);

            for (var j = 0; j < words.length; j++) {
                var word = words[j];
                if (!word) continue;

                // 如果样式改变，先绘制当前行
                if (currentLine && currentLineBold !== seg.bold) {
                    ctx.font = currentLineBold ? (boldFont || makeBoldFont(baseFont)) : baseFont;
                    ctx.fillText(currentLine, currentX, currentY);
                    currentX += ctx.measureText(currentLine).width;
                    currentLine = '';
                }

                // 设置当前段的字体样式
                var segBold = seg.bold;
                var segFont = segBold ? (boldFont || makeBoldFont(baseFont)) : baseFont;
                ctx.font = segFont;

                // 测试是否超出宽度（使用当前段的字体测量）
                var testLine = currentLine + word;
                var testWidth = ctx.measureText(testLine).width;

                if (testWidth > w && currentLine) {
                    // 绘制当前行并换行（使用当前行的字体）
                    ctx.font = currentLineBold ? (boldFont || makeBoldFont(baseFont)) : baseFont;
                    ctx.fillText(currentLine, currentX, currentY);
                    currentY += lineheight;
                    currentX = x;
                    currentLine = word;
                    currentLineBold = segBold;
                    // 更新字体以匹配新行的样式
                    ctx.font = currentLineBold ? (boldFont || makeBoldFont(baseFont)) : baseFont;
                } else {
                    currentLine = testLine;
                    currentLineBold = segBold;
                }
            }
        }

        // 绘制最后一行
        if (currentLine) {
            ctx.font = currentLineBold ? (boldFont || makeBoldFont(baseFont)) : baseFont;
            ctx.fillText(currentLine, currentX, currentY);
        }
    };

    // 处理 HTML 文本的省略号版本
    jcanvas.text_html_ellipsis = function (ctx, htmlText, x, y, w, h, baseFont, boldFont) {
        if (!htmlText) return;

        // 提取纯文本（去掉 HTML 标签用于测量宽度）
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlText;
        var plainText = tempDiv.textContent || tempDiv.innerText || '';

        // 使用纯文本计算省略号（使用正常字体测量）
        ctx.font = baseFont;
        var fittedText = jcanvas.fittingString(ctx, plainText, w);

        // 如果文本被截断，需要重新构建 HTML 结构
        if (fittedText !== plainText) {
            // 简化处理：只显示纯文本（带省略号）
            var center_y = y + h / 2;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = baseFont;
            ctx.fillText(fittedText, x, center_y, w);
        } else {
            // 文本完整，可以分段绘制
            var lineheight = parseInt(baseFont.match(/\/(\d+)/)?.[1] || '16');
            jcanvas.text_html(ctx, htmlText, x, y, w, h, lineheight, baseFont, boldFont);
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
            var self = this;
            // 添加小延迟确保 DOM 完全更新
            setTimeout(function() {
                self._draw(function () {
                    !!callback && callback();
                    self.clean();
                });
            }, 50);
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

        shootAsDataURL: function (callback, mode) {
            var self = this;
            var downloadFn = function () {
                !!callback && callback(self._getCroppedDataURL());
            };

            if (mode === 'all') {
                this.shootWithMode('all', downloadFn);
            } else {
                this.shoot(downloadFn);
            }
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

            var bgcolor = get_background_color(node_element, ncs);
            var bgimage = css(ncs, 'background-image');
            var round_radius = parseInt(css(ncs, 'border-top-left-radius'));
            var color = css(ncs, 'color');
            var padding_left = parseInt(css(ncs, 'padding-left'));
            var padding_right = parseInt(css(ncs, 'padding-right'));
            var padding_top = parseInt(css(ncs, 'padding-top'));
            var padding_bottom = parseInt(css(ncs, 'padding-bottom'));
            var text_overflow = css(ncs, 'text-overflow');
            // 保存原始 font-weight，用于后续加粗处理
            var baseFontWeight = css(ncs, 'font-weight');
            // 获取 line-height，如果是 normal 则使用 font-size 的 1.2 倍作为默认值
            var lineHeightStr = css(ncs, 'line-height');
            var lineHeightValue;
            if (lineHeightStr === 'normal' || !lineHeightStr || lineHeightStr === 'auto') {
                var fontSize = parseInt(css(ncs, 'font-size')) || 14;
                lineHeightValue = Math.round(fontSize * 1.2) + 'px';
            } else {
                lineHeightValue = lineHeightStr;
            }
            var font = css(ncs, 'font-style') + ' ' +
                css(ncs, 'font-variant') + ' ' +
                baseFontWeight + ' ' +
                css(ncs, 'font-size') + '/' + lineHeightValue + ' ' +
                css(ncs, 'font-family');

            var rb = {
                x: view_data.abs_x,
                y: view_data.abs_y,
                w: view_data.width + 1,
                h: view_data.height + 1
            };
            // 文本区域增加 4px 的容错宽度，避免 Canvas 字体渲染差异导致换行
            var tb = {
                x: rb.x + padding_left,
                y: rb.y + padding_top,
                w: rb.w - padding_left - padding_right + 4,
                h: rb.h - padding_top - padding_bottom
            };

            ctx.font = font;
            
            // 处理背景：优先使用纯色背景，如果是渐变则创建渐变填充
            if (bgcolor && bgcolor !== 'rgba(0, 0, 0, 0)' && bgcolor !== 'transparent' && bgcolor !== 'rgba(0,0,0,0)') {
                // 使用纯色背景
                ctx.fillStyle = bgcolor;
                ctx.beginPath();
                jcanvas.rect(ctx, rb.x, rb.y, rb.w, rb.h, round_radius);
                ctx.closePath();
                ctx.fill();
            } else if (bgimage && bgimage !== 'none' && bgimage.includes('linear-gradient')) {
                // 解析并绘制线性渐变
                var gradient = jcanvas.parseLinearGradient(ctx, bgimage, rb.x, rb.y, rb.w, rb.h);
                if (gradient) {
                    ctx.fillStyle = gradient;
                } else {
                    // 解析失败时使用默认背景色
                    ctx.fillStyle = '#ffffff';
                }
                ctx.beginPath();
                jcanvas.rect(ctx, rb.x, rb.y, rb.w, rb.h, round_radius);
                ctx.closePath();
                ctx.fill();
            } else {
                // 默认白色背景
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                jcanvas.rect(ctx, rb.x, rb.y, rb.w, rb.h, round_radius);
                ctx.closePath();
                ctx.fill();
            }

            // 绘制节点边框
            var borderColor = css(ncs, 'border-color');
            var borderWidth = parseInt(css(ncs, 'border-width'));

            // 只在有有效边框颜色和宽度时才绘制边框
            if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent' &&
                borderWidth && borderWidth > 0) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = borderWidth;
                ctx.beginPath();
                jcanvas.rect(ctx, rb.x, rb.y, rb.w, rb.h, round_radius);
                ctx.closePath();
                ctx.stroke();
            }


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
                // 检查是否包含 HTML 标签（如 <strong>）
                var hasHtml = /<[^>]+>/.test(node.topic);

                if (hasHtml) {
                    // 包含 HTML 标签，使用 HTML 渲染函数
                    // 构建加粗字体字符串：直接使用 CSS 属性构建，确保 font-weight 为 bold
                    var boldFont = css(ncs, 'font-style') + ' ' +
                        css(ncs, 'font-variant') + ' ' +
                        'bold ' +
                        css(ncs, 'font-size') + '/' + lineHeightValue + ' ' +
                        css(ncs, 'font-family');

                    if (text_overflow === 'ellipsis') {
                        jcanvas.text_html_ellipsis(ctx, node.topic, tb.x, tb.y, tb.w, tb.h, font, boldFont);
                    } else {
                        var line_height = parseInt(lineHeightValue);
                        jcanvas.text_html(ctx, node.topic, tb.x, tb.y, tb.w, tb.h, line_height, font, boldFont);
                    }
                } else {
                    // 纯文本，使用原有函数
                    if (text_overflow === 'ellipsis') {
                        jcanvas.text_ellipsis(ctx, node.topic, tb.x, tb.y, tb.w, tb.h);
                    } else {
                        var line_height = parseInt(lineHeightValue);
                        jcanvas.text_multiline(ctx, node.topic, tb.x, tb.y, tb.w, tb.h, line_height);
                    }
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
            var style_width = css(ncs, 'width');
            var style_height = css(ncs, 'height');
            var left = parseInt(style_left);
            var top = parseInt(style_top);
            var width = parseInt(style_width) || 14;
            var height = parseInt(style_height) || 14;
            var is_plus = expander.innerHTML === '+';

            // 获取样式
            var bgColor = css(ncs, 'background-color');
            var borderColor = css(ncs, 'border-color');
            var borderWidth = parseInt(css(ncs, 'border-width')) || 1;
            var color = css(ncs, 'color');
            var borderRadius = css(ncs, 'border-radius');

            // 计算中心点和半径
            var centerX = left + width / 2;
            var centerY = top + height / 2;
            var radius = Math.min(width, height) / 2 - borderWidth;

            // 绘制背景
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                ctx.fillStyle = bgColor;
                ctx.beginPath();
                if (borderRadius === '50%' || parseInt(borderRadius) >= width / 2) {
                    // 圆形
                    ctx.arc(centerX, centerY, radius + borderWidth / 2, 0, Math.PI * 2, true);
                } else {
                    // 圆角矩形
                    var r = parseInt(borderRadius) || 0;
                    jcanvas.rect(ctx, left, top, width, height, r);
                }
                ctx.closePath();
                ctx.fill();
            }

            // 绘制边框
            if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent') {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = borderWidth;
                ctx.beginPath();
                if (borderRadius === '50%' || parseInt(borderRadius) >= width / 2) {
                    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
                } else {
                    var r = parseInt(borderRadius) || 0;
                    jcanvas.rect(ctx, left + borderWidth / 2, top + borderWidth / 2, width - borderWidth, height - borderWidth, r);
                }
                ctx.closePath();
                ctx.stroke();
            }

            // 绘制加减号
            ctx.strokeStyle = color || '#666';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';

            var lineLength = Math.min(width, height) * 0.4;
            var halfLine = lineLength / 2;

            ctx.beginPath();
            // 横线
            ctx.moveTo(centerX - halfLine, centerY);
            ctx.lineTo(centerX + halfLine, centerY);
            // 竖线（仅当为加号时）
            if (is_plus) {
                ctx.moveTo(centerX, centerY - halfLine);
                ctx.lineTo(centerX, centerY + halfLine);
            }
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

                var pad = typeof padding === 'number' ? Math.max(0, Math.floor(padding)) : 30;
                var sx = Math.max(0, minX - pad);
                var sy = Math.max(0, minY - pad);
                var sw = Math.min(w - sx, (maxX - minX + 1) + pad * 2);
                var sh = Math.min(h - sy, (maxY - minY + 1) + pad * 2);

                var nc = $c('canvas');
                nc.width = sw;
                nc.height = sh;
                var nctx = nc.getContext('2d');

                // 设置背景色
                if (this.backgroundColor) {
                    // 使用指定的背景色（包括白色或其他颜色）
                    nctx.fillStyle = this.backgroundColor === 'white' ? '#ffffff' : this.backgroundColor;
                    nctx.fillRect(0, 0, sw, sh);
                } else if (this.whiteBackground) {
                    // 兼容旧版本：如果设置了 whiteBackground，使用白色
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
        // 允许外部设置导出背景（默认透明）
        // backgroundColor 可以是：false(透明), 'white'(白色), 或具体的颜色值如 '#fafbfc'
        jss.backgroundColor = false;
        jss.setWhiteBackground = function (b) { this.whiteBackground = !!b; };
        // 新增：设置自定义背景色
        jss.setBackgroundColor = function (color) { this.backgroundColor = color; };
        jm.shoot = function () {
            jss.shoot();
        };
        jm.add_event_listener(function (type, data) {
            jss.jm_event_handle.call(jss, type, data);
        });
    });

    jsMind.register_plugin(screenshot_plugin);

})(window);
