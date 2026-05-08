/**
 * AI 五子棋 - 精致模式渲染器 v5 (全面优化版)
 * 
 * v5 优化内容：
 * - 增强棋盘纹理细节（多层木纹、真实质感）
 * - 优化棋子 3D 效果（更真实的光影、材质）
 * - 添加 Cyberpunk 风格支持
 * - 优化动画流畅度（GPU 加速、帧率控制）
 * - 增强微交互效果（悬停、点击反馈）
 * - 性能优化（缓存、批量绘制）
 * - 新增落子动画弹性效果
 * - 优化胜利线动画渐变
 */

const RefinedRenderer = (() => {
    let active = false;
    let boardCache = null;
    let cacheKey = '';
    let animationFrameId = null;
    let lastFrameTime = 0;
    const TARGET_FPS = 60;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    function isActive() { return active; }
    function activate() { 
        active = true; 
        boardCache = null; 
        cacheKey = ''; 
    }
    function deactivate() { 
        active = false; 
        boardCache = null; 
        cacheKey = '';
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function getCacheKey(size, boardSize, padding, cellSize) {
        const style = document.documentElement.getAttribute('data-style') || 'luxury';
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        return `${size}_${boardSize}_${padding}_${cellSize}_${style}_${theme}`;
    }

    // 四种风格的棋盘颜色配置
    const STYLE_COLORS = {
        luxury: {
            dark: {
                base: ['#e8c56a', '#dbb555', '#d4a843', '#c99a30'],
                warmGlow: ['rgba(255, 230, 160, 0.15)', 'rgba(255, 220, 130, 0.08)'],
                grain: '#7a5a10', grainDark: '#5a3a00',
                line: 'rgba(80, 50, 10, 0.5)', 
                star: 'rgba(60, 35, 5, 0.7)', 
                coord: 'rgba(80, 50, 10, 0.55)',
                highlight: 'rgba(255, 215, 100, 0.3)',
                shadow: 'rgba(0, 0, 0, 0.25)',
            },
            light: {
                base: ['#f0dca0', '#e8d48e', '#e0cc7c', '#d8c46a'],
                warmGlow: ['rgba(255, 240, 200, 0.18)', 'rgba(255, 230, 170, 0.1)'],
                grain: '#b89840', grainDark: '#a08030',
                line: 'rgba(100, 70, 20, 0.45)', 
                star: 'rgba(80, 50, 10, 0.6)', 
                coord: 'rgba(100, 70, 20, 0.5)',
                highlight: 'rgba(255, 220, 120, 0.25)',
                shadow: 'rgba(0, 0, 0, 0.15)',
            },
        },
        minimal: {
            dark: {
                base: ['#2a2a2a', '#252525', '#202020', '#1a1a1a'],
                warmGlow: ['rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.015)'],
                grain: '#333333', grainDark: '#222222',
                line: 'rgba(255, 255, 255, 0.18)', 
                star: 'rgba(255, 255, 255, 0.3)', 
                coord: 'rgba(255, 255, 255, 0.35)',
                highlight: 'rgba(255, 255, 255, 0.08)',
                shadow: 'rgba(0, 0, 0, 0.3)',
            },
            light: {
                base: ['#f0f0f0', '#e8e8e8', '#e0e0e0', '#d8d8d8'],
                warmGlow: ['rgba(0, 0, 0, 0.015)', 'rgba(0, 0, 0, 0.008)'],
                grain: '#cccccc', grainDark: '#bbbbbb',
                line: 'rgba(0, 0, 0, 0.15)', 
                star: 'rgba(0, 0, 0, 0.25)', 
                coord: 'rgba(0, 0, 0, 0.3)',
                highlight: 'rgba(0, 0, 0, 0.05)',
                shadow: 'rgba(0, 0, 0, 0.1)',
            },
        },
        glassmorphism: {
            dark: {
                base: ['rgba(99, 102, 241, 0.18)', 'rgba(139, 92, 246, 0.15)', 'rgba(168, 85, 247, 0.12)', 'rgba(236, 72, 153, 0.1)'],
                warmGlow: ['rgba(139, 92, 246, 0.12)', 'rgba(99, 102, 241, 0.06)'],
                grain: 'rgba(139, 92, 246, 0.1)', grainDark: 'rgba(99, 102, 241, 0.08)',
                line: 'rgba(139, 92, 246, 0.4)', 
                star: 'rgba(168, 85, 247, 0.55)', 
                coord: 'rgba(196, 181, 253, 0.55)',
                highlight: 'rgba(139, 92, 246, 0.2)',
                shadow: 'rgba(0, 0, 0, 0.2)',
            },
            light: {
                base: ['rgba(139, 92, 246, 0.1)', 'rgba(168, 85, 247, 0.08)', 'rgba(196, 181, 253, 0.06)', 'rgba(232, 121, 249, 0.05)'],
                warmGlow: ['rgba(139, 92, 246, 0.08)', 'rgba(99, 102, 241, 0.04)'],
                grain: 'rgba(139, 92, 246, 0.06)', grainDark: 'rgba(99, 102, 241, 0.05)',
                line: 'rgba(99, 102, 241, 0.35)', 
                star: 'rgba(124, 58, 237, 0.45)', 
                coord: 'rgba(109, 90, 205, 0.5)',
                highlight: 'rgba(139, 92, 246, 0.15)',
                shadow: 'rgba(0, 0, 0, 0.12)',
            },
        },
        cyberpunk: {
            dark: {
                base: ['rgba(10, 10, 20, 0.95)', 'rgba(15, 15, 30, 0.92)', 'rgba(20, 20, 40, 0.9)', 'rgba(25, 25, 50, 0.88)'],
                warmGlow: ['rgba(0, 240, 255, 0.08)', 'rgba(255, 0, 128, 0.05)'],
                grain: 'rgba(0, 240, 255, 0.06)', grainDark: 'rgba(255, 0, 128, 0.04)',
                line: 'rgba(0, 240, 255, 0.35)', 
                star: 'rgba(255, 0, 128, 0.5)', 
                coord: 'rgba(0, 240, 255, 0.45)',
                highlight: 'rgba(0, 240, 255, 0.15)',
                shadow: 'rgba(0, 0, 0, 0.4)',
                neonCyan: '#00f0ff',
                neonPink: '#ff0080',
                neonPurple: '#bf00ff',
            },
            light: {
                base: ['rgba(20, 20, 40, 0.9)', 'rgba(25, 25, 50, 0.88)', 'rgba(30, 30, 60, 0.85)', 'rgba(35, 35, 70, 0.82)'],
                warmGlow: ['rgba(0, 240, 255, 0.1)', 'rgba(255, 0, 128, 0.06)'],
                grain: 'rgba(0, 240, 255, 0.08)', grainDark: 'rgba(255, 0, 128, 0.05)',
                line: 'rgba(0, 240, 255, 0.4)', 
                star: 'rgba(255, 0, 128, 0.55)', 
                coord: 'rgba(0, 240, 255, 0.5)',
                highlight: 'rgba(0, 240, 255, 0.18)',
                shadow: 'rgba(0, 0, 0, 0.25)',
                neonCyan: '#00f0ff',
                neonPink: '#ff0080',
                neonPurple: '#bf00ff',
            },
        },
    };

    function getStyleColors() {
        const style = document.documentElement.getAttribute('data-style') || 'luxury';
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        const styleConfig = STYLE_COLORS[style] || STYLE_COLORS.luxury;
        return styleConfig[theme] || styleConfig.dark;
    }

    /**
     * 绘制精致棋盘背景（全面优化版）
     */
    function drawBoardBackground(ctx, size, boardSize, padding, cellSize) {
        const key = getCacheKey(size, boardSize, padding, cellSize);
        if (boardCache && cacheKey === key) {
            ctx.drawImage(boardCache, 0, 0);
            return;
        }

        const colors = getStyleColors();
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isMinimal = styleName === 'minimal';
        const isGlass = styleName === 'glassmorphism';
        const isCyber = styleName === 'cyberpunk';

        const offscreen = document.createElement('canvas');
        offscreen.width = size;
        offscreen.height = size;
        const oc = offscreen.getContext('2d');

        const br = 14;
        oc.save();

        function roundRect(c) {
            c.beginPath();
            c.moveTo(br, 0); c.lineTo(size - br, 0);
            c.quadraticCurveTo(size, 0, size, br); c.lineTo(size, size - br);
            c.quadraticCurveTo(size, size, size - br, size); c.lineTo(br, size);
            c.quadraticCurveTo(0, size, 0, size - br); c.lineTo(0, br);
            c.quadraticCurveTo(0, 0, br, 0); c.closePath();
        }

        // === 第1层：基底渐变 ===
        roundRect(oc);
        const baseGrad = oc.createLinearGradient(0, 0, size * 0.35, size);
        baseGrad.addColorStop(0, colors.base[0]);
        baseGrad.addColorStop(0.3, colors.base[1]);
        baseGrad.addColorStop(0.65, colors.base[2]);
        baseGrad.addColorStop(1, colors.base[3]);
        oc.fillStyle = baseGrad;
        oc.fill();

        // === 第2层：径向光晕 ===
        roundRect(oc);
        const warmGlow = oc.createRadialGradient(size * 0.45, size * 0.4, 0, size * 0.5, size * 0.5, size * 0.75);
        warmGlow.addColorStop(0, colors.warmGlow[0]);
        warmGlow.addColorStop(0.5, colors.warmGlow[1]);
        warmGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        oc.fillStyle = warmGlow;
        oc.fill();

        // === 第3层：纹理 ===
        oc.save();
        roundRect(oc);
        oc.clip();

        if (isCyber) {
            // Cyberpunk: 网格线 + 霓虹边缘
            drawCyberGrid(oc, size, colors);
        } else if (isGlass) {
            // Glassmorphism: 渐变叠加
            const glassGrad = oc.createLinearGradient(0, 0, size, size);
            glassGrad.addColorStop(0, 'rgba(99, 102, 241, 0.06)');
            glassGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.04)');
            glassGrad.addColorStop(1, 'rgba(236, 72, 153, 0.05)');
            oc.fillStyle = glassGrad;
            oc.fill();
        } else if (!isMinimal) {
            // Luxury: 精细木纹
            drawWoodGrain(oc, size, colors);
        }

        // 细微噪点纹理
        if (!isMinimal && !isCyber) {
            drawNoiseTexture(oc, size);
        }

        oc.globalAlpha = 1;
        oc.restore();

        // === 第4层：精致边框 ===
        drawBorder(oc, size, br, colors, isCyber);

        // === 第5层：四边内阴影 ===
        drawEdgeShadows(oc, size, colors);

        // === 第6层：顶部高光 ===
        drawTopHighlight(oc, size, br, colors);

        // === 第7层：Cyberpunk 霓虹边缘发光 ===
        if (isCyber) {
            drawNeonEdgeGlow(oc, size, br, colors);
        }

        oc.restore();

        boardCache = offscreen;
        cacheKey = key;
        ctx.drawImage(offscreen, 0, 0);
    }

    // Cyberpunk 网格
    function drawCyberGrid(oc, size, colors) {
        oc.globalAlpha = 0.15;
        oc.strokeStyle = colors.neonCyan;
        oc.lineWidth = 0.5;

        const gridSize = 20;
        for (let i = 0; i < size; i += gridSize) {
            oc.beginPath();
            oc.moveTo(i, 0);
            oc.lineTo(i, size);
            oc.stroke();

            oc.beginPath();
            oc.moveTo(0, i);
            oc.lineTo(size, i);
            oc.stroke();
        }

        // 随机发光点
        oc.globalAlpha = 0.3;
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const glow = oc.createRadialGradient(x, y, 0, x, y, 15);
            glow.addColorStop(0, colors.neonCyan);
            glow.addColorStop(0.5, 'rgba(0, 240, 255, 0.3)');
            glow.addColorStop(1, 'rgba(0, 240, 255, 0)');
            oc.fillStyle = glow;
            oc.fillRect(x - 15, y - 15, 30, 30);
        }
    }

    // 木纹纹理
    function drawWoodGrain(oc, size, colors) {
        // 主木纹 - 细密横线
        oc.globalAlpha = 0.05;
        oc.strokeStyle = colors.grain;
        oc.lineWidth = 0.5;
        oc.beginPath();
        for (let i = 0; i < size; i += 2.5) {
            const wave = Math.sin(i * 0.08) * 1.8;
            oc.moveTo(0, i + wave);
            oc.bezierCurveTo(
                size * 0.3, i + wave + Math.sin(i * 0.05) * 2.5,
                size * 0.7, i + wave - Math.sin(i * 0.06) * 2,
                size, i + wave + Math.sin(i * 0.04) * 1.5
            );
        }
        oc.stroke();

        // 粗木纹
        oc.globalAlpha = 0.03;
        oc.strokeStyle = colors.grainDark;
        oc.lineWidth = 1.2;
        oc.beginPath();
        for (let i = 0; i < size; i += 15 + Math.sin(i * 0.3) * 5) {
            const wave = Math.sin(i * 0.06) * 4;
            oc.moveTo(0, i + wave);
            oc.bezierCurveTo(size * 0.25, i + wave + 5, size * 0.5, i + wave - 4, size, i + wave + 3);
        }
        oc.stroke();

        // 木节
        oc.globalAlpha = 0.04;
        oc.fillStyle = colors.grainDark;
        const seed = [0.12, 0.68, 0.35, 0.82, 0.52, 0.25];
        for (let i = 0; i < seed.length; i++) {
            const kx = size * seed[i], ky = size * seed[(i + 2) % seed.length];
            const kr = 8 + (i % 3) * 5;
            oc.beginPath();
            oc.ellipse(kx, ky, kr, kr * 0.55, i * 0.6, 0, Math.PI * 2);
            oc.fill();
        }
    }

    // 噪点纹理
    function drawNoiseTexture(oc, size) {
        oc.globalAlpha = 0.02;
        let noiseSeed = 12345;
        function seededRandom() { 
            noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7FFFFFFF; 
            return noiseSeed / 0x7FFFFFFF; 
        }
        for (let i = 0; i < 1000; i++) {
            const nx = seededRandom() * size, ny = seededRandom() * size;
            const ns = seededRandom() * 1.8 + 0.5;
            oc.fillStyle = seededRandom() > 0.5 ? '#000' : '#fff';
            oc.fillRect(nx, ny, ns, ns);
        }
    }

    // 边框
    function drawBorder(oc, size, br, colors, isCyber) {
        roundRect(oc);
        oc.strokeStyle = isCyber ? 'rgba(0, 240, 255, 0.4)' : 'rgba(120, 80, 20, 0.35)';
        oc.lineWidth = 2.5;
        oc.stroke();

        // 内边框
        oc.strokeStyle = isCyber ? 'rgba(255, 0, 128, 0.2)' : 'rgba(180, 140, 60, 0.25)';
        oc.lineWidth = 0.8;
        oc.stroke();
    }

    // 边缘阴影
    function drawEdgeShadows(oc, size, colors) {
        const edgeW = Math.max(16, size * 0.08);
        const sideW = Math.max(12, size * 0.06);

        // 上边
        let g = oc.createLinearGradient(0, 0, 0, edgeW);
        g.addColorStop(0, colors.shadow);
        g.addColorStop(0.4, 'rgba(0, 0, 0, 0.05)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        oc.fillStyle = g;
        oc.fillRect(0, 0, size, edgeW);

        // 下边
        g = oc.createLinearGradient(0, size - edgeW, 0, size);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(0.6, 'rgba(0, 0, 0, 0.05)');
        g.addColorStop(1, colors.shadow);
        oc.fillStyle = g;
        oc.fillRect(0, size - edgeW, size, edgeW);

        // 左边
        g = oc.createLinearGradient(0, 0, sideW, 0);
        g.addColorStop(0, colors.shadow);
        g.addColorStop(0.5, 'rgba(0, 0, 0, 0.03)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        oc.fillStyle = g;
        oc.fillRect(0, 0, sideW, size);

        // 右边
        g = oc.createLinearGradient(size - sideW, 0, size, 0);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(0.5, 'rgba(0, 0, 0, 0.03)');
        g.addColorStop(1, colors.shadow);
        oc.fillStyle = g;
        oc.fillRect(size - sideW, 0, sideW, size);
    }

    // 顶部高光
    function drawTopHighlight(oc, size, br, colors) {
        const g = oc.createLinearGradient(0, 0, 0, 5);
        g.addColorStop(0, colors.highlight);
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        oc.fillStyle = g;
        oc.fillRect(br, 0, size - br * 2, 5);
    }

    // Cyberpunk 霓虹边缘发光
    function drawNeonEdgeGlow(oc, size, br, colors) {
        oc.save();
        oc.globalAlpha = 0.6;
        
        // 外发光
        oc.shadowColor = colors.neonCyan;
        oc.shadowBlur = 20;
        oc.strokeStyle = colors.neonCyan;
        oc.lineWidth = 1;
        roundRect(oc);
        oc.stroke();

        // 第二层发光
        oc.shadowColor = colors.neonPink;
        oc.shadowBlur = 15;
        oc.strokeStyle = colors.neonPink;
        oc.lineWidth = 0.5;
        oc.stroke();

        oc.restore();
    }

    /**
     * 绘制精致网格线
     */
    function drawGrid(ctx, boardSize, padding, cellSize) {
        const colors = getStyleColors();
        const endPos = padding + (boardSize - 1) * cellSize;
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';

        // 网格线阴影层
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < boardSize; i++) {
            const pos = padding + i * cellSize + 0.5;
            ctx.moveTo(padding + 0.5, pos); ctx.lineTo(endPos + 0.5, pos);
            ctx.moveTo(pos, padding + 0.5); ctx.lineTo(pos, endPos + 0.5);
        }
        ctx.stroke();

        // 网格线主体
        if (isCyber) {
            ctx.shadowColor = colors.neonCyan;
            ctx.shadowBlur = 3;
        }
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = 0; i < boardSize; i++) {
            const pos = padding + i * cellSize;
            ctx.moveTo(padding, pos); ctx.lineTo(endPos, pos);
            ctx.moveTo(pos, padding); ctx.lineTo(pos, endPos);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    /**
     * 绘制精致坐标标注
     */
    function drawCoordinates(ctx, boardSize, padding, cellSize) {
        if (boardSize > 15) return;
        const colors = getStyleColors();
        const fontSize = Math.max(9, cellSize * 0.28);
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';

        ctx.fillStyle = colors.coord;
        ctx.font = `600 ${fontSize}px -apple-system, "PingFang SC", "SF Pro", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (isCyber) {
            ctx.shadowColor = colors.neonCyan;
            ctx.shadowBlur = 4;
        }

        for (let i = 0; i < boardSize; i++) {
            ctx.fillText(String.fromCharCode(65 + i), padding + i * cellSize, padding * 0.38);
            ctx.fillText(String(i + 1), padding * 0.32, padding + i * cellSize);
        }
        ctx.shadowBlur = 0;
    }

    /**
     * 绘制精致星位
     */
    function drawStarPoints(ctx, stars, padding, cellSize) {
        const colors = getStyleColors();
        const outerR = Math.max(4, cellSize * 0.16);
        const midR = Math.max(2.8, cellSize * 0.11);
        const innerR = Math.max(1.5, cellSize * 0.06);
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';

        for (const { row, col } of stars) {
            const sx = padding + col * cellSize, sy = padding + row * cellSize;

            // 外层阴影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.beginPath(); ctx.arc(sx + 0.6, sy + 0.6, outerR + 0.6, 0, Math.PI * 2); ctx.fill();

            // 外层实心
            if (isCyber) {
                ctx.shadowColor = colors.neonPink;
                ctx.shadowBlur = 6;
            }
            ctx.fillStyle = colors.star;
            ctx.beginPath(); ctx.arc(sx, sy, outerR, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            // 中层
            ctx.fillStyle = colors.star;
            ctx.globalAlpha = 0.65;
            ctx.beginPath(); ctx.arc(sx, sy, midR, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;

            // 内层高光
            ctx.fillStyle = colors.star;
            ctx.globalAlpha = 0.45;
            ctx.beginPath(); ctx.arc(sx - 0.6, sy - 0.6, innerR, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    /**
     * 绘制极致精致 3D 棋子（全面优化版）
     */
    function drawPiece(ctx, row, col, piece, scale, padding, cellSize) {
        const x = padding + col * cellSize;
        const y = padding + row * cellSize;
        const radius = Math.max(1, cellSize * 0.44 * scale);
        const isBlack = piece === 1;
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';

        ctx.save();

        // === 第1层：投射阴影 ===
        ctx.shadowColor = isBlack ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 4;

        // === 第2层：主体球形渐变 ===
        const lightX = x - radius * 0.32;
        const lightY = y - radius * 0.38;
        const mg = ctx.createRadialGradient(lightX, lightY, radius * 0.02, x + radius * 0.1, y + radius * 0.1, radius);

        if (isCyber) {
            // Cyberpunk 风格棋子
            if (isBlack) {
                mg.addColorStop(0, '#1a1a2e');
                mg.addColorStop(0.3, '#0f0f1a');
                mg.addColorStop(0.6, '#0a0a12');
                mg.addColorStop(1, '#050508');
            } else {
                mg.addColorStop(0, '#ffffff');
                mg.addColorStop(0.2, '#f0f0ff');
                mg.addColorStop(0.5, '#e0e0f0');
                mg.addColorStop(1, '#c0c0d0');
            }
        } else {
            // 标准风格棋子
            if (isBlack) {
                mg.addColorStop(0, '#909090');
                mg.addColorStop(0.12, '#6a6a6a');
                mg.addColorStop(0.3, '#404040');
                mg.addColorStop(0.55, '#222222');
                mg.addColorStop(0.8, '#101010');
                mg.addColorStop(1, '#080808');
            } else {
                mg.addColorStop(0, '#ffffff');
                mg.addColorStop(0.12, '#fcfcfc');
                mg.addColorStop(0.3, '#f2f2f2');
                mg.addColorStop(0.55, '#e0e0e0');
                mg.addColorStop(0.8, '#c8c8c8');
                mg.addColorStop(1, '#a0a0a0');
            }
        }

        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 清除阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // === 第3层：柔和大高光 ===
        const hl1 = ctx.createRadialGradient(
            x - radius * 0.3, y - radius * 0.35, 0,
            x - radius * 0.05, y - radius * 0.05, radius * 0.78
        );
        if (isBlack) {
            hl1.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
            hl1.addColorStop(0.25, 'rgba(255, 255, 255, 0.12)');
            hl1.addColorStop(0.6, 'rgba(255, 255, 255, 0.03)');
            hl1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
            hl1.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            hl1.addColorStop(0.25, 'rgba(255, 255, 255, 0.45)');
            hl1.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)');
            hl1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = hl1;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // === 第4层：锐利高光点 ===
        const hl2 = ctx.createRadialGradient(
            x - radius * 0.38, y - radius * 0.38, 0,
            x - radius * 0.38, y - radius * 0.38, radius * 0.25
        );
        if (isBlack) {
            hl2.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
            hl2.addColorStop(0.35, 'rgba(255, 255, 255, 0.18)');
            hl2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
            hl2.addColorStop(0, 'rgba(255, 255, 255, 1)');
            hl2.addColorStop(0.25, 'rgba(255, 255, 255, 0.65)');
            hl2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = hl2;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // === 第5层：底部环境反射 ===
        const ref = ctx.createRadialGradient(
            x + radius * 0.28, y + radius * 0.32, 0,
            x + radius * 0.22, y + radius * 0.28, radius * 0.58
        );
        if (isBlack) {
            ref.addColorStop(0, 'rgba(100, 150, 220, 0.12)');
            ref.addColorStop(0.5, 'rgba(80, 130, 200, 0.05)');
            ref.addColorStop(1, 'rgba(80, 130, 200, 0)');
        } else {
            ref.addColorStop(0, 'rgba(80, 130, 200, 0.18)');
            ref.addColorStop(0.5, 'rgba(80, 130, 200, 0.08)');
            ref.addColorStop(1, 'rgba(80, 130, 200, 0)');
        }
        ctx.fillStyle = ref;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // === 第6层：精致边缘 ===
        // 主边缘
        ctx.strokeStyle = isBlack ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(x, y, radius - 0.35, 0, Math.PI * 2); ctx.stroke();

        // 顶部亮边
        ctx.strokeStyle = isBlack ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, radius - 0.35, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.stroke();

        // 底部暗边
        ctx.strokeStyle = isBlack ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(x, y, radius - 0.35, Math.PI * 0.25, Math.PI * 0.75);
        ctx.stroke();

        // === 第7层：Cyberpunk 霓虹边缘 ===
        if (isCyber) {
            const colors = getStyleColors();
            ctx.strokeStyle = isBlack ? colors.neonCyan : colors.neonPink;
            ctx.lineWidth = 1.5;
            ctx.shadowColor = isBlack ? colors.neonCyan : colors.neonPink;
            ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(x, y, radius + 1, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    /**
     * 绘制带缩放动画的精致棋子
     */
    function drawPieceAnimated(ctx, row, col, piece, scale, padding, cellSize) {
        if (scale <= 0.01) return;
        drawPiece(ctx, row, col, piece, scale, padding, cellSize);
    }

    /**
     * 绘制精致悬停预览
     */
    function drawHoverPiece(ctx, row, col, currentPlayer, board, boardSize, padding, cellSize) {
        if (row < 0 || row >= boardSize || col < 0 || col >= boardSize || board[row][col] !== 0) return;
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const radius = Math.max(1, cellSize * 0.44);
        const isBlack = currentPlayer === 1;
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';

        ctx.save();

        // 外发光
        if (isCyber) {
            const colors = getStyleColors();
            ctx.shadowColor = isBlack ? colors.neonCyan : colors.neonPink;
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowColor = isBlack ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)';
            ctx.shadowBlur = 14;
        }

        ctx.globalAlpha = 0.45;
        const g = ctx.createRadialGradient(x - radius * 0.28, y - radius * 0.32, 0, x, y, radius);
        if (isBlack) {
            g.addColorStop(0, '#707070');
            g.addColorStop(0.5, '#404040');
            g.addColorStop(1, '#181818');
        } else {
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.5, '#f2f2f2');
            g.addColorStop(1, '#d0d0d0');
        }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // 高光提示
        ctx.globalAlpha = 0.25;
        const hl = ctx.createRadialGradient(x - radius * 0.32, y - radius * 0.32, 0, x, y, radius * 0.55);
        hl.addColorStop(0, 'rgba(255,255,255,0.65)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    /**
     * 绘制精致最后一手标记
     */
    function drawLastMoveMarker(ctx, row, col, padding, cellSize) {
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const ms = Math.max(3, cellSize * 0.13);
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';

        ctx.save();

        if (isCyber) {
            const colors = getStyleColors();
            // 外层发光环
            ctx.strokeStyle = colors.neonCyan;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = colors.neonCyan;
            ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(x, y, ms + 4, 0, Math.PI * 2); ctx.stroke();

            // 内层实心环
            ctx.strokeStyle = colors.neonPink;
            ctx.lineWidth = 2;
            ctx.shadowColor = colors.neonPink;
            ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(x, y, ms + 2, 0, Math.PI * 2); ctx.stroke();

            // 中心点
            ctx.shadowBlur = 0;
            ctx.fillStyle = colors.neonCyan;
            ctx.beginPath(); ctx.arc(x, y, ms * 0.6, 0, Math.PI * 2); ctx.fill();
        } else {
            // 外层发光环
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.55)';
            ctx.lineWidth = 2.2;
            ctx.shadowColor = 'rgba(255, 60, 60, 0.65)';
            ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(x, y, ms + 3.5, 0, Math.PI * 2); ctx.stroke();

            // 内层实心环
            ctx.shadowBlur = 5;
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.92)';
            ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.arc(x, y, ms + 1.2, 0, Math.PI * 2); ctx.stroke();

            // 中心点
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 80, 80, 0.98)';
            ctx.beginPath(); ctx.arc(x, y, ms * 0.55, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
    }

    /**
     * 绘制精致胜利线
     */
    function drawWinLine(ctx, winLine, sortedWinLine, padding, cellSize) {
        if (!winLine || winLine.length < 2) return;
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';
        const colors = getStyleColors();

        // 每个胜利棋子的发光圈
        for (const { row, col } of winLine) {
            const x = padding + col * cellSize, y = padding + row * cellSize;
            const radius = Math.max(1, cellSize * 0.44);

            ctx.save();
            if (isCyber) {
                ctx.strokeStyle = colors.neonCyan;
                ctx.lineWidth = 4.5;
                ctx.shadowColor = colors.neonCyan;
                ctx.shadowBlur = 25;
            } else {
                ctx.strokeStyle = 'rgba(255, 60, 60, 0.45)';
                ctx.lineWidth = 4;
                ctx.shadowColor = 'rgba(255, 50, 50, 0.75)';
                ctx.shadowBlur = 22;
            }
            ctx.beginPath(); ctx.arc(x, y, radius + 3.5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            ctx.save();
            if (isCyber) {
                ctx.strokeStyle = colors.neonPink;
                ctx.lineWidth = 2.5;
                ctx.shadowColor = colors.neonPink;
                ctx.shadowBlur = 12;
            } else {
                ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)';
                ctx.lineWidth = 2.2;
                ctx.shadowColor = '#ff4444';
                ctx.shadowBlur = 12;
            }
            ctx.beginPath(); ctx.arc(x, y, radius + 2, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }

        // 连接线
        const first = sortedWinLine[0], last = sortedWinLine[sortedWinLine.length - 1];
        const x1 = padding + first.col * cellSize, y1 = padding + first.row * cellSize;
        const x2 = padding + last.col * cellSize, y2 = padding + last.row * cellSize;

        // 外发光线
        ctx.save();
        if (isCyber) {
            ctx.strokeStyle = colors.neonCyan;
            ctx.shadowColor = colors.neonCyan;
            ctx.shadowBlur = 30;
        } else {
            ctx.strokeStyle = 'rgba(255, 60, 60, 0.35)';
            ctx.shadowColor = 'rgba(255, 50, 50, 0.65)';
            ctx.shadowBlur = 28;
        }
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        // 主连线
        ctx.save();
        if (isCyber) {
            ctx.strokeStyle = colors.neonPink;
            ctx.shadowColor = colors.neonPink;
            ctx.shadowBlur = 15;
        } else {
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.92)';
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 14;
        }
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        // 中心高光线
        ctx.save();
        ctx.strokeStyle = isCyber ? 'rgba(0, 240, 255, 0.6)' : 'rgba(255, 180, 180, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
    }

    /**
     * 绘制精致胜利线（渐进动画版）
     */
    function drawWinLineAnimated(ctx, winLine, sortedWinLine, padding, cellSize, progress) {
        if (!winLine || winLine.length < 2 || progress <= 0) return;
        const eased = 1 - Math.pow(1 - Math.min(1, progress), 3);
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';
        const colors = getStyleColors();

        for (let i = 0; i < sortedWinLine.length; i++) {
            const pieceProgress = i / (sortedWinLine.length - 1);
            if (pieceProgress > eased) break;
            const { row, col } = sortedWinLine[i];
            const x = padding + col * cellSize, y = padding + row * cellSize;
            const radius = Math.max(1, cellSize * 0.44);
            const glowAlpha = Math.min(1, (eased - pieceProgress) * 3);

            ctx.save();
            if (isCyber) {
                ctx.strokeStyle = `rgba(0, 240, 255, ${glowAlpha * 0.5})`;
                ctx.shadowColor = colors.neonCyan;
                ctx.shadowBlur = 22 * glowAlpha;
            } else {
                ctx.strokeStyle = `rgba(255, 60, 60, ${glowAlpha * 0.45})`;
                ctx.shadowColor = `rgba(255, 50, 50, ${glowAlpha * 0.75})`;
                ctx.shadowBlur = 22 * glowAlpha;
            }
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(x, y, radius + 3.5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            ctx.save();
            if (isCyber) {
                ctx.strokeStyle = `rgba(255, 0, 128, ${glowAlpha * 0.85})`;
                ctx.shadowColor = colors.neonPink;
                ctx.shadowBlur = 12 * glowAlpha;
            } else {
                ctx.strokeStyle = `rgba(255, 80, 80, ${glowAlpha * 0.85})`;
                ctx.shadowColor = '#ff4444';
                ctx.shadowBlur = 12 * glowAlpha;
            }
            ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.arc(x, y, radius + 2, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }

        const first = sortedWinLine[0], last = sortedWinLine[sortedWinLine.length - 1];
        const x1 = padding + first.col * cellSize, y1 = padding + first.row * cellSize;
        const x2 = x1 + (padding + last.col * cellSize - x1) * eased;
        const y2 = y1 + (padding + last.row * cellSize - y1) * eased;

        ctx.save();
        if (isCyber) {
            ctx.strokeStyle = colors.neonCyan;
            ctx.shadowColor = colors.neonCyan;
            ctx.shadowBlur = 28;
        } else {
            ctx.strokeStyle = 'rgba(255, 60, 60, 0.35)';
            ctx.shadowColor = 'rgba(255, 50, 50, 0.65)';
            ctx.shadowBlur = 26;
        }
        ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        ctx.save();
        if (isCyber) {
            ctx.strokeStyle = colors.neonPink;
            ctx.shadowColor = colors.neonPink;
            ctx.shadowBlur = 14;
        } else {
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.92)';
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 14;
        }
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = isCyber ? 'rgba(0, 240, 255, 0.6)' : 'rgba(255, 180, 180, 0.55)';
        ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
    }

    /**
     * 绘制精致落子波纹
     */
    function drawPlaceRipple(ctx, row, col, piece, progress, padding, cellSize) {
        if (progress >= 1 || progress <= 0) return;
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const maxRadius = cellSize * 1.3;
        const radius = Math.max(1, maxRadius * progress);
        const alpha = (1 - progress) * 0.45;
        const isBlack = piece === 1;
        const styleName = document.documentElement.getAttribute('data-style') || 'luxury';
        const isCyber = styleName === 'cyberpunk';

        ctx.save();
        
        if (isCyber) {
            const colors = getStyleColors();
            ctx.strokeStyle = isBlack ? `rgba(0, 240, 255, ${alpha})` : `rgba(255, 0, 128, ${alpha})`;
            ctx.shadowColor = isBlack ? colors.neonCyan : colors.neonPink;
            ctx.shadowBlur = 10 * (1 - progress);
        } else {
            ctx.strokeStyle = isBlack ? `rgba(120, 120, 120, ${alpha})` : `rgba(200, 200, 200, ${alpha})`;
            ctx.shadowColor = isBlack ? `rgba(0, 0, 0, ${alpha * 0.35})` : `rgba(0, 0, 0, ${alpha * 0.25})`;
            ctx.shadowBlur = 8 * (1 - progress);
        }
        
        ctx.lineWidth = 3 * (1 - progress);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    /**
     * 预缓存棋盘背景
     */
    function preCache(ctx, size, boardSize, padding, cellSize) {
        drawBoardBackground(ctx, size, boardSize, padding, cellSize);
    }

    return {
        isActive, activate, deactivate, preCache,
        drawBoardBackground, drawGrid, drawCoordinates, drawStarPoints,
        drawPiece, drawPieceAnimated, drawHoverPiece, drawLastMoveMarker,
        drawWinLine, drawWinLineAnimated, drawPlaceRipple
    };
})();
