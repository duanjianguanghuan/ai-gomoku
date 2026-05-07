/**
 * AI 五子棋 - 高级搜索增强模块
 * 集成 Zobrist 哈希、置换表、迭代加深、历史启发表等高级搜索技术
 * 为五子棋 AI 提供生产级的搜索加速与剪枝优化
 *
 * 核心技术：
 *   1. Zobrist 哈希 —— 快速棋盘状态指纹识别
 *   2. 置换表 (Transposition Table) —— 缓存搜索结果，避免重复计算
 *   3. 迭代加深 + 窗口试探 (Iterative Deepening + Aspiration Windows) —— 自适应搜索深度
 *   4. 历史启发表 (History Heuristic) —— 基于截止统计的走法排序
 *   5. Alpha-Beta 剪枝增强 Minimax —— 高效博弈树搜索
 */

const AISearchEnhance = (() => {
    'use strict';

    // ==================== 常量定义 ====================
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // 置换表相关常量
    const TT_SIZE = 1 << 20;            // 约 100 万个条目（2^20）
    const TT_EXACT = 0;                 // 精确值
    const TT_ALPHA = 1;                 // 上界（Alpha 节点）
    const TT_BETA = 2;                  // 下界（Beta 节点）

    // 胜负评分常量
    const WIN_SCORE = 10000000;         // 胜利基础分
    const LOSS_SCORE = -10000000;       // 失败基础分

    // ==================== 模块状态 ====================
    let enabled = true;                 // 模块启用开关
    let nodeCount = 0;                  // 当前搜索节点计数
    let ttHits = 0;                     // 置换表命中次数
    let ttMisses = 0;                   // 置换表未命中次数
    let lastCompletedDepth = 0;         // 上一次完成的迭代深度
    let searchAborted = false;          // 搜索是否被中止（超时）

    // ==================== Zobrist 哈希 ====================
    /**
     * Zobrist 哈希表：zobristTable[row][col][piece] = { hi, lo }
     * 使用两个 32 位整数模拟 64 位哈希（JavaScript 无原生 64 位整数）
     * 对于 15x15 棋盘：15 * 15 * 3 = 675 组随机数
     */
    const zobristTable = [];
    const HASH_SIDE = { hi: 0x12345678, lo: 0x9ABCDEF0 }; // 行棋方哈希盐值

    /**
     * 初始化 Zobrist 哈希表
     * 使用确定性伪随机数生成器（LCG），确保每次运行结果一致
     * @param {number} size - 棋盘尺寸
     */
    function initZobrist(size) {
        zobristTable.length = 0;
        // 使用线性同余生成器（LCG）产生确定性伪随机数
        let seed = 0x12345678;
        function nextRand() {
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
            return seed;
        }
        for (let r = 0; r < size; r++) {
            zobristTable[r] = [];
            for (let c = 0; c < size; c++) {
                // 索引 0 留空（EMPTY 不参与哈希），1 = BLACK，2 = WHITE
                zobristTable[r][c] = [
                    null,
                    { hi: nextRand(), lo: nextRand() },
                    { hi: nextRand(), lo: nextRand() }
                ];
            }
        }
    }

    /**
     * 计算当前棋盘的 Zobrist 哈希值
     * 遍历棋盘所有非空位置，异或对应的哈希值
     * @param {Array} board - 棋盘二维数组
     * @param {number} size - 棋盘尺寸
     * @returns {{ hi: number, lo: number }} 64 位哈希值（高 32 位 + 低 32 位）
     */
    function computeHash(board, size) {
        let hi = 0, lo = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) {
                    const z = zobristTable[r][c][board[r][c]];
                    hi ^= z.hi;
                    lo ^= z.lo;
                }
            }
        }
        return { hi, lo };
    }

    /**
     * 增量更新 Zobrist 哈希（落子/撤子时使用，避免全盘重算）
     * @param {{ hi: number, lo: number }} hash - 当前哈希值
     * @param {number} row - 行坐标
     * @param {number} col - 列坐标
     * @param {number} piece - 棋子类型
     * @returns {{ hi: number, lo: number }} 更新后的哈希值
     */
    function updateHash(hash, row, col, piece) {
        const z = zobristTable[row][col][piece];
        return { hi: hash.hi ^ z.hi, lo: hash.lo ^ z.lo };
    }

    // ==================== 置换表 (Transposition Table) ====================
    /**
     * 固定大小的哈希表，用于缓存已搜索节点的结果
     * 替换策略：深度优先——新条目搜索深度 >= 旧条目时替换
     */
    const transpositionTable = new Array(TT_SIZE);

    /**
     * 查询置换表
     * @param {{ hi: number, lo: number }} hash - 棋盘哈希值
     * @returns {Object|null} 命中返回条目 { hash, depth, score, flag, bestMove }，未命中返回 null
     */
    function ttProbe(hash) {
        const idx = ((hash.hi ^ hash.lo) >>> 0) % TT_SIZE;
        const entry = transpositionTable[idx];
        if (entry && entry.hash.hi === hash.hi && entry.hash.lo === hash.lo) {
            ttHits++;
            return entry;
        }
        ttMisses++;
        return null;
    }

    /**
     * 存储搜索结果到置换表
     * 替换策略：无条目 或 新条目搜索深度 >= 旧条目深度时替换
     * @param {{ hi: number, lo: number }} hash - 棋盘哈希值
     * @param {number} depth - 搜索深度
     * @param {number} score - 评估分数
     * @param {number} flag - 标志位 (TT_EXACT / TT_ALPHA / TT_BETA)
     * @param {{ row: number, col: number }} bestMove - 最佳走法
     */
    function ttStore(hash, depth, score, flag, bestMove) {
        const idx = ((hash.hi ^ hash.lo) >>> 0) % TT_SIZE;
        const existing = transpositionTable[idx];
        if (!existing || existing.depth <= depth) {
            transpositionTable[idx] = { hash, depth, score, flag, bestMove };
        }
    }

    // ==================== 历史启发表 (History Heuristic) ====================
    /**
     * 历史启发表：记录每个位置在搜索中引起 Beta 截止的频率
     * 搜索深度越深，截止权重越高（depth^2）
     */
    const historyTable = [];

    /**
     * 初始化历史启发表
     * @param {number} size - 棋盘尺寸
     */
    function initHistory(size) {
        historyTable.length = 0;
        for (let r = 0; r < size; r++) {
            historyTable[r] = new Array(size).fill(0);
        }
    }

    /**
     * 更新历史启发表（某位置引起 Beta 截止时调用）
     * 使用 depth^2 作为权重，深层截止比浅层截止更有参考价值
     * @param {number} row - 行坐标
     * @param {number} col - 列坐标
     * @param {number} depth - 引起截止时的搜索深度
     */
    function historyUpdate(row, col, depth) {
        historyTable[row][col] += depth * depth;
    }

    /**
     * 查询某位置的历史启发分数
     * @param {number} row - 行坐标
     * @param {number} col - 列坐标
     * @returns {number} 历史分数
     */
    function historyScore(row, col) {
        return historyTable[row] ? (historyTable[row][col] || 0) : 0;
    }

    /**
     * 老化历史启发表（所有分数除以 2）
     * 防止旧数据过度影响新局面的走法排序
     * @param {number} size - 棋盘尺寸
     */
    function ageHistory(size) {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                historyTable[r][c] >>= 1;
            }
        }
    }

    // ==================== 棋盘工具函数 ====================

    /**
     * 检测某位置落子后是否形成五连（胜利判定）
     * @param {Array} board - 棋盘二维数组
     * @param {number} row - 行坐标
     * @param {number} col - 列坐标
     * @param {number} piece - 棋子类型
     * @param {number} size - 棋盘尺寸
     * @returns {boolean} 是否胜利
     */
    function checkWin(board, row, col, piece, size) {
        for (const [dr, dc] of DIRECTIONS) {
            let count = 1;
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++; r += dr; c += dc;
            }
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++; r -= dr; c -= dc;
            }
            if (count >= 5) return true;
        }
        return false;
    }

    /**
     * 获取候选位置列表（只返回有邻居的空位，大幅减少搜索空间）
     * @param {Array} board - 棋盘二维数组
     * @param {number} size - 棋盘尺寸
     * @param {number} maxCandidates - 最大候选数量限制
     * @returns {Array<{ row: number, col: number }>} 候选位置数组
     */
    function getCandidates(board, size, maxCandidates) {
        const map = new Map();
        const range = 2; // 检测周围 2 格范围内的邻居
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
        let candidates = Array.from(map.values());
        // 如果候选数量超过限制，按快速评估排序后截取
        if (candidates.length > maxCandidates) {
            for (const c of candidates) {
                c._quickScore = quickEval(board, c.row, c.col, size);
            }
            candidates.sort((a, b) => b._quickScore - a._quickScore);
            candidates = candidates.slice(0, maxCandidates);
        }
        return candidates;
    }

    // ==================== 评估函数 ====================

    /**
     * 评估单方向连续棋子的得分
     * 从指定位置沿方向扫描，统计连续同色棋子数和开放端数
     * @param {Array} board - 棋盘二维数组
     * @param {number} row - 起始行
     * @param {number} col - 起始列
     * @param {number} dr - 行方向增量
     * @param {number} dc - 列方向增量
     * @param {number} piece - 棋子类型
     * @param {number} size - 棋盘尺寸
     * @returns {number} 该方向的评分
     */
    function evalLine(board, row, col, dr, dc, piece, size) {
        let count = 1;
        let openEnds = 0;
        let r, c;

        // 正方向扫描
        r = row + dr; c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; r += dr; c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        // 反方向扫描
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; r -= dr; c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        // 根据连子数和开放端数评分
        if (count >= 5) return 100000;        // 五连（必胜）
        if (openEnds === 0) return 0;          // 两端被封死，无价值

        switch (count) {
            case 4:
                return openEnds === 2 ? 50000 : 5000;   // 活四 / 冲四
            case 3:
                return openEnds === 2 ? 5000 : 500;     // 活三 / 眠三
            case 2:
                return openEnds === 2 ? 200 : 50;       // 活二 / 眠二
            case 1:
                return openEnds === 2 ? 10 : 2;         // 活一 / 眠一
            default:
                return 0;
        }
    }

    /**
     * 全局棋盘评估函数
     * 遍历棋盘所有位置，计算双方棋型的总得分差
     * 使用"只从一端开始计数"策略避免重复计算
     * @param {Array} board - 棋盘二维数组
     * @param {number} aiPiece - AI 棋子类型
     * @param {number} playerPiece - 对手棋子类型
     * @param {number} size - 棋盘尺寸
     * @returns {number} 评估分数（正值对 AI 有利，负值对对手有利）
     */
    function evaluateBoard(board, aiPiece, playerPiece, size) {
        let aiScore = 0, playerScore = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                const piece = board[r][c];
                for (const [dr, dc] of DIRECTIONS) {
                    // 避免重复计数：只从连续序列的一端开始扫描
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === piece) continue;

                    const score = evalLine(board, r, c, dr, dc, piece, size);
                    if (piece === aiPiece) aiScore += score;
                    else playerScore += score;
                }
            }
        }
        return aiScore - playerScore;
    }

    /**
     * 快速评估函数（用于走法排序，不追求精确度）
     * 评估在指定空位落子后的棋型价值
     * @param {Array} board - 棋盘二维数组
     * @param {number} row - 行坐标
     * @param {number} col - 列坐标
     * @param {number} size - 棋盘尺寸
     * @returns {number} 快速评估分数
     */
    function quickEval(board, row, col, size) {
        let score = 0;
        for (const [dr, dc] of DIRECTIONS) {
            let count = 1, openEnds = 0;

            // 正方向
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== EMPTY) {
                count++; r += dr; c += dc;
            }
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

            // 反方向
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== EMPTY) {
                count++; r -= dr; c -= dc;
            }
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

            // 快速评分（简化版，用于排序）
            if (count >= 5) score += 100000;
            else if (count === 4 && openEnds >= 1) score += 50000;
            else if (count === 3 && openEnds === 2) score += 5000;
            else if (count === 3 && openEnds === 1) score += 500;
            else if (count === 2 && openEnds === 2) score += 200;
        }

        // 位置权重：靠近棋盘中心的位置加分
        const center = (size - 1) / 2;
        score += Math.max(0, (size - Math.abs(row - center) - Math.abs(col - center))) * 3;

        return score;
    }

    // ==================== 增强 Minimax 搜索 ====================

    /**
     * 增强 Minimax 搜索（Alpha-Beta 剪枝 + 置换表 + 历史启发）
     *
     * 集成三大优化：
     *   1. 置换表探测与存储 —— 避免重复搜索相同局面
     *   2. 走法排序 —— TT 最佳走法优先，然后按历史启发 + 快速评估排序
     *   3. Beta 截止时更新历史启发表
     *
     * @param {Array} board - 棋盘二维数组（会被临时修改，搜索后恢复）
     * @param {number} depth - 剩余搜索深度
     * @param {number} ply - 当前搜索层数（从根节点算起）
     * @param {boolean} isMax - 是否为最大化节点（AI 走棋）
     * @param {number} alpha - Alpha 下界
     * @param {number} beta - Beta 上界
     * @param {number} aiPiece - AI 棋子类型
     * @param {number} playerPiece - 对手棋子类型
     * @param {number} size - 棋盘尺寸
     * @param {Object} config - 搜索配置
     * @returns {number} 当前局面的评估分数
     */
    function enhancedMinimax(board, depth, ply, isMax, alpha, beta, aiPiece, playerPiece, size, config) {
        nodeCount++;

        // 超时检查：每 10000 个节点检查一次（减少 performance.now() 调用开销）
        if (nodeCount % 10000 === 0 && config.timeLimit) {
            if (performance.now() - config.startTime > config.timeLimit) {
                searchAborted = true;
                return isMax ? -Infinity : Infinity; // 超时返回极端值
            }
        }

        // 如果搜索已被中止，立即返回
        if (searchAborted) {
            return isMax ? -Infinity : Infinity;
        }

        // 计算当前局面哈希
        const hash = computeHash(board, size);

        // 置换表探测
        const ttEntry = ttProbe(hash);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === TT_EXACT) return ttEntry.score;
            if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return alpha;
            if (ttEntry.flag === TT_BETA && ttEntry.score >= beta) return beta;
        }

        // 到达叶子节点，调用评估函数
        if (depth === 0) {
            return evaluateBoard(board, aiPiece, playerPiece, size);
        }

        // 生成候选走法
        const maxCandidates = Math.min(config.candidates || 20, 15);
        const candidates = getCandidates(board, size, maxCandidates);
        if (candidates.length === 0) {
            return evaluateBoard(board, aiPiece, playerPiece, size);
        }

        // ---- 走法排序 ----
        // 1. TT 最佳走法置顶
        let sortStart = 0;
        if (ttEntry && ttEntry.bestMove) {
            const ttIdx = candidates.findIndex(
                c => c.row === ttEntry.bestMove.row && c.col === ttEntry.bestMove.col
            );
            if (ttIdx > 0) {
                const [ttMove] = candidates.splice(ttIdx, 1);
                candidates.unshift(ttMove);
            }
            sortStart = 1;
        }

        // 2. 其余走法按历史启发 + 快速评估综合排序
        for (let i = sortStart; i < candidates.length; i++) {
            const c = candidates[i];
            c.orderScore = historyScore(c.row, c.col) + quickEval(board, c.row, c.col, size) * 0.1;
        }
        candidates.sort((a, b) => (b.orderScore || 0) - (a.orderScore || 0));

        let bestMove = candidates[0];
        const originalAlpha = alpha;

        if (isMax) {
            // ---- 最大化节点（AI 走棋）----
            let maxScore = -Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = aiPiece;

                // 胜利检测：立即返回，分数加上 ply 偏好更快获胜
                if (checkWin(board, row, col, aiPiece, size)) {
                    board[row][col] = EMPTY;
                    ttStore(hash, depth, WIN_SCORE + ply, TT_EXACT, { row, col });
                    return WIN_SCORE + ply;
                }

                const score = enhancedMinimax(board, depth - 1, ply + 1, false, alpha, beta, aiPiece, playerPiece, size, config);
                board[row][col] = EMPTY;

                if (score > maxScore) {
                    maxScore = score;
                    bestMove = { row, col };
                }
                alpha = Math.max(alpha, score);

                // Alpha-Beta 截止
                if (beta <= alpha) {
                    historyUpdate(row, col, depth); // Beta 截止 —— 更新历史启发表
                    break;
                }
            }

            // 存入置换表
            const flag = maxScore <= originalAlpha ? TT_ALPHA : (maxScore >= beta ? TT_BETA : TT_EXACT);
            ttStore(hash, depth, maxScore, flag, bestMove);
            return maxScore;

        } else {
            // ---- 最小化节点（对手走棋）----
            let minScore = Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = playerPiece;

                // 失败检测：对手获胜
                if (checkWin(board, row, col, playerPiece, size)) {
                    board[row][col] = EMPTY;
                    ttStore(hash, depth, LOSS_SCORE - ply, TT_EXACT, { row, col });
                    return LOSS_SCORE - ply;
                }

                const score = enhancedMinimax(board, depth - 1, ply + 1, true, alpha, beta, aiPiece, playerPiece, size, config);
                board[row][col] = EMPTY;

                if (score < minScore) {
                    minScore = score;
                    bestMove = { row, col };
                }
                beta = Math.min(beta, score);

                // Alpha-Beta 截止
                if (beta <= alpha) {
                    historyUpdate(row, col, depth); // Beta 截止 —— 更新历史启发表
                    break;
                }
            }

            // 存入置换表
            const flag = minScore <= alpha ? TT_ALPHA : (minScore >= originalAlpha ? TT_BETA : TT_EXACT);
            ttStore(hash, depth, minScore, flag, bestMove);
            return minScore;
        }
    }

    // ==================== 迭代加深搜索 ====================

    /**
     * 迭代加深搜索 + 窗口试探 (Aspiration Windows)
     *
     * 从深度 1 开始逐步加深搜索，每层利用上一层的分数作为窗口中心：
     *   - 若分数落在窗口内，直接采用
     *   - 若分数超出窗口，用全窗口重新搜索
     *
     * 优势：
     *   1. 任何时候都可以中断并使用上一层的最佳走法
     *   2. 深层搜索的走法排序信息（来自 TT）大幅提升浅层效率
     *   3. 窗口试探减少搜索节点数
     *
     * @param {Array} board - 棋盘二维数组
     * @param {number} aiPiece - AI 棋子类型
     * @param {number} playerPiece - 对手棋子类型
     * @param {number} size - 棋盘尺寸
     * @param {number} maxDepth - 最大搜索深度
     * @param {Object} config - 搜索配置
     * @returns {{ row: number, col: number }|null} 最佳走法
     */
    function iterativeDeepening(board, aiPiece, playerPiece, size, maxDepth, config) {
        // 初始化 Zobrist 哈希表（如果尚未初始化或尺寸不匹配）
        if (zobristTable.length !== size) {
            initZobrist(size);
        }
        // 初始化历史启发表（如果尚未初始化或尺寸不匹配）
        if (!historyTable[0] || historyTable.length !== size) {
            initHistory(size);
        }

        let bestMove = null;
        let previousScore = 0;

        // 重置搜索状态
        nodeCount = 0;
        ttHits = 0;
        ttMisses = 0;
        lastCompletedDepth = 0;
        searchAborted = false;

        for (let depth = 1; depth <= maxDepth; depth++) {
            // 窗口试探：以上一层分数为中心，宽度 ±200
            const window = 200;
            let alpha = previousScore - window;
            let beta = previousScore + window;

            let score = enhancedMinimax(board, depth, 0, true, alpha, beta, aiPiece, playerPiece, size, config);

            // 如果分数超出窗口，用完整窗口重新搜索
            if (!searchAborted && (score <= alpha || score >= beta)) {
                score = enhancedMinimax(board, depth, 0, true, -Infinity, Infinity, aiPiece, playerPiece, size, config);
            }

            // 检查是否超时
            if (searchAborted) {
                // 超时：使用上一层的最佳走法
                break;
            }

            previousScore = score;
            lastCompletedDepth = depth;

            // 从置换表获取最佳走法
            const hash = computeHash(board, size);
            const entry = ttProbe(hash);
            if (entry && entry.bestMove) {
                bestMove = entry.bestMove;
            }

            // 超时检查
            if (config.timeLimit && (performance.now() - config.startTime) > config.timeLimit) {
                break;
            }

            // 每完成一层迭代，老化历史启发表（防止旧数据累积）
            if (depth % 4 === 0) {
                ageHistory(size);
            }
        }

        return bestMove;
    }

    // ==================== 主搜索入口 ====================

    /**
     * 主搜索函数 —— 模块对外接口
     *
     * 调用流程：
     *   1. 合并默认配置
     *   2. 处理空棋盘特殊情况（直接下天元）
     *   3. 调用迭代加深搜索
     *   4. 返回搜索结果统计
     *
     * @param {Array} board - 棋盘二维数组
     * @param {number} aiPiece - AI 棋子类型 (BLACK=1 或 WHITE=2)
     * @param {number} size - 棋盘尺寸（默认 15）
     * @param {Object} config - 可选配置
     * @param {number} config.maxDepth - 最大搜索深度（默认 8）
     * @param {number} config.maxTimeMs - 最大搜索时间毫秒（默认 3000）
     * @param {number} config.candidates - 候选走法数量（默认 20）
     * @returns {{ row: number, col: number, score: number, depth: number, nodes: number, time: number, ttHitRate: string }}
     */
    function search(board, aiPiece, size, config) {
        config = config || {};
        size = size || 15;

        const defaults = {
            maxDepth: 8,
            maxTimeMs: 3000,
            candidates: 20,
        };
        const cfg = {
            ...defaults,
            ...config,
            startTime: performance.now(),
            timeLimit: config.maxTimeMs || defaults.maxTimeMs
        };

        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;

        // 空棋盘特殊处理：直接下天元（棋盘中心）
        let isEmpty = true;
        for (let r = 0; r < size && isEmpty; r++) {
            for (let c = 0; c < size && isEmpty; c++) {
                if (board[r][c] !== EMPTY) isEmpty = false;
            }
        }
        if (isEmpty) {
            const center = Math.floor(size / 2);
            return {
                row: center,
                col: center,
                score: 0,
                depth: 0,
                nodes: 0,
                time: 0,
                ttHitRate: '0%'
            };
        }

        // 执行迭代加深搜索
        const result = iterativeDeepening(board, aiPiece, playerPiece, size, cfg.maxDepth, cfg);

        // 计算搜索统计
        const totalTime = Math.round(performance.now() - cfg.startTime);
        const hitRate = (ttHits + ttMisses) > 0
            ? (ttHits / (ttHits + ttMisses) * 100).toFixed(1) + '%'
            : '0%';

        return {
            row: result ? result.row : -1,
            col: result ? result.col : -1,
            score: previousScore || 0,
            depth: lastCompletedDepth,
            nodes: nodeCount,
            time: totalTime,
            ttHitRate: hitRate
        };
    }

    // 用于存储上一轮搜索的分数（供 search 函数返回）
    let previousScore = 0;

    // ==================== 公共接口 ====================

    return {
        /**
         * 主搜索入口
         * @param {Array} board - 棋盘二维数组
         * @param {number} aiPiece - AI 棋子类型
         * @param {number} size - 棋盘尺寸
         * @param {Object} config - 搜索配置
         * @returns {Object} 搜索结果
         */
        search: search,

        /**
         * 清空置换表
         * 在新游戏开始时调用，释放内存
         */
        clearTT: function () {
            for (let i = 0; i < TT_SIZE; i++) {
                transpositionTable[i] = undefined;
            }
            ttHits = 0;
            ttMisses = 0;
        },

        /**
         * 清空历史启发表
         * 在新游戏开始时调用
         */
        clearHistory: function () {
            for (let r = 0; r < historyTable.length; r++) {
                if (historyTable[r]) {
                    for (let c = 0; c < historyTable[r].length; c++) {
                        historyTable[r][c] = 0;
                    }
                }
            }
        },

        /**
         * 获取搜索统计信息
         * @returns {{ ttHitRate: string, ttSize: number, historyTopMoves: Array }}
         */
        getStats: function () {
            // 找出历史启发分数最高的前 5 个位置
            const topMoves = [];
            for (let r = 0; r < historyTable.length; r++) {
                for (let c = 0; c < (historyTable[r] ? historyTable[r].length : 0); c++) {
                    const score = historyScore(r, c);
                    if (score > 0) {
                        topMoves.push({ row: r, col: c, score: score });
                    }
                }
            }
            topMoves.sort((a, b) => b.score - a.score);

            const totalProbes = ttHits + ttMisses;
            return {
                ttHitRate: totalProbes > 0
                    ? (ttHits / totalProbes * 100).toFixed(1) + '%'
                    : '0%',
                ttSize: TT_SIZE,
                historyTopMoves: topMoves.slice(0, 5)
            };
        },

        /**
         * 查询模块是否启用
         * @returns {boolean}
         */
        isEnabled: function () {
            return enabled;
        },

        /**
         * 设置模块启用状态
         * @param {boolean} val - 是否启用
         */
        setEnabled: function (val) {
            enabled = !!val;
        }
    };
})();
