/**
 * AI 五子棋 - Negamax 算法模块 v1
 * 
 * Negamax 是 Minimax 的简化版本，利用零和游戏特性：
 * - 不需要区分 max/min 节点
 * - 评分自动取反，代码更简洁
 * - 通常配合 Alpha-Beta 剪枝使用
 */

const AINegamax = (() => {
    'use strict';

    const EMPTY = 0, BLACK = 1, WHITE = 2;
    
    // 配置
    const CONFIG = {
        maxDepth: 4,
        maxTime: 2000,
        maxNodes: 200000,
        useAlphaBeta: true,
        useKillerMove: true,
        useHistoryHeuristic: true
    };

    let nodeCount = 0;
    let startTime = 0;
    let aiPiece = WHITE;
    
    // killer moves: 每个深度最多保存2个杀手移动
    const killerMoves = new Map();
    
    // 历史表：记录移动的历史评分
    const historyTable = new Map();

    // 棋型评分
    const SCORES = {
        FIVE: 10000000,
        LIVE_FOUR: 1000000,
        RUSH_FOUR: 8000,
        LIVE_THREE: 15000,
        SLEEP_THREE: 1000,
        LIVE_TWO: 350,
        SLEEP_TWO: 100,
        LIVE_ONE: 20
    };

    function init() {
        nodeCount = 0;
        killerMoves.clear();
        historyTable.clear();
    }

    function setAIPiece(piece) {
        aiPiece = piece;
    }

    function setConfig(config) {
        Object.assign(CONFIG, config);
    }

    // 检查获胜
    function checkWin(board, row, col, piece, size) {
        if (typeof AIUtils !== 'undefined') {
            return AIUtils.checkWin(board, row, col, piece, size);
        }
        
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (const [dr, dc] of directions) {
            let count = 1;
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
            if (count >= 5) return true;
        }
        return false;
    }

    // 获取有效移动
    function getValidMoves(board, size, maxMoves = 15) {
        if (typeof AIUtils !== 'undefined') {
            const moves = AIUtils.getValidMoves(board, size, 2);
            // 按历史评分排序
            if (CONFIG.useHistoryHeuristic) {
                moves.sort((a, b) => {
                    const sa = historyTable.get(`${a.row},${a.col}`) || 0;
                    const sb = historyTable.get(`${b.row},${b.col}`) || 0;
                    return sb - sa;
                });
            }
            return moves.slice(0, maxMoves);
        }
        return [];
    }

    // 获取对手
    function getOpponent(piece) {
        return piece === BLACK ? WHITE : BLACK;
    }

    // 评估函数
    function evaluate(board, piece, size) {
        let aiScore = 0, playerScore = 0;
        
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                
                const isAI = board[r][c] === aiPiece;
                for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === board[r][c]) continue;
                    
                    const lineScore = evaluateLine(board, r, c, dr, dc, board[r][c], size);
                    if (isAI) aiScore += lineScore;
                    else playerScore += lineScore;
                }
            }
        }
        
        return aiScore - playerScore;
    }

    // 评估一条线
    function evaluateLine(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0;
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

    // Negamax 主搜索（带 Alpha-Beta）
    function negamax(board, depth, alpha, beta, piece, size) {
        nodeCount++;
        
        // 超时或节点限制检查
        if (nodeCount >= CONFIG.maxNodes || performance.now() - startTime > CONFIG.maxTime) {
            return evaluate(board, aiPiece, size);
        }
        
        // 叶子节点评估
        if (depth === 0) {
            return evaluate(board, aiPiece, size);
        }
        
        // 获取候选移动
        let moves = getValidMoves(board, size, 15);
        
        //杀手移动优先
        if (CONFIG.useKillerMove) {
            const killers = killerMoves.get(depth) || [];
            moves.sort((a, b) => {
                let scoreA = killers.some(k => k.row === a.row && k.col === a.col) ? 1000 : 0;
                let scoreB = killers.some(k => k.row === b.row && k.col === b.col) ? 1000 : 0;
                return scoreB - scoreA;
            });
        }
        
        if (moves.length === 0) {
            return evaluate(board, aiPiece, size);
        }
        
        let bestScore = -Infinity;
        
        for (const move of moves) {
            board[move.row][move.col] = piece;
            
            // 检查获胜
            if (checkWin(board, move.row, move.col, piece, size)) {
                board[move.row][move.col] = EMPTY;
                return SCORES.FIVE * (piece === aiPiece ? 1 : -1);
            }
            
            // 递归搜索
            const score = -negamax(board, depth - 1, -beta, -alpha, getOpponent(piece), size);
            
            board[move.row][move.col] = EMPTY;
            
            if (score > bestScore) {
                bestScore = score;
            }
            
            // Alpha-Beta 剪枝
            if (CONFIG.useAlphaBeta) {
                alpha = Math.max(alpha, score);
                if (alpha >= beta) {
                    // 记录 killer move
                    if (CONFIG.useKillerMove) {
                        const killers = killerMoves.get(depth) || [];
                        if (killers.length >= 2) killers.shift();
                        killers.push(move);
                        killerMoves.set(depth, killers);
                    }
                    
                    // 更新历史表
                    if (CONFIG.useHistoryHeuristic) {
                        const key = `${move.row},${move.col}`;
                        historyTable.set(key, (historyTable.get(key) || 0) + depth * depth);
                    }
                    
                    break;
                }
            }
        }
        
        return bestScore;
    }

    // 获取最佳移动
    function getBestMove(board, piece, size) {
        init();
        startTime = performance.now();
        aiPiece = piece;
        
        const moves = getValidMoves(board, size, 20);
        if (moves.length === 0) {
            return { row: Math.floor(size / 2), col: Math.floor(size / 2) };
        }
        
        let bestMove = moves[0];
        let bestScore = -Infinity;
        
        for (const move of moves) {
            if (performance.now() - startTime > CONFIG.maxTime) break;
            
            board[move.row][move.col] = piece;
            
            if (checkWin(board, move.row, move.col, piece, size)) {
                board[move.row][move.col] = EMPTY;
                console.log(`[Negamax] Found winning move: (${move.row}, ${move.col})`);
                return move;
            }
            
            const score = -negamax(board, CONFIG.maxDepth - 1, -Infinity, Infinity, getOpponent(piece), size);
            
            board[move.row][move.col] = EMPTY;
            
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        
        const thinkTime = performance.now() - startTime;
        console.log(`[Negamax] Best move: (${bestMove.row}, ${bestMove.col}), score: ${bestScore}, nodes: ${nodeCount}, time: ${thinkTime.toFixed(2)}ms`);
        
        return bestMove;
    }

    return {
        init,
        setAIPiece,
        setConfig,
        getBestMove,
        CONFIG
    };
})();
