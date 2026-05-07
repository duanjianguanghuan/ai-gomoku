/**
 * AI 五子棋 - 记忆模块 v3
 * 记录对弈结果，分析模式，提供 AI 记忆建议
 * v3 新增：用户行为预测、序列模式分析、进攻路线推荐
 */

const GomokuMemory = (() => {
    const STORAGE_KEY = 'gomoku-battle-memory';
    const MAX_RECORDS = 200;

    let records = [];

    function init() { loadFromStorage(); }

    function loadFromStorage() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                records = JSON.parse(data);
                if (!Array.isArray(records)) records = [];
                // 校验每条记录的结构完整性
                records = records.filter(r => r && typeof r.winner === 'number' && Array.isArray(r.moves));
            }
        } catch (e) { records = []; }
    }

    function saveToStorage() {
        try {
            if (records.length > MAX_RECORDS) records = records.slice(records.length - MAX_RECORDS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (e) { console.warn('[Memory] Failed to save:', e); }
    }

    function record(result) {
        _memBonusCache = { piece: null, fn: null }; // 清除缓存
        records.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            winner: result.winner,
            moves: result.moves || 0,
            boardSize: result.boardSize || 15,
            moveHistory: result.moveHistory || [],
            mode: result.mode || 'unknown',  // 'pve' | 'battle' | 'unknown'
            aiPiece: result.aiPiece || null,  // AI 执什么棋
            timestamp: result.timestamp || Date.now()
        });
        saveToStorage();
    }

    function getStats() {
        const total = records.length;
        if (total === 0) return { total: 0, blackWins: 0, whiteWins: 0, draws: 0, blackRate: 0, whiteRate: 0, drawRate: 0, avgMoves: 0 };
        let blackWins = 0, whiteWins = 0, draws = 0, totalMoves = 0;
        for (const r of records) {
            if (r.winner === 'black') blackWins++;
            else if (r.winner === 'white') whiteWins++;
            else draws++;
            totalMoves += r.moves || 0;
        }
        return {
            total, blackWins, whiteWins, draws,
            blackRate: Math.round(blackWins / total * 100),
            whiteRate: Math.round(whiteWins / total * 100),
            drawRate: Math.round(draws / total * 100),
            avgMoves: Math.round(totalMoves / total)
        };
    }

    function getRecentTrend(n = 10) {
        const recent = records.slice(-n);
        let blackWins = 0, whiteWins = 0, draws = 0;
        for (const r of recent) {
            if (r.winner === 'black') blackWins++;
            else if (r.winner === 'white') whiteWins++;
            else draws++;
        }
        return { count: recent.length, blackWins, whiteWins, draws };
    }

    /**
     * 分析获胜方的高频落子位置
     */
    function analyzeWinningPositions() {
        const posMap = {};
        for (const r of records) {
            if (r.winner === 'draw') continue;
            const history = r.moveHistory || [];
            const winnerPiece = r.winner === 'black' ? 1 : 2;
            for (const m of history) {
                if (m.piece === winnerPiece) {
                    const key = `${m.row},${m.col}`;
                    posMap[key] = (posMap[key] || 0) + 1;
                }
            }
        }
        const arr = [];
        for (const [key, count] of Object.entries(posMap)) {
            const [row, col] = key.split(',');
            arr.push({ row: parseInt(row), col: parseInt(col), count });
        }
        arr.sort((a, b) => b.count - a.count);
        return arr.slice(0, 30);
    }

    /**
     * 分析败方的高频落子位置（需要避免的位置）
     */
    function analyzeLosingPositions() {
        const posMap = {};
        for (const r of records) {
            if (r.winner === 'draw') continue;
            const history = r.moveHistory || [];
            const loserPiece = r.winner === 'black' ? 2 : 1;
            for (const m of history) {
                if (m.piece === loserPiece) {
                    const key = `${m.row},${m.col}`;
                    posMap[key] = (posMap[key] || 0) + 1;
                }
            }
        }
        const arr = [];
        for (const [key, count] of Object.entries(posMap)) {
            const [row, col] = key.split(',');
            arr.push({ row: parseInt(row), col: parseInt(col), count });
        }
        arr.sort((a, b) => b.count - a.count);
        return arr.slice(0, 30);
    }

    /**
     * 分析高频开局位置（前 3 手）
     */
    function analyzeOpeningPatterns() {
        const posMap = {};
        for (const r of records) {
            const history = r.moveHistory || [];
            const limit = Math.min(3, history.length);
            for (let i = 0; i < limit; i++) {
                const m = history[i];
                const key = `${m.row},${m.col},${m.piece}`;
                posMap[key] = (posMap[key] || 0) + 1;
            }
        }
        const arr = [];
        for (const [key, count] of Object.entries(posMap)) {
            const [row, col, piece] = key.split(',');
            arr.push({ row: parseInt(row), col: parseInt(col), piece: parseInt(piece), count });
        }
        arr.sort((a, b) => b.count - a.count);
        return arr.slice(0, 20);
    }

    /**
     * 获取记忆建议的候选位置加分
     * 综合考虑：获胜位置加分 + 败局位置减分 + 趋势权重
     * @param {number} piece - 当前棋子颜色 (1=黑, 2=白)
     * @returns {Function} (row, col) => bonus 分数
     */
    // getMemoryBonus 缓存（避免每次调用都重建映射表）
    let _memBonusCache = { piece: null, fn: null };

    function getMemoryBonus(piece) {
        // 命中缓存直接返回
        if (_memBonusCache.piece === piece && _memBonusCache.fn) return _memBonusCache.fn;

        const total = records.length;
        if (total < 3) return () => 0;

        const winPositions = analyzeWinningPositions();
        const losePositions = analyzeLosingPositions();

        if (winPositions.length === 0 && losePositions.length === 0) return () => 0;

        // 构建加分表（获胜位置）
        const bonusMap = {};
        if (winPositions.length > 0) {
            const maxWinCount = winPositions[0].count;
            const baseScore = Math.min(30, total * 0.5);
            for (const pos of winPositions) {
                bonusMap[`${pos.row},${pos.col}`] = (pos.count / maxWinCount) * baseScore;
            }
        }

        // 构建减分表（败局位置）
        const penaltyMap = {};
        if (losePositions.length > 0) {
            const maxLoseCount = losePositions[0].count;
            const basePenalty = Math.min(15, total * 0.3);
            for (const pos of losePositions) {
                penaltyMap[`${pos.row},${pos.col}`] = (pos.count / maxLoseCount) * basePenalty;
            }
        }

        // 趋势加成：如果某方近期胜率高，额外加分
        const trend = getRecentTrend(Math.min(20, total));
        const pieceWins = piece === 1 ? trend.blackWins : trend.whiteWins;
        const trendBonus = trend.count > 0 ? (pieceWins / trend.count) * 8 : 0;

        const bonusFn = (row, col) => {
            const key = `${row},${col}`;
            const bonus = bonusMap[key] || 0;
            const penalty = penaltyMap[key] || 0;
            return Math.max(0, bonus - penalty + trendBonus);
        };

        // 写入缓存
        _memBonusCache = { piece, fn: bonusFn };
        return bonusFn;
    }

    /**
     * 获取记忆建议的开局位置
     */
    function getMemoryOpening(boardSize) {
        const patterns = analyzeOpeningPatterns();
        const sizeRecords = records.filter(r => r.boardSize === boardSize);
        if (sizeRecords.length < 3 || patterns.length === 0) return null;
        for (const p of patterns) {
            if (p.piece === 1 && p.count >= 2) return { row: p.row, col: p.col };
        }
        return null;
    }

    /**
     * 生成模拟建议（供 AI 参考）
     * 分析当前棋盘状态，结合记忆给出建议
     * @param {Array} board - 当前棋盘
     * @param {number} piece - 当前棋子
     * @returns {Object|null} 建议位置 {row, col, confidence} 或 null
     */
    function getSimulatedSuggestion(board, piece) {
        const total = records.length;
        if (total < 5) return null;

        const bonusFn = getMemoryBonus(piece);
        const size = board.length;

        // 找到所有空位中记忆加分最高的位置
        let bestBonus = 0, bestPos = null;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== 0) continue;
                // 只考虑已有棋子附近的位置
                let hasNeighbor = false;
                for (let dr = -2; dr <= 2 && !hasNeighbor; dr++) {
                    for (let dc = -2; dc <= 2 && !hasNeighbor; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] !== 0) {
                            hasNeighbor = true;
                        }
                    }
                }
                if (!hasNeighbor) continue;
                const bonus = bonusFn(r, c);
                if (bonus > bestBonus) { bestBonus = bonus; bestPos = { row: r, col: c }; }
            }
        }

        if (!bestPos || bestBonus < 1) return null;

        // 置信度基于记忆数量和加分强度
        const confidence = Math.min(95, 50 + total * 0.5 + bestBonus);
        return { row: bestPos.row, col: bestPos.col, confidence: Math.round(confidence) };
    }

    function getRecords() { return [...records]; }
    function getRecordCount() { return records.length; }
    function clearAll() { records = []; _memBonusCache = { piece: null, fn: null }; saveToStorage(); }

    /**
     * 裁剪记录，只保留最近 count 条
     */
    function trimRecords(count) {
        if (records.length > count) {
            records = records.slice(records.length - count);
            _memBonusCache = { piece: null, fn: null };
            saveToStorage();
        }
    }
    function getRecentRecords(limit = 20) { return records.slice(-limit).reverse(); }

    /**
     * 预测用户下一步最可能走的位置（v3 新增）
     * 通过分析用户历史落子的序列模式，预测当前局面下用户最可能走哪里
     * @param {Array} board - 当前棋盘
     * @param {number} playerPiece - 用户棋子颜色 (1=黑, 2=白)
     * @param {Array} recentPlayerMoves - 用户最近几步棋 [{row, col}, ...]
     * @returns {Array} 预测的用户下一步候选位置 [{row, col, probability}, ...]
     */
    function predictPlayerNextMove(board, playerPiece, recentPlayerMoves) {
        if (records.length < 3 || !recentPlayerMoves || recentPlayerMoves.length < 1) return [];

        const size = board.length;
        const predictions = [];

        // 方法1：分析所有记录中同色棋子的位置偏好（包括 AI 对决数据）
        const userPosFreq = {};
        for (const r of records) {
            const history = r.moveHistory || [];
            for (const m of history) {
                if (m.piece === playerPiece) {
                    const key = `${m.row},${m.col}`;
                    userPosFreq[key] = (userPosFreq[key] || 0) + 1;
                }
            }
        }

        // 方法2：分析同色棋子的落子序列模式（走A后经常走B，跨模式）
        const seqPatterns = {};
        for (const r of records) {
            const history = r.moveHistory || [];
            const pieceMoves = history.filter(m => m.piece === playerPiece);
            for (let i = 0; i < pieceMoves.length - 1; i++) {
                const fromKey = `${pieceMoves[i].row},${pieceMoves[i].col}`;
                const toKey = `${pieceMoves[i + 1].row},${pieceMoves[i + 1].col}`;
                if (!seqPatterns[fromKey]) seqPatterns[fromKey] = {};
                seqPatterns[fromKey][toKey] = (seqPatterns[fromKey][toKey] || 0) + 1;
            }
        }

        // 方法3：分析同色棋子的方向偏好（跨模式，包括 AI 对决的进攻路线）
        const dirPref = [0, 0, 0, 0]; // 水平、垂直、右斜、左斜
        for (const r of records) {
            const history = r.moveHistory || [];
            const pieceMoves = history.filter(m => m.piece === playerPiece);
            for (let i = 0; i < pieceMoves.length - 1; i++) {
                const dr = pieceMoves[i + 1].row - pieceMoves[i].row;
                const dc = pieceMoves[i + 1].col - pieceMoves[i].col;
                if (dr === 0 && dc !== 0) dirPref[0]++;
                else if (dc === 0 && dr !== 0) dirPref[1]++;
                else if (dr === dc && dr !== 0) dirPref[2]++;
                else if (dr === -dc && dr !== 0) dirPref[3]++;
            }
        }
        const maxDir = Math.max(...dirPref, 1);
        const preferredDirs = dirPref.map((count, idx) => ({ idx, weight: count / maxDir }));

        // 综合预测：基于用户最近一步，找到最可能的下一步
        if (recentPlayerMoves.length > 0) {
            const lastMove = recentPlayerMoves[recentPlayerMoves.length - 1];
            const lastKey = `${lastMove.row},${lastMove.col}`;

            // 基于序列模式预测
            const seqNext = seqPatterns[lastKey] || {};
            const seqTotal = Object.values(seqNext).reduce((s, v) => s + v, 0);

            // 基于方向偏好预测：用户最后一步的方向延伸
            const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
            for (const [dr, dc] of DIRECTIONS) {
                // 沿用户偏好方向搜索
                for (let step = 1; step <= 3; step++) {
                    const nr = lastMove.row + dr * step;
                    const nc = lastMove.col + dc * step;
                    if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) {
                        const dirIdx = DIRECTIONS.findIndex(d => d[0] === dr && d[1] === dc);
                        const dirWeight = preferredDirs[dirIdx] ? preferredDirs[dirIdx].weight : 0.5;
                        const posKey = `${nr},${nc}`;
                        const freqBonus = (userPosFreq[posKey] || 0) * 0.3;
                        const seqBonus = seqNext[posKey] ? (seqNext[posKey] / Math.max(1, seqTotal)) * 40 : 0;
                        const score = dirWeight * 20 + freqBonus + seqBonus + (4 - step) * 5;
                        if (score > 2) {
                            predictions.push({ row: nr, col: nc, score: Math.round(score * 10) / 10, source: 'direction' });
                        }
                        break; // 每个方向只取最近的空位
                    } else if (nr < 0 || nr >= size || nc < 0 || nc >= size) {
                        break;
                    }
                }
            }

            // 基于序列模式直接推荐
            for (const [toKey, count] of Object.entries(seqNext)) {
                const [row, col] = toKey.split(',').map(Number);
                if (row >= 0 && row < size && col >= 0 && col < size && board[row][col] === 0) {
                    const prob = count / Math.max(1, seqTotal);
                    const existing = predictions.find(p => p.row === row && p.col === col);
                    if (existing) {
                        existing.score += prob * 50;
                    } else if (prob > 0.1) {
                        predictions.push({ row, col, score: Math.round(prob * 50 * 10) / 10, source: 'sequence' });
                    }
                }
            }
        }

        // 基于用户高频位置推荐（用户喜欢下的位置）
        for (const [key, count] of Object.entries(userPosFreq)) {
            const [row, col] = key.split(',').map(Number);
            if (row >= 0 && row < size && col >= 0 && col < size && board[row][col] === 0) {
                const existing = predictions.find(p => p.row === row && p.col === col);
                if (!existing) {
                    const score = Math.min(15, count * 1.5);
                    if (score > 3) {
                        predictions.push({ row, col, score, source: 'frequency' });
                    }
                }
            }
        }

        // 排序并返回 top 5
        predictions.sort((a, b) => b.score - a.score);
        return predictions.slice(0, 5);
    }

    /**
     * 获取用户行为预测的进攻建议（v3 新增）
     * AI 根据预测的用户下一步，提前布局进攻
     * @param {Array} board - 当前棋盘
     * @param {number} aiPiece - AI 棋子颜色
     * @param {number} playerPiece - 用户棋子颜色
     * @param {Array} recentPlayerMoves - 用户最近几步
     * @returns {Object|null} 进攻建议 {row, col, reason, confidence}
     */
    function getAttackSuggestion(board, aiPiece, playerPiece, recentPlayerMoves) {
        const predictions = predictPlayerNextMove(board, playerPiece, recentPlayerMoves);
        if (predictions.length === 0) return null;

        const size = board.length;
        const EMPTY = 0;
        const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

        // 对每个预测的用户位置，找到 AI 的最佳进攻位置
        let bestSuggestion = null;
        let bestScore = 0;

        for (const pred of predictions) {
            const { row: pRow, col: pCol, score: predScore } = pred;

            // AI 在预测位置附近落子的进攻价值
            for (const [dr, dc] of DIRECTIONS) {
                for (let step = -2; step <= 2; step++) {
                    const nr = pRow + dr * step;
                    const nc = pCol + dc * step;
                    if (nr < 0 || nr >= size || nc < 0 || nc >= size || board[nr][nc] !== EMPTY) continue;

                    // 评估 AI 在此位置的进攻价值
                    let atkValue = 0;
                    board[nr][nc] = aiPiece;
                    try {
                    for (const [adr, adc] of DIRECTIONS) {
                        let count = 1, openEnds = 0;
                        let r = nr + adr, c = nc + adc;
                        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === aiPiece) { count++; r += adr; c += adc; }
                        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
                        r = nr - adr; c = nc - adc;
                        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === aiPiece) { count++; r -= adr; c -= adc; }
                        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
                        if (count >= 3 && openEnds >= 2) atkValue += 5000;
                        else if (count >= 3 && openEnds >= 1) atkValue += 800;
                        else if (count >= 2 && openEnds >= 2) atkValue += 300;
                    }
                    } finally {
                        board[nr][nc] = EMPTY;
                    }

                    // 同时考虑封堵用户的进攻路线
                    let blockValue = 0;
                    board[nr][nc] = playerPiece;
                    try {
                    for (const [adr, adc] of DIRECTIONS) {
                        let count = 1, openEnds = 0;
                        let r = nr + adr, c = nc + adc;
                        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === playerPiece) { count++; r += adr; c += adc; }
                        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
                        r = nr - adr; c = nc - adc;
                        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === playerPiece) { count++; r -= adr; c -= adc; }
                        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
                        if (count >= 3 && openEnds >= 2) blockValue += 3000;
                        else if (count >= 3 && openEnds >= 1) blockValue += 500;
                    }
                    } finally {
                        board[nr][nc] = EMPTY;
                    }

                    // 综合分：进攻为主，封堵为辅
                    const totalScore = atkValue * 2.0 + blockValue * 0.5 + predScore;
                    if (totalScore > bestScore) {
                        bestScore = totalScore;
                        bestSuggestion = { row: nr, col: nc, reason: `predict_${pred.source}`, confidence: Math.min(85, 40 + totalScore / 100) };
                    }
                }
            }
        }

        return bestSuggestion;
    }

    /**
     * 记录对局（兼容接口，支持 mode 和 aiPiece 参数）
     */
    function recordGame(result) {
        record(result);
    }

    /**
     * 获取指定模式的对局记录
     * @param {string} mode - 'pve' | 'battle' | 'all'
     */
    function getRecordsByMode(mode) {
        if (mode === 'all') return [...records];
        return records.filter(r => r.mode === mode);
    }

    return {
        init, record, recordGame, getStats, getRecentTrend,
        analyzeOpeningPatterns, analyzeWinningPositions, analyzeLosingPositions,
        getMemoryBonus, getMemoryOpening, getSimulatedSuggestion,
        predictPlayerNextMove, getAttackSuggestion,
        getRecords, getRecordsByMode, getRecordCount, clearAll, trimRecords, getRecentRecords
    };
})();
