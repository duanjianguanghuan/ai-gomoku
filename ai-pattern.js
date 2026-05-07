/**
 * AI 五子棋 - 模式识别 AI 模块 v3
 * 专注于棋盘模式识别、威胁预测和战术分析
 * 与 GomokuAI（搜索型 AI）、AIStrategy（攻防策略）、AITactics（战术调配）协同工作
 * v3 升级：候选位置优化、三路共识决策、活三评分提升、性能优化
 */

const AIPattern = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // ========== 候选位置生成 ==========
    /**
     * 获取候选位置列表（只返回有邻居的空位，大幅减少搜索空间）
     * @param {Array} board - 棋盘数组
     * @param {number} range - 邻居检测范围
     * @returns {Array<{row: number, col: number}>}
     */
    function getCandidates(board, range) {
        range = range || 2;
        const size = board.length;
        const map = new Map();
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                for (let dr = -range; dr <= range; dr++) {
                    for (let dc = -range; dc <= range; dc++) {
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

    /**
     * 分析整个棋盘的威胁态势
     * @param {Array} board - 棋盘数组
     * @param {number} piece - 要分析的棋子颜色
     * @param {Object} weights - 战术权重（可选）
     * @returns {Object} { threats: [{row,col,score,type}], totalThreat: number }
     */
    function analyzeBoardThreats(board, piece, weights) {
        weights = weights || { attackWeight: 1.0, defenseWeight: 1.0 };
        const size = board.length;
        const threats = [];
        const opp = piece === BLACK ? WHITE : BLACK;
        const candidates = getCandidates(board, 2);

        for (const { row, col } of candidates) {
            const atkScore = evalPosition(board, row, col, piece, size, weights);
            const defScore = evalPosition(board, row, col, opp, size, weights);
            const combined = atkScore * weights.attackWeight + defScore * weights.defenseWeight * 1.2;

            if (combined > 80) {
                threats.push({ row, col, score: combined, atkScore, defScore });
            }
        }

        threats.sort((a, b) => b.score - a.score);
        return {
            threats: threats.slice(0, 20),
            totalThreat: threats.reduce((s, t) => s + t.score, 0)
        };
    }

    /**
     * 检测是否存在必须立即处理的紧急威胁
     * @returns {Object|null} { row, col, type: 'win'|'block'|'critical' } 或 null
     */
    function detectUrgentMove(board, piece) {
        const size = board.length;
        const opp = piece === BLACK ? WHITE : BLACK;

        // 1. 自己能赢
        const candidates2 = getCandidates(board, 2);
        for (const { row, col } of candidates2) {
            board[row][col] = piece;
            if (checkWin(board, row, col, piece, size)) {
                board[row][col] = EMPTY;
                return { row, col, type: 'win' };
            }
            board[row][col] = EMPTY;
        }

        // 2. 对手即将赢（必须堵）
        for (const { row, col } of candidates2) {
            board[row][col] = opp;
            if (checkWin(board, row, col, opp, size)) {
                board[row][col] = EMPTY;
                return { row, col, type: 'block' };
            }
            board[row][col] = EMPTY;
        }

        // 3. 自己能形成双活三或冲四活三
        const candidates1 = getCandidates(board, 1);
        for (const { row, col } of candidates1) {
            board[row][col] = piece;
            const t = countThreats(board, row, col, piece, size);
            board[row][col] = EMPTY;
            if (t.liveFours > 0 || t.rushFours >= 2 ||
                (t.rushFours >= 1 && t.liveThrees >= 1) ||
                t.liveThrees >= 2) {
                return { row, col, type: 'critical' };
            }
        }

        // 4. 对手能形成双活三或冲四活三（必须防守）
        for (const { row, col } of candidates1) {
            board[row][col] = opp;
            const t = countThreats(board, row, col, opp, size);
            board[row][col] = EMPTY;
            if (t.liveFours > 0 || t.rushFours >= 2 ||
                (t.rushFours >= 1 && t.liveThrees >= 1) ||
                t.liveThrees >= 2) {
                return { row, col, type: 'critical' };
            }
        }

        return null;
    }

    /**
     * 模式识别评估某个位置的战术价值（增强版）
     * 考虑：连子潜力、跳子模式、空间控制、多方向联动
     */
    function evalPosition(board, row, col, piece, size, weights) {
        weights = weights || { attackWeight: 1.0, defenseWeight: 1.0 };
        let score = 0;
        let activeDirs = 0;
        let liveThrees = 0, rushFours = 0;

        for (const [dr, dc] of DIRECTIONS) {
            const pattern = analyzePattern(board, row, col, dr, dc, piece, size);
            const dirScore = patternScore(pattern);
            score += dirScore;

            if (pattern.count >= 2 || (pattern.count === 1 && pattern.openEnds >= 2)) activeDirs++;
            if (pattern.count === 3 && pattern.openEnds === 2) liveThrees++;
            if (pattern.count === 4 && pattern.openEnds === 1) rushFours++;
        }

        // 多方向联动加分
        if (liveThrees >= 2) score += 80000;
        if (rushFours >= 1 && liveThrees >= 1) score += 120000;
        if (activeDirs >= 3) score += 3000;
        else if (activeDirs >= 2) score += 1200;

        // 位置权重：靠近中心加分
        const center = (size - 1) / 2;
        const dist = Math.abs(row - center) + Math.abs(col - center);
        score += Math.max(0, (size - dist)) * 2;

        return score;
    }

    /**
     * 分析某个方向上的棋型模式（增强版）
     * @returns {Object} { count, openEnds, jumps, gapBefore, gapAfter }
     */
    function analyzePattern(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0;
        let gapBefore = false, gapAfter = false;

        // 正方向
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; r += dr; c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            gapAfter = true;
            // 检查跳子（增强：支持多级跳子）
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; jr += dr; jc += dc;
            }
            // 二级跳子检测
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let djr = jr + dr, djc = jc + dc;
                while (djr >= 0 && djr < size && djc >= 0 && djc < size && board[djr][djc] === piece) {
                    jumps += 0.5; djr += dr; djc += dc;
                }
            }
        }

        // 反方向
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; r -= dr; c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            gapBefore = true;
            // 反方向跳子
            let jr = r - dr, jc = c - dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; jr -= dr; jc -= dc;
            }
        }

        return { count, openEnds, jumps, gapBefore, gapAfter };
    }

    /**
     * 根据模式计算分数（增强版）
     */
    function patternScore(pattern) {
        const { count, openEnds, jumps } = pattern;
        if (count >= 5) return 10000000;
        if (openEnds === 0 && jumps === 0) return 0;

        switch (count) {
            case 4:
                if (openEnds === 2) return 1000000;  // 活四
                if (openEnds === 1) return 6500;       // 冲四（提高分值）
                if (jumps > 0 && openEnds >= 1) return 5500;  // 跳冲四
                return 0;
            case 3:
                if (openEnds === 2) {
                    return jumps > 0 ? 20000 : 12000; // 活三（跳活三更强，v3提升基础分）
                }
                if (openEnds === 1) {
                    return jumps > 0 ? 2500 : 800;     // 眠三
                }
                return 0;
            case 2:
                if (openEnds === 2) return jumps > 0 ? 550 : 300;  // 活二
                if (openEnds === 1) return jumps > 0 ? 180 : 80;   // 眠二
                return 0;
            case 1:
                if (openEnds === 2) return 18;
                if (openEnds === 1 && jumps > 0) return 10;
                return 0;
            default:
                return 0;
        }
    }

    /**
     * 获取模式 AI 的推荐落子位置
     * @param {Array} board - 棋盘
     * @param {number} piece - AI 棋子颜色
     * @returns {Object} { row, col, confidence }
     */
    function getSuggestion(board, piece) {
        // 先检查紧急情况
        const urgent = detectUrgentMove(board, piece);
        if (urgent) return { ...urgent, confidence: 99 };

        // 分析威胁态势
        const analysis = analyzeBoardThreats(board, piece);
        if (analysis.threats.length === 0) {
            const c = Math.floor(board.length / 2);
            return { row: c, col: c, confidence: 50 };
        }

        const best = analysis.threats[0];
        const confidence = Math.min(95, 60 + best.score / 100);
        return { row: best.row, col: best.col, confidence: Math.round(confidence) };
    }

    /**
     * 双 AI 共识决策：当两个 AI 推荐不同位置时，选择综合评分更高的
     * @param {Object} move1 - 第一个 AI 的推荐 { row, col }
     * @param {Object} move2 - 第二个 AI 的推荐 { row, col }
     * @param {Array} board - 棋盘
     * @param {number} piece - AI 棋子
     * @returns {Object} 最终推荐 { row, col }
     */
    function consensus(move1, move2, board, piece) {
        if (!move1) return move2;
        if (!move2) return move1;
        if (move1.row === move2.row && move1.col === move2.col) return move1;

        const size = board.length;
        const score1 = evalPosition(board, move1.row, move1.col, piece, size);
        const score2 = evalPosition(board, move2.row, move2.col, piece, size);

        const opp = piece === BLACK ? WHITE : BLACK;
        const def1 = evalPosition(board, move1.row, move1.col, opp, size);
        const def2 = evalPosition(board, move2.row, move2.col, opp, size);

        const total1 = score1 + def1 * 1.2;
        const total2 = score2 + def2 * 1.2;

        return total1 >= total2 ? move1 : move2;
    }

    /**
     * 三路共识决策：当三个 AI 推荐不同位置时，综合评估选出最优
     * 如果两个或以上 AI 推荐同一位置，优先选择该位置
     * 否则选择综合评分最高的位置
     * @param {Object} move1 - 第一个 AI 的推荐 { row, col }
     * @param {Object} move2 - 第二个 AI 的推荐 { row, col }
     * @param {Object} move3 - 第三个 AI 的推荐 { row, col }
     * @param {Array} board - 棋盘
     * @param {number} piece - AI 棋子
     * @returns {Object} 最终推荐 { row, col }
     */
    function tripleConsensus(move1, move2, move3, board, piece) {
        // 过滤空值
        const moves = [move1, move2, move3].filter(m => m != null);
        if (moves.length === 0) return null;
        if (moves.length === 1) return moves[0];
        if (moves.length === 2) return consensus(moves[0], moves[1], board, piece);

        // 检查是否有两个或以上 AI 推荐同一位置（多数投票）
        const posCount = {};
        for (const m of moves) {
            const key = m.row + ',' + m.col;
            posCount[key] = (posCount[key] || 0) + 1;
        }
        for (const key in posCount) {
            if (posCount[key] >= 2) {
                const [row, col] = key.split(',').map(Number);
                return { row, col };
            }
        }

        // 三个位置各不相同，选择综合评分最高的
        const size = board.length;
        const opp = piece === BLACK ? WHITE : BLACK;
        let bestMove = moves[0], bestScore = -1;

        for (const m of moves) {
            const atk = evalPosition(board, m.row, m.col, piece, size);
            const def = evalPosition(board, m.row, m.col, opp, size);
            const total = atk + def * 1.2;
            if (total > bestScore) {
                bestScore = total;
                bestMove = m;
            }
        }

        return bestMove;
    }

    // ========== 工具函数 ==========
    function countThreats(board, row, col, piece, size) {
        let liveFours = 0, rushFours = 0, liveThrees = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const p = analyzePattern(board, row, col, dr, dc, piece, size);
            if (p.count >= 5) { liveFours++; continue; }
            if (p.count === 4) {
                if (p.openEnds === 2) liveFours++;
                else if (p.openEnds === 1) rushFours++;
            }
            if (p.count === 3 && p.openEnds === 2) liveThrees++;
        }
        return { liveFours, rushFours, liveThrees };
    }

    function checkWin(board, row, col, piece, size) {
        for (const [dr, dc] of DIRECTIONS) {
            let count = 1;
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
            if (count >= 5) return true;
        }
        return false;
    }

    return {
        analyzeBoardThreats,
        detectUrgentMove,
        evalPosition,
        getSuggestion,
        consensus,
        tripleConsensus
    };
})();
