/**
 * AI 五子棋 - 大管家 AI v3
 * AIManager：总调度员 + 全局策略管理器 + 智能管家
 *
 * v3 升级：
 *   - 新增 pre-check 层：一步胜/一步防/对手必胜检测，避免冗余计算
 *   - 新增短路逻辑：VCF 必胜立即返回，不运行其他引擎
 *   - 新增对手 VCF 检测：检测对手是否有强制攻杀序列
 *   - 新增时间预算管理：总时间限制 + 每引擎时间分配
 *   - 新增阶段感知权重：根据 gamePhase 动态调整引擎权重
 *   - 改进共识算法：修复防守权重、添加 VCF 加分、多维度评估
 *   - 新增自适应时间管理：关键局面（活三/冲四）多花时间
 *   - 新增思考日志：记录每步的决策过程供调试
 *   - 优化用户画像：改进弱点分析、综合难度建议
 */

const AIManager = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // ========== 状态管理 ==========

    let enabled = true;
    let gamePhase = 'normal'; // 'normal' | 'advantage' | 'disadvantage' | 'winning' | 'losing'
    let moveCount = 0;
    let aiMoveHistory = [];          // AI 自己的落子记录
    let currentGamePlayerMoves = []; // 当前对局中用户的落子记录
    let gameStartTime = 0;
    let lastThinkTime = 0;           // 上次 AI 思考耗时（ms）

    // 思考日志：记录每步的决策过程供调试
    let thinkingLog = [];

    // 用户画像分析
    let userProfile = {
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        avgMoves: 0,
        preferredDirections: [0, 0, 0, 0], // 水平/垂直/右斜/左斜
        preferredPositions: {},             // 位置频率
        aggressionLevel: 0.5,               // 0=防守 1=激进
        weakSpots: [],                       // 用户弱点位置（相对坐标）
        strongPatterns: [],                  // 用户擅长棋型
        openingPreferences: [],              // 用户开局偏好记录
        recentWinRates: [],                  // 最近 N 局的胜负记录（用于趋势分析）
    };

    // ========== 时间预算配置 ==========

    const TIME_CONFIG = {
        maxTotalTime: 3000,    // 最大总思考时间 3s（人机模式需要快速响应）
        engineTimeRatio: 0.6,  // 引擎占总时间的比例
        preCheckTime: 500,     // pre-check 最大时间
        consensusTime: 200,    // 共识算法最大时间
    };

    // AI 模块注册表（基础权重，运行时由 getPhaseWeights 动态调整）
    const aiModules = {
        search:    { name: '深度搜索',   available: () => typeof GomokuAI !== 'undefined',    weight: 3.0 },
        pattern:   { name: '模式识别',   available: () => typeof AIPattern !== 'undefined',   weight: 2.0 },
        strategy:  { name: '攻防策略',   available: () => typeof AIStrategy !== 'undefined',  weight: 1.8 },
        tactics:   { name: '战术调配',   available: () => typeof AITactics !== 'undefined',   weight: 1.5 },
        memory:    { name: '记忆预测',   available: () => typeof GomokuMemory !== 'undefined',  weight: 1.2 },
        extreme:   { name: '极限引擎',   available: () => typeof AIExtreme !== 'undefined' && AIExtreme.isEnabled(), weight: 3.5 },
        ultimate:  { name: '终极策略',   available: () => typeof AIUltimate !== 'undefined' && AIUltimate.isEnabled(), weight: 4.0 },
        mcts:      { name: '蒙特卡洛',   available: () => typeof AIMCTS !== 'undefined' && AIMCTS.isEnabled(), weight: 3.8 },
        vcf:       { name: 'VCF/VCT攻杀', available: () => typeof AIVCF !== 'undefined' && AIVCF.isEnabled(), weight: 4.2 },
        searchEnh: { name: '增强搜索',   available: () => typeof AISearchEnhance !== 'undefined' && AISearchEnhance.isEnabled(), weight: 4.0 },
        opening:   { name: '开局库',     available: () => typeof AIOpening !== 'undefined' && AIOpening.isEnabled(), weight: 2.5 },
    };

    // ========== 基础访问器 ==========

    function isEnabled() { return enabled; }
    function setEnabled(val) { enabled = !!val; }
    function getGamePhase() { return gamePhase; }
    function getUserProfile() { return { ...userProfile }; }
    function getLastThinkTime() { return lastThinkTime; }

    // ========== 思考日志 ==========

    /**
     * 记录决策步骤到思考日志
     * @param {string} step - 决策阶段名称
     * @param {*} detail - 决策详情
     */
    function logDecision(step, detail) {
        thinkingLog.push({ step, detail, time: performance.now() });
    }

    /**
     * 获取思考日志副本
     * @returns {Array} 决策日志数组
     */
    function getThinkingLog() {
        return [...thinkingLog];
    }

    /**
     * 清空思考日志
     */
    function clearThinkingLog() {
        thinkingLog = [];
    }

    // ========== 时间预算管理 ==========

    /**
     * 获取当前局面自适应时间预算
     * 关键局面（活三/冲四）分配更多时间
     * @returns {number} 时间预算（毫秒）
     */
    function getTimeBudget() {
        const base = TIME_CONFIG.maxTotalTime;
        switch (gamePhase) {
            case 'winning':
            case 'losing':
                // 关键局面：多花 20% 时间寻找必胜/翻盘机会
                return base * 1.2;
            case 'advantage':
            case 'disadvantage':
                // 优势/劣势局面：使用标准时间
                return base;
            default:
                // 平稳局面：减少 20% 时间（无需深度思考）
                return base * 0.8;
        }
    }

    /**
     * 获取阶段感知的引擎权重
     * 根据当前 gamePhase 动态调整各引擎的投票权重
     * @returns {Object} 调整后的权重映射
     */
    function getPhaseWeights() {
        // 深拷贝基础权重，避免污染原始配置
        const base = {};
        for (const key of Object.keys(aiModules)) {
            base[key] = { weight: aiModules[key].weight };
        }

        switch (gamePhase) {
            case 'winning':
                // 胜势局面：加速寻找必胜，减少不必要的引擎
                base.vcf.weight *= 1.5;       // 加速寻找必胜序列
                base.ultimate.weight *= 1.3;  // 终极引擎更信任
                base.opening.weight *= 0.3;   // 开局库不再重要
                base.memory.weight *= 0.5;    // 记忆预测优先级降低
                break;
            case 'losing':
                // 劣势局面：寻找翻盘机会，减少慢速引擎
                base.vcf.weight *= 1.5;       // 寻找翻盘的 VCF 机会
                base.searchEnh.weight *= 1.2; // 深度搜索找机会
                base.mcts.weight *= 0.7;      // MCTS 较慢，减少权重
                base.opening.weight *= 0.3;   // 开局库无意义
                break;
            case 'advantage':
                // 优势局面：稳健推进
                base.ultimate.weight *= 1.2;  // 终极引擎更可靠
                base.searchEnh.weight *= 1.1; // 深度搜索辅助
                base.memory.weight *= 0.8;    // 略微降低记忆预测
                break;
            case 'disadvantage':
                // 略微劣势：标准引擎更稳，战术调配更重要
                base.search.weight *= 1.3;    // 标准引擎更稳定
                base.tactics.weight *= 1.2;   // 战术调配更重要
                base.mcts.weight *= 0.8;      // MCTS 减少时间消耗
                break;
            default:
                // normal 阶段：使用基础权重，不做调整
                break;
        }

        return base;
    }

    // ========== 工具函数 ==========

    /**
     * 检查棋盘是否为空
     */
    function isBoardEmpty(board, size) {
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) return false;
        return true;
    }

    /**
     * 快速获取候选落子位置
     * 只考虑已有棋子周围 2 格范围内的空位
     * @param {Array} board - 棋盘二维数组
     * @param {number} size - 棋盘大小
     * @returns {Array} 候选位置数组 [{row, col}, ...]
     */
    function getCandidatesFast(board, size) {
        const map = new Map();
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                // 遍历周围 2 格范围
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

    /**
     * 检查指定位置是否形成五连（胜利判定）
     * @param {Array} board - 棋盘
     * @param {number} row - 行
     * @param {number} col - 列
     * @param {number} piece - 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {boolean} 是否五连
     */
    function checkWin(board, row, col, piece, size) {
        for (const [dr, dc] of DIRECTIONS) {
            let count = 1;
            // 正方向计数
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++;
                r += dr;
                c += dc;
            }
            // 反方向计数
            r = row - dr;
            c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++;
                r -= dr;
                c -= dc;
            }
            if (count >= 5) return true;
        }
        return false;
    }

    /**
     * 快速统计某位置的威胁棋型
     * 用于 pre-check 层判断不可阻挡的威胁
     * @param {Array} board - 棋盘
     * @param {number} row - 行
     * @param {number} col - 列
     * @param {number} piece - 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Object} { liveFours, rushFours, liveThrees, rushFourLiveThree }
     */
    function quickCountThreats(board, row, col, piece, size) {
        let liveFours = 0, rushFours = 0, liveThrees = 0;

        for (const [dr, dc] of DIRECTIONS) {
            let count = 1, openEnds = 0;
            // 正方向扫描
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++;
                r += dr;
                c += dc;
            }
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
            // 反方向扫描
            r = row - dr;
            c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++;
                r -= dr;
                c -= dc;
            }
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

            // 已经五连，直接返回
            if (count >= 5) return { liveFours: 1, rushFours: 0, liveThrees: 0, rushFourLiveThree: false };
            // 活四：四连 + 两端开放
            if (count === 4 && openEnds === 2) liveFours++;
            // 冲四：四连 + 一端开放
            if (count === 4 && openEnds === 1) rushFours++;
            // 活三：三连 + 两端开放
            if (count === 3 && openEnds === 2) liveThrees++;
        }

        return {
            liveFours,
            rushFours,
            liveThrees,
            // 冲四+活三 组合威胁（不可阻挡）
            rushFourLiveThree: (rushFours >= 1 && liveThrees >= 1)
        };
    }

    /**
     * 快速评估某方向上的棋型分值
     * 用于共识算法的攻防评估
     */
    function quickScore(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        if (count >= 5) return 10000000;
        if (count === 4 && openEnds === 2) return 1000000;
        if (count === 4 && openEnds === 1) return 8000;
        if (count === 3 && openEnds === 2) return 10000;
        if (count === 3 && openEnds === 1) return 800;
        if (count === 2 && openEnds === 2) return 300;
        return 0;
    }

    // ========== Pre-Check 层（关键优化） ==========

    /**
     * 预检查层：在运行任何 AI 引擎之前，快速检测紧急局面
     * 按优先级依次检查：
     *   1. AI 一步胜 — 直接返回
     *   2. 对手一步胜 — 必须防守
     *   3. AI 活四/双冲四 — 不可阻挡
     *   4. 对手活四 — 必须堵
     *
     * @param {Array} board - 棋盘
     * @param {number} aiPiece - AI 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Object|null} 检测结果 {row, col, reason, confidence} 或 null
     */
    function preCheck(board, aiPiece, size) {
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        const candidates = getCandidatesFast(board, size);

        // 1. AI 一步胜 — 直接返回（无需运行任何引擎）
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            if (checkWin(board, row, col, aiPiece, size)) {
                board[row][col] = EMPTY;
                logDecision('precheck', { type: 'instant_win', row, col });
                return { row, col, reason: 'instant_win', confidence: 100 };
            }
            board[row][col] = EMPTY;
        }

        // 2. 对手一步胜 — 必须防守（不堵就输）
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            if (checkWin(board, row, col, playerPiece, size)) {
                board[row][col] = EMPTY;
                logDecision('precheck', { type: 'block_win', row, col });
                return { row, col, reason: 'block_win', confidence: 99 };
            }
            board[row][col] = EMPTY;
        }

        // 3. AI 活四/双冲四/冲四+活三 — 不可阻挡的威胁
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            const threats = quickCountThreats(board, row, col, aiPiece, size);
            board[row][col] = EMPTY;
            if (threats.liveFours > 0 || threats.rushFours >= 2 || threats.rushFourLiveThree) {
                logDecision('precheck', { type: 'unstoppable', row, col, threats });
                return { row, col, reason: 'unstoppable', confidence: 100 };
            }
        }

        // 4. 对手活四/双冲四/冲四+活三 — 必须堵（否则下步必输）
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            const threats = quickCountThreats(board, row, col, playerPiece, size);
            board[row][col] = EMPTY;
            if (threats.liveFours > 0 || threats.rushFours >= 2 || threats.rushFourLiveThree) {
                logDecision('precheck', { type: 'block_unstoppable', row, col, threats });
                return { row, col, reason: 'block_unstoppable', confidence: 98 };
            }
        }

        // 无紧急局面，返回 null 让后续引擎处理
        return null;
    }

    // ========== 对手 VCF 检测 ==========

    /**
     * 检测对手是否有 VCF（连续冲四取胜）强制攻杀序列
     * 如果对手有 VCF，则 AI 必须在对手 VCF 的第一步落子点进行防守
     *
     * @param {Array} board - 棋盘
     * @param {number} aiPiece - AI 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Object|null} 防守建议 {row, col, reason, confidence} 或 null
     */
    function checkOpponentVCF(board, aiPiece, size) {
        if (!aiModules.vcf.available()) return null;

        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        const oppVCF = AIVCF.findVCF(board, playerPiece, size);

        if (oppVCF) {
            // 对手有强制攻杀序列 — 在对手 VCF 的第一步落子点进行防守
            logDecision('opp_vcf', { type: 'block_opp_vcf', row: oppVCF.row, col: oppVCF.col });
            return { row: oppVCF.row, col: oppVCF.col, reason: 'block_opp_vcf', confidence: 97 };
        }

        return null;
    }

    // ========== 一、AI 总调度员（v3 重写） ==========

    /**
     * 大管家核心：统一入口获取最佳落子
     * v3 调度流程：
     *   1. Pre-Check 层 → 紧急局面直接返回
     *   2. 对手 VCF 检测 → 必须防守
     *   3. VCF 短路 → AI 有必胜序列立即返回
     *   4. 多引擎并行收集建议
     *   5. 加权共识算法 → 最终决策
     */
    function getBestMove(board, aiPiece, size) {
        if (!enabled) return null;
        const startTime = performance.now();
        let elapsed = performance.now() - startTime;
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;

        // 清空本步思考日志
        clearThinkingLog();
        logDecision('start', { aiPiece, size, gamePhase, moveCount });

        // 空棋盘 → 走天元
        if (isBoardEmpty(board, size)) {
            const c = Math.floor(size / 2);
            logDecision('empty_board', { row: c, col: c });
            lastThinkTime = Math.round(performance.now() - startTime);
            return { row: c, col: c };
        }

        // ===== 第一步：Pre-Check 层（零引擎开销） =====
        const preResult = preCheck(board, aiPiece, size);
        if (preResult) {
            // 紧急局面：直接返回，跳过所有引擎
            logDecision('precheck_result', preResult);
            aiMoveHistory.push({ row: preResult.row, col: preResult.col, piece: aiPiece, reason: preResult.reason });
            moveCount++;
            lastThinkTime = Math.round(performance.now() - startTime);
            return { row: preResult.row, col: preResult.col };
        }

        // ===== 第二步：对手 VCF 检测 =====
        const oppVCFResult = checkOpponentVCF(board, aiPiece, size);
        if (oppVCFResult) {
            // 对手有强制攻杀，必须防守
            logDecision('opp_vcf_result', oppVCFResult);
            aiMoveHistory.push({ row: oppVCFResult.row, col: oppVCFResult.col, piece: aiPiece, reason: oppVCFResult.reason });
            moveCount++;
            lastThinkTime = Math.round(performance.now() - startTime);
            return { row: oppVCFResult.row, col: oppVCFResult.col };
        }

        // ===== 第三步：AI VCF 短路检测 =====
        // VCF 必胜 → 立即返回，不运行其他引擎
        if (aiModules.vcf.available()) {
            const vcfResult = AIVCF.findVCF(board, aiPiece, size);
            if (vcfResult) {
                logDecision('vcf_win', { row: vcfResult.row, col: vcfResult.col });
                aiMoveHistory.push({ row: vcfResult.row, col: vcfResult.col, piece: aiPiece, reason: 'vcf_win' });
                moveCount++;
                lastThinkTime = Math.round(performance.now() - startTime);
                return { row: vcfResult.row, col: vcfResult.col };
            }
        }

        // ===== 第四步：多引擎建议收集 =====
        // 获取时间预算，用于控制各引擎的搜索深度/时间
        const timeBudget = getTimeBudget();
        const engineBudget = timeBudget * TIME_CONFIG.engineTimeRatio;
        logDecision('time_budget', { total: timeBudget, engine: engineBudget, gamePhase });

        const suggestions = [];

        // 0. 开局库（前几手优先使用）
        if (aiModules.opening.available()) {
            const openingMove = AIOpening.getBestResponse(board, aiPiece, size);
            if (openingMove && openingMove.confidence >= 80) {
                suggestions.push({
                    row: openingMove.row, col: openingMove.col,
                    source: 'opening', confidence: openingMove.confidence,
                    comment: openingMove.comment
                });
                logDecision('opening', { row: openingMove.row, col: openingMove.col, confidence: openingMove.confidence });
            }
        }

        // 1. VCT（VCF 已在上面检测过，这里只检测 VCT，限制时间）
        if (aiModules.vcf.available() && elapsed < 1500) {
            const vctResult = AIVCF.findVCT(board, aiPiece, size);
            elapsed = performance.now() - startTime;
            if (vctResult) {
                suggestions.push({ row: vctResult.row, col: vctResult.col, source: 'vct', confidence: 99 });
                logDecision('vct', { row: vctResult.row, col: vctResult.col, time: Math.round(elapsed) });
            }
        }

        // 引擎收集（带时间预算控制）
        elapsed = performance.now() - startTime;
        const heavyBudget = timeBudget * 0.55; // 重引擎总预算 55%
        const mediumBudget = timeBudget * 0.75; // 中等引擎总预算 75%

        // 2. 终极策略引擎（最重，限制时间）
        if (aiModules.ultimate.available() && elapsed < heavyBudget) {
            const move = AIUltimate.getBestMove(board, aiPiece, size);
            elapsed = performance.now() - startTime;
            if (move) {
                suggestions.push({ ...move, source: 'ultimate', confidence: 98 });
                logDecision('ultimate', { row: move.row, col: move.col, time: Math.round(elapsed) });
            }
        }

        // 3. 增强搜索引擎
        if (aiModules.searchEnh.available() && elapsed < mediumBudget) {
            const remaining = timeBudget - elapsed;
            const searchDepth = remaining > 2000 ? 6 : (remaining > 1000 ? 4 : 3);
            const searchTime = Math.min(remaining * 0.5, 1500);
            const searchResult = AISearchEnhance.search(board, aiPiece, size, {
                maxDepth: searchDepth,
                maxTimeMs: searchTime,
                candidates: 15,
            });
            elapsed = performance.now() - startTime;
            if (searchResult && searchResult.row != null) {
                suggestions.push({
                    row: searchResult.row, col: searchResult.col,
                    source: 'searchEnh', confidence: 97,
                });
                logDecision('searchEnh', { row: searchResult.row, col: searchResult.col, time: Math.round(elapsed) });
            }
        }

        // 4. MCTS（较重，限制时间）
        if (aiModules.mcts.available() && elapsed < mediumBudget) {
            const move = AIMCTS.getBestMove(board, aiPiece, size);
            elapsed = performance.now() - startTime;
            if (move) {
                suggestions.push({ ...move, source: 'mcts', confidence: 96 });
                logDecision('mcts', { row: move.row, col: move.col, time: Math.round(elapsed) });
            }
        }

        // 5-10. 轻量引擎（仅在时间充裕时运行）
        if (elapsed < timeBudget * 0.85) {
            // 5. 极限模式引擎
            if (aiModules.extreme.available()) {
                const move = AIExtreme.getBestMove(board, aiPiece, size);
                if (move) suggestions.push({ ...move, source: 'extreme', confidence: 95 });
            }

            // 6. 标准 AI 搜索引擎
            if (aiModules.search.available()) {
                GomokuAI.setAIPiece(aiPiece);
                const move = GomokuAI.getBestMove(board);
                if (move) suggestions.push({ ...move, source: 'search', confidence: 85 });
            }

            // 7. 模式识别
            if (aiModules.pattern.available() && !aiModules.extreme.available() && !aiModules.ultimate.available()) {
                const move = AIPattern.getSuggestion(board, aiPiece);
                if (move) suggestions.push({ ...move, source: 'pattern', confidence: move.confidence || 70 });
            }

            // 8. 攻防策略
            if (aiModules.strategy.available() && !aiModules.extreme.available() && !aiModules.ultimate.available()) {
                const tactical = typeof AITactics !== 'undefined'
                    ? AITactics.getTacticalWeights(board, aiPiece, size)
                    : { attackWeight: 1.5, defenseWeight: 0.8 };
                const move = AIStrategy.getStrategicMove(board, aiPiece, size, tactical);
                if (move && move.confidence > 50) {
                    suggestions.push({ row: move.row, col: move.col, source: 'strategy', confidence: move.confidence });
                }
            }

            // 9. 战术调配
            if (aiModules.tactics.available() && !aiModules.extreme.available() && !aiModules.ultimate.available()) {
                const move = AITactics.getTacticalMove(board, aiPiece, size);
                if (move && move.confidence > 50) {
                    suggestions.push({ row: move.row, col: move.col, source: 'tactics', confidence: move.confidence });
                }
            }

            // 10. 记忆预测
            if (aiModules.memory.available()) {
                const recentMoves = (typeof AITactics !== 'undefined' && AITactics.getPlayerMoveHistory)
                    ? AITactics.getPlayerMoveHistory() : [];
                if (recentMoves.length > 0) {
                    const attackSuggestion = GomokuMemory.getAttackSuggestion(board, aiPiece, playerPiece, recentMoves);
                    if (attackSuggestion && attackSuggestion.confidence > 40) {
                        suggestions.push({
                            row: attackSuggestion.row, col: attackSuggestion.col,
                            source: 'memory', confidence: attackSuggestion.confidence
                        });
                    }
                }
            }
        }

        // 11. 用户弱点利用（大管家独有）
        const weakSpotMove = findWeakSpotMove(board, aiPiece, size);
        if (weakSpotMove) {
            suggestions.push({ ...weakSpotMove, source: 'weak_spot', confidence: 60 });
            logDecision('weak_spot', { row: weakSpotMove.row, col: weakSpotMove.col });
        }

        // 无任何建议 → 走天元
        if (suggestions.length === 0) {
            const c = Math.floor(size / 2);
            logDecision('fallback_center', { row: c, col: c });
            lastThinkTime = Math.round(performance.now() - startTime);
            return { row: c, col: c };
        }

        elapsed = performance.now() - startTime;
        logDecision('engines_done', { suggestionCount: suggestions.length, elapsed: Math.round(elapsed) });

        // ===== 第五步：加权投票共识决策 =====
        const finalMove = weightedConsensus(suggestions, board, aiPiece, size);
        logDecision('consensus', { row: finalMove.row, col: finalMove.col, suggestionCount: suggestions.length });

        // 记录 AI 落子
        if (finalMove) {
            aiMoveHistory.push({ row: finalMove.row, col: finalMove.col, piece: aiPiece });
            moveCount++;
        }

        // 更新思考耗时
        lastThinkTime = Math.round(performance.now() - startTime);
        logDecision('end', { thinkTime: lastThinkTime });

        return finalMove;
    }

    // ========== 加权投票共识决策（v3 改进版） ==========

    /**
     * 加权投票共识决策
     * v3 改进：
     *   - 使用阶段感知权重（getPhaseWeights）替代固定权重
     *   - VCF/VCT 一致推荐直接采用（无需验证）
     *   - 多引擎一致推荐阈值降低为 3
     *   - 修复防守权重（原 0.05 → 0.4，防守权重过低导致忽视对手威胁）
     *   - 添加 VCF/VCT 来源加分
     *   - 扩展 top 候选到 5 个
     *   - 添加开局库加分
     */
    function weightedConsensus(suggestions, board, aiPiece, size) {
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        const phaseWeights = getPhaseWeights();
        const voteMap = {};

        // 第一轮：加权投票
        for (const sug of suggestions) {
            const key = `${sug.row},${sug.col}`;
            if (!voteMap[key]) {
                voteMap[key] = { row: sug.row, col: sug.col, votes: 0, sources: [], maxConf: 0 };
            }
            // 使用阶段感知权重
            const moduleWeight = phaseWeights[sug.source] ? phaseWeights[sug.source].weight : 1.0;
            voteMap[key].votes += moduleWeight * (sug.confidence / 100);
            voteMap[key].sources.push(sug.source);
            voteMap[key].maxConf = Math.max(voteMap[key].maxConf, sug.confidence);
        }

        // 按投票分数降序排列
        const ranked = Object.values(voteMap).sort((a, b) => b.votes - a.votes);

        // 短路规则 1：VCF/VCT 一致推荐 → 直接采用（无需验证）
        if (ranked[0].sources.includes('vcf') || ranked[0].sources.includes('vct')) {
            logDecision('consensus_shortcut', { type: 'vcf_vct', row: ranked[0].row, col: ranked[0].col });
            return { row: ranked[0].row, col: ranked[0].col };
        }

        // 短路规则 2：多个 AI 一致推荐（>=3 个引擎）→ 直接采用
        if (ranked[0].sources.length >= 3) {
            logDecision('consensus_shortcut', { type: 'multi_agree', row: ranked[0].row, col: ranked[0].col, count: ranked[0].sources.length });
            return { row: ranked[0].row, col: ranked[0].col };
        }

        // 第二轮：用攻防评估做最终确认（top 5）
        const topMoves = ranked.slice(0, Math.min(5, ranked.length));
        let bestEval = -Infinity, bestMove = topMoves[0];

        for (const move of topMoves) {
            let atk = 0, def = 0;

            // 评估 AI 进攻价值
            board[move.row][move.col] = aiPiece;
            for (const [dr, dc] of DIRECTIONS) {
                atk += quickScore(board, move.row, move.col, dr, dc, aiPiece, size);
            }
            board[move.row][move.col] = EMPTY;

            // 评估防守价值（如果对手在此落子，AI 的损失）
            board[move.row][move.col] = playerPiece;
            for (const [dr, dc] of DIRECTIONS) {
                def += quickScore(board, move.row, move.col, dr, dc, playerPiece, size);
            }
            board[move.row][move.col] = EMPTY;

            // v3 修复：防守权重从 0.05 提升到 0.4
            // 原代码 atk * 0.95 - def * 0.05 几乎完全忽略防守
            // 新公式：进攻 60% + 防守 40% + 投票分
            const eval_ = atk * 0.6 + def * 0.4 + move.votes * 500;

            // 开局库加分：如果该位置是开局推荐位置，额外加分
            if (aiModules.opening.available()) {
                eval_ += AIOpening.getOpeningBonus(board, move.row, move.col, aiPiece, size);
            }

            // VCF/VCT 来源加分（即使不在短路规则中命中，也给予高分）
            if (move.sources.includes('vcf')) eval_ += 50000;
            if (move.sources.includes('vct')) eval_ += 30000;

            if (eval_ > bestEval) { bestEval = eval_; bestMove = move; }
        }

        logDecision('consensus_eval', { row: bestMove.row, col: bestMove.col, eval: bestEval, sources: bestMove.sources });
        return { row: bestMove.row, col: bestMove.col };
    }

    // ========== 二、全局策略管理器 ==========

    /**
     * 评估当前局势（每次落子后调用）
     * @returns {Object} { phase, advantage, suggestion }
     */
    function evaluateGameSituation(board, aiPiece, size) {
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        let aiScore = 0, playerScore = 0;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                const piece = board[r][c];
                for (const [dr, dc] of DIRECTIONS) {
                    // 避免重复计数同一条线
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === piece) continue;
                    const score = evalLineForSituation(board, r, c, dr, dc, piece, size);
                    if (piece === aiPiece) aiScore += score;
                    else playerScore += score;
                }
            }
        }

        const total = aiScore + playerScore;
        let advantage = total > 0 ? (aiScore - playerScore) / total : 0;

        // 判断阶段
        if (advantage > 0.6) gamePhase = 'winning';
        else if (advantage > 0.2) gamePhase = 'advantage';
        else if (advantage < -0.6) gamePhase = 'losing';
        else if (advantage < -0.2) gamePhase = 'disadvantage';
        else gamePhase = 'normal';

        // 策略建议
        let suggestion = 'balanced';
        if (gamePhase === 'winning') suggestion = 'finish';       // 加速结束
        if (gamePhase === 'losing') suggestion = 'desperate';      // 孤注一掷
        if (gamePhase === 'advantage') suggestion = 'press';        // 乘胜追击
        if (gamePhase === 'disadvantage') suggestion = 'defend';    // 稳固防守

        return { phase: gamePhase, advantage: Math.round(advantage * 100) / 100, suggestion };
    }

    /**
     * 评估单条线的局势分值
     */
    function evalLineForSituation(board, row, col, dr, dc, piece, size) {
        let count = 0, block = 0;
        let r = row, c = col;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {} else block++;
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {} else block++;
        if (count >= 5) return 100000;
        if (block === 2) return 0;
        if (count === 4) return block === 0 ? 10000 : 5000;
        if (count === 3) return block === 0 ? 1000 : 200;
        if (count === 2) return block === 0 ? 100 : 20;
        return 0;
    }

    /**
     * 判断是否应该提前认输（AI 对决模式）
     * 连续 N 步处于劣势且差距拉大
     */
    function shouldResign(board, aiPiece, size) {
        const situation = evaluateGameSituation(board, aiPiece, size);
        if (situation.phase !== 'losing') return false;
        if (moveCount < 15) return false; // 太早不认输
        return situation.advantage < -0.5;
    }

    /**
     * 判断是否可以宣告胜利（AI 优势极大）
     */
    function canDeclareWin(board, aiPiece, size) {
        const situation = evaluateGameSituation(board, aiPiece, size);
        return situation.phase === 'winning' && situation.advantage > 0.7;
    }

    /**
     * 动态难度建议（基于用户表现）
     * v3 改进：综合考虑胜率、平均步数、近期趋势
     * @returns {Object} { suggestedDifficulty, reason }
     */
    function suggestDifficulty() {
        if (userProfile.totalGames < 5) {
            return { suggestedDifficulty: null, reason: '数据不足，至少需要 5 局数据' };
        }

        const winRate = userProfile.wins / userProfile.totalGames;

        // 计算近期趋势（最近 10 局的胜率）
        const recentGames = userProfile.recentWinRates.slice(-10);
        let recentTrend = 0;
        if (recentGames.length >= 5) {
            recentTrend = recentGames.filter(r => r === 'win').length / recentGames.length;
        }

        // 综合评估：胜率 + 近期趋势 + 平均步数
        // 平均步数少 → 用户实力强（快速获胜或快速失败）
        const avgMoves = userProfile.avgMoves;
        const fastGames = avgMoves < 30 && avgMoves > 0;

        if (winRate > 0.7 || (recentTrend > 0.8 && recentGames.length >= 5)) {
            return { suggestedDifficulty: 3, reason: `胜率 ${Math.round(winRate * 100)}%，近期趋势 ${Math.round(recentTrend * 100)}%，建议提升难度` };
        }
        if (winRate > 0.5 && !fastGames) {
            return { suggestedDifficulty: 2, reason: `胜率 ${Math.round(winRate * 100)}%，当前难度合适` };
        }
        if (winRate < 0.2 || (recentTrend < 0.2 && recentGames.length >= 5)) {
            return { suggestedDifficulty: 1, reason: `胜率 ${Math.round(winRate * 100)}%，近期趋势 ${Math.round(recentTrend * 100)}%，建议降低难度` };
        }

        return { suggestedDifficulty: null, reason: `胜率 ${Math.round(winRate * 100)}%，当前难度合适` };
    }

    /**
     * 记忆管理：清理过期记忆
     */
    function manageMemory() {
        if (typeof GomokuMemory === 'undefined') return;
        const records = GomokuMemory.getRecords();
        if (records.length > 150) {
            // 保留最近 100 条记录
            if (typeof GomokuMemory.trimRecords === 'function') {
                GomokuMemory.trimRecords(100);
            }
        }
    }

    // ========== 三、智能管家 + 用户分析（v3 改进版） ==========

    /**
     * 更新用户画像（每局结束时调用）
     * v3 改进：
     *   - 追踪近期胜负趋势（recentWinRates）
     *   - 记录用户开局偏好（openingPreferences）
     *   - 改进弱点分析（使用相对坐标）
     */
    function updateUserProfile(result, moveHistory, boardSize) {
        userProfile.totalGames++;

        // 记录胜负
        if (result.winner === 'player') {
            userProfile.wins++;
            userProfile.recentWinRates.push('win');
        } else if (result.winner === 'ai') {
            userProfile.losses++;
            userProfile.recentWinRates.push('loss');
        } else {
            userProfile.draws++;
            userProfile.recentWinRates.push('draw');
        }

        // 限制近期记录长度（保留最近 50 局）
        if (userProfile.recentWinRates.length > 50) {
            userProfile.recentWinRates = userProfile.recentWinRates.slice(-50);
        }

        // 分析用户落子方向偏好
        const aiPiece = result.aiPiece || 2;
        const playerMoves = (moveHistory || []).filter(m => m.piece !== aiPiece);
        for (let i = 0; i < playerMoves.length - 1; i++) {
            const dr = playerMoves[i + 1].row - playerMoves[i].row;
            const dc = playerMoves[i + 1].col - playerMoves[i].col;
            if (dr === 0 && dc !== 0) userProfile.preferredDirections[0]++;
            else if (dc === 0 && dr !== 0) userProfile.preferredDirections[1]++;
            else if (dr === dc && dr !== 0) userProfile.preferredDirections[2]++;
            else if (dr === -dc && dr !== 0) userProfile.preferredDirections[3]++;
        }

        // 分析用户位置偏好
        for (const m of playerMoves) {
            const key = `${m.row},${m.col}`;
            userProfile.preferredPositions[key] = (userProfile.preferredPositions[key] || 0) + 1;
        }

        // 记录用户开局偏好（前 3 手的相对位置）
        if (playerMoves.length >= 2) {
            const center = Math.floor(boardSize / 2);
            const openingOffset = {
                first: { row: playerMoves[0].row - center, col: playerMoves[0].col - center },
                second: { row: playerMoves[1].row - center, col: playerMoves[1].col - center },
            };
            userProfile.openingPreferences.push(openingOffset);
            // 限制长度
            if (userProfile.openingPreferences.length > 20) {
                userProfile.openingPreferences = userProfile.openingPreferences.slice(-20);
            }
        }

        // 分析激进程度
        if (playerMoves.length > 0) {
            const maxDir = Math.max(...userProfile.preferredDirections, 1);
            userProfile.aggressionLevel = userProfile.preferredDirections.reduce((a, b) => a + b, 0) > 0
                ? maxDir / userProfile.preferredDirections.reduce((a, b) => a + b, 0)
                : 0.5;
        }

        // 更新平均步数
        userProfile.avgMoves = Math.round(
            (userProfile.avgMoves * (userProfile.totalGames - 1) + (moveHistory ? moveHistory.length : 0))
            / userProfile.totalGames
        );

        // 识别用户弱点（v3 改进：使用相对坐标）
        analyzeWeakSpots(result, moveHistory, boardSize);
    }

    /**
     * 分析用户弱点位置
     * v3 改进：使用相对坐标（相对于棋盘中心），而非绝对坐标
     * 这样在不同棋盘大小下都能复用弱点信息
     */
    function analyzeWeakSpots(result, moveHistory, boardSize) {
        if (!moveHistory || result.winner !== 'ai') return;

        const aiPiece = result.aiPiece || 2;
        const playerMoves = moveHistory.filter(m => m.piece !== aiPiece);
        if (playerMoves.length < 3) return;

        const center = Math.floor(boardSize / 2);

        // 用户最后几步可能是失误（使用相对坐标存储）
        const recentMoves = playerMoves.slice(-3);
        for (const m of recentMoves) {
            // 使用相对坐标（偏移量），便于跨棋盘大小复用
            const relRow = m.row - center;
            const relCol = m.col - center;
            const key = `${relRow},${relCol}`;
            if (!userProfile.weakSpots.includes(key)) {
                userProfile.weakSpots.push(key);
            }
        }

        // 限制弱点列表长度
        if (userProfile.weakSpots.length > 20) {
            userProfile.weakSpots = userProfile.weakSpots.slice(-15);
        }
    }

    /**
     * 利用用户弱点寻找进攻位置
     * v3 改进：支持相对坐标转换回绝对坐标
     */
    function findWeakSpotMove(board, aiPiece, size) {
        if (userProfile.weakSpots.length === 0) return null;

        const center = Math.floor(size / 2);
        let bestMove = null, bestScore = 0;

        for (const key of userProfile.weakSpots) {
            const [relRow, relCol] = key.split(',').map(Number);
            // 将相对坐标转换为绝对坐标
            const row = relRow + center;
            const col = relCol + center;

            // 边界检查
            if (row < 0 || row >= size || col < 0 || col >= size) continue;
            if (board[row][col] !== EMPTY) continue;

            // 评估 AI 在此位置的进攻价值
            let score = 0;
            board[row][col] = aiPiece;
            for (const [dr, dc] of DIRECTIONS) {
                score += quickScore(board, row, col, dr, dc, aiPiece, size);
            }
            board[row][col] = EMPTY;

            // 如果用户经常在这个区域失误，额外加分
            score += 50;

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col };
            }
        }

        return bestMove && bestScore > 200 ? bestMove : null;
    }

    /**
     * 获取用户分析报告
     */
    function getUserReport() {
        const winRate = userProfile.totalGames > 0
            ? Math.round(userProfile.wins / userProfile.totalGames * 100) : 0;

        const topDirs = userProfile.preferredDirections
            .map((count, idx) => ({ name: ['水平', '垂直', '右斜', '左斜'][idx], count }))
            .sort((a, b) => b.count - a.count);

        const topPositions = Object.entries(userProfile.preferredPositions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([pos, count]) => ({ position: pos, count }));

        const style = userProfile.aggressionLevel > 0.6 ? '激进型' :
                       userProfile.aggressionLevel < 0.4 ? '防守型' : '均衡型';

        // 计算近期趋势
        const recentGames = userProfile.recentWinRates.slice(-10);
        let recentWinRate = 0;
        if (recentGames.length > 0) {
            recentWinRate = Math.round(recentGames.filter(r => r === 'win').length / recentGames.length * 100);
        }

        return {
            totalGames: userProfile.totalGames,
            wins: userProfile.wins,
            losses: userProfile.losses,
            draws: userProfile.draws,
            winRate: winRate + '%',
            recentWinRate: recentWinRate + '%',
            avgMoves: userProfile.avgMoves,
            style,
            preferredDirection: topDirs[0] ? topDirs[0].name : '无',
            topPositions,
            weakSpotsCount: userProfile.weakSpots.length,
            openingPreferencesCount: userProfile.openingPreferences.length,
            lastThinkTime,
            gamePhase,
        };
    }

    // ========== 游戏生命周期 ==========

    /**
     * 游戏开始时重置状态
     */
    function onGameStart() {
        moveCount = 0;
        aiMoveHistory = [];
        currentGamePlayerMoves = [];
        gameStartTime = Date.now();
        gamePhase = 'normal';
        clearThinkingLog(); // v3 新增：清空上局思考日志
    }

    /**
     * 游戏结束时更新用户画像和管理记忆
     */
    function onGameEnd(result, moveHistory, boardSize) {
        updateUserProfile(result, moveHistory, boardSize);
        manageMemory();
    }

    /**
     * 记录用户落子到当前对局历史（供 onGameEnd 使用）
     */
    function onPlayerMove(row, col) {
        currentGamePlayerMoves.push({ row, col });
    }

    /**
     * 完全重置 AI 管理器状态
     */
    function reset() {
        moveCount = 0;
        aiMoveHistory = [];
        currentGamePlayerMoves = [];
        gamePhase = 'normal';
        lastThinkTime = 0;
        clearThinkingLog(); // v3 新增：清空思考日志
        // 清理增强搜索引擎状态
        if (typeof AISearchEnhance !== 'undefined') {
            AISearchEnhance.clearTT();
            AISearchEnhance.clearHistory();
        }
    }

    // ========== 导出接口 ==========

    return {
        // 基础控制
        isEnabled,
        setEnabled,

        // 核心调度
        getBestMove,

        // 局面评估
        evaluateGameSituation,
        shouldResign,
        canDeclareWin,

        // 难度建议
        suggestDifficulty,

        // 用户分析
        getUserProfile,
        getUserReport,

        // 状态查询
        getGamePhase,
        getLastThinkTime,

        // 游戏生命周期
        onGameStart,
        onGameEnd,
        onPlayerMove,

        // 重置
        reset,

        // v3 新增接口
        getThinkingLog,     // () => array — 获取思考日志
        clearThinkingLog,   // () => void — 清空思考日志
        getTimeBudget,      // () => number — 获取当前时间预算
        getPhaseWeights,    // () => object — 获取当前阶段权重
    };
})();
