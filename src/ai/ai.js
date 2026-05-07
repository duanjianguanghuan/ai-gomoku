/**
 * AI 五子棋 - AI 模块 v11（性能优化版）
 * 基于 v10 全面优化升级
 * 
 * v11 核心优化：
 *   - 集成 AIUtils 高性能工具函数
 *   - 添加性能监控和超时控制
 *   - 优化 Minimax 搜索排序
 *   - 添加早期终止条件
 *   - 减少重复计算
 */

const GomokuAI = (() => {
    'use strict';

    const EMPTY = 0, BLACK = 1, WHITE = 2;

    // 专业级棋型评分
    const SCORES = {
        FIVE:           10000000,
        LIVE_FOUR:      1000000,
        RUSH_FOUR_LIVE: 500000,
        DOUBLE_FOUR:    200000,
        DOUBLE_THREE:   100000,
        LIVE_THREE:     15000,
        RUSH_FOUR:      8000,
        SLEEP_THREE:    1000,
        JUMP_LIVE_TWO:  500,
        LIVE_TWO:       350,
        BIG_JUMP_TWO:   200,
        SLEEP_TWO:      100,
        LIVE_ONE:       20,
    };

    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // 难度配置
    const DIFFICULTY_CONFIG = {
        1: { depth: 2, candidates: 15, usePattern: true, useStrategy: false, useTactics: true, name: '简单' },
        2: { depth: 3, candidates: 18, usePattern: true, useStrategy: true, useTactics: true, name: '中等' },
        3: { depth: 3, candidates: 15, usePattern: true, useStrategy: true, useTactics: true, name: '困难' },
    };

    let difficulty = 2, aiPiece = WHITE, playerPiece = BLACK;
    let memoryEnabled = true;
    let tacticalWeights = { attackWeight: 1.5, defenseWeight: 0.8 };
    let memBonusFn = null;
    
    // 性能限制
    const MAX_NODES = 300000;
    const MAX_VCT_NODES = 50000;
    const MAX_TIME_MS = 5000; // 5秒超时限制
    let nodeCount = 0;
    let vctNodeCount = 0;
    let lastThinkTime = 0;

    // 缓存
    const evalCache = new Map();
    const moveOrderCache = new Map();

    // 开局库
    const OPENING_BOOK = {
        15: [
            { moves: [[7,7]], responses: [[6,6],[8,8],[6,8],[8,6],[7,8],[8,7],[6,7],[7,6]], type: 'huayue' },
            { moves: [[7,7]], responses: [[7,9],[7,5],[9,7],[5,7],[6,8],[8,6]], type: 'puyue' },
            { moves: [[7,7]], responses: [[7,8],[8,7],[6,6],[8,8]], type: 'canyue' },
            { moves: [[7,7]], responses: [[6,8],[8,6],[8,8],[6,6],[7,9],[7,5]], type: 'xiyue' },
        ],
        13: [
            { moves: [[6,6]], responses: [[5,5],[7,7],[5,7],[7,5],[6,7],[7,6],[6,5],[5,6]], type: 'standard' },
        ],
        19: [
            { moves: [[9,9]], responses: [[8,8],[10,10],[8,10],[10,8],[9,10],[10,9],[8,9],[9,8]], type: 'standard' },
        ],
    };

    function setDifficulty(level) { difficulty = level; }
    function setAIPiece(piece) { aiPiece = piece; playerPiece = piece === BLACK ? WHITE : BLACK; }
    function setMemoryEnabled(enabled) { memoryEnabled = enabled; }
    function isMemoryEnabled() { return memoryEnabled; }

    function updateTacticalWeights(weights) {
        if (weights) {
            tacticalWeights.attackWeight = weights.attackWeight || 1.0;
            tacticalWeights.defenseWeight = weights.defenseWeight || 1.0;
        }
    }

    // 辅助函数：复用 AIUtils
    function checkWin(board, row, col, piece, size) {
        return AIUtils.checkWin(board, row, col, piece, size);
    }

    function isBoardEmpty(board, size) {
        return AIUtils.isBoardEmpty(board, size);
    }

    function getCandidates(board, size, maxCandidates) {
        const moves = AIUtils.getValidMoves(board, size, 2);
        if (moves.length <= maxCandidates) return moves;

        // 快速排序：优先中心位置
        const center = (size - 1) / 2;
        moves.sort((a, b) => {
            const da = Math.abs(a.row - center) + Math.abs(a.col - center);
            const db = Math.abs(b.row - center) + Math.abs(b.col - center);
            return da - db;
        });

        return moves.slice(0, maxCandidates);
    }

    function moveCount(board, size) {
        let count = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) count++;
            }
        }
        return count;
    }

    function getOpeningMove(board, size) {
        if (typeof GomokuMemory !== 'undefined' && GomokuMemory.getMemoryOpening) {
            const memOpen = GomokuMemory.getMemoryOpening(size);
            if (memOpen && board[memOpen.row][memOpen.col] === EMPTY) return memOpen;
        }

        const book = OPENING_BOOK[size];
        if (!book) return null;

        const moves = [];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) moves.push([r, c]);
            }
        }

        if (moves.length === 0) return null;

        for (const entry of book) {
            for (const firstMove of entry.moves) {
                if (board[firstMove[0]][firstMove[1]] !== EMPTY) {
                    for (const resp of entry.responses) {
                        if (board[resp[0]][resp[1]] === EMPTY) return { row: resp[0], col: resp[1] };
                    }
                }
            }
        }

        return null;
    }

    function getBestMove(board) {
        const startTime = performance.now();
        const size = board.length;
        const config = DIFFICULTY_CONFIG[difficulty];

        // 清空缓存
        evalCache.clear();
        nodeCount = 0;
        vctNodeCount = 0;

        // 空棋盘：下天元
        if (isBoardEmpty(board, size)) {
            if (memoryEnabled && typeof GomokuMemory !== 'undefined' && GomokuMemory.getMemoryOpening) {
                const memOpen = GomokuMemory.getMemoryOpening(size);
                if (memOpen && board[memOpen.row][memOpen.col] === EMPTY) return memOpen;
            }
            const c = Math.floor(size / 2);
            return { row: c, col: c };
        }

        // 第二手：使用专业开局库
        if (moveCount(board, size) === 1) {
            const opening = getOpeningMove(board, size);
            if (opening) return opening;
        }

        // 获取战术权重
        if (config.useTactics && typeof AITactics !== 'undefined' && AITactics.getTacticalWeights) {
            const tactics = AITactics.getTacticalWeights(board, aiPiece, size);
            updateTacticalWeights(tactics);
        }

        const candidates = getCandidates(board, size, config.candidates);
        if (candidates.length === 0) { const c = Math.floor(size / 2); return { row: c, col: c }; }

        // 预计算记忆加成
        memBonusFn = null;
        if (memoryEnabled && typeof GomokuMemory !== 'undefined' && GomokuMemory.getMemoryBonus) {
            memBonusFn = GomokuMemory.getMemoryBonus(aiPiece);
        }

        // === 优先级检查 ===
        // 1. AI 直接获胜
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            if (checkWin(board, row, col, aiPiece, size)) { board[row][col] = EMPTY; return { row, col }; }
            board[row][col] = EMPTY;
        }

        // 2. 防守对手五连
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            if (checkWin(board, row, col, playerPiece, size)) { board[row][col] = EMPTY; return { row, col }; }
            board[row][col] = EMPTY;
        }

        // 3. AI 形成必胜棋型
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            const t = countThreatsPro(board, row, col, aiPiece, size);
            board[row][col] = EMPTY;
            if (t.liveFours > 0 || t.rushFours >= 2 || t.rushFourLiveThree || t.doubleThrees) {
                return { row, col };
            }
        }

        // 4. 防守对手必胜棋型
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            const t = countThreatsPro(board, row, col, playerPiece, size);
            board[row][col] = EMPTY;
            if (t.liveFours > 0 || t.rushFours >= 2 || t.rushFourLiveThree || t.doubleThrees) {
                return { row, col };
            }
        }

        // 5. VCT 连续进攻检测
        const vctMove = detectVCT(board, aiPiece, size, 3);
        if (vctMove) return vctMove;

        // 6. 多点击杀检测
        const multiKillMove = detectMultiKill(board, aiPiece, size, candidates);
        if (multiKillMove) return multiKillMove;

        // 7. Minimax 搜索
        nodeCount = 0;
        vctNodeCount = 0;
        let bestScore = -Infinity, bestMove = candidates[0];

        for (const { row, col } of candidates) {
            // 超时检查
            if (performance.now() - startTime > MAX_TIME_MS) {
                console.warn('[AI] Timeout reached, returning best move so far');
                break;
            }

            board[row][col] = aiPiece;
            const score = minimax(board, config.depth - 1, false, -Infinity, Infinity, size);
            board[row][col] = EMPTY;

            if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
            else if (score === bestScore && memBonusFn) {
                const curMem = memBonusFn(row, col);
                const bestMem = memBonusFn(bestMove.row, bestMove.col);
                if (curMem > bestMem) { bestScore = score; bestMove = { row, col }; }
            }
        }

        // 8. 模式识别共识
        if (config.usePattern && typeof AIPattern !== 'undefined' && AIPattern.getSuggestion) {
            const patternSuggestion = AIPattern.getSuggestion(board, aiPiece);
            if (patternSuggestion) {
                const consensus = AIPattern.consensus ? AIPattern.consensus(bestMove, patternSuggestion, board, aiPiece) : null;
                if (consensus) bestMove = consensus;
            }
        }

        // 9. 策略共识
        if (config.useStrategy && typeof AIStrategy !== 'undefined' && AIStrategy.getStrategicMove) {
            const strategic = AIStrategy.getStrategicMove(board, aiPiece, size, tacticalWeights);
            if (strategic && strategic.confidence > 55) {
                const stratMove = { row: strategic.row, col: strategic.col };
                if (typeof AIPattern !== 'undefined' && AIPattern.consensus) {
                    const consensus = AIPattern.consensus(bestMove, stratMove, board, aiPiece);
                    if (consensus) bestMove = consensus;
                }
            }
        }

        lastThinkTime = performance.now() - startTime;
        console.log(`[AI] Think time: ${lastThinkTime.toFixed(2)}ms, nodes: ${nodeCount}`);

        return bestMove;
    }

    // 威胁计数
    function countThreatsPro(board, row, col, piece, size) {
        let liveFours = 0, rushFours = 0, liveThrees = 0, sleepThrees = 0, liveTwos = 0;
        let rushFourLiveThree = false, doubleThrees = false;

        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirPro(board, row, col, dr, dc, piece, size);
            if (info.count >= 5) continue;
            if (info.count === 4) {
                if (info.openEnds === 2) liveFours++;
                else if (info.openEnds === 1) rushFours++;
            }
            if (info.count === 3 && info.openEnds === 2) liveThrees++;
            if (info.count === 3 && info.openEnds === 1) sleepThrees++;
            if (info.count === 2 && info.openEnds === 2) liveTwos++;
        }

        if (rushFours >= 1 && liveThrees >= 1) rushFourLiveThree = true;
        if (liveThrees >= 2) doubleThrees = true;

        return { liveFours, rushFours, liveThrees, sleepThrees, liveTwos, rushFourLiveThree, doubleThrees };
    }

    function analyzeDirPro(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) { jumps++; jr += dr; jc += dc; }
        }
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        return { count, openEnds, jumps };
    }

    // VCT 检测
    function findWinMove(board, piece, size) {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) continue;
                board[r][c] = piece;
                if (checkWin(board, r, c, piece, size)) { board[r][c] = EMPTY; return { row: r, col: c }; }
                board[r][c] = EMPTY;
            }
        }
        return null;
    }

    function detectVCT(board, piece, size, maxDepth) {
        const opp = piece === BLACK ? WHITE : BLACK;
        const candidates = getCandidates(board, size, 15);

        for (const { row, col } of candidates) {
            if (++vctNodeCount >= MAX_VCT_NODES) return null;
            board[row][col] = piece;
            const t = countThreatsPro(board, row, col, piece, size);
            if (t.liveFours > 0) { board[row][col] = EMPTY; return { row, col }; }
            if (t.rushFourLiveThree || t.doubleThrees || t.rushFours >= 2) { board[row][col] = EMPTY; return { row, col }; }
            if (t.liveThrees >= 1 && maxDepth > 1) {
                const oppBlock = findBestDefense(board, piece, opp, size);
                if (oppBlock) {
                    board[oppBlock.row][oppBlock.col] = opp;
                    const oppWinMove = findWinMove(board, opp, size);
                    if (oppWinMove) { board[oppBlock.row][oppBlock.col] = EMPTY; board[row][col] = EMPTY; continue; }
                    const nextVCT = detectVCT(board, piece, size, maxDepth - 1);
                    board[oppBlock.row][oppBlock.col] = EMPTY;
                    if (nextVCT) { board[row][col] = EMPTY; return { row, col }; }
                }
            }
            board[row][col] = EMPTY;
        }
        return null;
    }

    function findBestDefense(board, piece, opp, size) {
        const candidates = getCandidates(board, size, 10);
        let bestScore = -1, bestMove = candidates[0] || null;
        for (const { row, col } of candidates) {
            board[row][col] = opp;
            const t = countThreatsPro(board, row, col, opp, size);
            board[row][col] = EMPTY;
            let score = 0;
            if (t.liveFours > 0) score = 100000;
            else if (t.rushFourLiveThree) score = 50000;
            else if (t.rushFours >= 2) score = 30000;
            else if (t.doubleThrees) score = 20000;
            else if (t.liveThrees >= 1) score = 5000;
            if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
        }
        return bestMove;
    }

    function detectMultiKill(board, piece, size, candidates) {
        let bestMove = null, bestKillCount = 0;

        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const t = countThreatsPro(board, row, col, piece, size);
            let killCount = t.liveFours * 3 + t.rushFours * 2 + t.liveThrees * 1;
            if (t.rushFourLiveThree) killCount += 5;
            if (t.doubleThrees) killCount += 4;
            board[row][col] = EMPTY;

            if (killCount >= 3 && killCount > bestKillCount) {
                bestKillCount = killCount;
                bestMove = { row, col };
            }
        }
        return bestMove;
    }

    // Minimax with Alpha-Beta pruning
    function minimax(board, depth, isMax, alpha, beta, size) {
        nodeCount++;
        if (nodeCount >= MAX_NODES) return evaluateBoard(board, size);
        if (depth === 0) return evaluateBoard(board, size);

        const config = DIFFICULTY_CONFIG[difficulty];
        const candidates = getCandidates(board, size, Math.min(config.candidates, 12));
        if (candidates.length === 0) return evaluateBoard(board, size);

        // 快速排序以优化剪枝
        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            moveOrderCache.set(key, quickEval(board, row, col, size));
        }
        candidates.sort((a, b) => {
            const sa = moveOrderCache.get(`${a.row},${a.col}`) || 0;
            const sb = moveOrderCache.get(`${b.row},${b.col}`) || 0;
            return sb - sa;
        });
        moveOrderCache.clear();

        if (isMax) {
            let maxScore = -Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = aiPiece;
                if (checkWin(board, row, col, aiPiece, size)) { board[row][col] = EMPTY; return SCORES.FIVE; }
                const t = countThreatsPro(board, row, col, aiPiece, size);
                if (t.liveFours > 0 || t.rushFourLiveThree) { board[row][col] = EMPTY; return SCORES.RUSH_FOUR_LIVE; }
                if (t.doubleThrees || t.rushFours >= 2) { board[row][col] = EMPTY; return SCORES.DOUBLE_FOUR; }
                const score = minimax(board, depth - 1, false, alpha, beta, size);
                board[row][col] = EMPTY;
                maxScore = Math.max(maxScore, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
                if (nodeCount >= MAX_NODES) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = playerPiece;
                if (checkWin(board, row, col, playerPiece, size)) { board[row][col] = EMPTY; return -SCORES.FIVE; }
                const t = countThreatsPro(board, row, col, playerPiece, size);
                if (t.liveFours > 0 || t.rushFourLiveThree) { board[row][col] = EMPTY; return -SCORES.RUSH_FOUR_LIVE; }
                if (t.doubleThrees || t.rushFours >= 2) { board[row][col] = EMPTY; return -SCORES.DOUBLE_FOUR; }
                const score = minimax(board, depth - 1, true, alpha, beta, size);
                board[row][col] = EMPTY;
                minScore = Math.min(minScore, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
                if (nodeCount >= MAX_NODES) break;
            }
            return minScore;
        }
    }

    function evaluateBoard(board, size) {
        let aiScore = 0, playerScore = 0;
        let aiHasFive = false, playerHasFive = false;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                const piece = board[r][c], isAI = piece === aiPiece;
                for (const [dr, dc] of DIRECTIONS) {
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === piece) continue;
                    const score = evaluateLinePro(board, r, c, dr, dc, piece, size);
                    if (isAI) {
                        aiScore += score;
                        if (score >= SCORES.FIVE) aiHasFive = true;
                    } else {
                        playerScore += score;
                        if (score >= SCORES.FIVE) playerHasFive = true;
                    }
                }
            }
        }

        if (aiHasFive) return SCORES.FIVE;
        if (playerHasFive) return -SCORES.FIVE;
        return aiScore - playerScore;
    }

    function evaluateLinePro(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        if (count >= 5) return SCORES.FIVE;
        if (openEnds === 0) return 0;

        switch (count) {
            case 4: return openEnds === 2 ? SCORES.LIVE_FOUR : SCORES.RUSH_FOUR;
            case 3: return openEnds === 2 ? SCORES.LIVE_THREE : SCORES.SLEEP_THREE;
            case 2: return openEnds === 2 ? SCORES.LIVE_TWO : SCORES.SLEEP_TWO;
            case 1: return openEnds === 2 ? SCORES.LIVE_ONE : 0;
            default: return 0;
        }
    }

    function quickEval(board, row, col, size) {
        let score = 0;
        const center = (size - 1) / 2;
        score -= (Math.abs(row - center) + Math.abs(col - center)) * 2;
        if (memBonusFn) score += memBonusFn(row, col);
        return score;
    }

    return {
        init: () => {},
        setDifficulty,
        setAIPiece,
        setMemoryEnabled,
        isMemoryEnabled,
        getBestMove,
        checkWin,
        evaluateBoard,
        getLastThinkTime: () => lastThinkTime,
        getNodeCount: () => nodeCount
    };
})();
