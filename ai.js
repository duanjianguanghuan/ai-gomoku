/**
 * AI 五子棋 - AI 模块 v10（性能优化版）
 * 基于 v9 全面优化升级
 *
 * v10 核心优化：
 *   - 修复斜线加分重复计算（diag1 已在主循环中评估）
 *   - 添加节点计数限制（MAX_NODES = 300000）防止深度搜索卡顿
 *   - evaluateBoard 早期终止优化（遇到五连/活四立即返回）
 *   - 改进开局匹配逻辑（检查所有 moves 位置）
 *   - 活三→冲四转换路径权重优化
 *   - quickEval 性能优化（减少不必要的 memBonusFn 调用）
 *   - 修复 getLineScorePro 中 count>=5 语义
 */

const GomokuAI = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;

    // 专业级棋型评分（根据攻略层级调整）
    const SCORES = {
        FIVE:           10000000,  // 五连
        LIVE_FOUR:      1000000,   // 活四（无敌棋形）
        RUSH_FOUR_LIVE: 500000,    // 冲四活三（必杀）
        DOUBLE_FOUR:    200000,    // 双冲四（无解杀招）
        DOUBLE_THREE:   100000,    // 双活三（无解进攻）
        LIVE_THREE:     15000,     // 活三（提升权重）
        RUSH_FOUR:      8000,      // 冲四（强制先手）
        SLEEP_THREE:    1000,      // 眠三
        JUMP_LIVE_TWO:  500,       // 跳活二（隐蔽突袭）
        LIVE_TWO:       350,       // 连活二
        BIG_JUMP_TWO:   200,       // 大跳活二（后期联动）
        SLEEP_TWO:      100,       // 眠二
        LIVE_ONE:       20,        // 活一
    };

    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // 难度配置（根据攻略调整搜索深度和候选数）
    const DIFFICULTY_CONFIG = {
        1: { depth: 2, candidates: 15, usePattern: true,  useStrategy: false, useTactics: true,  name: '简单' },
        2: { depth: 3, candidates: 20, usePattern: true,  useStrategy: true,  useTactics: true,  name: '中等' },
        3: { depth: 3, candidates: 15, usePattern: true,  useStrategy: true,  useTactics: true,  name: '困难' },
    };

    let difficulty = 2, aiPiece = WHITE, playerPiece = BLACK;
    let memoryEnabled = true;
    let tacticalWeights = { attackWeight: 1.5, defenseWeight: 0.8 };
    let memBonusFn = null; // 预计算记忆加分闭包（IIFE 顶层，供 getCandidates/quickEval 使用）
    const MAX_NODES = 300000; // 节点计数限制，防止深度搜索卡顿
    const MAX_VCT_NODES = 50000; // VCT 递归节点计数限制
    let nodeCount = 0;
    let vctNodeCount = 0;

    // 专业开局库（基于攻略第一章）
    const OPENING_BOOK = {
        15: [
            // 花月开局：天元 + 斜侧做角
            { moves: [[7,7]], responses: [[6,6],[8,8],[6,8],[8,6],[7,8],[8,7],[6,7],[7,6]], type: 'huayue' },
            // 浦月开局：天元 + 侧方跳点
            { moves: [[7,7]], responses: [[7,9],[7,5],[9,7],[5,7],[6,8],[8,6]], type: 'puyue' },
            // 残月开局：稳扎稳打
            { moves: [[7,7]], responses: [[7,8],[8,7],[6,6],[8,8]], type: 'canyue' },
            // 溪月开局：斜线与横线联动
            { moves: [[7,7]], responses: [[6,8],[8,6],[8,8],[6,6],[7,9],[7,5]], type: 'xiyue' },
        ],
        13: [
            { moves: [[6,6]], responses: [[5,5],[7,7],[5,7],[7,5],[6,7],[7,6],[6,5],[5,6]], type: 'standard' },
        ],
        19: [
            { moves: [[9,9]], responses: [[8,8],[10,10],[8,10],[10,8],[9,10],[10,9],[8,9],[9,8]], type: 'standard' },
        ],
    };

    function setDifficulty(level) { difficulty = level; }
    function setAIPiece(piece) { aiPiece = piece; playerPiece = piece === BLACK ? WHITE : BLACK; }
    function setMemoryEnabled(enabled) { memoryEnabled = enabled; }
    function isMemoryEnabled() { return memoryEnabled; }

    function updateTacticalWeights(weights) {
        if (weights) {
            tacticalWeights.attackWeight = weights.attackWeight || 1.0;
            tacticalWeights.defenseWeight = weights.defenseWeight || 1.0;
        }
    }

    function getBestMove(board) {
        const size = board.length;
        const config = DIFFICULTY_CONFIG[difficulty];

        // 空棋盘：下天元
        if (isBoardEmpty(board, size)) {
            if (memoryEnabled && typeof GomokuMemory !== 'undefined') {
                const memOpen = GomokuMemory.getMemoryOpening(size);
                if (memOpen && board[memOpen.row][memOpen.col] === EMPTY) return { row: memOpen.row, col: memOpen.col };
            }
            const c = Math.floor(size / 2);
            return { row: c, col: c };
        }

        // 第二手：使用专业开局库
        if (moveCount(board, size) === 1) {
            const opening = getOpeningMove(board, size);
            if (opening) return opening;
        }

        // 获取战术权重
        if (config.useTactics && typeof AITactics !== 'undefined') {
            const tactics = AITactics.getTacticalWeights(board, aiPiece, size);
            updateTacticalWeights(tactics);
        }

        const candidates = getCandidates(board, size, config.candidates);
        if (candidates.length === 0) { const c = Math.floor(size / 2); return { row: c, col: c }; }

        // 预计算记忆加分闭包（避免在 quickEval 中重复调用）
        memBonusFn = null;
        if (memoryEnabled && typeof GomokuMemory !== 'undefined') {
            memBonusFn = GomokuMemory.getMemoryBonus(aiPiece);
        }

        // === 防守优先级体系（攻略第三章） ===
        // 冲四 > 活四 > 活三 > 双活二 > 眠三 > 单活二

        // 1. AI 直接获胜（最高优先级）
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            if (checkWin(board, row, col, aiPiece, size)) { board[row][col] = EMPTY; return { row, col }; }
            board[row][col] = EMPTY;
        }

        // 2. 防守对手五连（冲四/活四级别）
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            if (checkWin(board, row, col, playerPiece, size)) { board[row][col] = EMPTY; return { row, col }; }
            board[row][col] = EMPTY;
        }

        // 3. AI 形成必胜棋型（冲四活三、双冲四、双活三）
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            const t = countThreatsPro(board, row, col, aiPiece, size);
            board[row][col] = EMPTY;
            if (t.liveFours > 0 || t.rushFours >= 2 || t.rushFourLiveThree ||
                t.doubleThrees) {
                return { row, col };
            }
        }

        // 4. 防守对手必胜棋型
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            const t = countThreatsPro(board, row, col, playerPiece, size);
            board[row][col] = EMPTY;
            if (t.liveFours > 0 || t.rushFours >= 2 || t.rushFourLiveThree ||
                t.doubleThrees) {
                return { row, col };
            }
        }

        // 5. VCT/VCF 连续进攻检测（攻略第二章高阶战术）
        const vctMove = detectVCT(board, aiPiece, size, 3);
        if (vctMove) return vctMove;

        // 6. 多点击杀检测（一手铺垫多处杀棋）
        const multiKillMove = detectMultiKill(board, aiPiece, size, candidates);
        if (multiKillMove) return multiKillMove;

        // 7. 极大极小搜索
        nodeCount = 0;
        vctNodeCount = 0;
        let bestScore = -Infinity, bestMove = candidates[0];
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            const score = minimax(board, config.depth - 1, false, -Infinity, Infinity, size);
            board[row][col] = EMPTY;
            if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
            else if (score === bestScore && memBonusFn) {
                const curMem = memBonusFn(row, col);
                const bestMem = memBonusFn(bestMove.row, bestMove.col);
                if (curMem > bestMem) { bestScore = score; bestMove = { row, col }; }
            }
        }

        // 8. 模式识别共识
        if (config.usePattern && typeof AIPattern !== 'undefined') {
            const patternSuggestion = AIPattern.getSuggestion(board, aiPiece);
            if (patternSuggestion) {
                const consensus = AIPattern.consensus(bestMove, patternSuggestion, board, aiPiece);
                if (consensus) bestMove = consensus;
            }
        }

        // 9. 攻防策略共识
        if (config.useStrategy && typeof AIStrategy !== 'undefined') {
            const strategic = AIStrategy.getStrategicMove(board, aiPiece, size, tacticalWeights);
            if (strategic && strategic.confidence > 55) {
                const stratMove = { row: strategic.row, col: strategic.col };
                if (typeof AIPattern !== 'undefined') {
                    const consensus = AIPattern.consensus(bestMove, stratMove, board, aiPiece);
                    if (consensus) bestMove = consensus;
                }
            }
        }

        // 10. 实时战术调配共识
        if (config.useTactics && typeof AITactics !== 'undefined') {
            const tacticalMove = AITactics.getTacticalMove(board, aiPiece, size);
            if (tacticalMove && tacticalMove.confidence > 50) {
                const tacMove = { row: tacticalMove.row, col: tacticalMove.col };
                if (tacticalMove.reason === 'critical_defense') {
                    bestMove = tacMove;
                } else if (typeof AIPattern !== 'undefined') {
                    const consensus = AIPattern.consensus(bestMove, tacMove, board, aiPiece);
                    if (consensus) bestMove = consensus;
                }
            }
        }

        // 11. 记忆预测共识
        if (memoryEnabled && typeof GomokuMemory !== 'undefined' && typeof AITactics !== 'undefined') {
            const recentMoves = AITactics.getPlayerMoveHistory ? AITactics.getPlayerMoveHistory() : [];
            if (recentMoves.length > 0) {
                const attackSuggestion = GomokuMemory.getAttackSuggestion(board, aiPiece, playerPiece, recentMoves);
                if (attackSuggestion && attackSuggestion.confidence > 45) {
                    const memMove = { row: attackSuggestion.row, col: attackSuggestion.col };
                    if (typeof AIPattern !== 'undefined') {
                        const consensus = AIPattern.consensus(bestMove, memMove, board, aiPiece);
                        if (consensus) bestMove = consensus;
                    }
                }
            }
        }

        return bestMove;
    }

    // ========== 专业威胁计数（攻略层级） ==========

    function countThreatsPro(board, row, col, piece, size) {
        let liveFours = 0, rushFours = 0, liveThrees = 0, sleepThrees = 0, liveTwos = 0;
        let rushFourLiveThree = false, doubleThrees = false;

        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirPro(board, row, col, dr, dc, piece, size);
            if (info.count >= 5) continue; // 五连在 checkWin 中已处理，不计入威胁
            if (info.count === 4) {
                if (info.openEnds === 2) liveFours++;
                else if (info.openEnds === 1) rushFours++;
            }
            if (info.count === 3 && info.openEnds === 2) liveThrees++;
            if (info.count === 3 && info.openEnds === 1) sleepThrees++;
            if (info.count === 2 && info.openEnds === 2) liveTwos++;
        }

        // 冲四活三检测
        if (rushFours >= 1 && liveThrees >= 1) rushFourLiveThree = true;
        // 双活三检测
        if (liveThrees >= 2) doubleThrees = true;

        return { liveFours, rushFours, liveThrees, sleepThrees, liveTwos, rushFourLiveThree, doubleThrees };
    }

    function analyzeDirPro(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) { jumps++; jr += dr; jc += dc; }
            // 大跳检测（间隔两空）
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let djr = jr + dr, djc = jc + dc;
                while (djr >= 0 && djr < size && djc >= 0 && djc < size && board[djr][djc] === piece) {
                    jumps += 0.5; djr += dr; djc += dc;
                }
            }
        }
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        return { count, openEnds, jumps };
    }

    // ========== VCT 连续进攻检测（攻略第二章） ==========

    function findWinMove(board, piece, size) {
        // Check if piece can win in one move anywhere on the board
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) continue;
                board[r][c] = piece;
                if (checkWin(board, r, c, piece, size)) { board[r][c] = EMPTY; return { row: r, col: c }; }
                board[r][c] = EMPTY;
            }
        }
        return null;
    }

    function detectVCT(board, piece, size, maxDepth) {
        const opp = piece === BLACK ? WHITE : BLACK;
        const candidates = getCandidates(board, size, 15);

        for (const { row, col } of candidates) {
            if (++vctNodeCount >= MAX_VCT_NODES) return null;
            board[row][col] = piece;
            const t = countThreatsPro(board, row, col, piece, size);
            if (t.liveFours > 0) { board[row][col] = EMPTY; return { row, col }; }
            if (t.rushFourLiveThree || t.doubleThrees || t.rushFours >= 2) {
                board[row][col] = EMPTY; return { row, col };
            }
            // 活三 → 递归检测后续冲四
            if (t.liveThrees >= 1 && maxDepth > 1) {
                const oppBlock = findBestDefense(board, piece, opp, size);
                if (oppBlock) {
                    board[oppBlock.row][oppBlock.col] = opp;
                    // Check if opponent has a winning response (VCT fails if opp can win)
                    const oppWinMove = findWinMove(board, opp, size);
                    if (oppWinMove) { board[oppBlock.row][oppBlock.col] = EMPTY; board[row][col] = EMPTY; continue; }
                    const nextVCT = detectVCT(board, piece, size, maxDepth - 1);
                    board[oppBlock.row][oppBlock.col] = EMPTY;
                    if (nextVCT) { board[row][col] = EMPTY; return { row, col }; }
                }
            }
            board[row][col] = EMPTY;
        }
        return null;
    }

    function findBestDefense(board, piece, opp, size) {
        // Find where opp can form the strongest threat, and block it
        const candidates = getCandidates(board, size, 10);
        let bestScore = -1, bestMove = candidates[0] || null;
        for (const { row, col } of candidates) {
            board[row][col] = opp;
            const t = countThreatsPro(board, row, col, opp, size);
            board[row][col] = EMPTY;
            let score = 0;
            if (t.liveFours > 0) score = 100000;
            else if (t.rushFourLiveThree) score = 50000;
            else if (t.rushFours >= 2) score = 30000;
            else if (t.doubleThrees) score = 20000;
            else if (t.liveThrees >= 1) score = 5000;
            if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
        }
        return bestMove;
    }

    // ========== 多点击杀检测（攻略第二章：多点做杀术） ==========

    function detectMultiKill(board, piece, size, candidates) {
        let bestMove = null, bestKillCount = 0;

        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const t = countThreatsPro(board, row, col, piece, size);

            // 计算杀棋点数量
            let killCount = t.liveFours * 3 + t.rushFours * 2 + t.liveThrees * 1;
            if (t.rushFourLiveThree) killCount += 5;
            if (t.doubleThrees) killCount += 4;

            board[row][col] = EMPTY;

            if (killCount >= 3 && killCount > bestKillCount) {
                bestKillCount = killCount;
                bestMove = { row, col };
            }
        }
        return bestMove;
    }

    // ========== Minimax（专业评分） ==========

    function minimax(board, depth, isMax, alpha, beta, size) {
        nodeCount++;
        if (nodeCount >= MAX_NODES) return evaluateBoard(board, size);
        if (depth === 0) return evaluateBoard(board, size);
        const config = DIFFICULTY_CONFIG[difficulty];
        const candidates = getCandidates(board, size, Math.min(config.candidates, 12));
        if (candidates.length === 0) return evaluateBoard(board, size);

        // Sort candidates by quickEval score for better alpha-beta pruning
        candidates.sort((a, b) => {
            const sa = quickEval(board, a.row, a.col, size, null);
            const sb = quickEval(board, b.row, b.col, size, null);
            return sb - sa;
        });

        if (isMax) {
            let maxScore = -Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = aiPiece;
                if (checkWin(board, row, col, aiPiece, size)) { board[row][col] = EMPTY; return SCORES.FIVE; }
                const t = countThreatsPro(board, row, col, aiPiece, size);
                if (t.liveFours > 0 || t.rushFourLiveThree) { board[row][col] = EMPTY; return SCORES.RUSH_FOUR_LIVE; }
                if (t.doubleThrees || t.rushFours >= 2) { board[row][col] = EMPTY; return SCORES.DOUBLE_FOUR; }
                const score = minimax(board, depth - 1, false, alpha, beta, size);
                board[row][col] = EMPTY;
                maxScore = Math.max(maxScore, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
                if (nodeCount >= MAX_NODES) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = playerPiece;
                if (checkWin(board, row, col, playerPiece, size)) { board[row][col] = EMPTY; return -SCORES.FIVE; }
                const t = countThreatsPro(board, row, col, playerPiece, size);
                if (t.liveFours > 0 || t.rushFourLiveThree) { board[row][col] = EMPTY; return -SCORES.RUSH_FOUR_LIVE; }
                if (t.doubleThrees || t.rushFours >= 2) { board[row][col] = EMPTY; return -SCORES.DOUBLE_FOUR; }
                const score = minimax(board, depth - 1, true, alpha, beta, size);
                board[row][col] = EMPTY;
                minScore = Math.min(minScore, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
                if (nodeCount >= MAX_NODES) break;
            }
            return minScore;
        }
    }

    function evaluateBoard(board, size) {
        let aiScore = 0, playerScore = 0;
        let aiHasFive = false, playerHasFive = false;
        let aiLiveFours = 0, playerLiveFours = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                const piece = board[r][c], isAI = piece === aiPiece;
                let foundFive = false;
                for (const [dr, dc] of DIRECTIONS) {
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === piece) continue;
                    const score = evaluateLinePro(board, r, c, dr, dc, piece, size);
                    if (isAI) {
                        aiScore += score;
                        if (score >= SCORES.FIVE) { aiHasFive = true; foundFive = true; }
                        if (score >= SCORES.LIVE_FOUR) aiLiveFours++;
                    } else {
                        playerScore += score;
                        if (score >= SCORES.FIVE) { playerHasFive = true; foundFive = true; }
                        if (score >= SCORES.LIVE_FOUR) playerLiveFours++;
                    }
                }
                // Skip inner direction loop early if five-in-a-row found
                if (foundFive) continue;
            }
            // 早期终止：双方都有决定性棋型时无需继续遍历
            if ((aiHasFive || aiLiveFours > 0) && (playerHasFive || playerLiveFours > 0)) break;
            // 早期终止：分数差距已具决定性
            if (Math.abs(aiScore - playerScore) > 500000) break;
        }
        // 早期终止：任一方有五连，直接返回决定性分数
        if (aiHasFive) return SCORES.FIVE * tacticalWeights.attackWeight;
        if (playerHasFive) return -SCORES.FIVE * tacticalWeights.defenseWeight;
        return aiScore * tacticalWeights.attackWeight - playerScore * tacticalWeights.defenseWeight;
    }

    function evaluateLinePro(board, row, col, dr, dc, piece, size) {
        let count = 0, block = 0, jumpCount = 0;
        let r = row, c = col;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        let end1Open = false;
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            end1Open = true;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) { jumpCount++; jr += dr; jc += dc; }
            // 大跳检测
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let djr = jr + dr, djc = jc + dc;
                while (djr >= 0 && djr < size && djc >= 0 && djc < size && board[djr][djc] === piece) {
                    jumpCount += 0.5; djr += dr; djc += dc;
                }
            }
        } else { block++; }
        let end2Open = false;
        const pr = row - dr, pc = col - dc;
        if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === EMPTY) {
            end2Open = true;
            let jr = pr - dr, jc = pc - dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) { jumpCount++; jr -= dr; jc -= dc; }
            // 大跳检测
            if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === EMPTY) {
                let djr = jr - dr, djc = jc - dc;
                while (djr >= 0 && djr < size && djc >= 0 && djc < size && board[djr][djc] === piece) {
                    jumpCount += 0.5; djr -= dr; djc -= dc;
                }
            }
        } else { block++; }
        const openEnds = (end1Open ? 1 : 0) + (end2Open ? 1 : 0);
        return getLineScorePro(count, block, openEnds, jumpCount);
    }

    function getLineScorePro(count, block, openEnds, jumpCount) {
        // count>=5 是五连，语义明确，不应归入任何其他棋型
        if (count >= 5) return SCORES.FIVE;
        if (block === 2 && jumpCount === 0) return 0;
        switch (count) {
            case 4:
                if (openEnds === 2) return SCORES.LIVE_FOUR;
                if (openEnds === 1) return SCORES.RUSH_FOUR;
                return 0;
            case 3:
                if (openEnds === 2) {
                    if (jumpCount >= 1) return SCORES.LIVE_THREE * 1.8;  // 跳活三（防堵难度高）
                    // 活三→冲四转换路径：活三只需一步即可变为冲四，给予额外权重
                    return SCORES.LIVE_THREE * 1.1;
                }
                if (openEnds === 1) {
                    if (jumpCount >= 1) return SCORES.SLEEP_THREE * 2.5;  // 跳眠三可变活三
                    // 眠三→冲四转换路径：眠三有一定概率变为冲四
                    return SCORES.SLEEP_THREE * 1.2;
                }
                return 0;
            case 2:
                if (openEnds === 2) {
                    if (jumpCount >= 1.5) return SCORES.BIG_JUMP_TWO;   // 大跳活二（后期联动）
                    if (jumpCount >= 1) return SCORES.JUMP_LIVE_TWO;    // 跳活二（隐蔽突袭）
                    return SCORES.LIVE_TWO;
                }
                if (openEnds === 1) {
                    if (jumpCount >= 1) return SCORES.SLEEP_TWO * 2;
                    return SCORES.SLEEP_TWO;
                }
                return 0;
            case 1:
                if (openEnds === 2) return SCORES.LIVE_ONE;
                if (openEnds === 1 && jumpCount >= 1) return SCORES.LIVE_ONE * 0.5;
                return 0;
            default: return 0;
        }
    }

    function quickScoreLite(board, row, col, size) {
        let score = 0;
        for (const [dr, dc] of DIRECTIONS) {
            // Check both pieces in each direction
            const p1 = board[row + dr]?.[col + dc];
            const p2 = board[row - dr]?.[col - dc];
            const isAI1 = p1 === aiPiece, isAI2 = p2 === aiPiece;
            const isOpp1 = p1 === playerPiece, isOpp2 = p2 === playerPiece;

            if (isAI1 && isAI2) score += 200; // AI both sides
            if (isOpp1 && isOpp2) score += 180; // Opp both sides (block value)
            if (isAI1 || isAI2) score += 30;
            if (isOpp1 || isOpp2) score += 25;

            // Check 2-step patterns
            const p3 = board[row + 2*dr]?.[col + 2*dc];
            const p4 = board[row - 2*dr]?.[col - 2*dc];
            if (isAI1 && p3 === aiPiece) score += 80;
            if (isOpp1 && p3 === playerPiece) score += 70;
            if (isAI2 && p4 === aiPiece) score += 80;
            if (isOpp2 && p4 === playerPiece) score += 70;
        }
        const center = (size - 1) / 2;
        score += Math.max(0, size - Math.abs(row - center) - Math.abs(col - center)) * 3;
        return score;
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
        const arr = [];
        const bonusFn = memBonusFn; // 缓存引用，避免闭包查找开销
        for (const [, cand] of map) {
            cand.score = quickScoreLite(board, cand.row, cand.col, size);
            if (bonusFn) cand.score += bonusFn(cand.row, cand.col);
            arr.push(cand);
        }
        arr.sort((a, b) => b.score - a.score);
        return arr.slice(0, maxCount);
    }

    function quickEval(board, row, col, size, bonusFn) {
        let atk = 0, def = 0;
        for (const [dr, dc] of DIRECTIONS) {
            atk += simDirPro(board, row, col, dr, dc, aiPiece, size);
            def += simDirPro(board, row, col, dr, dc, playerPiece, size);
        }
        let score = atk * tacticalWeights.attackWeight * 2.0 + def * tacticalWeights.defenseWeight * 0.7;

        if (bonusFn) {
            score += bonusFn(row, col);
        }

        const center = (size - 1) / 2;
        score += Math.max(0, size - Math.abs(row - center) - Math.abs(col - center)) * 3;
        return score;
    }

    function simDirPro(board, row, col, dr, dc, piece, size) {
        let count = 1, block = 0, jump = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        let o1 = false;
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            o1 = true;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) { jump++; jr += dr; jc += dc; }
        } else { block++; }
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        let o2 = false;
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) { o2 = true; }
        else { block++; }
        return getLineScorePro(count, block, (o1?1:0)+(o2?1:0), jump);
    }

    function getOpeningMove(board, size) {
        const book = OPENING_BOOK[size];
        if (!book) return null;
        for (const entry of book) {
            // 检查所有 moves 位置都有棋子（完整匹配开局条件）
            const allMovesMatch = entry.moves.every(([r, c]) => board[r][c] !== EMPTY);
            if (allMovesMatch) {
                const valid = entry.responses.filter(([rr, cc]) => board[rr][cc] === EMPTY);
                if (valid.length > 0) {
                    const pick = valid[Math.floor(Math.random() * valid.length)];
                    return { row: pick[0], col: pick[1] };
                }
            }
        }
        return null;
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

    function getWinLine(board, row, col, piece, size) {
        for (const [dr, dc] of DIRECTIONS) {
            const line = [{ row, col }];
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { line.push({ row: r, col: c }); r += dr; c += dc; }
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { line.push({ row: r, col: c }); r -= dr; c -= dc; }
            if (line.length >= 5) return line;
        }
        return null;
    }

    function isBoardEmpty(board, size) {
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) return false;
        return true;
    }

    function moveCount(board, size) {
        let n = 0;
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) n++;
        return n;
    }

    return {
        EMPTY, BLACK, WHITE,
        setDifficulty, setAIPiece, setMemoryEnabled, isMemoryEnabled,
        updateTacticalWeights,
        getBestMove, checkWin, getWinLine
    };
})();
