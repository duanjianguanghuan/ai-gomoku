/**
 * AI 五子棋 - 多算法集成模块 v1
 * 
 * 功能：
 * - 结合多种算法的优势
 * - 投票决策机制
 * - 评分加权平均
 * - 置信度评估
 */

const AIEnsemble = (() => {
    'use strict';

    const EMPTY = 0, BLACK = 1, WHITE = 2;

    // 权重配置（各算法的可信度）
    const ALGORITHM_WEIGHTS = {
        minimax: 1.0,
        negamax: 1.2,   // 略高于 minimax
        mcts: 1.5,      // 随机模拟，可信度较低
        pattern: 0.8,
        strategy: 0.7
    };

    // 置信度阈值
    const CONFIDENCE_THRESHOLDS = {
        HIGH: 70,      // >70% 算法一致 = 高置信度
        MEDIUM: 50,    // >50% 算法一致 = 中置信度
        LOW: 30        // >30% 算法一致 = 低置信度
    };

    let aiPiece = WHITE;
    let nodeCount = 0;

    // 初始化
    function init() {
        nodeCount = 0;
    }

    // 设置 AI 棋子
    function setAIPiece(piece) {
        aiPiece = piece;
    }

    // 获取有效移动
    function getValidMoves(board, size) {
        if (typeof AIUtils !== 'undefined') {
            return AIUtils.getValidMoves(board, size, 2);
        }
        
        const moves = new Map();
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) continue;
                
                let hasNeighbor = false;
                for (let dr = -2; dr <= 2 && !hasNeighbor; dr++) {
                    for (let dc = -2; dc <= 2 && !hasNeighbor; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] !== EMPTY) {
                            hasNeighbor = true;
                        }
                    }
                }
                
                if (hasNeighbor) {
                    moves.set(r * size + c, { row: r, col: c });
                }
            }
        }
        return Array.from(moves.values());
    }

    // 评估单个位置（多维度）
    function evaluatePosition(board, row, col, piece, size) {
        const scores = {
            attack: 0,
            defense: 0,
            potential: 0,
            central: 0
        };

        const opp = piece === BLACK ? WHITE : BLACK;
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

        // 攻击评分
        scores.attack = evaluateDirection(board, row, col, directions, piece, size);
        
        // 防守评分
        scores.defense = evaluateDirection(board, row, col, directions, opp, size) * 1.1;
        
        // 潜力评分
        scores.potential = evaluatePotential(board, row, col, piece, size);
        
        // 中心度评分
        const center = (size - 1) / 2;
        scores.central = Math.max(0, 10 - (Math.abs(row - center) + Math.abs(col - center)) / 2);

        return scores;
    }

    // 评估方向
    function evaluateDirection(board, row, col, directions, piece, size) {
        let totalScore = 0;
        
        for (const [dr, dc] of directions) {
            const lineScore = evaluateLine(board, row, col, dr, dc, piece, size);
            totalScore += lineScore;
        }
        
        return totalScore;
    }

    // 评估一条线
    function evaluateLine(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0;
        
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++;
            r += dr;
            c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        
        r = row - dr;
        c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++;
            r -= dr;
            c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        if (count >= 5) return 10000000;
        if (openEnds === 0) return 0;

        const SCORES = {
            4: openEnds === 2 ? 1000000 : 8000,
            3: openEnds === 2 ? 15000 : 1000,
            2: openEnds === 2 ? 350 : 100,
            1: openEnds === 2 ? 20 : 0
        };

        return SCORES[count] || 0;
    }

    // 评估潜力
    function evaluatePotential(board, row, col, piece, size) {
        let score = 0;
        
        // 检查周围的空位能形成什么
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === EMPTY) {
                    score += 5;
                }
            }
        }
        
        return score;
    }

    // 多算法投票
    function vote(board, piece, size) {
        const candidates = getValidMoves(board, size);
        const votes = new Map();

        // 初始化票数
        for (const move of candidates) {
            const key = `${move.row},${move.col}`;
            votes.set(key, {
                ...move,
                votes: 0,
                totalScore: 0,
                algorithms: {}
            });
        }

        // 1. Minimax/Negamax 投票
        if (typeof GomokuAI !== 'undefined' && GomokuAI.getBestMove) {
            const minimaxMove = GomokuAI.getBestMove(board);
            if (minimaxMove) {
                const key = `${minimaxMove.row},${minimaxMove.col}`;
                if (votes.has(key)) {
                    votes.get(key).votes += ALGORITHM_WEIGHTS.minimax;
                    votes.get(key).algorithms.minimax = true;
                }
            }
        }

        // 2. MCTS 投票
        if (typeof AIMCTS !== 'undefined' && AIMCTS.getBestMove) {
            try {
                const mctsMove = AIMCTS.getBestMove(board, piece, size);
                if (mctsMove) {
                    const key = `${mctsMove.row},${mctsMove.col}`;
                    if (votes.has(key)) {
                        votes.get(key).votes += ALGORITHM_WEIGHTS.mcts;
                        votes.get(key).algorithms.mcts = true;
                    }
                }
            } catch (e) {
                console.warn('[Ensemble] MCTS failed:', e);
            }
        }

        // 3. Negamax 投票
        if (typeof AINegamax !== 'undefined' && AINegamax.getBestMove) {
            try {
                const negamaxMove = AINegamax.getBestMove(board, piece, size);
                if (negamaxMove) {
                    const key = `${negamaxMove.row},${negamaxMove.col}`;
                    if (votes.has(key)) {
                        votes.get(key).votes += ALGORITHM_WEIGHTS.negamax;
                        votes.get(key).algorithms.negamax = true;
                    }
                }
            } catch (e) {
                console.warn('[Ensemble] Negamax failed:', e);
            }
        }

        // 4. 模式识别投票
        if (typeof AIPattern !== 'undefined' && AIPattern.getSuggestion) {
            const patternMove = AIPattern.getSuggestion(board, piece);
            if (patternMove) {
                const key = `${patternMove.row},${patternMove.col}`;
                if (votes.has(key)) {
                    votes.get(key).votes += ALGORITHM_WEIGHTS.pattern;
                    votes.get(key).algorithms.pattern = true;
                }
            }
        }

        // 5. 策略投票
        if (typeof AIStrategy !== 'undefined' && AIStrategy.getStrategicMove) {
            const strategyMove = AIStrategy.getStrategicMove(board, piece, size);
            if (strategyMove) {
                const key = `${strategyMove.row},${strategyMove.col}`;
                if (votes.has(key)) {
                    votes.get(key).votes += ALGORITHM_WEIGHTS.strategy;
                    votes.get(key).algorithms.strategy = true;
                }
            }
        }

        // 6. 评分加权
        for (const voteInfo of votes.values()) {
            const scores = evaluatePosition(board, voteInfo.row, voteInfo.col, piece, size);
            voteInfo.totalScore = scores.attack * 1.5 + scores.defense * 1.3 + scores.potential * 0.5 + scores.central * 10;
        }

        return Array.from(votes.values());
    }

    // 获取最佳移动（集成算法）
    function getBestMove(board, piece, size, difficulty = 4) {
        init();
        const startTime = performance.now();
        aiPiece = piece;

        const candidates = getValidMoves(board, size);
        if (candidates.length === 0) {
            return { row: Math.floor(size / 2), col: Math.floor(size / 2) };
        }

        // 投票
        const votes = vote(board, piece, size);

        // 计算综合得分
        for (const v of votes) {
            // 综合得分 = 投票数 * 调整系数 + 评分
            v.finalScore = v.votes * 10000 + v.totalScore;
        }

        // 排序
        votes.sort((a, b) => b.finalScore - a.finalScore);

        const bestMove = votes[0];
        const secondMove = votes[1];

        // 计算置信度
        let confidence = 0;
        if (votes.length > 1) {
            const ratio = bestMove.votes / (secondMove.votes + bestMove.votes);
            confidence = Math.round(ratio * 100);
        }

        // 检查是否是高置信度决策
        const confidenceLevel = confidence >= CONFIDENCE_THRESHOLDS.HIGH ? 'HIGH' :
                               confidence >= CONFIDENCE_THRESHOLDS.MEDIUM ? 'MEDIUM' : 'LOW';

        const thinkTime = performance.now() - startTime;
        console.log(`[Ensemble] Best: (${bestMove.row}, ${bestMove.col}), ` +
                   `confidence: ${confidence}% (${confidenceLevel}), ` +
                   `time: ${thinkTime.toFixed(2)}ms`);

        return {
            row: bestMove.row,
            col: bestMove.col,
            confidence,
            confidenceLevel,
            voteCount: bestMove.votes,
            algorithms: bestMove.algorithms,
            thinkTime
        };
    }

    // 获取分析报告
    function getAnalysisReport(board, piece, size) {
        const candidates = getValidMoves(board, size);
        const votes = vote(board, piece, size);

        for (const v of votes) {
            const scores = evaluatePosition(board, v.row, v.col, piece, size);
            v.finalScore = v.votes * 10000 + scores.attack * 1.5 + scores.defense * 1.3 + scores.potential * 0.5 + scores.central * 10;
        }

        votes.sort((a, b) => b.finalScore - a.finalScore);

        return {
            topMoves: votes.slice(0, 5).map(v => ({
                row: v.row,
                col: v.col,
                votes: v.votes.toFixed(1),
                totalScore: Math.round(v.totalScore),
                finalScore: Math.round(v.finalScore),
                algorithms: Object.keys(v.algorithms)
            })),
            timestamp: Date.now()
        };
    }

    return {
        init,
        setAIPiece,
        getBestMove,
        getAnalysisReport,
        vote,
        evaluatePosition,
        ALGORITHM_WEIGHTS,
        CONFIDENCE_THRESHOLDS
    };
})();
