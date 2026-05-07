/**
 * AI 五子棋 - 游戏核心逻辑 v11
 * 新增：集成 AITactics 实时战术调配（记录用户落子、重置战术状态）
 * 四 AI 协同：GomokuAI + AIPattern + AIStrategy + AITactics
 */

(() => {
    'use strict';

    const EMPTY = 0, BLACK = 1, WHITE = 2;

    let boardSize = 15, board = [], currentPlayer = BLACK;
    let playerPiece = BLACK, aiPiece = WHITE;
    let gameOver = false, moveHistory = [], aiThinking = false;
    let winLine = null, hoverPos = null;
    let soundEnabled = true, perfMode = false, glassMode = true;
    try { perfMode = localStorage.getItem('gomoku-perf-mode') === 'true'; } catch {}
    let battleMode = false;
    let playerControl = true;
    let scores = { player: 0, ai: 0, draw: 0 };
    let animatingPiece = null;
    let placeRipples = [];
    let winLineAnim = null;
    let autoMode = false; // 自动连续对弈
    let battleFirstPiece = BLACK; // AI 对决先手棋子

    // ========== 音效系统（增强版） ==========
    let audioCtx = null;
    function initAudio() { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }

    function playSound(type) {
        if (!soundEnabled || !audioCtx) return;
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const now = audioCtx.currentTime;
            if (type === 'place') {
                // 落子音：双频叠加 + 衰减
                const o1 = audioCtx.createOscillator(), o2 = audioCtx.createOscillator(), g = audioCtx.createGain();
                o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
                o1.type = 'sine'; o1.frequency.setValueAtTime(1200, now); o1.frequency.exponentialRampToValueAtTime(600, now + 0.06);
                o2.type = 'sine'; o2.frequency.setValueAtTime(800, now); o2.frequency.exponentialRampToValueAtTime(400, now + 0.08);
                g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                o1.start(now); o1.stop(now + 0.15); o2.start(now); o2.stop(now + 0.15);
            } else if (type === 'win') {
                // 胜利音：上行琶音
                [523, 659, 784, 1047].forEach((freq, i) => {
                    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                    o.connect(g); g.connect(audioCtx.destination); o.type = 'sine';
                    o.frequency.setValueAtTime(freq, now + i * 0.1);
                    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.2, now + i * 0.1);
                    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
                    o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.3);
                });
            } else if (type === 'lose') {
                // 失败音：下行滑音
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.connect(g); g.connect(audioCtx.destination); o.type = 'triangle';
                o.frequency.setValueAtTime(440, now); o.frequency.linearRampToValueAtTime(220, now + 0.4);
                g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                o.start(now); o.stop(now + 0.5);
            } else if (type === 'undo') {
                // 悔棋音：短促下滑
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.connect(g); g.connect(audioCtx.destination); o.type = 'triangle';
                o.frequency.setValueAtTime(500, now); o.frequency.exponentialRampToValueAtTime(350, now + 0.08);
                g.gain.setValueAtTime(0.1, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                o.start(now); o.stop(now + 0.12);
            } else if (type === 'click') {
                // 点击音：极短脉冲
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.connect(g); g.connect(audioCtx.destination); o.type = 'sine';
                o.frequency.setValueAtTime(1000, now); g.gain.setValueAtTime(0.06, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                o.start(now); o.stop(now + 0.05);
            } else if (type === 'gamestart') {
                // 新局音：清脆提示
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.connect(g); g.connect(audioCtx.destination); o.type = 'sine';
                o.frequency.setValueAtTime(880, now); o.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
                g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                o.start(now); o.stop(now + 0.15);
            } else if (type === 'draw') {
                // 平局音：两个柔和音
                [440, 523].forEach((freq, i) => {
                    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                    o.connect(g); g.connect(audioCtx.destination); o.type = 'sine';
                    o.frequency.setValueAtTime(freq, now + i * 0.15);
                    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.12, now + i * 0.15);
                    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
                    o.start(now + i * 0.15); o.stop(now + i * 0.15 + 0.4);
                });
            }
        } catch(e) {}
    }

    function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }

    // ========== DOM ==========
    const canvas = document.getElementById('board-canvas');
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('status-text');
    const currentPieceEl = document.getElementById('current-piece');
    const playerWinsEl = document.getElementById('player-wins');
    const aiWinsEl = document.getElementById('ai-wins');
    const drawsEl = document.getElementById('draws');
    const moveNumEl = document.getElementById('move-num');
    const winOverlay = document.getElementById('win-overlay');
    const winText = document.getElementById('win-text');
    const winDetail = document.getElementById('win-detail');
    const winIcon = document.getElementById('win-icon');
    const thinkingEl = document.getElementById('thinking');
    const settingsPanel = document.getElementById('settings-panel');
    const themeIcon = document.getElementById('theme-icon');
    const modeBadge = document.getElementById('mode-badge');
    const autoBadge = document.getElementById('auto-badge');
    const btnUndo = document.getElementById('btn-undo');
    const btnBattlePause = document.getElementById('btn-battle-pause');
    const battlePauseText = document.getElementById('battle-pause-text');
    const scoreLabelPlayer = document.getElementById('score-label-player');
    const scoreLabelAi = document.getElementById('score-label-ai');
    const scoreLabelDraw = document.getElementById('score-label-draw');
    const memoryPanel = document.getElementById('memory-panel');
    const memTotalEl = document.getElementById('memory-total');
    const memBlackWinsEl = document.getElementById('mem-black-wins');
    const memWhiteWinsEl = document.getElementById('mem-white-wins');
    const memDrawsEl = document.getElementById('mem-draws');
    const memAvgMovesEl = document.getElementById('mem-avg-moves');
    const memBarBlack = document.getElementById('mem-bar-black');
    const memBarWhite = document.getElementById('mem-bar-white');
    const memBarDraw = document.getElementById('mem-bar-draw');
    const boardContainer = document.getElementById('board-container');

    let cellSize = 0, padding = 0, boardPixelSize = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rafId = null;

    function isRefined() { return perfMode && typeof RefinedRenderer !== 'undefined' && RefinedRenderer.isActive(); }

    // ========== 主题 ==========
    let currentTheme = (function() { try { return localStorage.getItem('gomoku-theme'); } catch { return null; } })() || 'dark';
    function applyTheme(theme) {
        currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem('gomoku-theme', theme); } catch {}
        // 主题切换过渡动画
        document.documentElement.classList.add('theme-transitioning');
        setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 650);
        themeIcon.classList.toggle('icon-sun', theme === 'light');
        themeIcon.classList.toggle('icon-moon', theme === 'dark');
        themeIcon.classList.remove('zoom-in');
        void themeIcon.offsetWidth;
        themeIcon.classList.add('zoom-in');
        setTimeout(() => themeIcon.classList.remove('zoom-in'), 600);
        setTimeout(() => {
            if (typeof RefinedRenderer !== 'undefined' && RefinedRenderer.isActive && RefinedRenderer.isActive()) {
                RefinedRenderer.activate(); // 清除缓存（主题影响棋盘颜色）
            }
            setupCanvas(); drawBoard();
        }, 60);
    }
    function toggleTheme() { applyTheme(currentTheme === 'dark' ? 'light' : 'dark'); playSound('click'); }

    // ========== 精致模式 ==========
    function applyPerfMode(enabled) {
        perfMode = enabled;
        try { localStorage.setItem('gomoku-perf-mode', perfMode ? 'true' : 'false'); } catch {}
        document.documentElement.setAttribute('data-perf', enabled ? 'on' : 'off');
        // 显示/隐藏灵动岛风格选择器
        const styleItem = document.getElementById('island-style-item');
        if (styleItem) styleItem.style.display = enabled ? '' : 'none';
        // 同步灵动岛风格按钮的 active 状态
        if (enabled) {
            const savedStyle = localStorage.getItem('gomoku-island-style') || 'luxury';
            document.querySelectorAll('#island-style-selector .opt-btn').forEach(b => {
                const isActive = b.dataset.style === savedStyle;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }
        // 恢复精致模式子风格
        if (enabled && typeof IslandAnimation !== 'undefined' && IslandAnimation.enableRefinedMode) {
            const savedStyle = localStorage.getItem('gomoku-island-style') || 'luxury';
            IslandAnimation.enableRefinedMode();
            IslandAnimation.setRefinedStyle(savedStyle);
            document.documentElement.setAttribute('data-style', savedStyle);
        } else if (typeof IslandAnimation !== 'undefined' && IslandAnimation.disableRefinedMode) {
            IslandAnimation.disableRefinedMode();
            document.documentElement.removeAttribute('data-style');
        }
        // 动态加载/卸载精致模式样式
        if (enabled) {
            if (typeof RefinedUI !== 'undefined') RefinedUI.loadCSS();
            if (typeof RefinedRenderer !== 'undefined') RefinedRenderer.activate();
            // 预缓存棋盘背景，避免首次绘制卡顿
            if (typeof RefinedRenderer !== 'undefined' && typeof RefinedRenderer.preCache === 'function') {
                const cvs = document.getElementById('board-canvas');
                if (cvs) {
                    const c = cvs.getContext('2d');
                    RefinedRenderer.preCache(c, cvs.width, boardSize, padding, cellSize);
                }
            }
        } else {
            if (typeof RefinedUI !== 'undefined') RefinedUI.unloadCSS();
            if (typeof RefinedRenderer !== 'undefined') RefinedRenderer.deactivate();
        }
    }

    function applyGlassMode() {
        const glassBtn = document.querySelector('#glass-selector .opt-btn.active');
        glassMode = glassBtn && glassBtn.dataset.glass === 'on';
        const island = document.getElementById('music-island');
        if (island) {
            if (glassMode) island.classList.remove('no-glass');
            else island.classList.add('no-glass');
        }
    }

    // ========== AI 对决模式 ==========
    function setBattleMode(enabled) {
        battleMode = enabled;
        document.body.classList.toggle('battle-mode', enabled);
        if (modeBadge) {
            modeBadge.classList.toggle('visible', enabled);
            modeBadge.textContent = 'AI 对决';
        }
        btnUndo.classList.toggle('disabled', enabled);
        if (btnBattlePause) {
            btnBattlePause.classList.toggle('hidden', !enabled);
        }
        // 记忆面板（两种模式都显示）
        if (memoryPanel) {
            memoryPanel.classList.remove('hidden');
        }
        updateScoreLabels();
        if (enabled) updateMemoryPanel();
    }

    function updateScoreLabels() {
        if (battleMode) {
            if (scoreLabelPlayer) scoreLabelPlayer.textContent = '⚫';
            if (scoreLabelAi) scoreLabelAi.textContent = '⚪';
            if (scoreLabelDraw) scoreLabelDraw.textContent = '平';
        } else {
            if (scoreLabelPlayer) scoreLabelPlayer.textContent = '你';
            if (scoreLabelAi) scoreLabelAi.textContent = 'AI';
            if (scoreLabelDraw) scoreLabelDraw.textContent = '平';
        }
    }

    // ========== 记忆面板更新 ==========
    function updateMemoryPanel() {
        if (!memoryPanel || typeof GomokuMemory === 'undefined') return;
        const stats = GomokuMemory.getStats();
        if (memTotalEl) {
            const pveCount = GomokuMemory.getRecordsByMode ? GomokuMemory.getRecordsByMode('pve').length : 0;
            const battleCount = GomokuMemory.getRecordsByMode ? GomokuMemory.getRecordsByMode('battle').length : 0;
            const parts = [];
            if (stats.total > 0) parts.push(`共 ${stats.total} 局`);
            if (pveCount > 0) parts.push(`人机 ${pveCount}`);
            if (battleCount > 0) parts.push(`AI对决 ${battleCount}`);
            memTotalEl.textContent = parts.length > 0 ? parts.join(' | ') : '暂无记录';
        }
        if (memBlackWinsEl) memBlackWinsEl.textContent = stats.blackWins;
        if (memWhiteWinsEl) memWhiteWinsEl.textContent = stats.whiteWins;
        if (memDrawsEl) memDrawsEl.textContent = stats.draws;
        if (memAvgMovesEl) memAvgMovesEl.textContent = stats.avgMoves;
        // 比例条
        if (stats.total > 0) {
            const bw = (stats.blackWins / stats.total * 100).toFixed(1);
            const dw = (stats.draws / stats.total * 100).toFixed(1);
            const ww = (stats.whiteWins / stats.total * 100).toFixed(1);
            if (memBarBlack) memBarBlack.style.width = bw + '%';
            if (memBarDraw) memBarDraw.style.width = dw + '%';
            if (memBarWhite) memBarWhite.style.width = ww + '%';
        }
    }

    // ========== 公开接口 ==========
    function setPlayerControl(enabled) { playerControl = enabled; }
    function isGameOver() { return gameOver; }
    function setBattleFirst(piece) { battleFirstPiece = piece; }

    /**
     * 获取对局结果（供记忆系统使用）
     */
    function getGameResult() {
        if (!gameOver) return null;
        let winner = 'draw';
        if (winLine) {
            // 找到获胜棋子
            for (const { row, col } of winLine) {
                if (board[row] && board[row][col] !== EMPTY) {
                    winner = board[row][col] === BLACK ? 'black' : 'white';
                    break;
                }
            }
        }
        return {
            winner,
            moves: moveHistory.length,
            boardSize,
            mode: battleMode ? 'battle' : 'pve',
            aiPiece: battleMode ? null : aiPiece,
            moveHistory: moveHistory.map(m => ({ row: m.row, col: m.col, piece: m.piece })),
            timestamp: Date.now()
        };
    }

    /**
     * AI 自动落子
     */
    function aiAutoMove(callback) {
        setTimeout(() => {
            try {
                GomokuAI.setAIPiece(currentPlayer);

                // 快速策略：即时胜/防 + GomokuAI 标准搜索
                let move = null;
                const oppP = currentPlayer === BLACK ? WHITE : BLACK;
                const cands = getCandidatesFast(board, boardSize);

                // 1. 一步胜
                for (const c of cands) {
                    board[c.row][c.col] = currentPlayer;
                    if (checkWinAt(board, c.row, c.col, currentPlayer, boardSize)) {
                        board[c.row][c.col] = EMPTY; move = c; break;
                    }
                    board[c.row][c.col] = EMPTY;
                }
                // 2. 对手一步胜 → 堵
                if (!move) {
                    for (const c of cands) {
                        board[c.row][c.col] = oppP;
                        if (checkWinAt(board, c.row, c.col, oppP, boardSize)) {
                            board[c.row][c.col] = EMPTY; move = c; break;
                        }
                        board[c.row][c.col] = EMPTY;
                    }
                }
                // 3. GomokuAI 标准搜索
                if (!move) move = GomokuAI.getBestMove(board);

                if (!move) { if (callback) callback(); return; }

                makeMove(move.row, move.col, currentPlayer);
                playSound('place');

                if (checkGameEnd(move.row, move.col, currentPlayer)) {
                    if (callback) callback();
                    return;
                }

            currentPlayer = currentPlayer === BLACK ? WHITE : BLACK;
            updateStatus();
            if (callback) callback();
            } catch (e) {
                console.error('[AI] aiAutoMove error:', e);
                updateStatus();
                if (callback) callback();
            }
        }, 50);
    }

    /**
     * 自动重启（供自动连续对弈使用）
     */
    function autoRestart() {
        // 短暂显示结果后自动开始下一局
        winOverlay.classList.add('hidden');
        initBoard(); setupCanvas(); drawBoard(); updateStatus();
        playSound('gamestart');
        updateMemoryPanel();
        setTimeout(() => {
            AIBattle.start({ isGameOver, aiAutoMove, setPlayerControl, getGameResult, autoRestart, setBattleFirst });
        }, 300);
    }

    // ========== 初始化 ==========
    function init() {
        // 初始化记忆系统
        if (typeof GomokuMemory !== 'undefined') GomokuMemory.init();

        applyTheme(currentTheme);
        applyPerfMode(perfMode);
        // Restore extreme mode from localStorage
        if (typeof AIExtreme !== 'undefined') {
            try {
                if (localStorage.getItem('gomoku-extreme') === 'true') {
                    AIExtreme.setEnabled(true);
                }
            } catch {}
        }
        document.addEventListener('click', () => { if (!audioCtx) initAudio(); }, { once: true });
        document.addEventListener('touchstart', () => { if (!audioCtx) initAudio(); }, { once: true });
        initBoard(); setupCanvas(); drawBoard(); bindEvents(); updateStatus();
        updateScoreLabels();
    }

    function initBoard() {
        board = [];
        for (let r = 0; r < boardSize; r++) board[r] = new Array(boardSize).fill(EMPTY);
        currentPlayer = battleMode ? battleFirstPiece : BLACK;
        gameOver = false; moveHistory = [];
        winLine = null; aiThinking = false; hoverPos = null; animatingPiece = null; placeRipples = []; winLineAnim = null;
        playerControl = !battleMode;
        winOverlay.classList.add('hidden'); thinkingEl.classList.add('hidden');
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        // 重置战术引擎状态
        if (typeof AITactics !== 'undefined') AITactics.reset();
        // 大管家：新游戏开始
        if (typeof AIManager !== 'undefined') AIManager.onGameStart();
        // 棋盘入场动画
        canvas.style.animation = 'none';
        void canvas.offsetWidth;
        canvas.style.animation = 'boardEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    }

    function setupCanvas() {
        const w = boardContainer.clientWidth, h = boardContainer.clientHeight;
        const availableSize = Math.min(w, h) - 8;
        boardPixelSize = Math.max(100, availableSize);
        padding = boardPixelSize * 0.045;
        cellSize = (boardPixelSize - padding * 2) / (boardSize - 1);
        canvas.style.width = boardPixelSize + 'px';
        canvas.style.height = boardPixelSize + 'px';
        canvas.width = boardPixelSize * dpr;
        canvas.height = boardPixelSize * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ========== 绘制 ==========
    function drawBoard() {
        const useRefined = isRefined();
        const size = boardPixelSize;
        ctx.clearRect(0, 0, size, size);

        const br = perfMode ? 12 : 8;
        if (useRefined) {
            RefinedRenderer.drawBoardBackground(ctx, size, boardSize, padding, cellSize);
            RefinedRenderer.drawGrid(ctx, boardSize, padding, cellSize);
            RefinedRenderer.drawCoordinates(ctx, boardSize, padding, cellSize);
            RefinedRenderer.drawStarPoints(ctx, getStarPoints(), padding, cellSize);
        } else {
            // 标准棋盘背景
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(br, 0); ctx.lineTo(size - br, 0);
            ctx.quadraticCurveTo(size, 0, size, br); ctx.lineTo(size, size - br);
            ctx.quadraticCurveTo(size, size, size - br, size); ctx.lineTo(br, size);
            ctx.quadraticCurveTo(0, size, 0, size - br); ctx.lineTo(0, br);
            ctx.quadraticCurveTo(0, 0, br, 0); ctx.closePath();
            const bgGrad = ctx.createLinearGradient(0, 0, size, size);
            bgGrad.addColorStop(0, '#dcb35c'); bgGrad.addColorStop(0.5, '#d4a843'); bgGrad.addColorStop(1, '#c99a30');
            ctx.fillStyle = bgGrad; ctx.fill();
            ctx.restore();
        }

        // 网格线
        if (useRefined) {
            // Already drawn by RefinedRenderer
        } else {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; ctx.lineWidth = 0.8;
            for (let i = 0; i < boardSize; i++) {
                const pos = padding + i * cellSize;
                ctx.beginPath(); ctx.moveTo(padding, pos); ctx.lineTo(padding + (boardSize - 1) * cellSize, pos); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(pos, padding); ctx.lineTo(pos, padding + (boardSize - 1) * cellSize); ctx.stroke();
            }
        }

        // 星位
        const stars = getStarPoints();
        if (!useRefined) {
            for (const { row, col } of stars) {
                const sx = padding + col * cellSize, sy = padding + row * cellSize;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.beginPath(); ctx.arc(sx, sy, Math.max(2.5, cellSize * 0.12), 0, Math.PI * 2); ctx.fill();
            }
        }

        // 悬停预览
        if (hoverPos && !gameOver && !aiThinking && playerControl && !battleMode) drawHoverPiece(hoverPos.row, hoverPos.col);

        // 绘制所有棋子
        for (let r = 0; r < boardSize; r++)
            for (let c = 0; c < boardSize; c++)
                if (board[r][c] !== EMPTY) {
                    if (animatingPiece && animatingPiece.row === r && animatingPiece.col === c) continue;
                    drawPiece(r, c, board[r][c], 1);
                }

        // 动画棋子
        if (animatingPiece) {
            const elapsed = performance.now() - animatingPiece.startTime;
            const progress = Math.min(1, elapsed / animatingPiece.duration);
            const scale = easeOutBack(progress);
            drawPiece(animatingPiece.row, animatingPiece.col, animatingPiece.piece, scale);
            if (progress < 1) rafId = requestAnimationFrame(drawBoard);
            else animatingPiece = null;
        }

        // 落子波纹动画
        for (let i = placeRipples.length - 1; i >= 0; i--) {
            const rp = placeRipples[i];
            const elapsed = performance.now() - rp.startTime;
            const progress = elapsed / rp.duration;
            if (progress >= 1) { placeRipples.splice(i, 1); continue; }
            if (isRefined()) {
                RefinedRenderer.drawPlaceRipple(ctx, rp.row, rp.col, rp.piece, progress, padding, cellSize);
            } else {
                const rx = padding + rp.col * cellSize, ry = padding + rp.row * cellSize;
                const maxR = cellSize * 1.2;
                const rr = Math.max(1, maxR * progress);
                const alpha = (1 - progress) * 0.5;
                ctx.save();
                ctx.strokeStyle = rp.piece === BLACK ? `rgba(80,80,80,${alpha})` : `rgba(200,200,200,${alpha})`;
                ctx.lineWidth = 2 * (1 - progress);
                ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
        }
        if (placeRipples.length > 0 && !animatingPiece) rafId = requestAnimationFrame(drawBoard);

        // 胜利线
        if (winLine) drawWinLine();

        // 最后一手标记
        if (moveHistory.length > 0 && !winLine) {
            const last = moveHistory[moveHistory.length - 1];
            drawLastMoveMarker(last.row, last.col);
        }
    }

    function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function startPlaceRipple(row, col, piece) {
        placeRipples.push({ row, col, piece, startTime: performance.now(), duration: 500 });
        if (!rafId) drawBoard();
    }

    function drawPiece(row, col, piece, scale) {
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const radius = Math.max(1, cellSize * 0.42 * scale);
        ctx.save();
        if (isRefined()) {
            RefinedRenderer.drawPiece(ctx, row, col, piece, scale, padding, cellSize);
        } else {
            ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1.5; ctx.shadowOffsetY = 1.5;
            const g = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
            if (piece === BLACK) { g.addColorStop(0, '#666'); g.addColorStop(0.6, '#333'); g.addColorStop(1, '#111'); }
            else { g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#f0f0f0'); g.addColorStop(1, '#ccc'); }
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    function drawHoverPiece(row, col) {
        if (row < 0 || row >= boardSize || col < 0 || col >= boardSize || board[row][col] !== EMPTY) return;
        const x = padding + col * cellSize, y = padding + row * cellSize, radius = Math.max(1, cellSize * 0.42);
        const breathAlpha = 0.2 + Math.sin(performance.now() * 0.004) * 0.1;
        ctx.save(); ctx.globalAlpha = perfMode ? breathAlpha + 0.1 : breathAlpha;
        if (isRefined()) {
            RefinedRenderer.drawHoverPiece(ctx, row, col, currentPlayer, board, boardSize, padding, cellSize);
            ctx.restore();
        } else {
            ctx.fillStyle = currentPlayer === BLACK ? '#333' : '#eee';
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        if (hoverPos && !gameOver && !aiThinking && !rafId) rafId = requestAnimationFrame(drawBoard);
    }

    function drawLastMoveMarker(row, col) {
        const x = padding + col * cellSize, y = padding + row * cellSize, ms = Math.max(2, cellSize * 0.1);
        ctx.save();
        if (isRefined()) {
            RefinedRenderer.drawLastMoveMarker(ctx, row, col, padding, cellSize);
            ctx.restore();
            return;
        }
        ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(x, y, ms, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    function drawWinLine() {
        if (!winLine || winLine.length < 2) return;
        const useRefined = isRefined();
        const sorted = sortWinLine(winLine);
        if (!winLineAnim) winLineAnim = { startTime: performance.now(), duration: 600 };
        const elapsed = performance.now() - winLineAnim.startTime;
        const progress = Math.min(1, elapsed / winLineAnim.duration);

        // 精致模式使用专属渲染器
        if (useRefined && typeof RefinedRenderer.drawWinLineAnimated === 'function') {
            RefinedRenderer.drawWinLineAnimated(ctx, winLine, sorted, padding, cellSize, progress);
            if (progress < 1) rafId = requestAnimationFrame(drawBoard);
            return;
        }

        const eased = easeOutCubic(progress);
        const first = sorted[0], last = sorted[sorted.length - 1];
        for (let i = 0; i < sorted.length; i++) {
            const pp = i / (sorted.length - 1);
            if (pp <= eased) {
                const { row, col } = sorted[i];
                const wx = padding + col * cellSize, wy = padding + row * cellSize;
                const wr = Math.max(1, cellSize * 0.42);
                ctx.save();
                const ga = Math.min(1, (eased - pp) * 3);
                ctx.strokeStyle = `rgba(255,68,68,${ga * 0.8})`; ctx.lineWidth = 2.5;
                ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 8 * ga;
                ctx.beginPath(); ctx.arc(wx, wy, wr + 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            }
        }
        const endX = padding + first.col * cellSize + (last.col - first.col) * cellSize * eased;
        const endY = padding + first.row * cellSize + (last.row - first.row) * cellSize * eased;
        ctx.save(); ctx.strokeStyle = 'rgba(255,68,68,0.7)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(padding + first.col * cellSize, padding + first.row * cellSize);
        ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore();
        if (progress < 1) rafId = requestAnimationFrame(drawBoard);
    }

    function sortWinLine(line) {
        if (line.length < 2) return line;
        const sorted = [...line];
        const dr = Math.abs(line[1].row - line[0].row), dc = Math.abs(line[1].col - line[0].col);
        if (dr === 0) sorted.sort((a, b) => a.col - b.col);
        else if (dc === 0) sorted.sort((a, b) => a.row - b.row);
        else sorted.sort((a, b) => a.row - b.row);
        return sorted;
    }

    function getStarPoints() {
        const pts = [], c = Math.floor(boardSize / 2);
        pts.push({ row: c, col: c });
        if (boardSize >= 13) {
            const o = boardSize >= 15 ? 3 : 2;
            pts.push({ row: o, col: o }, { row: o, col: boardSize - 1 - o }, { row: boardSize - 1 - o, col: o }, { row: boardSize - 1 - o, col: boardSize - 1 - o });
        }
        if (boardSize >= 15) {
            const o = 3;
            pts.push({ row: o, col: c }, { row: boardSize - 1 - o, col: c }, { row: c, col: o }, { row: c, col: boardSize - 1 - o });
        }
        return pts;
    }

    // ========== 状态栏动画 ==========
    let statusAnimTimer = null;
    function animateStatusText(text) {
        if (statusAnimTimer) clearTimeout(statusAnimTimer);
        statusText.classList.remove('fade-in');
        statusText.classList.add('fade-out');
        statusAnimTimer = setTimeout(() => {
            statusText.textContent = text;
            statusText.classList.remove('fade-out');
            statusText.classList.add('fade-in');
            statusAnimTimer = setTimeout(() => {
                statusText.classList.remove('fade-in');
                statusAnimTimer = null;
            }, 350);
        }, 150);
    }
    function animateScorePop(el) {
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 400);
        const target = parseInt(el.textContent);
        if (isNaN(target)) return;
        const start = Math.max(0, target - 1);
        const duration = 300, startTime = performance.now();
        function roll(now) {
            const p = Math.min(1, (now - startTime) / duration);
            el.textContent = Math.round(start + (target - start) * easeOutCubic(p));
            if (p < 1) requestAnimationFrame(roll);
        }
        requestAnimationFrame(roll);
    }
    function animatePieceIndicator(piece) {
        currentPieceEl.classList.remove('bounce');
        currentPieceEl.className = 'piece ' + (piece === BLACK ? 'black' : 'white');
        void currentPieceEl.offsetWidth; currentPieceEl.classList.add('bounce');
    }

    // ========== 事件 ==========
    let lastTouchTime = 0;

    function bindEvents() {
        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        canvas.addEventListener('click', handleBoardClick);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseleave', handleMouseLeave);

        // 同步开屏动画设置面板状态
        if (typeof Splash !== 'undefined' && Splash.isSplashEnabled && !Splash.isSplashEnabled()) {
            const onBtn = document.querySelector('#splash-selector [data-splash="on"]');
            const offBtn = document.querySelector('#splash-selector [data-splash="off"]');
            if (onBtn) onBtn.classList.remove('active');
            if (offBtn) offBtn.classList.add('active');
        }

        // 预览全部开屏动画（刷新页面进入全量播放模式）
        const previewBtn = document.getElementById('btn-preview-all');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                const key = (typeof Splash !== 'undefined' && Splash.PREVIEW_SESSION_KEY) || 'gomoku_splash_preview_all';
                sessionStorage.setItem(key, 'true');
                window.location.reload();
            });
        }

        document.getElementById('btn-restart').addEventListener('click', restartGame);
        document.getElementById('btn-undo').addEventListener('click', undoMove);
        document.getElementById('btn-play-again').addEventListener('click', restartGame);
        document.getElementById('btn-theme').addEventListener('click', toggleTheme);

        document.getElementById('btn-settings').addEventListener('click', (e) => { e.stopPropagation(); settingsPanel.classList.remove('hidden'); playSound('click'); });
        document.getElementById('btn-close-settings').addEventListener('click', (e) => { e.stopPropagation(); closeSettings(); });
        document.getElementById('settings-mask').addEventListener('click', (e) => { e.stopPropagation(); closeSettings(); });
        // 暂停按钮
        if (btnBattlePause) {
            btnBattlePause.addEventListener('click', (e) => {
                e.stopPropagation();
                const isPaused = AIBattle.togglePause();
                battlePauseText.textContent = isPaused ? '继续' : '暂停';
                const pauseIcon = document.getElementById('btn-icon-pause');
                if (pauseIcon) pauseIcon.textContent = isPaused ? '▶' : '⏸';
                playSound('click');
                if (isPaused) animateStatusText('已暂停');
                else updateStatus();
            });
        }

        // 清除记忆按钮
        const btnClearMem = document.getElementById('btn-clear-memory');
        if (btnClearMem) {
            btnClearMem.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof GomokuMemory !== 'undefined') {
                    GomokuMemory.clearAll();
                    updateMemoryPanel();
                    playSound('click');
                }
            });
        }

        // 游戏模式切换（仅切换 UI 面板，应用时生效）
        setupOptionGroup('#mode-selector', (btn) => {
            const isBattle = btn.dataset.mode === 'battle';
            document.getElementById('pve-settings').classList.toggle('hidden', isBattle);
            document.getElementById('battle-settings').classList.toggle('hidden', !isBattle);
        });

        // 以下设置仅切换高亮，点击「应用设置」时统一生效
        setupOptionGroup('#difficulty-selector', null);
        setupOptionGroup('#first-selector', null);
        setupOptionGroup('#battle-first-selector', null);
        setupOptionGroup('#size-selector', null);
        setupOptionGroup('#sound-selector', null);
        setupOptionGroup('#perf-selector', (btn) => {
            // 显示/隐藏灵动岛风格选择器
            const styleItem = document.getElementById('island-style-item');
            if (styleItem) styleItem.style.display = btn.dataset.perf === 'on' ? '' : 'none';
        });
        setupOptionGroup('#glass-selector', null);
        setupOptionGroup('#island-style-selector', (btn) => {
            // 实时切换灵动岛风格（无需点击"应用设置"）
            const style = btn.dataset.style;
            if (!style) return;
            try { localStorage.setItem('gomoku-island-style', style); } catch {}
            document.documentElement.setAttribute('data-style', style);
            if (typeof IslandAnimation !== 'undefined' && IslandAnimation.setRefinedStyle) {
                IslandAnimation.setRefinedStyle(style);
            }
            // 清除棋盘缓存并重绘（风格影响棋盘颜色）
            if (typeof RefinedRenderer !== 'undefined' && RefinedRenderer.isActive && RefinedRenderer.isActive()) {
                RefinedRenderer.activate(); // 清除缓存
            }
            if (typeof drawBoard === 'function') drawBoard();
        });
        setupOptionGroup('#speed-selector', null);
        setupOptionGroup('#auto-selector', null);
        setupOptionGroup('#memory-selector', null);
        setupOptionGroup('#pve-memory-selector', null);
        setupOptionGroup('#extreme-selector', null);

        // 应用设置按钮
        document.getElementById('btn-apply-settings').addEventListener('click', (e) => {
            e.stopPropagation();
            closeSettings();
            restartGame();
        });

        window.addEventListener('resize', debounce(() => { dpr = Math.min(window.devicePixelRatio || 1, 2); setupCanvas(); drawBoard(); }, 200));
        document.addEventListener('keydown', handleKeydown);

        // 按钮涟漪追踪
        document.querySelectorAll('.btn-primary, .btn-secondary, .opt-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const rect = this.getBoundingClientRect();
                this.style.setProperty('--ripple-x', (e.clientX - rect.left) + 'px');
                this.style.setProperty('--ripple-y', (e.clientY - rect.top) + 'px');
                this.classList.remove('ripple'); void this.offsetWidth; this.classList.add('ripple');
                setTimeout(() => this.classList.remove('ripple'), 600);
            });
        });
        // 思考指示器跳动点
        if (thinkingEl && !thinkingEl.querySelector('.thinking-dots')) {
            const dots = document.createElement('span');
            dots.className = 'thinking-dots';
            dots.innerHTML = '<span></span><span></span><span></span>';
            thinkingEl.appendChild(dots);
        }
    }

    function setupOptionGroup(sel, cb) {
        const c = document.querySelector(sel); if (!c) return;
        c.querySelectorAll('.opt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                c.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
                c.querySelectorAll('.opt-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                playSound('click'); vibrate(5);
                if (cb) cb(btn);
            });
        });
    }

    function closeSettings() {
        settingsPanel.classList.add('closing');
        setTimeout(() => {
            settingsPanel.classList.remove('closing');
            settingsPanel.classList.add('hidden');
        }, 200);
    }

    /**
     * 统一应用所有设置（点击「应用设置」时调用）
     */
    function applyAllSettings() {
        try {
        // 难度
        const diffBtn = document.querySelector('#difficulty-selector .opt-btn.active');
        if (diffBtn) GomokuAI.setDifficulty(parseInt(diffBtn.dataset.level));

        // 先手（人机模式）
        const af = document.querySelector('#first-selector .opt-btn.active');
        if (af && af.dataset.first === 'ai') { playerPiece = WHITE; aiPiece = BLACK; }
        else { playerPiece = BLACK; aiPiece = WHITE; }

        // 先手（AI 对决模式）
        const bfBtn = document.querySelector('#battle-first-selector .opt-btn.active');
        if (bfBtn) {
            battleFirstPiece = bfBtn.dataset.bfirst === 'white' ? WHITE : BLACK;
            AIBattle.setBattleFirstPiece(battleFirstPiece);
        }

        // 棋盘大小
        const sizeBtn = document.querySelector('#size-selector .opt-btn.active');
        if (sizeBtn) boardSize = parseInt(sizeBtn.dataset.size);

        // 音效
        const soundBtn = document.querySelector('#sound-selector .opt-btn.active');
        soundEnabled = soundBtn && soundBtn.dataset.sound === 'on';

        // 渲染模式
        const perfBtn = document.querySelector('#perf-selector .opt-btn.active');
        applyPerfMode(perfBtn && perfBtn.dataset.perf === 'on');

        // 灵动岛风格（精致模式下）
        if (perfMode) {
            const styleBtn = document.querySelector('#island-style-selector .opt-btn.active');
            const style = styleBtn ? styleBtn.dataset.style : 'luxury';
            try { localStorage.setItem('gomoku-island-style', style); } catch {}
            if (typeof IslandAnimation !== 'undefined' && IslandAnimation.setRefinedStyle) {
                IslandAnimation.setRefinedStyle(style);
                document.documentElement.setAttribute('data-style', style);
            }
        }

        // 开屏动画开关
        const splashBtn = document.querySelector('#splash-selector .opt-btn.active');
        if (typeof Splash !== 'undefined' && Splash.setSplashEnabled) {
            Splash.setSplashEnabled(splashBtn && splashBtn.dataset.splash === 'on');
        }

        // 灵动岛毛玻璃
        applyGlassMode();

        // 对弈速度
        const speedBtn = document.querySelector('#speed-selector .opt-btn.active');
        if (speedBtn) AIBattle.setSpeed(parseInt(speedBtn.dataset.speed));

        // 自动连续对弈
        const autoBtn = document.querySelector('#auto-selector .opt-btn.active');
        autoMode = autoBtn && autoBtn.dataset.auto === 'on';
        AIBattle.setAutoMode(autoMode);

        // 记忆开关（按模式分别设置）
        if (battleMode) {
            const memBtn = document.querySelector('#memory-selector .opt-btn.active');
            GomokuAI.setMemoryEnabled(memBtn && memBtn.dataset.memory === 'on');
        } else {
            const pveMemBtn = document.querySelector('#pve-memory-selector .opt-btn.active');
            GomokuAI.setMemoryEnabled(pveMemBtn && pveMemBtn.dataset.memory === 'on');
        }

        // 极限模式（人机模式）
        const extremeBtn = document.querySelector('#extreme-selector .opt-btn.active');
        const extremeRequested = extremeBtn && extremeBtn.dataset.extreme === 'on';
        if (!battleMode && extremeRequested) {
            if (typeof AIExtreme !== 'undefined') {
                if (!AIExtreme.isEnabled()) {
                    // 首次开启，弹窗确认
                    if (confirm('⚠️ 极限模式\n\n6个AI同时运算 · 攻势95% · 深度搜索\nAI将变得极其强大，确定开启吗？')) {
                        AIExtreme.setEnabled(true);
                        try { localStorage.setItem('gomoku-extreme', 'true'); } catch {}
                        GomokuAI.setMemoryEnabled(true); // 极限模式强制开启记忆
                    } else {
                        // 用户取消，恢复关闭状态
                        document.querySelector('#extreme-selector .opt-btn[data-extreme="off"]').click();
                    }
                }
            }
        } else if (typeof AIExtreme !== 'undefined') {
            AIExtreme.setEnabled(false);
            try { localStorage.setItem('gomoku-extreme', 'false'); } catch {}
        }
        } catch (e) {
            console.warn('[Game] applyAllSettings error:', e);
        }
    }

    function handleTouch(e) { e.preventDefault(); lastTouchTime = Date.now(); const t = e.touches[0], rect = canvas.getBoundingClientRect(); processInput(t.clientX - rect.left, t.clientY - rect.top); }
    function handleBoardClick(e) { if (Date.now() - lastTouchTime < 400) return; const rect = canvas.getBoundingClientRect(); processInput(e.clientX - rect.left, e.clientY - rect.top); }
    function handleMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const col = Math.round((e.clientX - rect.left - padding) / cellSize);
        const row = Math.round((e.clientY - rect.top - padding) / cellSize);
        if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
            if (!hoverPos || hoverPos.row !== row || hoverPos.col !== col) {
                // Clear previous hover
                if (hoverPos) {
                    const oldX = padding + hoverPos.col * cellSize;
                    const oldY = padding + hoverPos.row * cellSize;
                    const r = Math.max(1, cellSize * 0.43) + 2;
                    ctx.clearRect(oldX - r, oldY - r, r * 2, r * 2);
                    // Redraw the cell area (grid lines + any piece)
                    redrawCell(hoverPos.row, hoverPos.col);
                }
                hoverPos = { row, col };
                drawHoverPiece(row, col);
            }
        } else if (hoverPos) {
            const oldX = padding + hoverPos.col * cellSize;
            const oldY = padding + hoverPos.row * cellSize;
            const r = Math.max(1, cellSize * 0.43) + 2;
            ctx.clearRect(oldX - r, oldY - r, r * 2, r * 2);
            redrawCell(hoverPos.row, hoverPos.col);
            hoverPos = null;
        }
    }
    function handleMouseLeave() {
        if (hoverPos) {
            const oldX = padding + hoverPos.col * cellSize;
            const oldY = padding + hoverPos.row * cellSize;
            const r = Math.max(1, cellSize * 0.43) + 2;
            ctx.clearRect(oldX - r, oldY - r, r * 2, r * 2);
            redrawCell(hoverPos.row, hoverPos.col);
            hoverPos = null;
        }
    }
    function redrawCell(row, col) {
        const x = padding + col * cellSize, y = padding + row * cellSize;
        const useRefined = isRefined();
        const halfCell = cellSize / 2 + 1;

        // Redraw grid lines through this cell
        ctx.strokeStyle = useRefined ? 'rgba(60, 40, 10, 0.5)' : 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = useRefined ? 0.6 : 0.8;
        ctx.beginPath();
        ctx.moveTo(padding, y); ctx.lineTo(padding + (boardSize - 1) * cellSize, y);
        ctx.moveTo(x, padding); ctx.lineTo(x, padding + (boardSize - 1) * cellSize);
        ctx.stroke();

        // Redraw piece if present
        if (board[row][col] !== EMPTY) {
            drawPiece(row, col, board[row][col], 1);
        }

        // Redraw last move marker if this is the last move
        if (moveHistory.length > 0 && !winLine) {
            const last = moveHistory[moveHistory.length - 1];
            if (last.row === row && last.col === col) {
                drawLastMoveMarker(row, col);
            }
        }
    }
    function handleKeydown(e) { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoMove(); } }

    function processInput(x, y) {
        if (gameOver || aiThinking || !playerControl || battleMode) return;
        const col = Math.round((x - padding) / cellSize);
        const row = Math.round((y - padding) / cellSize);
        if (row < 0 || row >= boardSize || col < 0 || col >= boardSize || board[row][col] !== EMPTY) return;
        hoverPos = null;
        makeMove(row, col, currentPlayer);
        // 记录用户落子到战术引擎
        if (typeof AITactics !== 'undefined') AITactics.recordPlayerMove(row, col);
        // 大管家：记录用户落子，更新用户画像
        if (typeof AIManager !== 'undefined') AIManager.onPlayerMove(row, col);
        playSound('place'); vibrate(15);
        if (checkGameEnd(row, col, currentPlayer)) return;
        currentPlayer = currentPlayer === BLACK ? WHITE : BLACK;
        updateStatus();
        aiThinking = true; thinkingEl.classList.remove('hidden');
        setTimeout(aiMovePvE, 300);
    }

    // 快速获取候选位置（仅遍历已有棋子的邻居）
    function getCandidatesFast(board, size) {
        const map = new Map();
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === EMPTY) {
                            const key = nr * size + nc;
                            if (!map.has(key)) map.set(key, { row: nr, col: nc });
                        }
                    }
                }
            }
        }
        return Array.from(map.values());
    }

    // 快速检查某位置是否五连
    function checkWinAt(board, row, col, piece, size) {
        const dirs = [[1,0],[0,1],[1,1],[1,-1]];
        for (const [dr, dc] of dirs) {
            let count = 1;
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
            if (count >= 5) return true;
        }
        return false;
    }

    function aiMovePvE() {
        aiThinking = true; thinkingEl.classList.remove('hidden');
        setTimeout(() => {
            try {
                let move = null;
                GomokuAI.setAIPiece(aiPiece);

                // 策略：先检查即时胜/防，再用 GomokuAI 快速获取结果
                const playerP = aiPiece === BLACK ? WHITE : BLACK;
                const cands = getCandidatesFast(board, boardSize);

                // 1. AI 一步胜
                for (const c of cands) {
                    board[c.row][c.col] = aiPiece;
                    if (checkWinAt(board, c.row, c.col, aiPiece, boardSize)) {
                        board[c.row][c.col] = EMPTY; move = c; break;
                    }
                    board[c.row][c.col] = EMPTY;
                }
                // 2. 对手一步胜 → 必须堵
                if (!move) {
                    for (const c of cands) {
                        board[c.row][c.col] = playerP;
                        if (checkWinAt(board, c.row, c.col, playerP, boardSize)) {
                            board[c.row][c.col] = EMPTY; move = c; break;
                        }
                        board[c.row][c.col] = EMPTY;
                    }
                }
                // 3. GomokuAI 标准搜索（快速可靠）
                if (!move) move = GomokuAI.getBestMove(board);

                // 极限模式增强
                if (typeof AIExtreme !== 'undefined' && AIExtreme.isEnabled && AIExtreme.isEnabled()) {
                    try {
                        const extremeMove = AIExtreme.getBestMove(board, aiPiece, boardSize);
                        if (extremeMove) move = extremeMove;
                    } catch (e) {
                        console.warn('[Game] AIExtreme error, fallback to standard AI:', e);
                    }
                }

                if (!move) { aiThinking = false; thinkingEl.classList.add('hidden'); return; }
                makeMove(move.row, move.col, aiPiece);
                playSound('place'); vibrate(10);
                aiThinking = false; thinkingEl.classList.add('hidden');
                if (checkGameEnd(move.row, move.col, aiPiece)) return;
                currentPlayer = playerPiece; updateStatus();
            } catch (e) {
                console.error('[AI] aiMovePvE error:', e);
                aiThinking = false; thinkingEl.classList.add('hidden');
                updateStatus();
            }
        }, 50);
    }

    function makeMove(row, col, piece) {
        board[row][col] = piece;
        moveHistory.push({ row, col, piece });
        moveNumEl.textContent = moveHistory.length;
        if (perfMode) {
            if (rafId) cancelAnimationFrame(rafId);
            animatingPiece = { row, col, piece, startTime: performance.now(), duration: 320 };
        }
        startPlaceRipple(row, col, piece);
        drawBoard();
    }

    function checkGameEnd(row, col, piece) {
        if (GomokuAI.checkWin(board, row, col, piece, boardSize)) {
            gameOver = true;
            winLine = GomokuAI.getWinLine(board, row, col, piece, boardSize);
            drawBoard();
            if (battleMode) {
                const winner = piece === BLACK ? '⚫ 黑棋' : '⚪ 白棋';
                if (piece === BLACK) scores.player++; else scores.ai++;
                showWinOverlay(`${winner} 获胜！`, '🤖', `共 ${moveHistory.length} 手`);
                playSound('win'); vibrate([50, 100, 50]);
            } else {
                if (piece === playerPiece) {
                    scores.player++;
                    showWinOverlay('你赢了！', '🏆', `共 ${moveHistory.length} 手`);
                    playSound('win'); vibrate([50, 100, 50, 100, 50]);
                } else {
                    scores.ai++;
                    showWinOverlay('AI 赢了！', '🤖', `共 ${moveHistory.length} 手`);
                    playSound('lose'); vibrate([100, 50, 100]);
                }
            }
            animateScorePop(piece === playerPiece || (battleMode && piece === BLACK) ? playerWinsEl : aiWinsEl);
            updateScoreBoard();
            // 记录对局到记忆系统（AI对决模式由 ai-battle.js 统一记录，避免重复）
            if (!battleMode && typeof GomokuMemory !== 'undefined' && GomokuAI.isMemoryEnabled()) {
                GomokuMemory.recordGame(getGameResult());
            }
            // 大管家：记录对局结果，更新用户画像
            if (typeof AIManager !== 'undefined') {
                AIManager.onGameEnd(getGameResult(), moveHistory, boardSize);
            }
            // 更新记忆面板
            updateMemoryPanel();
            return true;
        }
        if (moveHistory.length >= boardSize * boardSize) {
            gameOver = true; scores.draw++;
            showWinOverlay('平局！', '🤝', '棋盘已满');
            playSound('draw'); vibrate([30, 30, 30]);
            animateScorePop(drawsEl);
            updateScoreBoard();
            // 记录平局到记忆系统（AI对决模式由 ai-battle.js 统一记录）
            if (!battleMode && typeof GomokuMemory !== 'undefined' && GomokuAI.isMemoryEnabled()) {
                GomokuMemory.recordGame(getGameResult());
            }
            if (typeof AIManager !== 'undefined') {
                AIManager.onGameEnd(getGameResult(), moveHistory, boardSize);
            }
            updateMemoryPanel();
            return true;
        }
        return false;
    }

    function showWinOverlay(text, icon, detail) {
        winText.textContent = text; winIcon.textContent = icon; winDetail.textContent = detail || '';
        winOverlay.classList.remove('hidden');
        // 重新触发入场动画
        winOverlay.style.animation = 'none';
        void winOverlay.offsetWidth;
        winOverlay.style.animation = '';
        // 内容延迟入场
        const content = document.getElementById('win-content');
        if (content) {
            content.style.animation = 'none';
            void content.offsetWidth;
            content.style.animation = '';
        }
    }

    function updateStatus() {
        if (gameOver) { animateStatusText('游戏结束'); return; }
        if (battleMode) {
            const name = currentPlayer === BLACK ? '⚫ 黑棋' : '⚪ 白棋';
            animateStatusText(`${name} 思考中...`);
            animatePieceIndicator(currentPlayer);
            return;
        }
        if (aiThinking) { animateStatusText('AI 思考中...'); animatePieceIndicator(aiPiece); return; }
        if (currentPlayer === playerPiece) { animateStatusText('你的回合'); animatePieceIndicator(playerPiece); }
        else { animateStatusText('AI 的回合'); animatePieceIndicator(aiPiece); }
    }

    function updateScoreBoard() { playerWinsEl.textContent = scores.player; aiWinsEl.textContent = scores.ai; drawsEl.textContent = scores.draw; }

    // ========== 游戏操作 ==========
    function restartGame() {
        AIBattle.stop();

        const modeBtn = document.querySelector('#mode-selector .opt-btn.active');
        const isBattle = modeBtn && modeBtn.dataset.mode === 'battle';
        setBattleMode(isBattle);

        // 统一读取所有设置
        applyAllSettings();

        // 自动徽章
        if (autoBadge) autoBadge.classList.toggle('visible', isBattle && autoMode);

        // 先手（已在 applyAllSettings 中设置，无需重复读取）
        if (isBattle) {
            playerPiece = BLACK; aiPiece = WHITE;
        }
        // playerPiece 和 aiPiece 已由 applyAllSettings() 正确设置

        // 重置暂停按钮
        if (btnBattlePause && isBattle) {
            battlePauseText.textContent = '暂停';
            const pauseIcon = document.getElementById('btn-icon-pause');
            if (pauseIcon) pauseIcon.textContent = '⏸';
        }

        initBoard(); setupCanvas(); drawBoard(); updateStatus();
        playSound('gamestart');

        if (isBattle) {
            setTimeout(() => AIBattle.start({ isGameOver, aiAutoMove, setPlayerControl, getGameResult, autoRestart, setBattleFirst }), 500);
        } else if (aiPiece === BLACK) {
            currentPlayer = aiPiece; aiThinking = true;
            thinkingEl.classList.remove('hidden'); updateStatus();
            setTimeout(aiMovePvE, 500);
        }
    }

    function undoMove() {
        if (gameOver || aiThinking || battleMode || moveHistory.length < 2) return;
        for (let i = 0; i < 2 && moveHistory.length > 0; i++) {
            const last = moveHistory.pop(); board[last.row][last.col] = EMPTY;
        }
        // 撤销战术引擎中的玩家落子记录
        if (typeof AITactics !== 'undefined' && AITactics.undoLastPlayerMove) {
            AITactics.undoLastPlayerMove();
        }
        currentPlayer = playerPiece; winLine = null; hoverPos = null; animatingPiece = null;
        moveNumEl.textContent = moveHistory.length;
        drawBoard(); updateStatus(); playSound('undo'); vibrate(10);
    }

    function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }

    // ========== 启动 ==========
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
