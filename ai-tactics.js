/**
 * AI 五子棋 - 实时战术调配引擎 v2
 * AITactics：根据用户下棋位置和棋盘态势，实时调配攻防策略
 * 功能：
 *   1. 游戏阶段检测（开局/中局/残局）
 *   2. 用户下棋风格分析（激进/防守/均衡）
 *   3. 实时威胁等级评估
 *   4. 动态攻防权重调配
 *   5. 焦点区域检测（关键战场）
 *   6. 反制策略生成
 */

const AITactics = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // 游戏阶段定义
    const PHASE = { OPENING: 'opening', MID: 'midgame', LATE: 'late' };

    // 内部状态：追踪用户下棋历史
    let playerMoveHistory = [];
    let lastAnalysis = null;
    let cachedPlayerStyle = null;
    let cachedStyleHistoryLen = 0;

    // 威胁评估缓存
    let threatCacheKey = null;
    let threatCacheResult = null;

    /**
     * 重置战术状态（新游戏时调用）
     */
    function reset() {
        playerMoveHistory = [];
        lastAnalysis = null;
        cachedPlayerStyle = null;
        cachedStyleHistoryLen = 0;
        threatCacheKey = null;
        threatCacheResult = null;
    }

    /**
     * 记录用户落子（每次用户下棋后调用）
     */
    function recordPlayerMove(row, col) {
        playerMoveHistory.push({ row, col, index: playerMoveHistory.length });
        lastAnalysis = null; // 清除缓存，强制重新分析
        cachedPlayerStyle = null; // 清除风格缓存
        threatCacheKey = null; // 清除威胁缓存
        threatCacheResult = null;
    }

    /**
     * 检测游戏阶段
     * @returns {string} 'opening' | 'midgame' | 'late'
     */
    function detectGamePhase(board, size) {
        let moveCount = 0;
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) moveCount++;

        if (moveCount <= 8) return PHASE.OPENING;
        if (moveCount <= 35) return PHASE.MID;
        return PHASE.LATE;
    }

    /**
     * 分析用户下棋风格
     * 通过分析用户落子分布、连子倾向、中心偏好等判断
     * @returns {Object} { style: 'aggressive'|'defensive'|'balanced', score: number }
     */
    function analyzePlayerStyle(board, playerPiece, size) {
        if (playerMoveHistory.length < 3) {
            return { style: 'balanced', score: 0.5, aggression: 0.5 };
        }

        // 缓存机制：如果历史长度未变且已有缓存，直接返回
        if (cachedPlayerStyle && cachedStyleHistoryLen === playerMoveHistory.length) {
            return cachedPlayerStyle;
        }

        let aggressionScore = 0;
        let defenseScore = 0;
        let centerPreference = 0;
        const center = (size - 1) / 2;
        const maxDist = center;

        // 分析最近 N 步用户的下棋特征
        const recentMoves = playerMoveHistory.slice(-Math.min(8, playerMoveHistory.length));

        for (const move of recentMoves) {
            const { row, col } = move;

            // 1. 中心偏好度
            const dist = Math.sqrt((row - center) ** 2 + (col - center) ** 2);
            centerPreference += 1 - (dist / maxDist);

            // 2. 攻击倾向：落子后形成的进攻棋型
            const origPiece = board[row][col];
            try {
                board[row][col] = playerPiece;
                let attackPotential = 0;
                for (const [dr, dc] of DIRECTIONS) {
                    const info = scanDir(board, row, col, dr, dc, playerPiece, size);
                    if (info.count >= 3) attackPotential += info.count * info.openEnds * 50;
                    else if (info.count === 2) attackPotential += info.openEnds * 10;
                    if (info.jumps > 0) attackPotential += info.jumps * 15;
                }
                aggressionScore += attackPotential;
            } finally {
                board[row][col] = origPiece;
            }

            // 3. 防守倾向：落子是否靠近对手棋子（封堵行为）
            const opp = playerPiece === BLACK ? WHITE : BLACK;
            let nearOppCount = 0;
            for (const [dr, dc] of DIRECTIONS) {
                for (let step = 1; step <= 2; step++) {
                    const nr = row + dr * step, nc = col + dc * step;
                    if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === opp) {
                        nearOppCount++;
                    }
                }
            }
            defenseScore += nearOppCount * 8;
        }

        // 归一化
        const totalMoves = recentMoves.length;
        aggressionScore /= totalMoves;
        defenseScore /= totalMoves;
        centerPreference /= totalMoves;

        // 综合判断
        const aggression = Math.min(1, aggressionScore / 200);
        const defensiveness = Math.min(1, defenseScore / 40);

        let style, score;
        if (aggression > defensiveness * 1.3 && aggression > 0.4) {
            style = 'aggressive';
            score = aggression;
        } else if (defensiveness > aggression * 1.3 && defensiveness > 0.4) {
            style = 'defensive';
            score = defensiveness;
        } else {
            style = 'balanced';
            score = (aggression + defensiveness) / 2;
        }

        const result = { style, score, aggression, defensiveness, centerPreference };
        cachedPlayerStyle = result;
        cachedStyleHistoryLen = playerMoveHistory.length;
        return result;
    }

    /**
     * 分析用户最后一步棋的意图
     * @returns {Object} { intent: 'attack'|'defense'|'expand'|'setup', threatLevel: number }
     */
    function analyzeLastMoveIntent(board, playerPiece, size) {
        if (playerMoveHistory.length === 0) {
            return { intent: 'none', threatLevel: 0 };
        }

        const last = playerMoveHistory[playerMoveHistory.length - 1];
        const { row, col } = last;
        const opp = playerPiece === BLACK ? WHITE : BLACK;

        const origVal = board[row][col];
        let maxAttack = 0, maxDefense = 0;
        let liveThrees = 0, rushFours = 0, liveFours = 0;
        let oppNearby = 0;
        try {
            board[row][col] = playerPiece;

            // 分析用户落子后形成的棋型
            for (const [dr, dc] of DIRECTIONS) {
                const info = scanDir(board, row, col, dr, dc, playerPiece, size);

                // 用户进攻棋型
                if (info.count >= 5) maxAttack += 1000000;
                else if (info.count === 4 && info.openEnds === 2) { liveFours++; maxAttack += 100000; }
                else if (info.count === 4 && info.openEnds === 1) { rushFours++; maxAttack += 10000; }
                else if (info.count === 3 && info.openEnds === 2) { liveThrees++; maxAttack += 5000; }
                else if (info.count === 3 && info.openEnds === 1) maxAttack += 500;
                else if (info.count === 2 && info.openEnds === 2) maxAttack += 200;
                if (info.jumps > 0) maxAttack += info.jumps * 100;

                // 检查是否靠近对手（防守意图）
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < size && c >= 0 && c < size) {
                    if (board[r][c] === opp) { oppNearby++; break; }
                    if (board[r][c] !== EMPTY) break;
                    r += dr; c += dc;
                }
                r = row - dr; c = col - dc;
                while (r >= 0 && r < size && c >= 0 && c < size) {
                    if (board[r][c] === opp) { oppNearby++; break; }
                    if (board[r][c] !== EMPTY) break;
                    r -= dr; c -= dc;
                }
            }
        } finally {
            board[row][col] = origVal;
        }

        // 判断意图
        let intent, threatLevel;

        if (liveFours > 0 || rushFours >= 2 || (rushFours >= 1 && liveThrees >= 1) || liveThrees >= 2) {
            intent = 'attack';
            threatLevel = 95 + Math.min(5, liveFours * 2 + rushFours);
        } else if (rushFours === 1 || liveThrees === 1) {
            intent = 'attack';
            threatLevel = 60 + (rushFours ? 20 : 0) + liveThrees * 10;
        } else if (maxAttack > 300) {
            intent = 'setup';
            threatLevel = 30 + maxAttack / 50;
        } else if (oppNearby >= 3) {
            intent = 'defense';
            threatLevel = 20 + oppNearby * 5;
        } else {
            intent = 'expand';
            threatLevel = 10 + maxAttack / 30;
        }

        return {
            intent,
            threatLevel: Math.min(100, Math.round(threatLevel)),
            liveFours, rushFours, liveThrees,
            attackScore: maxAttack,
            oppNearby
        };
    }

    /**
     * 评估整体威胁等级
     * 综合考虑用户的所有威胁和AI的防守状态
     * @returns {Object} { level: number, mustDefend: boolean, criticalPositions: Array }
     */
    function evaluateThreatLevel(board, aiPiece, size) {
        // 构建缓存键：棋子数量 + AI棋子类型
        let pieceCount = 0;
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) pieceCount++;

        const cacheKey = `${pieceCount}:${aiPiece}`;
        if (threatCacheKey === cacheKey && threatCacheResult) {
            return threatCacheResult;
        }

        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        const criticalPositions = [];
        let totalThreat = 0;
        let mustDefend = false;

        // 使用预计算的候选位置（有邻居的空位），避免遍历全盘
        const candidates = getNeighborCandidates(board, size, 2);

        for (const { row, col } of candidates) {
            // 模拟用户在此落子
            board[row][col] = playerPiece;
            try {
                let threat = 0;
                let isCritical = false;

                for (const [dr, dc] of DIRECTIONS) {
                    const info = scanDir(board, row, col, dr, dc, playerPiece, size);
                    if (info.count >= 5) { threat += 1000000; isCritical = true; }
                    else if (info.count === 4 && info.openEnds === 2) { threat += 100000; isCritical = true; }
                    else if (info.count === 4 && info.openEnds === 1) { threat += 8000; isCritical = true; }
                    else if (info.count === 3 && info.openEnds === 2) { threat += 5000; }
                    else if (info.count === 3 && info.openEnds === 1) { threat += 500; }
                    else if (info.count === 2 && info.openEnds === 2) { threat += 200; }
                }

                if (threat > 0) {
                    criticalPositions.push({ row, col, threat });
                    totalThreat += threat;
                }
                if (isCritical) mustDefend = true;
            } finally {
                board[row][col] = EMPTY;
            }
        }

        criticalPositions.sort((a, b) => b.threat - a.threat);

        const result = {
            level: Math.min(100, Math.round(totalThreat / 500)),
            mustDefend,
            criticalPositions: criticalPositions.slice(0, 5),
            totalThreat
        };

        threatCacheKey = cacheKey;
        threatCacheResult = result;
        return result;
    }

    /**
     * 检测焦点区域（当前棋盘上最关键的战场）
     * @returns {Object} { center: {row, col}, radius: number, intensity: number }
     */
    function detectFocusArea(board, size) {
        // 优化：只在有棋子的区域附近计算热力图
        let minR = size, maxR = 0, minC = size, maxC = 0;
        const spread = 3;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) {
                    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
                    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
                }
            }
        }

        // 空棋盘：返回中心
        if (minR > maxR) {
            const center = Math.floor(size / 2);
            return { center: { row: center, col: center }, radius: 5, intensity: 0 };
        }

        // 扩展范围并限制边界
        const startR = Math.max(0, minR - spread);
        const endR = Math.min(size - 1, maxR + spread);
        const startC = Math.max(0, minC - spread);
        const endC = Math.min(size - 1, maxC + spread);

        // 使用 Map 替代完整的 size×size 二维数组，仅分配所需区域
        const heatMap = new Map();
        let maxHeat = 0;

        // 为每个有棋子的位置生成热力图（仅在有棋子的区域范围内）
        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                if (board[r][c] === EMPTY) continue;

                for (let dr = -spread; dr <= spread; dr++) {
                    for (let dc = -spread; dc <= spread; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= startR && nr <= endR && nc >= startC && nc <= endC) {
                            const dist = Math.abs(dr) + Math.abs(dc);
                            const heat = Math.max(0, (spread + 1 - dist) * 3);
                            const key = nr * size + nc;
                            const newHeat = (heatMap.get(key) || 0) + heat;
                            heatMap.set(key, newHeat);
                            if (newHeat > maxHeat) maxHeat = newHeat;
                        }
                    }
                }
            }
        }

        // 用 3x3 滑动窗口找最高密度区域（仅在有效范围内搜索）
        let bestR = Math.floor(size / 2), bestC = Math.floor(size / 2);
        let bestHeat = 0;

        for (let r = startR + 1; r < endR; r++) {
            for (let c = startC + 1; c < endC; c++) {
                let areaHeat = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        areaHeat += heatMap.get((r + dr) * size + (c + dc)) || 0;
                    }
                }
                if (areaHeat > bestHeat) {
                    bestHeat = areaHeat;
                    bestR = r;
                    bestC = c;
                }
            }
        }

        // 计算焦点半径（棋子分布的离散程度）
        let pieceCount = 0;
        let weightedDist = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) {
                    pieceCount++;
                    weightedDist += Math.abs(r - bestR) + Math.abs(c - bestC);
                }
            }
        }

        const avgDist = pieceCount > 0 ? weightedDist / pieceCount : 0;
        const radius = Math.max(3, Math.min(8, Math.ceil(avgDist) + 2));
        const intensity = maxHeat > 0 ? Math.min(100, Math.round(bestHeat / (maxHeat * 0.1))) : 0;

        return { center: { row: bestR, col: bestC }, radius, intensity };
    }

    /**
     * 核心功能：获取实时战术调配参数
     * 根据当前棋盘态势，动态计算攻防权重
     * @returns {Object} {
     *   attackWeight: number,    // 进攻权重倍率 (0.5 ~ 2.0)
     *   defenseWeight: number,   // 防守权重倍率 (0.5 ~ 2.0)
     *   focusArea: Object,       // 焦点区域
     *   gamePhase: string,       // 游戏阶段
     *   playerStyle: Object,     // 用户风格分析
     *   lastMoveIntent: Object,  // 用户最后一步意图
     *   threatLevel: Object,     // 威胁等级
     *   strategy: string         // 推荐策略 'full_attack'|'attack'|'balanced'|'defense'|'full_defense'
     * }
     */
    function getTacticalWeights(board, aiPiece, size) {
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;

        // 1. 检测游戏阶段
        const gamePhase = detectGamePhase(board, size);

        // 2. 分析用户风格
        const playerStyle = analyzePlayerStyle(board, playerPiece, size);

        // 3. 分析用户最后一步意图
        const lastMoveIntent = analyzeLastMoveIntent(board, playerPiece, size);

        // 4. 评估威胁等级
        const threatLevel = evaluateThreatLevel(board, aiPiece, size);

        // 5. 检测焦点区域
        const focusArea = detectFocusArea(board, size);

        // 6. 计算动态权重（攻势绝对优先）
        let attackWeight = 1.5;
        let defenseWeight = 0.7;

        // 基于游戏阶段调整
        if (gamePhase === PHASE.OPENING) {
            // 开局：全力进攻，抢占有利位置
            attackWeight += 0.4;
            defenseWeight -= 0.1;
        } else if (gamePhase === PHASE.MID) {
            // 中局：根据态势动态调整
            if (lastMoveIntent.threatLevel > 70) {
                // 用户威胁高 → 适度防守，但保持强攻
                defenseWeight += 0.25;
                attackWeight += 0.2;
            } else if (lastMoveIntent.threatLevel > 40) {
                // 中等威胁 → 攻守兼备，偏进攻
                defenseWeight += 0.1;
                attackWeight += 0.3;
            } else {
                // 低威胁 → 全力进攻
                attackWeight += 0.5;
                defenseWeight -= 0.2;
            }
        } else {
            // 残局：激进进攻
            if (threatLevel.mustDefend) {
                defenseWeight += 0.4;
                attackWeight += 0.1;
            } else {
                attackWeight += 0.6;
                defenseWeight -= 0.1;
            }
        }

        // 基于用户风格调整
        if (playerStyle.style === 'aggressive') {
            // 用户激进 → AI 以攻对攻，寻找反击机会
            attackWeight += 0.3;
            defenseWeight += 0.1;
        } else if (playerStyle.style === 'defensive') {
            // 用户保守 → AI 大幅加强进攻
            attackWeight += 0.5;
            defenseWeight -= 0.2;
        }

        // 基于最后一步意图调整
        if (lastMoveIntent.intent === 'attack') {
            // 用户在进攻 → AI 以攻代守，同时防守
            defenseWeight += lastMoveIntent.threatLevel / 100 * 0.3;
            attackWeight += 0.2;
        } else if (lastMoveIntent.intent === 'setup') {
            // 用户在布局 → AI 抢先进攻
            attackWeight += 0.4;
        }

        // 紧急威胁覆盖一切
        if (threatLevel.mustDefend) {
            defenseWeight = Math.max(defenseWeight, 1.8);
        }

        // 限制权重范围
        attackWeight = Math.max(0.5, Math.min(2.0, attackWeight));
        defenseWeight = Math.max(0.5, Math.min(2.0, defenseWeight));

        // 确定策略类型
        let strategy;
        const ratio = attackWeight / (attackWeight + defenseWeight);
        if (ratio > 0.7) strategy = 'full_attack';
        else if (ratio > 0.55) strategy = 'attack';
        else if (ratio > 0.45) strategy = 'balanced';
        else if (ratio > 0.3) strategy = 'defense';
        else strategy = 'full_defense';

        const result = {
            attackWeight: Math.round(attackWeight * 100) / 100,
            defenseWeight: Math.round(defenseWeight * 100) / 100,
            focusArea,
            gamePhase,
            playerStyle,
            lastMoveIntent,
            threatLevel,
            strategy
        };

        lastAnalysis = result;
        return result;
    }

    /**
     * 获取战术推荐落子位置
     * 综合所有分析，推荐最佳战术位置
     * @returns {Object|null} { row, col, reason, confidence }
     */
    function getTacticalMove(board, aiPiece, size) {
        const tactics = getTacticalWeights(board, aiPiece, size);
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;

        // 如果有紧急威胁，返回防守位置
        if (tactics.threatLevel.mustDefend && tactics.threatLevel.criticalPositions.length > 0) {
            const pos = tactics.threatLevel.criticalPositions[0];
            return {
                row: pos.row,
                col: pos.col,
                reason: 'critical_defense',
                confidence: 95,
                tactics
            };
        }

        // 根据策略选择候选区域
        const candidates = getTacticalCandidates(board, aiPiece, size, tactics);
        if (candidates.length === 0) return null;

        // 根据策略权重评估每个候选
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            let score = 0;
            let atkScore = 0, defScore = 0;

            // 进攻评估
            board[row][col] = aiPiece;
            try {
                for (const [dr, dc] of DIRECTIONS) {
                    const info = scanDir(board, row, col, dr, dc, aiPiece, size);
                    atkScore += tacticalAttackScore(info);
                }
            } finally {
                board[row][col] = EMPTY;
            }

            // 防守评估
            board[row][col] = playerPiece;
            try {
                for (const [dr, dc] of DIRECTIONS) {
                    const info = scanDir(board, row, col, dr, dc, playerPiece, size);
                    defScore += tacticalDefenseScore(info);
                }
            } finally {
                board[row][col] = EMPTY;
            }

            // 攻势绝对优先：进攻权重远高于防守
            score = atkScore * tactics.attackWeight * 1.5 + defScore * tactics.defenseWeight * 0.7;

            // 焦点区域加分
            const focusDist = Math.abs(row - tactics.focusArea.center.row) +
                              Math.abs(col - tactics.focusArea.center.col);
            if (focusDist <= tactics.focusArea.radius) {
                score *= 1.15;
            }

            // 中心位置微调加分
            const center = (size - 1) / 2;
            const centerDist = Math.abs(row - center) + Math.abs(col - center);
            score += Math.max(0, (size - centerDist)) * 2;

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, score };
            }
        }

        if (!bestMove) return null;

        return {
            row: bestMove.row,
            col: bestMove.col,
            reason: tactics.strategy,
            confidence: Math.min(90, 50 + Math.log10(bestMove.score + 1) * 10),
            tactics
        };
    }

    /**
     * 获取战术候选位置（在焦点区域附近优先）
     */
    function getTacticalCandidates(board, aiPiece, size, tactics) {
        const map = new Map();
        const range = 2;

        // 第一优先级：焦点区域附近的空位
        const focusR = tactics.focusArea.center.row;
        const focusC = tactics.focusArea.center.col;
        const focusRadius = tactics.focusArea.radius;

        // 优化：只收集有邻居的空位，避免遍历全盘
        const neighborCandidates = getNeighborCandidates(board, size, range);

        for (const { row, col } of neighborCandidates) {
            // 焦点区域内的位置优先
            const focusDist = Math.abs(row - focusR) + Math.abs(col - focusC);
            const inFocus = focusDist <= focusRadius;

            const key = row * size + col;
            if (!map.has(key)) {
                map.set(key, { row, col, priority: inFocus ? 2 : 1 });
            }
        }

        const arr = Array.from(map.values());
        // 焦点区域优先排序
        arr.sort((a, b) => b.priority - a.priority);

        // 限制候选数量
        const maxCandidates = tactics.strategy === 'full_defense' ? 15 : 20;
        return arr.slice(0, maxCandidates);
    }

    /**
     * 战术进攻评分
     */
    function tacticalAttackScore(info) {
        const { count, openEnds, jumps } = info;
        if (count >= 5) return 10000000;
        if (openEnds === 0 && jumps === 0) return 0;

        switch (count) {
            case 4:
                if (openEnds === 2) return 1000000;
                if (openEnds === 1) return 8000;
                if (jumps > 0 && openEnds >= 1) return 6000;
                return 0;
            case 3:
                if (openEnds === 2) return jumps > 0 ? 25000 : 12000;
                if (openEnds === 1) return jumps > 0 ? 3000 : 1000;
                return 0;
            case 2:
                if (openEnds === 2) return jumps > 0 ? 600 : 400;
                if (openEnds === 1) return jumps > 0 ? 200 : 100;
                return 0;
            case 1:
                return openEnds === 2 ? 20 : (openEnds === 1 ? 5 : 0);
            default: return 0;
        }
    }

    /**
     * 战术防守评分
     */
    function tacticalDefenseScore(info) {
        const { count, openEnds, jumps } = info;
        if (count >= 5) return 9000000;
        if (openEnds === 0 && jumps === 0) return 0;

        switch (count) {
            case 4:
                if (openEnds === 2) return 900000;
                if (openEnds === 1) return 7500;
                if (jumps > 0 && openEnds >= 1) return 5500;
                return 0;
            case 3:
                if (openEnds === 2) return jumps > 0 ? 22000 : 10000;
                if (openEnds === 1) return jumps > 0 ? 2800 : 950;
                return 0;
            case 2:
                if (openEnds === 2) return jumps > 0 ? 500 : 350;
                if (openEnds === 1) return jumps > 0 ? 180 : 90;
                return 0;
            case 1:
                return openEnds === 2 ? 18 : (openEnds === 1 ? 4 : 0);
            default: return 0;
        }
    }

    /**
     * 扫描方向上的棋型
     */
    function scanDir(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0;

        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; r += dr; c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; jr += dr; jc += dc;
            }
            // 二级跳子检测：跳过一个空位后还有同色棋子
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let jr2 = jr + dr, jc2 = jc + dc;
                while (jr2 >= 0 && jr2 < size && jc2 >= 0 && jc2 < size && board[jr2][jc2] === piece) {
                    jumps++; jr2 += dr; jc2 += dc;
                }
            }
        }

        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; r -= dr; c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            // 反方向二级跳子检测
            let jr = r - dr, jc = c - dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; jr -= dr; jc -= dc;
            }
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let jr2 = jr - dr, jc2 = jc - dc;
                while (jr2 >= 0 && jr2 < size && jc2 >= 0 && jc2 < size && board[jr2][jc2] === piece) {
                    jumps++; jr2 -= dr; jc2 -= dc;
                }
            }
        }

        return { count, openEnds, jumps };
    }

    function hasNeighbor(board, row, col, size, range) {
        for (let dr = -range; dr <= range; dr++) {
            for (let dc = -range; dc <= range; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] !== EMPTY) return true;
            }
        }
        return false;
    }

    /**
     * 获取所有有邻居的空位（预计算候选位置，避免重复遍历全盘）
     */
    function getNeighborCandidates(board, size, range) {
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
     * 撤销最后一条玩家落子记录（悔棋时调用）
     */
    function undoLastPlayerMove() {
        if (playerMoveHistory.length > 0) {
            playerMoveHistory.pop();
            lastAnalysis = null; // 清除缓存
            cachedPlayerStyle = null; // 清除风格缓存
            threatCacheKey = null; // 清除威胁缓存
            threatCacheResult = null;
        }
    }

    return {
        reset,
        recordPlayerMove,
        undoLastPlayerMove,
        getPlayerMoveHistory: () => [...playerMoveHistory],
        detectGamePhase,
        analyzePlayerStyle,
        analyzeLastMoveIntent,
        evaluateThreatLevel,
        detectFocusArea,
        getTacticalWeights,
        getTacticalMove
    };
})();
