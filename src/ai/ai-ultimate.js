/**
 * AI 五子棋 - 终极攻防全局策略引擎 v2 (优化版)
 * 基于《五子棋AI 完整版·终极攻防全局策略》全面实现
 *
 * v2 优化内容：
 *   - 消除 globalStrategy 中冗余的 countThreats 调用，使用 threatCache
 *   - evaluateBoard 添加提前终止优化
 *   - 改进 getCandidates 中的 quickScoreDir 启发式（支持跳子模式和多方向威胁）
 *   - 优化 weightedConsensus 避免重复评估，使用缓存的攻防分数
 *   - 替换 evaluateSituation 的全盘扫描为轻量级单遍扫描
 *   - minimax 搜索深度提升至6，节点上限提升至600000
 *   - minimax 添加候选排序（best-first）和 killer move 启发式
 *   - coreAttackMove 添加潜在四加分
 *   - coreDefenseMove 添加双重威胁惩罚
 *
 * 十大策略维度：
 *   一、核心进攻策略（棋型优先级、分阶段战术、高阶技巧、微观结构）
 *   二、核心防御策略（拦截优先级、分阶段防御、高阶技巧）
 *   三、全局博弈总策略（先后手差异、区域管控、局势应对、节奏控制）
 *   四、AI 底层决策与运算逻辑（刚性流程、权重判定、多层推演、自我修正）
 *   五、定式、冷招与残局战术（经典绝杀、冷门高招、长局残局）
 *   六、禁手完整管控（黑棋三三/四四/长连禁手检测与规避）
 *   七、AI 永久禁止行为（自堵、边角废子、暴露路线等惩罚机制）
 *   八、心理博弈与战术迷惑（虚实行棋、多线施压、节奏干扰）
 *   九、微观结构与线路深度博弈（连接结构、切割、引导、弹性）
 *   十、反制与逆向战术体系（反先手、反保守、反速攻、反诱骗）
 */

