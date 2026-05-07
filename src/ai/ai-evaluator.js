/**
 * AI 五子棋 - 评估函数优化器 v1
 * 
 * 功能：
 * - 自适应评估函数参数
 * - 棋盘态势分析
 * - 位置权重计算
 * - 威胁等级评估
 */

const AIEvaluator = (() => {
    'use strict';

    const EMPTY = 0, BLACK = 1, WHITE = 2;

    // 基础评分
    const BASE_SCORES = {
        FIVE: 10000000,
        LIVE_FOUR: 1000000,
        RUSH_FOUR: 8000,
        LIVE_THREE: 15000,
        SLEEP_THREE: 1000,
        LIVE_TWO: 350,
        SLEEP_TWO: 100,
        LIVE_ONE: 20
    };

    // 位置权重（中心更有价值）
    let positionWeights = null;

    // 初始化位置权重
    function initPositionWeights(size) {
        const center = (size - 1) / 2;
        positionWeights = [];

        for (let r = 0; r < size; r++) {
            positionWeights[r] = [];
            for (let c = 0; c < size; c++) {
                const dist = Math.sqrt(Math.pow(r - center, 2) + Math.pow(c - center, 2));
                const maxDist = Math.sqrt(2) * center;
                // 中心位置权重更高
                positionWeights[r][c] = Math.max(0, Math.floor((1 - dist / maxDist) * 10));
            }
        }
    }

    // 获取位置权重
    function getPositionWeight(row, col) {
        if (!positionWeights || !positionWeights[row]) return 0;
        return positionWeights[row][col] || 0;
    }

    // 评估整个棋盘态势
    function evaluateBoardSituation(board, piece, size) {
        const opp = piece === BLACK ? WHITE : BLACK;
        
        let aiThreats = 0;
        let playerThreats = 0;
        let aiPotential = 0;
        let playerPotential = 0;
        
        const threats = {
            critical: [],   // 必杀威胁
            high: [],      // 高威胁
            medium: [],    // 中等威胁
            low: []        // 低威胁
        };

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) continue;
                
                // 评估此位置对我方和对方的影响
                const aiScore = evaluatePosition(board, r, c, piece, size);
                const playerScore = evaluatePosition(board, r, c, opp, size);
                
                if (aiScore > 10000) {
                    threats.critical.push({ row: r, col: c, score: aiScore, type: 'attack' });
                    aiThreats += 3;
                } else if (aiScore > 1000) {
                    threats.high.push({ row: r, col: c, score: aiScore, type: 'attack' });
                    aiThreats += 2;
                    aiPotential += aiScore;
                } else if (aiScore > 100) {
                    threats.medium.push({ row: r, col: c, score: aiScore, type: 'attack' });
                    aiThreats += 1;
                    aiPotential += aiScore;
                }
                
                if (playerScore > 10000) {
                    threats.critical.push({ row: r, col, score: playerScore, type: 'defense' });
                    playerThreats += 3;
                } else if (playerScore > 1000) {
                    threats.high.push({ row: r, col, score: playerScore, type: 'defense' });
                    playerThreats += 2;
                    playerPotential += playerScore;
                } else if (playerScore > 100) {
                    threats.medium.push({ row: r, col, score: playerScore, type: 'defense' });
                    playerThreats += 1;
                    playerPotential += playerScore;
                }
            }
        }

        return {
            aiThreats,
            playerThreats,
            aiPotential,
            playerPotential,
            threats,
            advantage: aiThreats - playerThreats,
            netPotential: aiPotential - playerPotential
        };
    }

    // 评估单个位置
    function evaluatePosition(board, row, col, piece, size) {
        let totalScore = 0;
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

        for (const [dr, dc] of directions) {
            const lineScore = evaluateDirection(board, row, col, dr, dc, piece, size);
            totalScore += lineScore;
        }

        // 位置权重加成
        totalScore += getPositionWeight(row, col) * 10;

        return totalScore;
    }

    // 评估一个方向
    function evaluateDirection(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0;
        let blocks = 0; // 被堵的一端数

        // 正方向
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++;
            r += dr;
            c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size) {
            if (board[r][c] !== EMPTY) blocks++;
            else openEnds++;
        }

        // 反方向
        r = row - dr;
        c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++;
            r -= dr;
            c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size) {
            if (board[r][c] !== EMPTY) blocks++;
            else openEnds++;
        }

        if (count >= 5) return BASE_SCORES.FIVE;
        if (blocks === 2 && count < 5) return 0; // 两端都被堵

        // 根据棋型评分
        switch (count) {
            case 4:
                return openEnds === 2 ? BASE_SCORES.LIVE_FOUR : BASE_SCORES.RUSH_FOUR;
            case 3:
                return openEnds === 2 ? BASE_SCORES.LIVE_THREE : BASE_SCORES.SLEEP_THREE;
            case 2:
                return openEnds === 2 ? BASE_SCORES.LIVE_TWO : BASE_SCORES.SLEEP_TWO;
            case 1:
                return openEnds === 2 ? BASE_SCORES.LIVE_ONE : 0;
            default:
                return 0;
        }
    }

    // 检测威胁类型
    function detectThreatType(board, row, col, piece, size) {
        const opp = piece === BLACK ? WHITE : BLACK;
        
        board[row][col] = piece;
        const canWin = checkWin(board, row, col, piece, size);
        board[row][col] = EMPTY;

        if (canWin) return 'WIN';

        board[row][col] = piece;
        const t = countThreats(board, row, col, piece, size);
        board[row][col] = EMPTY;

        if (t.fours >= 2 || t.liveFours > 0) return 'CRITICAL';
        if (t.liveThrees >= 2 || (t.liveThrees >= 1 && t.rushFours > 0)) return 'HIGH';
        if (t.liveThrees > 0) return 'MEDIUM';
        if (t.rushFours > 0 || t.sleepThrees >= 2) return 'LOW';
        
        return 'NONE';
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

    // 计数威胁
    function countThreats(board, row, col, piece, size) {
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        let liveFours = 0, rushFours = 0, liveThrees = 0, sleepThrees = 0, liveTwos = 0;

        for (const [dr, dc] of directions) {
            const info = analyzeDir(board, row, col, dr, dc, piece, size);
            
            if (info.count === 4) {
                if (info.openEnds === 2) liveFours++;
                else if (info.openEnds === 1) rushFours++;
            }
            if (info.count === 3) {
                if (info.openEnds === 2) liveThrees++;
                else if (info.openEnds === 1) sleepThrees++;
            }
            if (info.count === 2 && info.openEnds === 2) liveTwos++;
        }

        return { liveFours, rushFours, liveThrees, sleepThrees, liveTwos };
    }

    // 分析方向
    function analyzeDir(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        return { count, openEnds };
    }

    // 获取最佳防守位置
    function getBestDefense(board, piece, size) {
        const opp = piece === BLACK ? WHITE : BLACK;
        let bestMove = null;
        let bestScore = -Infinity;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) continue;
                
                // 检查对手是否能在这里获胜
                board[r][c] = opp;
                const oppWins = checkWin(board, r, c, opp, size);
                board[r][c] = EMPTY;
                
                if (oppWins) {
                    return { row: r, col: c, reason: 'BLOCK_WIN' };
                }
                
                // 评估防守价值
                const score = evaluatePosition(board, r, c, piece, size);
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = { row: r, col: c };
                }
            }
        }

        return bestMove;
    }

    // 获取综合评分（攻防综合）
    function getCombinedScore(board, row, col, piece, size) {
        const attackScore = evaluatePosition(board, row, col, piece, size);
        const opp = piece === BLACK ? WHITE : BLACK;
        const defenseScore = evaluatePosition(board, row, col, opp, size) * 1.1; // 防守略优先
        
        return attackScore + defenseScore;
    }

    return {
        initPositionWeights,
        getPositionWeight,
        evaluateBoardSituation,
        evaluatePosition,
        evaluateDirection,
        detectThreatType,
        countThreats,
        getBestDefense,
        getCombinedScore,
        BASE_SCORES
    };
})();
