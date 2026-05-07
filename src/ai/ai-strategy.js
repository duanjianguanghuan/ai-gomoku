/**
 * AI 五子棋 - 攻防策略 AI 模块 v3
 * 专注于攻势推演和防势预判
 * 自动推测对手下一步，提前布局攻防
 * v3 升级：候选位置优化、冲四活三组合检测、精确多方向联动、性能优化
 */

const AIStrategy = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // ========== 候选位置生成 ==========
    /**
     * 获取候选位置列表（只返回有邻居的空位，大幅减少搜索空间）
     * @param {Array} board - 棋盘数组
     * @param {number} size - 棋盘大小
     * @param {number} range - 邻居检测范围
     * @returns {Array<{row: number, col: number}>}
     */
    function getCandidates(board, size, range) {
        range = range || 2;
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
     * 检测冲四活三组合（单步即可形成冲四+活三的必杀局面）
     * @returns {boolean} 是否存在冲四活三组合
     */
    function hasRushFourLiveThree(board, row, col, piece, size) {
        let rushFours = 0, liveThrees = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const info = scanDirection(board, row, col, dr, dc, piece, size);
            if (info.count === 4 && info.openEnds === 1) rushFours++;
            if (info.count === 3 && info.openEnds === 2) liveThrees++;
        }
        return rushFours >= 1 && liveThrees >= 1;
    }

    /**
     * 攻势评估：计算某位置对己方的进攻价值
     * 考虑：连子延伸潜力、多方向联动、跳子威胁、空间控制
     */
    function evaluateAttack(board, row, col, piece, size, weights) {
        weights = weights || { attackWeight: 1.0, defenseWeight: 1.0 };
        let score = 0;
        let liveThrees = 0, rushFours = 0, liveFours = 0;
        let totalDirs = 0, activeDirs = 0;

        for (const [dr, dc] of DIRECTIONS) {
            const info = scanDirection(board, row, col, dr, dc, piece, size);
            score += dirAttackScore(info);
            totalDirs++;

            if (info.count >= 2 || (info.count === 1 && info.openEnds >= 2)) activeDirs++;

            if (info.count >= 5) liveFours++;
            else if (info.count === 4 && info.openEnds === 2) liveFours++;
            else if (info.count === 4 && info.openEnds === 1) rushFours++;
            if (info.count === 3 && info.openEnds === 2) liveThrees++;
        }

        // 多方向联动加分（增强版）
        if (liveFours >= 1) score += 500000;
        if (rushFours >= 2) score += 200000;
        if (rushFours >= 1 && liveThrees >= 1) score += 150000;
        if (liveThrees >= 2) score += 100000;

        // 冲四活三组合特殊加分（v3新增：检测单步形成的冲四+活三必杀）
        if (hasRushFourLiveThree(board, row, col, piece, size)) {
            score += 160000;
        }

        // 多方向活跃加分（新）
        if (activeDirs >= 3) score += 5000;
        else if (activeDirs >= 2) score += 2000;

        // 应用战术权重
        return score * weights.attackWeight;
    }

    /**
     * 防势评估：计算某位置对对手的防守价值
     * 推测对手下一步最可能走哪里，提前封堵
     */
    function evaluateDefense(board, row, col, piece, size, weights) {
        weights = weights || { attackWeight: 1.0, defenseWeight: 1.0 };
        const opp = piece === BLACK ? WHITE : BLACK;
        let score = 0;
        let oppLiveThrees = 0, oppRushFours = 0, oppLiveFours = 0;

        for (const [dr, dc] of DIRECTIONS) {
            const info = scanDirection(board, row, col, dr, dc, opp, size);
            score += dirDefenseScore(info);

            if (info.count >= 5) oppLiveFours++;
            else if (info.count === 4 && info.openEnds === 2) oppLiveFours++;
            else if (info.count === 4 && info.openEnds === 1) oppRushFours++;
            if (info.count === 3 && info.openEnds === 2) oppLiveThrees++;
        }

        // 对手多方向联动 → 必须防守（v3增强：更精确的联动检测）
        if (oppLiveFours >= 1) score += 400000;
        if (oppRushFours >= 2) score += 180000;
        if (oppRushFours >= 1 && oppLiveThrees >= 1) score += 140000;
        if (oppLiveThrees >= 2) score += 90000;

        // 对手冲四活三组合特殊防守加分（v3新增）
        if (hasRushFourLiveThree(board, row, col, opp, size)) {
            score += 155000;
        }

        // 对手多方向眠三联动检测（v3新增：两个以上眠三+开放端也需警惕）
        let oppSleepThrees = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const info = scanDirection(board, row, col, dr, dc, opp, size);
            if (info.count === 3 && info.openEnds === 1 && info.jumps === 0) oppSleepThrees++;
        }
        if (oppSleepThrees >= 2) score += 15000;

        // 应用战术权重
        return score * weights.defenseWeight;
    }

    /**
     * 推测对手最佳落子位置（增强版）
     * 模拟对手视角，找出对手最想下的位置
     */
    function predictOpponentMove(board, piece, size, weights) {
        weights = weights || { attackWeight: 1.0, defenseWeight: 1.0 };
        const opp = piece === BLACK ? WHITE : BLACK;
        let bestScore = -1, bestPos = null;
        const candidates = getCandidates(board, size, 2);

        for (const { row, col } of candidates) {
            const atk = evaluateAttack(board, row, col, opp, size, weights);
            const def = evaluateDefense(board, row, col, opp, size, weights);
            const score = atk + def * 0.8;

            if (score > bestScore) { bestScore = score; bestPos = { row, col }; }
        }
        return bestPos;
    }

    /**
     * 综合攻防评分：为候选位置计算攻防综合分
     * @param {Object} weights - 战术权重 { attackWeight, defenseWeight }
     * @returns {Object} { row, col, attackScore, defenseScore, totalScore }
     */
    function evaluatePosition(board, row, col, piece, size, weights) {
        weights = weights || { attackWeight: 1.0, defenseWeight: 1.0 };

        const atkScore = evaluateAttack(board, row, col, piece, size, weights);
        const defScore = evaluateDefense(board, row, col, piece, size, weights);

        // 攻势绝对优先：进攻权重远高于防守
        const totalScore = atkScore * 2.2 + defScore * 0.8;

        return { row, col, attackScore: atkScore, defenseScore: defScore, totalScore };
    }

    /**
     * 获取攻防策略推荐的最佳位置
     * @param {Object} weights - 战术权重 { attackWeight, defenseWeight }
     * @returns {Object} { row, col, confidence, attackScore, defenseScore }
     */
    function getStrategicMove(board, piece, size, weights) {
        weights = weights || { attackWeight: 1.0, defenseWeight: 1.0 };
        let bestTotal = -1, bestMove = null;
        const candidates = getCandidates(board, size, 2);

        for (const { row, col } of candidates) {
            const eval_ = evaluatePosition(board, row, col, piece, size, weights);
            if (eval_.totalScore > bestTotal) {
                bestTotal = eval_.totalScore;
                bestMove = eval_;
            }
        }

        if (!bestMove) {
            const center = Math.floor(size / 2);
            return { row: center, col: center, confidence: 30, attackScore: 0, defenseScore: 0 };
        }

        const confidence = Math.min(98, 55 + Math.log10(bestTotal.totalScore + 1) * 12);
        return { ...bestMove, confidence: Math.round(confidence) };
    }

    /**
     * 扫描某个方向上的棋型（增强版：更好的跳子检测）
     */
    function scanDirection(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0;

        // 正方向
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; r += dr; c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            // 跳子检测：空位后面还有己方棋子
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; jr += dr; jc += dc;
            }
            // 双跳检测：跳子后再空再连
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let djr = jr + dr, djc = jc + dc;
                while (djr >= 0 && djr < size && djc >= 0 && djc < size && board[djr][djc] === piece) {
                    jumps += 0.5; djr += dr; djc += dc; // 双跳权重减半
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
            // 反方向跳子
            let jr = r - dr, jc = c - dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; jr -= dr; jc -= dc;
            }
        }

        return { count, openEnds, jumps };
    }

    function dirAttackScore(info) {
        const { count, openEnds, jumps } = info;
        if (count >= 5) return 10000000;
        if (openEnds === 0 && jumps === 0) return 0;
        switch (count) {
            case 4:
                return openEnds === 2 ? 1000000 : (openEnds === 1 ? 8000 : 0);
            case 3:
                return openEnds === 2 ? (jumps > 0 ? 28000 : 12000) : (openEnds === 1 ? (jumps > 0 ? 3500 : 1000) : 0);
            case 2:
                return openEnds === 2 ? (jumps > 0 ? 700 : 400) : (openEnds === 1 ? (jumps > 0 ? 250 : 100) : 0);
            case 1:
                return openEnds === 2 ? 25 : (openEnds === 1 ? 8 : 0);
            default: return 0;
        }
    }

    function dirDefenseScore(info) {
        const { count, openEnds, jumps } = info;
        if (count >= 5) return 9000000;
        if (openEnds === 0 && jumps === 0) return 0;
        switch (count) {
            case 4:
                return openEnds === 2 ? 900000 : (openEnds === 1 ? 7500 : 0);
            case 3:
                return openEnds === 2 ? (jumps > 0 ? 25000 : 10000) : (openEnds === 1 ? (jumps > 0 ? 3000 : 900) : 0);
            case 2:
                return openEnds === 2 ? (jumps > 0 ? 600 : 350) : (openEnds === 1 ? (jumps > 0 ? 200 : 90) : 0);
            case 1:
                return openEnds === 2 ? 22 : (openEnds === 1 ? 6 : 0);
            default: return 0;
        }
    }

    return {
        evaluateAttack,
        evaluateDefense,
        evaluatePosition,
        predictOpponentMove,
        getStrategicMove
    };
})();
