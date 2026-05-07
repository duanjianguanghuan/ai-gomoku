/**
 * AI 五子棋 - 精致模式渲染器 v3
 * 极致精致：多层木纹棋盘 · 6层3D棋子 · 真实光泽 · 精致标记
 * 性能优化：棋盘背景缓存 · 批量绘制
 */

const RefinedRenderer = (() => {
    let active = false;
    let boardCache = null;
    let cacheKey = '';

    function isActive() { return active; }
    function activate() { active = true; boardCache = null; cacheKey = ''; }
    function deactivate() { active = false; boardCache = null; cacheKey = ''; }

    function getCacheKey(size, boardSize, padding, cellSize) {
        const style = document.documentElement.getAttribute('data-style') || 'luxury';
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        return `${size}_${boardSize}_${padding}_${cellSize}_${style}_${theme}`;
    }

    // 三种风格的棋盘颜色配置（深色 + 浅色）
    const STYLE_COLORS = {
        luxury: {
            dark: {
                base: ['#e8c56a', '#dbb555', '#d4a843', '#c99a30'],
                warmGlow: ['rgba(255, 230, 160, 0.12)', 'rgba(255, 220, 130, 0.05)'],
                grain: '#7a5a10', grainDark: '#5a3a00',
                line: 'rgba(80, 50, 10, 0.5)', star: 'rgba(60, 35, 5, 0.7)', coord: 'rgba(80, 50, 10, 0.55)',
            },
            light: {
                base: ['#f0dca0', '#e8d48e', '#e0cc7c', '#d8c46a'],
                warmGlow: ['rgba(255, 240, 200, 0.15)', 'rgba(255, 230, 170, 0.08)'],
                grain: '#b89840', grainDark: '#a08030',
                line: 'rgba(100, 70, 20, 0.45)', star: 'rgba(80, 50, 10, 0.6)', coord: 'rgba(100, 70, 20, 0.5)',
            },
        },
        minimal: {
            dark: {
                base: ['#2a2a2a', '#252525', '#202020', '#1a1a1a'],
                warmGlow: ['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.01)'],
                grain: '#333333', grainDark: '#222222',
                line: 'rgba(255, 255, 255, 0.15)', star: 'rgba(255, 255, 255, 0.25)', coord: 'rgba(255, 255, 255, 0.3)',
            },
            light: {
                base: ['#f0f0f0', '#e8e8e8', '#e0e0e0', '#d8d8d8'],
                warmGlow: ['rgba(0, 0, 0, 0.01)', 'rgba(0, 0, 0, 0.005)'],
                grain: '#cccccc', grainDark: '#bbbbbb',
                line: 'rgba(0, 0, 0, 0.12)', star: 'rgba(0, 0, 0, 0.2)', coord: 'rgba(0, 0, 0, 0.25)',
            },
        },
        glassmorphism: {
            dark: {
                base: ['rgba(99, 102, 241, 0.15)', 'rgba(139, 92, 246, 0.12)', 'rgba(168, 85, 247, 0.1)', 'rgba(236, 72, 153, 0.08)'],
                warmGlow: ['rgba(139, 92, 246, 0.1)', 'rgba(99, 102, 241, 0.05)'],
                grain: 'rgba(139, 92, 246, 0.08)', grainDark: 'rgba(99, 102, 241, 0.06)',
                line: 'rgba(139, 92, 246, 0.35)', star: 'rgba(168, 85, 247, 0.5)', coord: 'rgba(196, 181, 253, 0.5)',
            },
            light: {
                base: ['rgba(139, 92, 246, 0.08)', 'rgba(168, 85, 247, 0.06)', 'rgba(196, 181, 253, 0.05)', 'rgba(232, 121, 249, 0.04)'],
                warmGlow: ['rgba(139, 92, 246, 0.06)', 'rgba(99, 102, 241, 0.03)'],
                grain: 'rgba(139, 92, 246, 0.05)', grainDark: 'rgba(99, 102, 241, 0.04)',
                line: 'rgba(99, 102, 241, 0.3)', star: 'rgba(124, 58, 237, 0.4)', coord: 'rgba(109, 90, 205, 0.45)',
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
     * 绘制精致棋盘背景（多层木纹 + 真实质感）
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

        const offscreen = document.createElement('canvas');
        offscreen.width = size;
        offscreen.height = size;
        const oc = offscreen.getContext('2d');

        const br = 12;
        oc.save();

        // 圆角裁剪路径
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
        const baseGrad = oc.createLinearGradient(0, 0, size * 0.3, size);
        baseGrad.addColorStop(0, colors.base[0]);
        baseGrad.addColorStop(0.3, colors.base[1]);
        baseGrad.addColorStop(0.6, colors.base[2]);
        baseGrad.addColorStop(1, colors.base[3]);
        oc.fillStyle = baseGrad;
        oc.fill();

        // === 第2层：径向光晕（中心微亮） ===
        roundRect(oc);
        const warmGlow = oc.createRadialGradient(size * 0.45, size * 0.4, 0, size * 0.5, size * 0.5, size * 0.7);
        warmGlow.addColorStop(0, colors.warmGlow[0]);
        warmGlow.addColorStop(0.5, colors.warmGlow[1]);
        warmGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        oc.fillStyle = warmGlow;
        oc.fill();

        // === 第3层：纹理（奢华风木纹，简约风无，毛玻璃渐变） ===
        oc.save();
        roundRect(oc);
        oc.clip();

        if (isGlass) {
            // 毛玻璃风格：渐变叠加
            const glassGrad = oc.createLinearGradient(0, 0, size, size);
            glassGrad.addColorStop(0, 'rgba(99, 102, 241, 0.05)');
            glassGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.03)');
            glassGrad.addColorStop(1, 'rgba(236, 72, 153, 0.04)');
            oc.fillStyle = glassGrad;
            oc.fill();
        } else if (!isMinimal) {
            // 奢华风：木纹纹理
            // 主木纹 - 细密横线
            oc.globalAlpha = 0.04;
            oc.strokeStyle = colors.grain;
            oc.lineWidth = 0.4;
            oc.beginPath();
            for (let i = 0; i < size; i += 2) {
                const wave = Math.sin(i * 0.08) * 1.5;
                oc.moveTo(0, i + wave);
                oc.bezierCurveTo(size * 0.3, i + wave + Math.sin(i * 0.05) * 2,
                                 size * 0.7, i + wave - Math.sin(i * 0.06) * 1.5,
                                 size, i + wave + Math.sin(i * 0.04) * 1);
            }
            oc.stroke();

            // 粗木纹 - 间隔较宽的深色线
            oc.globalAlpha = 0.025;
            oc.strokeStyle = colors.grainDark;
            oc.lineWidth = 1;
            oc.beginPath();
            for (let i = 0; i < size; i += 12 + Math.sin(i * 0.3) * 4) {
                const wave = Math.sin(i * 0.06) * 3;
                oc.moveTo(0, i + wave);
                oc.bezierCurveTo(size * 0.25, i + wave + 4, size * 0.5, i + wave - 3, size, i + wave + 2);
            }
            oc.stroke();

            // 木节（稀疏的暗色椭圆）
            oc.globalAlpha = 0.03;
            oc.fillStyle = colors.grainDark;
            const seed = [0.15, 0.72, 0.38, 0.85, 0.55];
            for (let i = 0; i < seed.length; i++) {
                const kx = size * seed[i], ky = size * seed[(i + 2) % seed.length];
                const kr = 6 + (i % 3) * 4;
                oc.beginPath();
                oc.ellipse(kx, ky, kr, kr * 0.6, i * 0.5, 0, Math.PI * 2);
                oc.fill();
            }
        }

        // 细微噪点纹理（固定种子确保缓存一致性）
        if (!isMinimal) {
            oc.globalAlpha = 0.015;
            let noiseSeed = 12345;
            function seededRandom() { noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7FFFFFFF; return noiseSeed / 0x7FFFFFFF; }
            for (let i = 0; i < 800; i++) {
                const nx = seededRandom() * size, ny = seededRandom() * size;
                const ns = seededRandom() * 1.5 + 0.5;
                oc.fillStyle = seededRandom() > 0.5 ? '#000' : '#fff';
                oc.fillRect(nx, ny, ns, ns);
            }
        }

        oc.globalAlpha = 1;
        oc.restore();

        // === 第4层：精致边框 ===
        roundRect(oc);
        oc.strokeStyle = 'rgba(120, 80, 20, 0.3)';
        oc.lineWidth = 2;
        oc.stroke();

        // 内边框（双线效果）
        roundRect(oc);
        oc.strokeStyle = 'rgba(180, 140, 60, 0.2)';
        oc.lineWidth = 0.5;
        const inset = 3;
        oc.stroke();

        // === 第5层：四边精致内阴影（多层渐变） ===
        const edgeW = Math.max(14, size * 0.07);
        const sideW = Math.max(10, size * 0.05);

        // 上边内阴影
        let g = oc.createLinearGradient(0, 0, 0, edgeW);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
        g.addColorStop(0.4, 'rgba(0, 0, 0, 0.04)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        oc.fillStyle = g;
        oc.fillRect(0, 0, size, edgeW);

        // 下边内阴影
        g = oc.createLinearGradient(0, size - edgeW, 0, size);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(0.6, 'rgba(0, 0, 0, 0.04)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        oc.fillStyle = g;
        oc.fillRect(0, size - edgeW, size, edgeW);

        // 左边内阴影
        g = oc.createLinearGradient(0, 0, sideW, 0);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.07)');
        g.addColorStop(0.5, 'rgba(0, 0, 0, 0.02)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        oc.fillStyle = g;
        oc.fillRect(0, 0, sideW, size);

        // 右边内阴影
        g = oc.createLinearGradient(size - sideW, 0, size, 0);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(0.5, 'rgba(0, 0, 0, 0.02)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0.07)');
        oc.fillStyle = g;
        oc.fillRect(size - sideW, 0, sideW, size);

        // === 第6层：顶部高光条 ===
        g = oc.createLinearGradient(0, 0, 0, 4);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        oc.fillStyle = g;
        oc.fillRect(br, 0, size - br * 2, 4);

        oc.restore();

        boardCache = offscreen;
        cacheKey = key;
        ctx.drawImage(offscreen, 0, 0);
    }

    /**
     * 绘制精致网格线（带微弱阴影感）
     */
    function drawGrid(ctx, boardSize, padding, cellSize) {
        const colors = getStyleColors();
        const endPos = padding + (boardSize - 1) * cellSize;

        // 网格线阴影层（极淡）
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < boardSize; i++) {
            const pos = padding + i * cellSize + 0.5;
            ctx.moveTo(padding + 0.5, pos); ctx.lineTo(endPos + 0.5, pos);
            ctx.moveTo(pos, padding + 0.5); ctx.lineTo(pos, endPos + 0.5);
        }
        ctx.stroke();

        // 网格线主体
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let i = 0; i < boardSize; i++) {
            const pos = padding + i * cellSize;
            ctx.moveTo(padding, pos); ctx.lineTo(endPos, pos);
            ctx.moveTo(pos, padding); ctx.lineTo(pos, endPos);
        }
        ctx.stroke();
    }

    /**
     * 绘制精致坐标标注
     */
    function drawCoordinates(ctx, boardSize, padding, cellSize) {
        if (boardSize > 15) return;
        const colors = getStyleColors();
        const fontSize = Math.max(8, cellSize * 0.26);
        ctx.fillStyle = colors.coord;
        ctx.font = `600 ${fontSize}px -apple-system, "PingFang SC", "SF Pro", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < boardSize; i++) {
            ctx.fillText(String.fromCharCode(65 + i), padding + i * cellSize, padding * 0.36);
            ctx.fillText(String(i + 1), padding * 0.3, padding + i * cellSize);
        }
    }

    /**
     * 绘制精致星位（三层 + 内发光）
     */
    function drawStarPoints(ctx, stars, padding, cellSize) {
        const colors = getStyleColors();
        const outerR = Math.max(3.5, cellSize * 0.15);
        const midR = Math.max(2.5, cellSize * 0.1);
        const innerR = Math.max(1.2, cellSize * 0.05);

        for (const { row, col } of stars) {
            const sx = padding + col * cellSize, sy = padding + row * cellSize;

            // 外层阴影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.beginPath(); ctx.arc(sx + 0.5, sy + 0.5, outerR + 0.5, 0, Math.PI * 2); ctx.fill();

            // 外层实心
            ctx.fillStyle = colors.star;
            ctx.beginPath(); ctx.arc(sx, sy, outerR, 0, Math.PI * 2); ctx.fill();

            // 中层
            ctx.fillStyle = colors.star;
            ctx.globalAlpha = 0.6;
            ctx.beginPath(); ctx.arc(sx, sy, midR, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;

            // 内层高光
            ctx.fillStyle = colors.star;
            ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.arc(sx - 0.5, sy - 0.5, innerR, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    /**
     * 绘制极致精致 3D 棋子（6 层渲染）
     */
    function drawPiece(ctx, row, col, piece, scale, padding, cellSize) {
        const x = padding + col * cellSize;
        const y = padding + row * cellSize;
        const radius = Math.max(1, cellSize * 0.43 * scale);
        const isBlack = piece === 1;

        ctx.save();

        // === 第1层：投射阴影（偏移 + 模糊感） ===
        ctx.shadowColor = isBlack ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2.5;
        ctx.shadowOffsetY = 3.5;

        // === 第2层：主体球形渐变（光源左上） ===
        const lightX = x - radius * 0.3;
        const lightY = y - radius * 0.35;
        const mg = ctx.createRadialGradient(lightX, lightY, radius * 0.02, x + radius * 0.08, y + radius * 0.08, radius);

        if (isBlack) {
            mg.addColorStop(0, '#888888');
            mg.addColorStop(0.15, '#5a5a5a');
            mg.addColorStop(0.35, '#333333');
            mg.addColorStop(0.65, '#1a1a1a');
            mg.addColorStop(0.85, '#0d0d0d');
            mg.addColorStop(1, '#050505');
        } else {
            mg.addColorStop(0, '#ffffff');
            mg.addColorStop(0.15, '#fefefe');
            mg.addColorStop(0.35, '#f5f5f5');
            mg.addColorStop(0.6, '#e6e6e6');
            mg.addColorStop(0.8, '#d0d0d0');
            mg.addColorStop(1, '#a8a8a8');
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

        // === 第3层：柔和大高光（左上弧形区域） ===
        const hl1 = ctx.createRadialGradient(
            x - radius * 0.28, y - radius * 0.32, 0,
            x - radius * 0.05, y - radius * 0.05, radius * 0.75
        );
        if (isBlack) {
            hl1.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
            hl1.addColorStop(0.3, 'rgba(255, 255, 255, 0.1)');
            hl1.addColorStop(0.7, 'rgba(255, 255, 255, 0.02)');
            hl1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
            hl1.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
            hl1.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
            hl1.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
            hl1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = hl1;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // === 第4层：锐利高光点（左上角小光斑） ===
        const hl2 = ctx.createRadialGradient(
            x - radius * 0.35, y - radius * 0.35, 0,
            x - radius * 0.35, y - radius * 0.35, radius * 0.22
        );
        if (isBlack) {
            hl2.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
            hl2.addColorStop(0.4, 'rgba(255, 255, 255, 0.15)');
            hl2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
            hl2.addColorStop(0, 'rgba(255, 255, 255, 1)');
            hl2.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
            hl2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = hl2;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // === 第5层：底部环境反射（右下弧形） ===
        const ref = ctx.createRadialGradient(
            x + radius * 0.25, y + radius * 0.3, 0,
            x + radius * 0.2, y + radius * 0.25, radius * 0.55
        );
        if (isBlack) {
            ref.addColorStop(0, 'rgba(120, 160, 220, 0.1)');
            ref.addColorStop(0.5, 'rgba(100, 140, 200, 0.04)');
            ref.addColorStop(1, 'rgba(100, 140, 200, 0)');
        } else {
            ref.addColorStop(0, 'rgba(100, 140, 200, 0.15)');
            ref.addColorStop(0.5, 'rgba(100, 140, 200, 0.06)');
            ref.addColorStop(1, 'rgba(100, 140, 200, 0)');
        }
        ctx.fillStyle = ref;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // === 第6层：精致边缘（渐变描边 + 底部反光弧） ===
        // 主边缘
        ctx.strokeStyle = isBlack ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(x, y, radius - 0.3, 0, Math.PI * 2); ctx.stroke();

        // 顶部亮边
        ctx.strokeStyle = isBlack ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(x, y, radius - 0.3, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();

        // 底部暗边
        ctx.strokeStyle = isBlack ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, radius - 0.3, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * 绘制带缩放动画的精致棋子（落子动画）
     */
    function drawPieceAnimated(ctx, row, col, piece, scale, padding, cellSize) {
        if (scale <= 0.01) return;
        drawPiece(ctx, row, col, piece, scale, padding, cellSize);
    }

    /**
     * 绘制精致悬停预览（半透明 + 脉冲光晕）
     */
    function drawHoverPiece(ctx, row, col, currentPlayer, board, boardSize, padding, cellSize) {
        if (row < 0 || row >= boardSize || col < 0 || col >= boardSize || board[row][col] !== 0) return;
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const radius = Math.max(1, cellSize * 0.43);
        const isBlack = currentPlayer === 1;

        ctx.save();

        // 外发光
        ctx.shadowColor = isBlack ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 12;

        ctx.globalAlpha = 0.4;
        const g = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, 0, x, y, radius);
        if (isBlack) {
            g.addColorStop(0, '#666666');
            g.addColorStop(0.5, '#333333');
            g.addColorStop(1, '#111111');
        } else {
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.5, '#f0f0f0');
            g.addColorStop(1, '#cccccc');
        }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        // 高光提示
        ctx.globalAlpha = 0.2;
        const hl = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius * 0.5);
        hl.addColorStop(0, 'rgba(255,255,255,0.6)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    /**
     * 绘制精致最后一手标记（双层发光环 + 中心点）
     */
    function drawLastMoveMarker(ctx, row, col, padding, cellSize) {
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const ms = Math.max(2.5, cellSize * 0.12);

        ctx.save();

        // 外层发光环
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.5)';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(255, 60, 60, 0.6)';
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(x, y, ms + 3, 0, Math.PI * 2); ctx.stroke();

        // 内层实心环
        ctx.shadowBlur = 4;
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, ms + 1, 0, Math.PI * 2); ctx.stroke();

        // 中心点
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 80, 80, 0.95)';
        ctx.beginPath(); ctx.arc(x, y, ms * 0.5, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    /**
     * 绘制精致胜利线（多层发光 + 渐变连线）
     */
    function drawWinLine(ctx, winLine, sortedWinLine, padding, cellSize) {
        if (!winLine || winLine.length < 2) return;

        // 每个胜利棋子的发光圈
        for (const { row, col } of winLine) {
            const x = padding + col * cellSize, y = padding + row * cellSize;
            const radius = Math.max(1, cellSize * 0.43);

            // 外发光
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 60, 60, 0.4)';
            ctx.lineWidth = 4;
            ctx.shadowColor = 'rgba(255, 50, 50, 0.7)';
            ctx.shadowBlur = 20;
            ctx.beginPath(); ctx.arc(x, y, radius + 3, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            // 内圈
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }

        // 连接线
        const first = sortedWinLine[0], last = sortedWinLine[sortedWinLine.length - 1];
        const x1 = padding + first.col * cellSize, y1 = padding + first.row * cellSize;
        const x2 = padding + last.col * cellSize, y2 = padding + last.row * cellSize;

        // 外发光线
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.3)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 50, 50, 0.6)';
        ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        // 主连线
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        // 中心高光线
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 180, 180, 0.5)';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
    }

    /**
     * 绘制精致胜利线（渐进动画版）
     */
    function drawWinLineAnimated(ctx, winLine, sortedWinLine, padding, cellSize, progress) {
        if (!winLine || winLine.length < 2 || progress <= 0) return;
        const eased = 1 - Math.pow(1 - Math.min(1, progress), 3); // easeOutCubic

        // 每个胜利棋子的发光圈（渐进显现）
        for (let i = 0; i < sortedWinLine.length; i++) {
            const pieceProgress = i / (sortedWinLine.length - 1);
            if (pieceProgress > eased) break;
            const { row, col } = sortedWinLine[i];
            const x = padding + col * cellSize, y = padding + row * cellSize;
            const radius = Math.max(1, cellSize * 0.43);
            const glowAlpha = Math.min(1, (eased - pieceProgress) * 3);

            ctx.save();
            ctx.strokeStyle = `rgba(255, 60, 60, ${glowAlpha * 0.4})`;
            ctx.lineWidth = 4;
            ctx.shadowColor = `rgba(255, 50, 50, ${glowAlpha * 0.7})`;
            ctx.shadowBlur = 20 * glowAlpha;
            ctx.beginPath(); ctx.arc(x, y, radius + 3, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = `rgba(255, 80, 80, ${glowAlpha * 0.8})`;
            ctx.lineWidth = 2;
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 10 * glowAlpha;
            ctx.beginPath(); ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }

        // 渐进连线
        const first = sortedWinLine[0], last = sortedWinLine[sortedWinLine.length - 1];
        const x1 = padding + first.col * cellSize, y1 = padding + first.row * cellSize;
        const x2 = x1 + (padding + last.col * cellSize - x1) * eased;
        const y2 = y1 + (padding + last.row * cellSize - y1) * eased;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.3)';
        ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 50, 50, 0.6)'; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
        ctx.lineWidth = 3.5; ctx.lineCap = 'round';
        ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 180, 180, 0.5)';
        ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
    }

    /**
     * 绘制精致落子波纹
     */
    function drawPlaceRipple(ctx, row, col, piece, progress, padding, cellSize) {
        if (progress >= 1 || progress <= 0) return;
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const maxRadius = cellSize * 1.2;
        const radius = Math.max(1, maxRadius * progress);
        const alpha = (1 - progress) * 0.4;
        const isBlack = piece === 1;

        ctx.save();
        ctx.strokeStyle = isBlack ? `rgba(100,100,100,${alpha})` : `rgba(180,180,180,${alpha})`;
        ctx.lineWidth = 2.5 * (1 - progress);
        ctx.shadowColor = isBlack ? `rgba(0,0,0,${alpha * 0.3})` : `rgba(0,0,0,${alpha * 0.2})`;
        ctx.shadowBlur = 6 * (1 - progress);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    /**
     * 预缓存棋盘背景（精致模式启用时调用，避免首次绘制卡顿）
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