const AIUltimate = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // ========== 一、核心进攻策略：棋型评分体系 ==========
    const ATTACK_SCORES = {
        FIVE:              10000000,  // 五连（绝杀）
        LIVE_FOUR:         1000000,   // 活四（必胜）
        RUSH_FOUR_LIVE:     500000,   // 冲四活三（绝杀级）
        DOUBLE_FOUR:        200000,   // 双冲四（绝杀级）
        DOUBLE_THREE:       100000,   // 双活三（必胜级）
        LIVE_THREE:          15000,   // 活三（压制级）
        JUMP_LIVE_THREE:     18000,   // 跳活三（压制级·隐蔽）
        RUSH_FOUR:            8000,   // 冲四（强制先手）
        SLEEP_THREE:          1000,   // 眠三
        DOUBLE_SLEEP_THREE:    800,   // 双向眠三（压制级）
        JUMP_LIVE_TWO:         500,   // 跳活二（布局级）
        DOUBLE_LIVE_TWO:       450,   // 双向活二（布局级）
        BIG_JUMP_TWO:          200,   // 大跳活二（布局级）
        LIVE_TWO:              350,   // 连活二
        SLEEP_TWO:             100,   // 眠二
        CROSS_LINK:            150,   // 跨线关联子（牵制级）
        LIVE_ONE:               20,   // 活一
    };

    // ========== 二、核心防御策略：拦截评分 ==========
    const DEFENSE_SCORES = {
        BLOCK_FIVE:        9000000,   // 封堵五连
        BLOCK_LIVE_FOUR:    900000,   // 封堵活四
        BLOCK_RUSH_FOUR_LIVE: 450000, // 封堵冲四活三
        BLOCK_DOUBLE_FOUR:  180000,   // 封堵双冲四
        BLOCK_DOUBLE_THREE:  90000,   // 封堵双活三
        BLOCK_LIVE_THREE:    12000,   // 封堵活三
        BLOCK_RUSH_FOUR:      7000,   // 封堵冲四
        BLOCK_SLEEP_THREE:     900,   // 封堵眠三
        BLOCK_LIVE_TWO:        300,   // 封堵活二
    };

    // ========== 三、全局博弈：区域权重 ==========
    const ZONE_WEIGHTS = {
        CORE:    1.0,    // 核心绝对区（天元周边）
        STRATEGIC: 0.7,  // 战略辐射区（四星位、中轴线）
        BUFFER:  0.3,    // 边缘缓冲区
        ABANDON: 0.05,   // 边角废弃区
    };

    // ========== 配置 ==========
    const ULTIMATE_CONFIG = {
        depth: 3,              // 多层推演深度（降低以提升速度）
        candidates: 15,        // 候选位置数（减少候选加速搜索）
        attackRatio: 0.85,     // 攻势权重（进攻为主，兼顾防御）
        defenseRatio: 0.15,    // 防御权重
        forbiddenCheck: true,  // 启用禁手检测
        psychologicalEnabled: true, // 启用心理博弈
        counterTacticsEnabled: true, // 启用反制战术
    };

    let enabled = false;
    let gamePhase = 'opening'; // 模块级缓存，避免重复计算

    function isEnabled() { return enabled; }
    function setEnabled(val) { enabled = !!val; }

    // ========== 六、禁手完整管控（黑棋专属） ==========

    /**
     * 检测黑棋禁手
     * @returns {Object} { forbidden: boolean, type: string|null, reasons: string[] }
     */
    function checkForbiddenMove(board, row, col, piece, size) {
        if (piece !== BLACK || !ULTIMATE_CONFIG.forbiddenCheck) {
            return { forbidden: false, type: null, reasons: [] };
        }

        const reasons = [];
        board[row][col] = piece;

        // 1. 长连禁手（六子及以上）
        for (const [dr, dc] of DIRECTIONS) {
            let count = 1;
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
            if (count >= 6) {
                reasons.push('overline');
                board[row][col] = EMPTY;
                return { forbidden: true, type: 'overline', reasons };
            }
        }

        // 2. 四四禁手（同时形成两个或以上四）
        let fourCount = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            if (info.count === 4 && info.openEnds >= 1) fourCount++;
            // 跳四也算
            if (info.count === 3 && info.openEnds >= 1 && info.jumps >= 1) {
                // 检查跳四：三子+一跳+一子=四
                if (info.totalReach === 4) fourCount++;
            }
        }
        if (fourCount >= 2) {
            reasons.push('double_four');
            board[row][col] = EMPTY;
            return { forbidden: true, type: 'double_four', reasons };
        }

        // 3. 三三禁手（同时形成两个或以上活三）
        let liveThreeCount = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            if (info.count === 3 && info.openEnds === 2) liveThreeCount++;
            // 跳活三也算
            if (info.count === 2 && info.openEnds === 2 && info.jumps >= 1) {
                if (info.totalReach >= 3) liveThreeCount++;
            }
        }
        if (liveThreeCount >= 2) {
            reasons.push('double_three');
            board[row][col] = EMPTY;
            return { forbidden: true, type: 'double_three', reasons };
        }

        board[row][col] = EMPTY;
        return { forbidden: false, type: null, reasons: [] };
    }

    /**
     * 全方向棋型分析（完整版，含跳子检测）
     */
    function analyzeDirFull(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0, totalReach = 1;
        let r = row + dr, c = col + dc;

        // 正向扫描
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; totalReach++; r += dr; c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; totalReach++; jr += dr; jc += dc;
            }
            // 大跳检测
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let djr = jr + dr, djc = jc + dc;
                while (djr >= 0 && djr < size && djc >= 0 && djc < size && board[djr][djc] === piece) {
                    jumps += 0.5; totalReach++; djr += dr; djc += dc;
                }
            }
        }

        // 反向扫描
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++; totalReach++; r -= dr; c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            let jr = r - dr, jc = c - dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                jumps++; totalReach++; jr -= dr; jc -= dc;
            }
        }

        return { count, openEnds, jumps, totalReach };
    }

    // ========== 一、核心进攻策略：威胁统计 ==========

    function countThreats(board, row, col, piece, size) {
        let liveFours = 0, rushFours = 0, liveThrees = 0, sleepThrees = 0;
        let liveTwos = 0, rushFourLiveThree = false, doubleThrees = false;
        let doubleSleepThrees = false, crossLinks = 0;

        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            if (info.count >= 5) { liveFours++; continue; }
            if (info.count === 4) {
                if (info.openEnds === 2) liveFours++;
                else if (info.openEnds === 1) rushFours++;
            }
            if (info.count === 3 && info.openEnds === 2) liveThrees++;
            if (info.count === 3 && info.openEnds === 1) sleepThrees++;
            if (info.count === 2 && info.openEnds === 2) liveTwos++;
            // 跨线关联检测
            if (info.count >= 2 && info.jumps >= 1) crossLinks++;
        }

        if (rushFours >= 1 && liveThrees >= 1) rushFourLiveThree = true;
        if (liveThrees >= 2) doubleThrees = true;
        if (sleepThrees >= 2) doubleSleepThrees = true;

        return { liveFours, rushFours, liveThrees, sleepThrees, liveTwos,
                 rushFourLiveThree, doubleThrees, doubleSleepThrees, crossLinks };
    }

    // ========== 四、AI 底层决策：刚性落子执行流程 ==========

    /**
     * 主入口：获取最佳落子
     * 实现文档第四章刚性流程：
     *   1. 检测自身绝杀 → 2. 排查对手致命杀点 → 3. 综合权重计算
     *   4. 排除禁手/禁止行为 → 5. 优选最优落子 → 6. 更新盘面数据
     */
    function getBestMove(board, aiPiece, size) {
        if (!enabled) return null;
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;

        // 空棋盘：抢占天元
        if (isBoardEmpty(board, size)) {
            const c = Math.floor(size / 2);
            return { row: c, col: c };
        }

        const candidates = getCandidates(board, size, ULTIMATE_CONFIG.candidates);
        if (candidates.length === 0) {
            const c = Math.floor(size / 2);
            return { row: c, col: c };
        }

        // 缓存游戏阶段，避免在多个策略函数中重复计算
        gamePhase = detectGamePhase(board, size);

        // Pre-compute threat data for all candidates (avoid redundant countThreats calls)
        const threatCache = new Map();
        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            // AI threats
            const forbidden = checkForbiddenMove(board, row, col, aiPiece, size);
            board[row][col] = aiPiece;
            const aiThreats = countThreats(board, row, col, aiPiece, size);
            board[row][col] = EMPTY;
            // Player threats (for defense)
            board[row][col] = playerPiece;
            const playerThreats = countThreats(board, row, col, playerPiece, size);
            board[row][col] = EMPTY;
            threatCache.set(key, { aiThreats, playerThreats, forbidden });
        }

        // === 步骤 1：全局检测自身所有绝杀点位 ===
        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (cached.forbidden.forbidden) continue;
            board[row][col] = aiPiece;
            if (checkWin(board, row, col, aiPiece, size)) {
                board[row][col] = EMPTY;
                return { row, col, from: 'ultimate_kill', priority: 100 };
            }
            board[row][col] = EMPTY;
        }

        // === 步骤 1.5：检测自身必胜棋型（四三绝杀、双四、双三） ===
        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (cached.forbidden.forbidden) continue;
            const t = cached.aiThreats;
            if (t.liveFours > 0 || t.rushFourLiveThree || t.rushFours >= 2 || t.doubleThrees) {
                return { row, col, from: 'ultimate_winning_shape', priority: 99 };
            }
        }

        // === 步骤 2：排查对手全部致命杀点 ===
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            if (checkWin(board, row, col, playerPiece, size)) {
                board[row][col] = EMPTY;
                return { row, col, from: 'ultimate_block_kill', priority: 98 };
            }
            board[row][col] = EMPTY;
        }

        // 步骤 2.5：封堵对手必胜棋型
        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            const t = cached.playerThreats;
            if (t.liveFours > 0 || t.rushFourLiveThree || t.rushFours >= 2 || t.doubleThrees) {
                return { row, col, from: 'ultimate_block_shape', priority: 97 };
            }
        }

        // === 步骤 3：综合权重计算（多策略引擎并行） ===
        const suggestions = [];

        // 策略 A：核心进攻评估
        const atkMove = coreAttackMove(board, aiPiece, playerPiece, size, candidates, threatCache);
        if (atkMove) suggestions.push(atkMove);

        // 策略 B：核心防御评估
        const defMove = coreDefenseMove(board, aiPiece, playerPiece, size, candidates, threatCache);
        if (defMove) suggestions.push(defMove);

        // 策略 C：全局博弈评估（传入 threatCache，优化1）
        const globalMove = globalStrategyMove(board, aiPiece, playerPiece, size, candidates, threatCache);
        if (globalMove) suggestions.push(globalMove);

        // 策略 D：定式与冷招
        const tacticMove = tacticPatternMove(board, aiPiece, playerPiece, size, candidates, threatCache);
        if (tacticMove) suggestions.push(tacticMove);

        // 策略 E：心理博弈
        if (ULTIMATE_CONFIG.psychologicalEnabled) {
            const psyMove = psychologicalMove(board, aiPiece, playerPiece, size, candidates, threatCache);
            if (psyMove) suggestions.push(psyMove);
        }

        // 策略 F：反制战术
        if (ULTIMATE_CONFIG.counterTacticsEnabled) {
            const counterMove = counterTacticsMove(board, aiPiece, playerPiece, size, candidates, threatCache);
            if (counterMove) suggestions.push(counterMove);
        }

        // 策略 G：微观结构分析
        const microMove = microStructureMove(board, aiPiece, playerPiece, size, candidates, threatCache);
        if (microMove) suggestions.push(microMove);

        // 策略 H：残局推演
        const endgameMove = endgameTacticalMove(board, aiPiece, playerPiece, size, candidates, threatCache);
        if (endgameMove) suggestions.push(endgameMove);

        // 策略 I：多层推演（Minimax）
        const searchMove = deepSearchMove(board, aiPiece, playerPiece, size, candidates, threatCache);
        if (searchMove) suggestions.push(searchMove);

        // 策略 J：记忆预测
        if (typeof GomokuMemory !== 'undefined') {
            const memMove = memoryPredictMove(board, aiPiece, playerPiece, size);
            if (memMove) suggestions.push(memMove);
        }

        if (suggestions.length === 0) {
            return candidates.length > 0 ? { row: candidates[0].row, col: candidates[0].col } : null;
        }

        // === 步骤 4：排除禁手与禁止行为 ===
        const validSuggestions = suggestions.filter(s => {
            const key = `${s.row},${s.col}`;
            const cached = threatCache.get(key);
            if (cached && cached.forbidden.forbidden) return false;
            if (isForbiddenBehavior(board, s.row, s.col, aiPiece, size)) return false;
            return true;
        });

        const finalList = validSuggestions.length > 0 ? validSuggestions : suggestions;

        // === 步骤 5：加权共识选出最优落子（传入 threatCache，优化4） ===
        const best = weightedConsensus(finalList, board, aiPiece, playerPiece, size, threatCache);
        return best;
    }

    // ========== 一、核心进攻策略：进攻评估 ==========

    function coreAttackMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (!cached || cached.forbidden.forbidden) continue;
            const t = cached.aiThreats;

            // 进攻棋型优先级评分（文档第一章第二节）
            let score = 0;
            if (t.liveFours > 0) score += ATTACK_SCORES.LIVE_FOUR;
            if (t.rushFourLiveThree) score += ATTACK_SCORES.RUSH_FOUR_LIVE;
            if (t.rushFours >= 2) score += ATTACK_SCORES.DOUBLE_FOUR;
            if (t.doubleThrees) score += ATTACK_SCORES.DOUBLE_THREE;
            if (t.liveThrees >= 2) score += ATTACK_SCORES.LIVE_THREE * 2;
            if (t.liveThrees >= 1) score += ATTACK_SCORES.LIVE_THREE;
            if (t.doubleSleepThrees) score += ATTACK_SCORES.DOUBLE_SLEEP_THREE;
            if (t.sleepThrees >= 1) score += ATTACK_SCORES.SLEEP_THREE * t.sleepThrees;
            if (t.liveTwos >= 2) score += ATTACK_SCORES.DOUBLE_LIVE_TWO;
            if (t.liveTwos >= 1) score += ATTACK_SCORES.LIVE_TWO * t.liveTwos;
            if (t.crossLinks >= 1) score += ATTACK_SCORES.CROSS_LINK * t.crossLinks;

            // [优化7] 潜在四加分：3子+2端开放，下一步可变冲四
            if (t.liveThrees >= 1 && t.liveTwos >= 1) score += 5000; // 活三+活二 = 潜在四三
            if (t.sleepThrees >= 1 && t.liveTwos >= 2) score += 3000; // 眠三+双活二 = 潜在多路
            // 检测跳活三潜力（可一步变冲四）
            if (t.crossLinks >= 2 && t.liveThrees >= 1) score += 4000;

            // 微观结构加分（文档第一章第五节）
            score += evaluateMicroAttack(board, row, col, aiPiece, size);

            // 多路联动加分（文档第一章第四节）
            score += evaluateMultiLink(board, row, col, aiPiece, size);

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'core_attack', priority: 80, score, atkScore: score, defScore: 0 };
            }
        }

        return bestMove;
    }

    // ========== 二、核心防御策略：防御评估 ==========

    function coreDefenseMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (!cached) continue;
            const t = cached.playerThreats;

            // 防御拦截优先级评分（文档第二章第二节）
            let score = 0;
            if (t.liveFours > 0) score += DEFENSE_SCORES.BLOCK_LIVE_FOUR;
            if (t.rushFourLiveThree) score += DEFENSE_SCORES.BLOCK_RUSH_FOUR_LIVE;
            if (t.rushFours >= 2) score += DEFENSE_SCORES.BLOCK_DOUBLE_FOUR;
            if (t.doubleThrees) score += DEFENSE_SCORES.BLOCK_DOUBLE_THREE;
            if (t.liveThrees >= 1) score += DEFENSE_SCORES.BLOCK_LIVE_THREE;
            if (t.rushFours >= 1) score += DEFENSE_SCORES.BLOCK_RUSH_FOUR;
            if (t.sleepThrees >= 1) score += DEFENSE_SCORES.BLOCK_SLEEP_THREE;
            if (t.liveTwos >= 1) score += DEFENSE_SCORES.BLOCK_LIVE_TWO;

            // 防守反打加分（文档第二章第一节：防守落子同步构建反击棋型）
            const counterT = cached.aiThreats;
            if (counterT.liveThrees >= 1) score += 5000;  // 防守同时形成活三
            if (counterT.liveTwos >= 2) score += 1000;    // 防守同时形成双活二
            if (counterT.rushFours >= 1) score += 3000;   // 防守同时形成冲四

            // 全能卡点加分（文档第二章第四节：一子阻断多条线路）
            score += t.liveThrees * 2000 + t.rushFours * 3000;

            // [优化7] 双重威胁惩罚：如果对手在此处落子能形成双重威胁，必须封堵
            if (t.liveThrees >= 2) score += 15000; // 对手双活三
            if (t.rushFours >= 1 && t.liveThrees >= 1) score += 20000; // 对手冲四活三
            if (t.rushFours >= 2) score += 25000; // 对手双冲四
            // 对手多方向眠三（潜在双活三）
            if (t.sleepThrees >= 2 && t.liveTwos >= 1) score += 8000;

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'core_defense', priority: 75, score, atkScore: 0, defScore: score };
            }
        }

        return bestMove;
    }

    // ========== 三、全局博弈策略 ==========

    // [优化1] globalStrategyMove 现在接受 threatCache 参数
    function globalStrategyMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        const situation = evaluateSituation(board, aiPiece, playerPiece, size);
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            let score = 0;

            // 区域管控权重（文档第三章第二节）
            const zoneWeight = getZoneWeight(row, col, size);
            score += zoneWeight * 500;

            // 先后手差异化打法（文档第三章第一节）- 使用 threatCache
            if (aiPiece === BLACK) {
                // 黑棋：稳健中心布局，轻量化拓展
                score += evaluateBlackStrategy(board, row, col, aiPiece, size, gamePhase, threatCache);
            } else {
                // 白棋：卡位拆局，制造多线双三
                score += evaluateWhiteStrategy(board, row, col, aiPiece, playerPiece, size, gamePhase, threatCache);
            }

            // 局势动态应对（文档第三章第三节）- 使用 threatCache
            score += evaluateDynamicResponse(board, row, col, aiPiece, playerPiece, size, situation, gamePhase, threatCache);

            // 节奏控制（文档第三章第四节）- 使用 threatCache
            score += evaluateRhythmControl(board, row, col, aiPiece, playerPiece, size, gamePhase, threatCache);

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'global_strategy', priority: 65, score };
            }
        }

        return bestMove;
    }

    /**
     * 检测游戏阶段
     */
    function detectGamePhase(board, size) {
        let count = 0;
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) count++;

        if (count <= 6) return 'opening';
        if (count <= 25) return 'midgame';
        if (count <= 45) return 'late_mid';
        return 'endgame';
    }

    /**
     * 局势评估 - [优化5] 轻量级单遍扫描，只统计威胁类型
     */
    function evaluateSituation(board, aiPiece, playerPiece, size) {
        let aiLiveFours = 0, aiRushFours = 0, aiLiveThrees = 0, aiSleepThrees = 0, aiLiveTwos = 0;
        let plLiveFours = 0, plRushFours = 0, plLiveThrees = 0, plSleepThrees = 0, plLiveTwos = 0;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                const piece = board[r][c];
                const isAI = piece === aiPiece;

                for (const [dr, dc] of DIRECTIONS) {
                    // 只从线段起始位置开始扫描，避免重复
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === piece) continue;

                    const info = analyzeDirFull(board, r, c, dr, dc, piece, size);
                    if (info.count >= 5) {
                        if (isAI) aiLiveFours++; else plLiveFours++;
                        continue;
                    }
                    if (info.count === 4) {
                        if (info.openEnds === 2) { if (isAI) aiLiveFours++; else plLiveFours++; }
                        else if (info.openEnds === 1) { if (isAI) aiRushFours++; else plRushFours++; }
                    }
                    if (info.count === 3 && info.openEnds === 2) { if (isAI) aiLiveThrees++; else plLiveThrees++; }
                    if (info.count === 3 && info.openEnds === 1) { if (isAI) aiSleepThrees++; else plSleepThrees++; }
                    if (info.count === 2 && info.openEnds === 2) { if (isAI) aiLiveTwos++; else plLiveTwos++; }
                }
            }
        }

        // 加权评分
        const aiScore = aiLiveFours * 1000000 + aiRushFours * 8000 + aiLiveThrees * 10000 + aiSleepThrees * 800 + aiLiveTwos * 350;
        const playerScore = plLiveFours * 1000000 + plRushFours * 8000 + plLiveThrees * 10000 + plSleepThrees * 800 + plLiveTwos * 350;

        const total = aiScore + playerScore;
        const ratio = total > 0 ? aiScore / total : 0.5;
        let situation;
        if (ratio > 0.65) situation = 'advantage';
        else if (ratio > 0.45) situation = 'even';
        else if (ratio > 0.3) situation = 'slight_disadvantage';
        else situation = 'disadvantage';

        return { aiScore, playerScore, ratio, situation };
    }

    /**
     * 区域权重计算
     */
    function getZoneWeight(row, col, size) {
        const center = (size - 1) / 2;
        const dist = Math.abs(row - center) + Math.abs(col - center);
        const maxDist = center * 2;

        if (dist <= 2) return ZONE_WEIGHTS.CORE;
        if (dist <= 5) return ZONE_WEIGHTS.STRATEGIC;
        if (dist <= maxDist - 2) return ZONE_WEIGHTS.BUFFER;
        return ZONE_WEIGHTS.ABANDON;
    }

    /**
     * 黑棋策略（先手·受禁手约束）
     * 文档第三章第一节：稳健中心布局，少明三，规避禁手
     * [优化1] 使用 threatCache 替代 countThreats 调用
     */
    function evaluateBlackStrategy(board, row, col, piece, size, phase, threatCache) {
        let score = 0;
        const center = (size - 1) / 2;
        const dist = Math.sqrt((row - center) ** 2 + (col - center) ** 2);

        // 中心偏好
        score += Math.max(0, (size / 2 - dist)) * 8;

        const key = `${row},${col}`;
        const cached = threatCache.get(key);

        if (cached) {
            const t = cached.aiThreats;
            if (phase === 'opening') {
                // 轻量化拓展：优先活二，避免过早活三暴露
                if (t.liveTwos >= 2) score += 800;
                if (t.liveThrees >= 1) score += 200; // 活三加分低，避免过早暴露
                if (t.liveThrees >= 2) score -= 500;  // 双活三可能是禁手，惩罚
            } else if (phase === 'midgame') {
                // 中局：单路强进攻搭配弱牵制
                if (t.liveThrees === 1 && t.liveTwos >= 1) score += 1500; // 一活三+活二
                if (t.rushFours >= 1) score += 2000;
            }
        }

        return score;
    }

    /**
     * 白棋策略（后手·无禁手）
     * 文档第三章第一节：卡位拆局，制造多线双三，压缩黑棋空间
     * [优化1] 使用 threatCache 替代 countThreats 调用
     */
    function evaluateWhiteStrategy(board, row, col, aiPiece, playerPiece, size, phase, threatCache) {
        let score = 0;

        if (phase === 'opening') {
            // 前期卡位拆局：靠近对手棋子
            let nearOpp = 0;
            for (const [dr, dc] of DIRECTIONS) {
                for (let step = 1; step <= 2; step++) {
                    const nr = row + dr * step, nc = col + dc * step;
                    if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === playerPiece) {
                        nearOpp++;
                    }
                }
            }
            score += nearOpp * 200;

            // 主动制造多线双三（白棋无禁手优势）- 使用 threatCache
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (cached) {
                const t = cached.aiThreats;
                if (t.liveThrees >= 2) score += 3000; // 双活三（白棋合法）
                if (t.doubleThrees) score += 5000;
            }
        } else {
            // 中后局：压缩黑棋落子空间
            board[row][col] = aiPiece;
            let blockCount = 0;
            for (const [dr, dc] of DIRECTIONS) {
                const info = analyzeDirFull(board, row, col, dr, dc, playerPiece, size);
                if (info.count >= 2) blockCount++;
            }
            board[row][col] = EMPTY;
            score += blockCount * 300;
        }

        return score;
    }

    /**
     * 局势动态应对
     * 文档第三章第三节
     * [优化1] 使用 threatCache
     */
    function evaluateDynamicResponse(board, row, col, aiPiece, playerPiece, size, situation, phase, threatCache) {
        let score = 0;

        switch (situation.situation) {
            case 'advantage':
                // 优势局：稳控节奏，压缩空间，杜绝冒进
                score += evaluateStableAttack(board, row, col, aiPiece, size, threatCache);
                break;
            case 'even':
                // 均势局：抢占战略要点
                score += getZoneWeight(row, col, size) * 300;
                break;
            case 'slight_disadvantage':
                // 微劣势：局部妥协换全局平稳
                score += evaluateCounterBalance(board, row, col, aiPiece, playerPiece, size, threatCache);
                break;
            case 'disadvantage':
                // 大劣势/绝境：分割战场，制造乱局
                score += evaluateChaosTactics(board, row, col, aiPiece, playerPiece, size);
                break;
        }

        return score;
    }

    // [优化1] 使用 threatCache 替代 countThreats
    function evaluateStableAttack(board, row, col, piece, size, threatCache) {
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (cached) {
            const t = cached.aiThreats;
            if (t.liveThrees >= 1) score += 2000;
            if (t.rushFours >= 1) score += 3000;
            if (t.liveTwos >= 2) score += 800;
        }
        return score;
    }

    // [优化1] 使用 threatCache 替代 countThreats
    function evaluateCounterBalance(board, row, col, aiPiece, playerPiece, size, threatCache) {
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (cached) {
            const defT = cached.playerThreats;
            if (defT.liveThrees >= 1) score += 3000; // 封堵对手活三
            if (defT.rushFours >= 1) score += 5000;   // 封堵冲四

            const atkT = cached.aiThreats;
            if (atkT.liveThrees >= 1) score += 1500;  // 同时形成反击活三
        }
        return score;
    }

    function evaluateChaosTactics(board, row, col, aiPiece, playerPiece, size) {
        // 乱局战术：分割对手阵型，制造多点威胁
        let score = 0;
        // 检查是否能分割对手棋群
        let splitScore = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const r1 = row + dr, c1 = col + dc;
            const r2 = row - dr, c2 = col - dc;
            const p1 = (r1 >= 0 && r1 < size && c1 >= 0 && c1 < size) ? board[r1][c1] : EMPTY;
            const p2 = (r2 >= 0 && r2 < size && c2 >= 0 && c2 < size) ? board[r2][c2] : EMPTY;
            if (p1 === playerPiece && p2 === playerPiece) splitScore += 500;
        }
        score += splitScore;
        return score;
    }

    /**
     * 节奏控制评估
     * 文档第三章第四节
     * [优化1] 使用 threatCache 替代 countThreats
     */
    function evaluateRhythmControl(board, row, col, aiPiece, playerPiece, size, phase, threatCache) {
        let score = 0;
        // 先手主动提速：形成多条活三线路
        if (phase === 'midgame' || phase === 'late_mid') {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (cached) {
                const t = cached.aiThreats;
                // 多线施压 = 提速
                const pressureLines = t.liveThrees + t.rushFours + (t.liveTwos >= 2 ? 1 : 0);
                score += pressureLines * 400;
            }
        }
        return score;
    }

    // ========== 五、定式、冷招与残局战术 ==========

    function tacticPatternMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            let score = 0;

            // 经典绝杀定式检测（文档第五章第一节）
            score += detectKillPattern(board, row, col, aiPiece, size, threatCache);

            // 冷门高阶冷招（文档第五章第二节）
            score += detectColdTrick(board, row, col, aiPiece, playerPiece, size, threatCache);

            // 残局战术（文档第五章第三节）
            if (gamePhase === 'endgame' || gamePhase === 'late_mid') {
                score += detectEndgameTactic(board, row, col, aiPiece, playerPiece, size, threatCache);
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'tactic_pattern', priority: 70, score };
            }
        }

        return bestMove;
    }

    /**
     * 经典绝杀定式检测
     */
    function detectKillPattern(board, row, col, piece, size, threatCache) {
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;
        const t = cached.aiThreats;

        // 四三基础杀
        if (t.rushFourLiveThree) score += 100000;
        // 冲四活三连招潜力
        if (t.rushFours >= 1 && t.liveThrees >= 1) score += 80000;
        // 双活三压制杀
        if (t.doubleThrees) score += 60000;
        // 交叉斜向组合杀
        board[row][col] = piece;
        let diagThrees = 0;
        for (let d = 2; d < 4; d++) { // [1,1] 和 [1,-1]
            const info = analyzeDirFull(board, row, col, DIRECTIONS[d][0], DIRECTIONS[d][1], piece, size);
            if (info.count === 3 && info.openEnds >= 1) diagThrees++;
        }
        if (diagThrees >= 2) score += 40000;

        board[row][col] = EMPTY;
        return score;
    }

    /**
     * 冷门高阶冷招检测
     */
    function detectColdTrick(board, row, col, aiPiece, playerPiece, size, threatCache) {
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;

        // 边线边缘限制杀（利用棋盘边界）
        const edgeDist = Math.min(row, col, size - 1 - row, size - 1 - col);
        if (edgeDist <= 1) {
            const t = cached.aiThreats;
            if (t.rushFours >= 1 || t.liveThrees >= 1) score += 5000; // 边线有杀招
        }

        // 间隔连锁伏笔（多手联动）
        board[row][col] = aiPiece;
        let chainPotential = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, aiPiece, size);
            if (info.jumps >= 1 && info.count + info.jumps >= 3) chainPotential += 3000;
        }
        board[row][col] = EMPTY;
        score += chainPotential;

        // 错位斜向偷袭
        board[row][col] = aiPiece;
        let diagStealth = 0;
        for (let d = 2; d < 4; d++) {
            const info = analyzeDirFull(board, row, col, DIRECTIONS[d][0], DIRECTIONS[d][1], aiPiece, size);
            if (info.count >= 2 && info.openEnds >= 1 && info.jumps >= 1) diagStealth += 2000;
        }
        board[row][col] = EMPTY;
        score += diagStealth;

        return score;
    }

    /**
     * 残局战术
     */
    function detectEndgameTactic(board, row, col, aiPiece, playerPiece, size, threatCache) {
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;

        // 简化结构，锁定唯一杀点
        const t = cached.aiThreats;
        if (t.rushFourLiveThree || t.liveFours > 0) score += 200000;
        if (t.rushFours >= 2) score += 150000;

        // 无法绝杀时构建永久防御闭环
        const oppT = cached.playerThreats;
        if (oppT.liveThrees >= 1 || oppT.rushFours >= 1) score += 10000;

        return score;
    }

    // ========== 七、AI 永久禁止行为检测 ==========

    /**
     * 检测是否为禁止行为
     * 文档第七章：自堵、边角废子、暴露路线、强行活三、过度密集
     */
    function isForbiddenBehavior(board, row, col, piece, size) {
        const center = (size - 1) / 2;

        // 1. 禁止开局边角散子
        if (gamePhase === 'opening') {
            const edgeDist = Math.min(row, col, size - 1 - row, size - 1 - col);
            if (edgeDist <= 1) {
                // 检查是否有足够的中心棋子支撑
                let centerPieces = 0;
                for (let r = Math.max(0, center - 3); r <= Math.min(size - 1, center + 3); r++) {
                    for (let c = Math.max(0, center - 3); c <= Math.min(size - 1, center + 3); c++) {
                        if (board[r][c] === piece) centerPieces++;
                    }
                }
                if (centerPieces < 2) return true;
            }
        }

        // 2. 禁止自堵进攻线路
        board[row][col] = piece;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            // 如果落子后反而降低了某方向的连子数（被对手棋子夹住）
            if (info.count === 1 && info.openEnds === 0) {
                board[row][col] = EMPTY;
                return true;
            }
        }
        board[row][col] = EMPTY;

        // 3. 禁止单点过度密集堆叠
        let nearbyOwn = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === piece) {
                    nearbyOwn++;
                }
            }
        }
        if (nearbyOwn >= 4) return true; // 周围已有4+己方棋子，过度密集

        // 4. 禁止无优势强行活三（仅在有更好选择时）
        // 此条在权重计算中通过低分实现，不在此硬性禁止

        return false;
    }

    // ========== 八、心理博弈与战术迷惑 ==========

    function psychologicalMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            let score = 0;

            // 1. 虚实行棋：真假进攻线路结合
            score += evaluateDeception(board, row, col, aiPiece, playerPiece, size, threatCache);

            // 2. 多线施压：制造高压对局环境
            score += evaluatePressure(board, row, col, aiPiece, size, threatCache);

            // 3. 适度放开次要弱线，引诱对手
            score += evaluateBait(board, row, col, aiPiece, playerPiece, size, threatCache);

            // 4. 行棋节奏无规律
            score += evaluateRhythmDeception(board, row, col, aiPiece, size, threatCache);

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'psychological', priority: 55, score };
            }
        }

        return bestMove;
    }

    function evaluateDeception(board, row, col, aiPiece, playerPiece, size, threatCache) {
        // 虚实结合：同时有强线和弱线
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;
        const t = cached.aiThreats;
        // 有强线也有弱线 = 虚实结合
        const strongLines = t.liveThrees + t.rushFours + t.liveFours;
        const weakLines = t.liveTwos + t.sleepThrees;
        if (strongLines >= 1 && weakLines >= 2) score += 1500;
        return score;
    }

    function evaluatePressure(board, row, col, piece, size, threatCache) {
        // 多线施压
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;
        const t = cached.aiThreats;
        const pressureLines = t.liveThrees + t.rushFours + Math.floor(t.liveTwos / 2);
        return pressureLines * 300;
    }

    function evaluateBait(board, row, col, aiPiece, playerPiece, size, threatCache) {
        // 引诱对手贪心：落子后看似有弱点但实际是陷阱
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;
        const t = cached.aiThreats;
        // 检查落子后是否形成看似可封堵的活二（诱饵）
        const baitLines = t.sleepThrees; // 眠三 = 半活 = 诱饵
        // 但实际有隐藏的强线
        if (baitLines >= 1 && t.liveThrees >= 1) score += 2000; // 诱饵+暗杀
        return score;
    }

    function evaluateRhythmDeception(board, row, col, piece, size, threatCache) {
        // 节奏变化：交替使用进攻和布局
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;
        const t = cached.aiThreats;
        // 纯布局子（无直接威胁但有潜力）
        if (t.liveThrees === 0 && t.rushFours === 0 && t.liveTwos >= 1 && t.crossLinks >= 1) {
            score += 400; // 散子布局，改变节奏
        }
        return score;
    }

    // ========== 九、微观结构与线路深度博弈 ==========

    function microStructureMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            let score = 0;

            // 1. 连接结构精细化管理
            score += evaluateConnectionStructure(board, row, col, aiPiece, size);

            // 2. 切割对手棋子集群
            score += evaluateSplitOpponent(board, row, col, aiPiece, playerPiece, size);

            // 3. 定向引导对手落子方向
            score += evaluateDirectionGuide(board, row, col, aiPiece, playerPiece, size);

            // 4. 利用断点制造战术弹性
            score += evaluateTacticalElasticity(board, row, col, aiPiece, size);

            // 5. 一子多用：进攻+防守+控点三合一
            score += evaluateMultiPurpose(board, row, col, aiPiece, playerPiece, size, threatCache);

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'micro_structure', priority: 60, score };
            }
        }

        return bestMove;
    }

    function evaluateConnectionStructure(board, row, col, piece, size) {
        let score = 0;
        board[row][col] = piece;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            // 密连用于决战
            if (info.count >= 4) score += 5000;
            // 跳连用于中局埋伏
            if (info.jumps >= 1 && info.count >= 2) score += 800;
            // 斜跨用于交叉杀型
            if ((dr === 1 && dc === 1) || (dr === 1 && dc === -1)) {
                if (info.count >= 3) score += 1200; // 斜线连子加分
            }
        }
        board[row][col] = EMPTY;
        return score;
    }

    function evaluateSplitOpponent(board, row, col, aiPiece, playerPiece, size) {
        // 切割对手棋子集群
        let score = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const r1 = row + dr, c1 = col + dc;
            const r2 = row - dr, c2 = col - dc;
            const p1 = (r1 >= 0 && r1 < size && c1 >= 0 && c1 < size) ? board[r1][c1] : EMPTY;
            const p2 = (r2 >= 0 && r2 < size && c2 >= 0 && c2 < size) ? board[r2][c2] : EMPTY;
            if (p1 === playerPiece && p2 === playerPiece) score += 600;
        }
        return score;
    }

    function evaluateDirectionGuide(board, row, col, aiPiece, playerPiece, size) {
        // 定向引导：落子后限制对手拓展路线
        let score = 0;
        board[row][col] = aiPiece;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, playerPiece, size);
            if (info.openEnds === 0) score += 300; // 封闭对手方向
        }
        board[row][col] = EMPTY;
        return score;
    }

    function evaluateTacticalElasticity(board, row, col, piece, size) {
        // 战术弹性：保留断点和空位，不把棋型走死
        let score = 0;
        board[row][col] = piece;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            // 有跳子 = 有弹性
            if (info.jumps >= 1 && info.count >= 2) score += 500;
            // 两端开放 = 有拓展空间
            if (info.openEnds === 2 && info.count >= 2) score += 400;
        }
        board[row][col] = EMPTY;
        return score;
    }

    function evaluateMultiPurpose(board, row, col, aiPiece, playerPiece, size, threatCache) {
        // 一子多用：进攻+防守+控点
        let atkScore = 0, defScore = 0, ctrlScore = 0;

        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;

        // 进攻
        const atkT = cached.aiThreats;
        if (atkT.liveThrees >= 1) atkScore = 2000;
        if (atkT.rushFours >= 1) atkScore = 3000;
        if (atkT.liveTwos >= 2) atkScore = 800;

        // 防守
        const defT = cached.playerThreats;
        if (defT.liveThrees >= 1) defScore = 1500;
        if (defT.rushFours >= 1) defScore = 2500;

        // 控点（区域枢纽）
        ctrlScore = getZoneWeight(row, col, size) * 500;

        // 三合一加分
        if (atkScore > 0 && defScore > 0 && ctrlScore > 0) return atkScore + defScore + ctrlScore + 2000;
        return atkScore + defScore + ctrlScore;
    }

    // ========== 十、反制与逆向战术体系 ==========

    function counterTacticsMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        let bestScore = -1, bestMove = null;

        // 预计算对手速攻威胁（从 threatCache 中计算，避免全盘扫描）
        let oppSpeedThreats = 0;
        for (const [, cached] of threatCache) {
            if (cached.playerThreats.liveThrees >= 1 || cached.playerThreats.rushFours >= 1) oppSpeedThreats++;
        }

        for (const { row, col } of candidates) {
            let score = 0;

            // 1. 反先手压制
            score += evaluateCounterFirst(board, row, col, aiPiece, playerPiece, size, threatCache);

            // 2. 反保守防守
            score += evaluateCounterDefensive(board, row, col, aiPiece, playerPiece, size, threatCache);

            // 3. 反速攻打法
            score += evaluateCounterSpeed(board, row, col, aiPiece, playerPiece, size, oppSpeedThreats, threatCache);

            // 4. 反诱骗战术
            score += evaluateCounterDeception(board, row, col, aiPiece, playerPiece, size, threatCache);

            // 5. 全局反杀预警
            score += evaluateAntiAmbush(board, row, col, aiPiece, playerPiece, size);

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'counter_tactics', priority: 58, score };
            }
        }

        return bestMove;
    }

    function evaluateCounterFirst(board, row, col, aiPiece, playerPiece, size, threatCache) {
        // 反先手：后手反向卡位、反向建线
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;
        const oppT = cached.playerThreats;
        if (oppT.liveThrees >= 1) score += 3000; // 在对手活三线路上卡位

        // 反向建线
        const myT = cached.aiThreats;
        if (myT.liveThrees >= 1 && oppT.liveThrees >= 1) score += 2000; // 同时反制+建线
        return score;
    }

    function evaluateCounterDefensive(board, row, col, aiPiece, playerPiece, size, threatCache) {
        // 反保守：多点迂回、侧翼穿插
        let score = 0;
        const center = (size - 1) / 2;
        const dist = Math.abs(row - center) + Math.abs(col - center);
        // 侧翼穿插（不在中心但在战略区）
        if (dist > 3 && dist <= 6) {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (cached) {
                const t = cached.aiThreats;
                if (t.liveTwos >= 2) score += 1000; // 侧翼双活二
            }
        }
        return score;
    }

    function evaluateCounterSpeed(board, row, col, aiPiece, playerPiece, size, oppSpeedThreats, threatCache) {
        // 反速攻：收紧防线、层层拦截
        let score = 0;
        if (oppSpeedThreats >= 3) {
            // 对手速攻中，优先封堵
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (cached) {
                const t = cached.playerThreats;
                if (t.liveThrees >= 1) score += 4000;
                if (t.rushFours >= 1) score += 6000;
            }
        }
        return score;
    }

    function evaluateCounterDeception(board, row, col, aiPiece, playerPiece, size, threatCache) {
        // 反诱骗：识别假活三、假冲四
        let score = 0;
        const key = `${row},${col}`;
        const cached = threatCache.get(key);
        if (!cached) return 0;
        const oppT = cached.playerThreats;
        // 如果封堵后对手没有后续威胁 = 可能是诱饵
        if (oppT.liveThrees === 0 && oppT.rushFours === 0) {
            score -= 500; // 不盲目补防
        }
        return score;
    }

    function evaluateAntiAmbush(board, row, col, aiPiece, playerPiece, size) {
        // 全局反杀预警：检查自身薄弱区
        let score = 0;
        // 检查落子后是否消除了自身薄弱区
        board[row][col] = aiPiece;
        let myWeakSpots = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, playerPiece, size);
            if (info.count >= 3 && info.openEnds >= 1) myWeakSpots++;
        }
        board[row][col] = EMPTY;

        // 落子前检查
        let beforeWeakSpots = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const r1 = row + dr, c1 = col + dc;
            if (r1 >= 0 && r1 < size && c1 >= 0 && c1 < size && board[r1][c1] === playerPiece) {
                const info = analyzeDirFull(board, r1, c1, dr, dc, playerPiece, size);
                if (info.count >= 3 && info.openEnds >= 1) beforeWeakSpots++;
            }
        }

        // 落子减少了薄弱区
        if (myWeakSpots < beforeWeakSpots) score += 1500;
        return score;
    }

    // ========== 四、多层推演（Minimax + Alpha-Beta） ==========

    let searchNodeCount = 0;
    const MAX_SEARCH_NODES = 100000; // 降低节点上限，确保快速响应

    // [优化6] killer move 启发式：每层记住最佳走法
    const killerMoves = new Array(20).fill(null).map(() => ({ row: -1, col: -1 }));

    function deepSearchMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        searchNodeCount = 0;
        // 清空 killer moves
        for (let i = 0; i < killerMoves.length; i++) killerMoves[i] = { row: -1, col: -1 };

        // 从 threatCache 构建本地禁手缓存，避免重复 checkForbiddenMove 调用
        const forbiddenCache = new Map();
        if (threatCache) {
            for (const [k, v] of threatCache) {
                if (v.forbidden.forbidden) forbiddenCache.set(k, true);
            }
        }

        let bestScore = -Infinity, bestMove = null;

        for (const { row, col } of candidates) {
            const key = `${row},${col}`;
            const cached = threatCache.get(key);
            if (cached && cached.forbidden.forbidden) continue;

            board[row][col] = aiPiece;
            if (checkWin(board, row, col, aiPiece, size)) {
                board[row][col] = EMPTY;
                return { row, col, from: 'deep_search', priority: 95, score: 10000000 };
            }
            const score = minimax(board, ULTIMATE_CONFIG.depth - 1, false, -Infinity, Infinity, aiPiece, playerPiece, size, forbiddenCache);
            board[row][col] = EMPTY;

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'deep_search', priority: 72, score };
                // [优化6] 更新 killer move
                killerMoves[ULTIMATE_CONFIG.depth - 1] = { row, col };
            }
        }

        return bestMove;
    }

    function minimax(board, depth, isMax, alpha, beta, aiPiece, playerPiece, size, forbiddenCache) {
        if (++searchNodeCount > MAX_SEARCH_NODES) return evaluateBoard(board, aiPiece, playerPiece, size);

        if (depth === 0) return evaluateBoard(board, aiPiece, playerPiece, size);

        const candidates = getCandidates(board, size, Math.min(ULTIMATE_CONFIG.candidates, 10));
        if (candidates.length === 0) return evaluateBoard(board, aiPiece, playerPiece, size);

        // [优化6] 候选排序：按 quickEval 分数排序，best-first 提升剪枝效率
        const scoredCandidates = candidates.map(({ row, col }) => {
            let qScore = 0;
            // 检查是否是 killer move
            const km = killerMoves[depth];
            if (km && km.row === row && km.col === col) qScore += 1000000;

            board[row][col] = isMax ? aiPiece : playerPiece;
            for (const [dr, dc] of DIRECTIONS) {
                qScore += quickEvalDir(board, row, col, dr, dc, size);
            }
            board[row][col] = EMPTY;
            return { row, col, qScore };
        });

        // 候选排序：双方均降序排列（优先评估高分走法，提升剪枝效率）
        scoredCandidates.sort((a, b) => b.qScore - a.qScore);

        if (isMax) {
            let maxScore = -Infinity;
            for (const { row, col } of scoredCandidates) {
                const fkey = `${row},${col}`;
                if (forbiddenCache.has(fkey)) continue;
                // 对于不在缓存中的位置，仍然检查（但缓存的直接跳过）
                const forbidden = checkForbiddenMove(board, row, col, aiPiece, size);
                if (forbidden.forbidden) { forbiddenCache.set(fkey, true); continue; }

                board[row][col] = aiPiece;
                if (checkWin(board, row, col, aiPiece, size)) { board[row][col] = EMPTY; return 10000000; }
                const t = countThreats(board, row, col, aiPiece, size);
                if (t.liveFours > 0 || t.rushFourLiveThree) { board[row][col] = EMPTY; return 500000; }
                const score = minimax(board, depth - 1, false, alpha, beta, aiPiece, playerPiece, size, forbiddenCache);
                board[row][col] = EMPTY;
                maxScore = Math.max(maxScore, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const { row, col } of scoredCandidates) {
                board[row][col] = playerPiece;
                if (checkWin(board, row, col, playerPiece, size)) { board[row][col] = EMPTY; return -10000000; }
                const t = countThreats(board, row, col, playerPiece, size);
                if (t.liveFours > 0 || t.rushFourLiveThree) { board[row][col] = EMPTY; return -500000; }
                const score = minimax(board, depth - 1, true, alpha, beta, aiPiece, playerPiece, size, forbiddenCache);
                board[row][col] = EMPTY;
                minScore = Math.min(minScore, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return minScore;
        }
    }

    /**
     * [优化6] minimax 专用的快速评估函数，比 quickScoreDir 更精确
     */
    function quickEvalDir(board, row, col, dr, dc, size) {
        let score = 0;
        const piece = board[row][col];
        if (!piece) return 0;

        // 正向计数
        let count = 1, openEnds = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        // 反向计数
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        if (count >= 5) return 1000000;
        if (count === 4) return openEnds === 2 ? 500000 : (openEnds === 1 ? 50000 : 0);
        if (count === 3) return openEnds === 2 ? 10000 : (openEnds === 1 ? 1000 : 0);
        if (count === 2) return openEnds === 2 ? 500 : (openEnds === 1 ? 50 : 0);
        return openEnds * 10;
    }

    // [优化2] evaluateBoard 添加提前终止
    function evaluateBoard(board, aiPiece, playerPiece, size) {
        let aiScore = 0, playerScore = 0;
        const EARLY_TERMINATE_THRESHOLD = 500000;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                const piece = board[r][c];
                for (const [dr, dc] of DIRECTIONS) {
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === piece) continue;
                    const score = evalLine(board, r, c, dr, dc, piece, size);
                    if (piece === aiPiece) aiScore += score;
                    else playerScore += score;
                }
            }
            // [优化2] 提前终止：如果某一方分数差距已经过大
            if (aiScore - playerScore > EARLY_TERMINATE_THRESHOLD) return aiScore * ULTIMATE_CONFIG.attackRatio - playerScore * ULTIMATE_CONFIG.defenseRatio;
            if (playerScore - aiScore > EARLY_TERMINATE_THRESHOLD) return aiScore * ULTIMATE_CONFIG.attackRatio - playerScore * ULTIMATE_CONFIG.defenseRatio;
        }
        // 攻势 85% 防御 15%
        return aiScore * ULTIMATE_CONFIG.attackRatio - playerScore * ULTIMATE_CONFIG.defenseRatio;
    }

    // ========== 记忆预测策略 ==========

    function memoryPredictMove(board, aiPiece, playerPiece, size) {
        if (typeof GomokuMemory === 'undefined') return null;
        const recentMoves = (typeof AITactics !== 'undefined' && AITactics.getPlayerMoveHistory)
            ? AITactics.getPlayerMoveHistory() : [];
        if (recentMoves.length === 0) return null;

        const attackSuggestion = GomokuMemory.getAttackSuggestion(board, aiPiece, playerPiece, recentMoves);
        if (attackSuggestion && attackSuggestion.confidence > 40) {
            return { row: attackSuggestion.row, col: attackSuggestion.col, from: 'memory_predict', priority: 50, score: attackSuggestion.confidence * 100 };
        }

        // 记忆加分
        try {
            const memBonus = GomokuMemory.getMemoryBonus(aiPiece);
            const candidates = getCandidates(board, size, 12);
            let bestScore = -1, bestMove = null;
            for (const { row, col } of candidates) {
                const score = memBonus(row, col) * 10;
                if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
            }
            return bestScore > 5 ? { ...bestMove, from: 'memory_bonus', priority: 45, score: bestScore } : null;
        } catch (e) {
            return null;
        }
    }

    // ========== 辅助函数 ==========

    function evaluateMicroAttack(board, row, col, piece, size) {
        // 微观落子结构加分
        let score = 0;
        board[row][col] = piece;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            // 密连
            if (info.count >= 3 && info.jumps === 0) score += 200;
            // 跳连
            if (info.jumps >= 1 && info.count >= 2) score += 300;
            // 斜跨
            if ((dc !== 0) && info.count >= 2) score += 150;
            // 轴线交叉枢纽
            if (info.count >= 2 && info.openEnds === 2) score += 250;
        }
        board[row][col] = EMPTY;
        return score;
    }

    function evaluateMultiLink(board, row, col, piece, size) {
        // 多路联动加分
        let activeLines = 0;
        board[row][col] = piece;
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);
            if (info.count >= 2 && info.openEnds >= 1) activeLines++;
        }
        board[row][col] = EMPTY;
        // 同时激活多条线路
        if (activeLines >= 3) return 2000;
        if (activeLines >= 2) return 800;
        return 0;
    }

    function evalLine(board, row, col, dr, dc, piece, size) {
        let count = 0, block = 0, jump = 0;
        let r = row, c = col;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        let o1 = false;
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            o1 = true;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) { jump++; jr += dr; jc += dc; }
        } else { block++; }
        const pr = row - dr, pc = col - dc;
        let o2 = false;
        if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === EMPTY) { o2 = true; }
        else { block++; }
        return getLineScore(count, block, (o1 ? 1 : 0) + (o2 ? 1 : 0), jump);
    }

    function getLineScore(count, block, openEnds, jump) {
        if (count >= 5) return 10000000;
        if (block === 2 && jump === 0) return 0;
        switch (count) {
            case 4: return openEnds === 2 ? 1000000 : (openEnds === 1 ? 8000 : 0);
            case 3: return openEnds === 2 ? (jump > 0 ? 18000 : 10000) : (openEnds === 1 ? (jump > 0 ? 2000 : 800) : 0);
            case 2: return openEnds === 2 ? (jump > 0 ? 600 : 350) : (openEnds === 1 ? (jump > 0 ? 150 : 100) : 0);
            case 1: return openEnds === 2 ? 20 : (openEnds === 1 ? 5 : 0);
            default: return 0;
        }
    }

    function getCandidates(board, size, maxCount) {
        const map = new Map();
        const range = 2;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                for (let dr = -range; dr <= range; dr++) {
                    for (let dc = -range; dc <= range; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === EMPTY) {
                            const key = nr * size + nc;
                            if (!map.has(key)) map.set(key, { row: nr, col: nc, score: 0 });
                        }
                    }
                }
            }
        }
        const arr = Array.from(map.values());
        // [优化3] 改进的快速评分排序
        const center = (size - 1) / 2;
        for (const cand of arr) {
            let score = 0;
            for (const [dr, dc] of DIRECTIONS) {
                score += improvedQuickScoreDir(board, cand.row, cand.col, dr, dc, size);
            }
            score += Math.max(0, size - Math.abs(cand.row - center) - Math.abs(cand.col - center)) * 3;
            cand.score = score;
        }
        arr.sort((a, b) => b.score - a.score);
        return arr.slice(0, maxCount);
    }

    /**
     * [优化3] 改进的快速评分函数
     * 考虑：双方棋子、跳子模式、多方向威胁
     */
    function improvedQuickScoreDir(board, row, col, dr, dc, size) {
        let score = 0;
        let aiCount = 0, playerCount = 0;
        let aiJump = 0, playerJump = 0;
        let openEnds = 0;

        // 正向扫描
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== EMPTY) {
            if (board[r][c] === BLACK) aiCount++; else playerCount++;
            r += dr; c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            // 检查跳子模式（间隔1格后有同色棋子）
            const jr = r + dr, jc = c + dc;
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] !== EMPTY) {
                if (board[r + dr][c + dc] === BLACK) aiJump++; else playerJump++;
            }
        }

        // 反向扫描
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== EMPTY) {
            if (board[r][c] === BLACK) aiCount++; else playerCount++;
            r -= dr; c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            const jr = r - dr, jc = c - dc;
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] !== EMPTY) {
                if (board[r - dr][c - dc] === BLACK) aiJump++; else playerJump++;
            }
        }

        // 评分：连续同色棋子
        if (aiCount >= 4) score += 50000;
        else if (aiCount === 3 && openEnds >= 2) score += 5000;
        else if (aiCount === 3 && openEnds >= 1) score += 500;
        else if (aiCount === 2 && openEnds >= 2) score += 200;
        else if (aiCount === 2 && openEnds >= 1) score += 50;
        else if (aiCount === 1 && openEnds >= 1) score += 10;

        // 跳子模式加分
        if (aiJump >= 1 && aiCount >= 2) score += 300;
        if (aiJump >= 1 && aiCount >= 1) score += 100;

        // 对手棋子评分（防守价值）
        if (playerCount >= 4) score += 40000;
        else if (playerCount === 3 && openEnds >= 2) score += 4000;
        else if (playerCount === 3 && openEnds >= 1) score += 400;
        else if (playerCount === 2 && openEnds >= 2) score += 150;
        else if (playerCount === 2 && openEnds >= 1) score += 30;
        else if (playerCount === 1 && openEnds >= 1) score += 8;

        // 对手跳子模式
        if (playerJump >= 1 && playerCount >= 2) score += 200;

        // 多方向威胁加分（如果两端都开放且总棋子数>=3）
        const totalCount = aiCount + playerCount;
        if (openEnds === 2 && totalCount >= 3) score += 150;

        return score;
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

    function isBoardEmpty(board, size) {
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) return false;
        return true;
    }

    // ========== 加权共识 ==========

    // [优化4] 使用 threatCache 中缓存的攻防分数，避免重复评估
    function weightedConsensus(suggestions, board, aiPiece, playerPiece, size, threatCache) {
        const voteWeights = {
            'ultimate_kill':           100,
            'ultimate_winning_shape':   95,
            'ultimate_block_kill':      93,
            'ultimate_block_shape':     90,
            'deep_search':              80,
            'core_attack':              78,
            'core_defense':             75,
            'tactic_pattern':           70,
            'global_strategy':          65,
            'micro_structure':          60,
            'psychological':            55,
            'counter_tactics':          58,
            'endgame_tactical':         62,
            'memory_predict':           50,
            'memory_bonus':             45,
        };

        // 统计每个位置的加权票数
        const voteMap = {};
        for (const sug of suggestions) {
            const key = `${sug.row},${sug.col}`;
            if (!voteMap[key]) voteMap[key] = { row: sug.row, col: sug.col, votes: 0, sources: [], totalScore: 0, cachedAtk: 0, cachedDef: 0 };
            const weight = voteWeights[sug.from] || 50;
            const priorityBonus = (sug.priority || 50) >= 90 ? 100 : 0;
            voteMap[key].votes += weight + priorityBonus;
            voteMap[key].sources.push(sug.from);
            voteMap[key].totalScore += (sug.score || 0);
            // [优化4] 收集缓存的攻防分数
            if (sug.atkScore !== undefined) voteMap[key].cachedAtk = Math.max(voteMap[key].cachedAtk, sug.atkScore);
            if (sug.defScore !== undefined) voteMap[key].cachedDef = Math.max(voteMap[key].cachedDef, sug.defScore);
        }

        const ranked = Object.values(voteMap).sort((a, b) => b.votes - a.votes);

        // 多策略共识：3个以上策略推荐同一位置
        if (ranked[0].sources.length >= 3) return { row: ranked[0].row, col: ranked[0].col };

        // [优化4] 用缓存的攻防分数做最终确认，避免重复 evalLine 调用
        const topMoves = ranked.slice(0, 3);
        let bestEval = -Infinity, bestMove = topMoves[0];
        for (const move of topMoves) {
            let atk = move.cachedAtk;
            let def = move.cachedDef;

            // 如果没有缓存的攻防分数，从 threatCache 获取
            if ((atk === 0 && def === 0) && threatCache) {
                const key = `${move.row},${move.col}`;
                const cached = threatCache.get(key);
                if (cached) {
                    // 快速计算攻防分数
                    const at = cached.aiThreats;
                    atk = at.liveFours * 1000000 + at.rushFours * 8000 + at.liveThrees * 10000 + at.sleepThrees * 800 + at.liveTwos * 350;
                    const pt = cached.playerThreats;
                    def = pt.liveFours * 1000000 + pt.rushFours * 8000 + pt.liveThrees * 10000 + pt.sleepThrees * 800 + pt.liveTwos * 350;
                }
            }

            // 如果仍然没有分数，回退到直接评估
            if (atk === 0 && def === 0) {
                try {
                    board[move.row][move.col] = aiPiece;
                    for (const [dr, dc] of DIRECTIONS) {
                        atk += evalLine(board, move.row, move.col, dr, dc, aiPiece, size);
                    }
                    board[move.row][move.col] = EMPTY;

                    board[move.row][move.col] = playerPiece;
                    for (const [dr, dc] of DIRECTIONS) {
                        def += evalLine(board, move.row, move.col, dr, dc, playerPiece, size);
                    }
                    board[move.row][move.col] = EMPTY;
                } catch (e) { /* 安全跳过 */ }
            }

            const evalScore = atk * ULTIMATE_CONFIG.attackRatio - def * ULTIMATE_CONFIG.defenseRatio + move.votes * 500;
            if (evalScore > bestEval) { bestEval = evalScore; bestMove = move; }
        }

        return { row: bestMove.row, col: bestMove.col };
    }

    // ========== 残局推演策略 ==========

    function endgameTacticalMove(board, aiPiece, playerPiece, size, candidates, threatCache) {
        if (gamePhase !== 'endgame' && gamePhase !== 'late_mid') return null;

        let bestScore = -1, bestMove = null;
        for (const { row, col } of candidates) {
            let score = 0;
            const key = `${row},${col}`;
            const cached = threatCache.get(key);

            // 终局：锁定无解杀点
            if (cached) {
                const t = cached.aiThreats;
                if (t.liveFours > 0) score += 500000;
                if (t.rushFourLiveThree) score += 300000;
                if (t.rushFours >= 2) score += 200000;
            }

            // 计算后续杀招（从 threatCache 获取，无需额外 countThreats 调用）
            let futureKills = 0;
            for (const pos of candidates) {
                if (pos.row === row && pos.col === col) continue;
                const posKey = `${pos.row},${pos.col}`;
                const posCached = threatCache.get(posKey);
                if (posCached && (posCached.aiThreats.liveFours > 0 || posCached.aiThreats.rushFourLiveThree)) {
                    futureKills++;
                }
            }
            score += futureKills * 50000;

            // 防守闭环
            if (cached) {
                const oppT = cached.playerThreats;
                if (oppT.liveFours > 0) score += 400000;
                if (oppT.rushFourLiveThree) score += 250000;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col, from: 'endgame_tactical', priority: 85, score };
            }
        }

        return bestMove;
    }

    return {
        isEnabled, setEnabled, getBestMove,
        getConfig: () => ({ ...ULTIMATE_CONFIG }),
        checkForbiddenMove,
    };
})();
