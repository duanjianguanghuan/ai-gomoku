/**
 * AI 五子棋 - 极限模式 AI 引擎 v3（专业攻防升级版）
 * 基于五子棋专业级攻防全攻略全面升级
 * 6 个 AI 算法同时运算，攻势 95% 防御 5%
 *
 * AI-1: 深度搜索（depth=6, 15候选/minimax 10候选）+ VCT连续进攻
 * AI-2: 统一极限评估（合并模式识别/攻防策略/战术调配）
 * AI-3: 记忆预测引擎（跨模式深度分析 + 序列预测）
 * AI-4: 终局推演（提前 N 步推演胜负 + 防守优先级）
 */

const AIExtreme = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // 极限模式配置
    const EXTREME_CONFIG = {
        depth: 6,              // 搜索深度 6 层
        candidates: 15,        // 候选位置 15 个（降低以避免超出 MAX_SEARCH_NODES）
        minimaxCandidates: 10, // minimax 内部候选限制为 10
        attackRatio: 0.95,     // 攻势 95%
        defenseRatio: 0.05,    // 防御 5%
    };

    let enabled = false;
    let searchNodeCount = 0;
    const MAX_SEARCH_NODES = 500000; // 节点计数限制，防止 UI 冻结

    function isEnabled() { return enabled; }
    function setEnabled(val) { enabled = !!val; }

    // ========== AI-1: 深度搜索（增强版 minimax） ==========

    function deepSearchBestMove(board, aiPiece, size) {
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        searchNodeCount = 0; // 重置节点计数
        const candidates = getCandidates(board, size, EXTREME_CONFIG.candidates);
        if (candidates.length === 0) return null;

        // 必胜/必防检查
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            if (checkWin(board, row, col, aiPiece, size)) { board[row][col] = EMPTY; return { row, col, from: 'deep_search', priority: 100 }; }
            board[row][col] = EMPTY;
        }
        for (const { row, col } of candidates) {
            board[row][col] = playerPiece;
            if (checkWin(board, row, col, playerPiece, size)) { board[row][col] = EMPTY; return { row, col, from: 'deep_search', priority: 99 }; }
            board[row][col] = EMPTY;
        }

        let bestScore = -Infinity, bestMove = null;
        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            const score = minimaxDeep(board, EXTREME_CONFIG.depth - 1, false, -Infinity, Infinity, aiPiece, playerPiece, size);
            board[row][col] = EMPTY;
            if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
        }
        return bestMove ? { ...bestMove, from: 'deep_search', priority: 80, score: bestScore } : null;
    }

    function minimaxDeep(board, depth, isMax, alpha, beta, aiPiece, playerPiece, size) {
        if (++searchNodeCount > MAX_SEARCH_NODES) return evaluateExtreme(board, aiPiece, playerPiece, size);
        if (depth === 0) return evaluateExtreme(board, aiPiece, playerPiece, size);
        const candidates = getCandidates(board, size, EXTREME_CONFIG.minimaxCandidates);
        if (candidates.length === 0) return evaluateExtreme(board, aiPiece, playerPiece, size);

        if (isMax) {
            let maxScore = -Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = aiPiece;
                if (checkWin(board, row, col, aiPiece, size)) { board[row][col] = EMPTY; return 100000000; }
                const score = minimaxDeep(board, depth - 1, false, alpha, beta, aiPiece, playerPiece, size);
                board[row][col] = EMPTY;
                maxScore = Math.max(maxScore, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const { row, col } of candidates) {
                board[row][col] = playerPiece;
                if (checkWin(board, row, col, playerPiece, size)) { board[row][col] = EMPTY; return -100000000; }
                const score = minimaxDeep(board, depth - 1, true, alpha, beta, aiPiece, playerPiece, size);
                board[row][col] = EMPTY;
                minScore = Math.min(minScore, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return minScore;
        }
    }

    // ========== AI-2: 统一极限评估（合并模式识别/攻防策略/战术调配） ==========

    function evaluatePositionExtreme(board, aiPiece, size) {
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        const candidates = getCandidates(board, size, 15);
        let bestScore = -1, bestMove = null;

        // 检测焦点区域（原 extremeTacticalMove 的焦点加分）
        const focus = detectFocus(board, size);

        for (const { row, col } of candidates) {
            // 进攻评分（权重 95%）
            board[row][col] = aiPiece;
            let atkScore = 0;
            let liveFours = 0, rushFours = 0, liveThrees = 0;
            for (const [dr, dc] of DIRECTIONS) {
                const info = scanDir(board, row, col, dr, dc, aiPiece, size);
                atkScore += patternScore(info);
                if (info.count >= 5) liveFours++;
                else if (info.count === 4 && info.openEnds === 2) liveFours++;
                else if (info.count === 4 && info.openEnds === 1) rushFours++;
                if (info.count === 3 && info.openEnds === 2) liveThrees++;
            }
            board[row][col] = EMPTY;

            // 防守评分（权重 5%）
            board[row][col] = playerPiece;
            let defScore = 0;
            for (const [dr, dc] of DIRECTIONS) {
                const info = scanDir(board, row, col, dr, dc, playerPiece, size);
                defScore += patternScore(info);
            }
            board[row][col] = EMPTY;

            // 多方向联动加分（原 extremePatternMove 的 comboBonus）
            let comboBonus = 0;
            if (liveFours >= 1) comboBonus += 500000;
            if (rushFours >= 2) comboBonus += 200000;
            if (rushFours >= 1 && liveThrees >= 1) comboBonus += 150000;
            if (liveThrees >= 2) comboBonus += 100000;

            // 攻势 95% 防御 5%
            let score = atkScore * 0.95 + defScore * 0.05 + comboBonus;

            // 焦点区域加分（原 extremeTacticalMove）
            const focusDist = Math.abs(row - focus.row) + Math.abs(col - focus.col);
            if (focusDist <= focus.radius) score *= 1.2;

            // 中心加分（原 extremeTacticalMove）
            const center = (size - 1) / 2;
            score += Math.max(0, (size - Math.abs(row - center) - Math.abs(col - center))) * 5;

            if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
        }
        return bestMove ? { ...bestMove, from: 'extreme_unified', priority: 70, score: bestScore } : null;
    }

    // ========== 记忆预测引擎 ==========

    function memoryPredictionMove(board, aiPiece, size) {
        if (typeof GomokuMemory === 'undefined') return null;
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        const recentMoves = (typeof AITactics !== 'undefined' && AITactics.getPlayerMoveHistory)
            ? AITactics.getPlayerMoveHistory() : [];

        if (recentMoves.length === 0) return null;

        // 获取记忆预测
        const attackSuggestion = GomokuMemory.getAttackSuggestion(board, aiPiece, playerPiece, recentMoves);
        if (attackSuggestion && attackSuggestion.confidence > 40) {
            return { row: attackSuggestion.row, col: attackSuggestion.col, from: 'memory_predict', priority: 55, score: attackSuggestion.confidence * 100 };
        }

        // 记忆加分
        const memBonus = GomokuMemory.getMemoryBonus(aiPiece);
        const candidates = getCandidates(board, size, 15);
        let bestScore = -1, bestMove = null;
        for (const { row, col } of candidates) {
            const score = memBonus(row, col) * 10;
            if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
        }
        return bestMove && bestScore > 5 ? { ...bestMove, from: 'memory_bonus', priority: 50, score: bestScore } : null;
    }

    // ========== VCT 连续进攻检测（极限版） ==========

    function detectVCTExtreme(board, piece, size, maxDepth) {
        const opp = piece === BLACK ? WHITE : BLACK;
        const candidates = getCandidates(board, size, 12);

        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const t = countThreatsExtreme(board, row, col, piece, size);
            if (t.liveFours > 0) { board[row][col] = EMPTY; return { row, col }; }
            if (t.rushFourLiveThree || t.doubleThrees || t.rushFours >= 2) {
                board[row][col] = EMPTY; return { row, col };
            }
            if (t.liveThrees >= 1 && maxDepth > 1) {
                const oppBlock = findDefenseExtreme(board, piece, opp, size);
                if (oppBlock) {
                    board[oppBlock.row][oppBlock.col] = opp;
                    const next = detectVCTExtreme(board, piece, size, maxDepth - 1);
                    board[oppBlock.row][oppBlock.col] = EMPTY;
                    if (next) { board[row][col] = EMPTY; return { row, col }; }
                }
            }
            board[row][col] = EMPTY;
        }
        return null;
    }

    function countThreatsExtreme(board, row, col, piece, size) {
        let liveFours = 0, rushFours = 0, liveThrees = 0;
        let rushFourLiveThree = false, doubleThrees = false;
        for (const [dr, dc] of DIRECTIONS) {
            const info = scanDir(board, row, col, dr, dc, piece, size);
            if (info.count >= 5) { liveFours++; continue; }
            if (info.count === 4) {
                if (info.openEnds === 2) liveFours++;
                else if (info.openEnds === 1) rushFours++;
            }
            if (info.count === 3 && info.openEnds === 2) liveThrees++;
        }
        if (rushFours >= 1 && liveThrees >= 1) rushFourLiveThree = true;
        if (liveThrees >= 2) doubleThrees = true;
        return { liveFours, rushFours, liveThrees, rushFourLiveThree, doubleThrees };
    }

    function findDefenseExtreme(board, piece, opp, size) {
        const candidates = getCandidates(board, size, 12);
        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const t = countThreatsExtreme(board, row, col, piece, size);
            board[row][col] = EMPTY;
            if (t.liveFours > 0 || t.rushFourLiveThree || t.rushFours >= 2) return { row, col };
        }
        return candidates.length > 0 ? candidates[0] : null;
    }

    // ========== 终局推演 ==========

    function endgameProjection(board, aiPiece, size) {
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;
        const candidates = getCandidates(board, size, 12);
        let bestScore = -1, bestMove = null;

        for (const { row, col } of candidates) {
            board[row][col] = aiPiece;
            let projScore = 0;

            // 只检查候选位置附近的空位（性能优化）
            const nearby = getCandidates(board, size, 10);
            let aiThreats = 0, playerThreats = 0;
            for (const pos of nearby) {
                const r = pos.row, c = pos.col;
                // 过滤已占用位置（避免重复计算）
                if (board[r][c] !== EMPTY) continue;
                // AI 下一步威胁
                board[r][c] = aiPiece;
                for (const [dr, dc] of DIRECTIONS) {
                    const info = scanDir(board, r, c, dr, dc, aiPiece, size);
                    if (info.count >= 4) aiThreats += 50000;
                    else if (info.count === 3 && info.openEnds === 2) aiThreats += 5000;
                }
                board[r][c] = EMPTY;

                // 对手下一步威胁
                board[r][c] = playerPiece;
                for (const [dr, dc] of DIRECTIONS) {
                    const info = scanDir(board, r, c, dr, dc, playerPiece, size);
                    if (info.count >= 4) playerThreats += 50000;
                    else if (info.count === 3 && info.openEnds === 2) playerThreats += 5000;
                }
                board[r][c] = EMPTY;
            }
            board[row][col] = EMPTY;

            // 攻势 95%
            projScore = aiThreats * 0.95 - playerThreats * 0.05;
            if (projScore > bestScore) { bestScore = projScore; bestMove = { row, col }; }
        }
        return bestMove ? { ...bestMove, from: 'endgame_projection', priority: 58, score: bestScore } : null;
    }

    // ========== 多 AI 加权投票共识 ==========

    function getBestMove(board, aiPiece, size) {
        if (!enabled) return null;

        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;

        // 空棋盘下中心
        let totalPieces = 0;
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) totalPieces++;
        if (totalPieces === 0) {
            const c = Math.floor(size / 2);
            return { row: c, col: c };
        }

        // VCT 连续进攻检测（攻略高阶战术，限制深度避免卡顿）
        const vctResult = detectVCTExtreme(board, aiPiece, size, 3);
        if (vctResult) return vctResult;

        // 防守对手 VCT（深度 2）
        const oppVCT = detectVCTExtreme(board, playerPiece, size, 2);
        if (oppVCT) {
            // 如果 AI 自己有立即获胜的走法，优先进攻
            const nearCands = getCandidates(board, size, 20);
            for (const cand of nearCands) {
                board[cand.row][cand.col] = aiPiece;
                if (checkWin(board, cand.row, cand.col, aiPiece, size)) {
                    board[cand.row][cand.col] = EMPTY;
                    return { row: cand.row, col: cand.col };
                }
                board[cand.row][cand.col] = EMPTY;
            }
            return oppVCT; // 否则堵截对手 VCT 第一步
        }

        // 收集所有 AI 的建议
        const suggestions = [];
        // AI-1: 深度搜索（最高权重）
        const s1 = deepSearchBestMove(board, aiPiece, size);
        if (s1) suggestions.push(s1);

        // AI-2: 统一极限评估（合并原 AI-2/3/4）
        const s2 = evaluatePositionExtreme(board, aiPiece, size);
        if (s2) suggestions.push(s2);

        // AI-3: 记忆预测引擎
        const s3 = memoryPredictionMove(board, aiPiece, size);
        if (s3) suggestions.push(s3);

        // AI-4: 终局推演
        const s4 = endgameProjection(board, aiPiece, size);
        if (s4) suggestions.push(s4);

        if (suggestions.length === 0) {
            const c = Math.floor(size / 2);
            return { row: c, col: c };
        }

        // 加权投票
        const voteWeights = {
            'deep_search': 3.0,         // 深度搜索权重最高
            'extreme_unified': 2.5,     // 统一极限评估（合并原 pattern/strategy/tactical）
            'memory_predict': 1.2,      // 记忆预测
            'memory_bonus': 0.8,        // 记忆加分
            'endgame_projection': 1.6,  // 终局推演
        };

        // 统计每个位置的加权票数
        const voteMap = {};
        for (const sug of suggestions) {
            const key = `${sug.row},${sug.col}`;
            if (!voteMap[key]) voteMap[key] = { row: sug.row, col: sug.col, votes: 0, sources: [] };
            const weight = voteWeights[sug.from] || 1.0;
            // priority 越高（必胜/必防），额外加分
            const priorityBonus = sug.priority >= 99 ? 100 : 0;
            voteMap[key].votes += weight + priorityBonus;
            voteMap[key].sources.push(sug.from);
        }

        // 按票数排序
        const ranked = Object.values(voteMap).sort((a, b) => b.votes - a.votes);

        // 如果多个 AI 都推荐同一位置，直接采用
        if (ranked[0].sources.length >= 3) return { row: ranked[0].row, col: ranked[0].col };

        // 否则用攻防评估做最终确认
        const topMoves = ranked.slice(0, 3);
        let bestEval = -Infinity, bestMove = topMoves[0];
        for (const move of topMoves) {
            let atk = 0, def = 0;
            board[move.row][move.col] = aiPiece;
            for (const [dr, dc] of DIRECTIONS) {
                atk += patternScore(scanDir(board, move.row, move.col, dr, dc, aiPiece, size));
            }
            board[move.row][move.col] = EMPTY;

            board[move.row][move.col] = playerPiece;
            for (const [dr, dc] of DIRECTIONS) {
                def += patternScore(scanDir(board, move.row, move.col, dr, dc, playerPiece, size));
            }
            board[move.row][move.col] = EMPTY;

            const eval_ = atk * 0.95 - def * 0.05 + move.votes * 1000;
            if (eval_ > bestEval) { bestEval = eval_; bestMove = move; }
        }

        return { row: bestMove.row, col: bestMove.col };
    }

    // ========== 评估函数（攻势 95% 防御 5%） ==========

    function evaluateExtreme(board, aiPiece, playerPiece, size) {
        let aiScore = 0, playerScore = 0;
        let aiLiveFours = 0, aiRushFourLiveThree = false;
        let playerLiveFours = 0, playerRushFourLiveThree = false;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                const piece = board[r][c];
                for (const [dr, dc] of DIRECTIONS) {
                    const pr = r - dr, pc = c - dc;
                    if (pr >= 0 && pr < size && pc >= 0 && pc < size && board[pr][pc] === piece) continue;
                    const score = evalLine(board, r, c, dr, dc, piece, size);
                    if (piece === aiPiece) {
                        aiScore += score;
                        // Early termination: 检测活四/冲四活三
                        if (score >= 1000000) aiLiveFours++;
                        else if (score >= 8000) {
                            // 检查是否有活三配合（冲四活三）
                            for (const [dr2, dc2] of DIRECTIONS) {
                                if (dr2 === dr && dc2 === dc) continue;
                                const pr2 = r - dr2, pc2 = c - dc2;
                                if (pr2 >= 0 && pr2 < size && pc2 >= 0 && pc2 < size && board[pr2][pc2] === piece) continue;
                                const s2 = evalLine(board, r, c, dr2, dc2, piece, size);
                                if (s2 >= 10000) aiRushFourLiveThree = true;
                            }
                        }
                    } else {
                        playerScore += score;
                        if (score >= 1000000) playerLiveFours++;
                        else if (score >= 8000) {
                            for (const [dr2, dc2] of DIRECTIONS) {
                                if (dr2 === dr && dc2 === dc) continue;
                                const pr2 = r - dr2, pc2 = c - dc2;
                                if (pr2 >= 0 && pr2 < size && pc2 >= 0 && pc2 < size && board[pr2][pc2] === piece) continue;
                                const s2 = evalLine(board, r, c, dr2, dc2, piece, size);
                                if (s2 >= 10000) playerRushFourLiveThree = true;
                            }
                        }
                    }
                }
            }
        }

        // Early termination: 检测到活四或冲四活三时立即返回
        if (aiLiveFours > 0) return 50000000;  // AI 有活四，必胜
        if (aiRushFourLiveThree) return 30000000;  // AI 有冲四活三，几乎必胜
        if (playerLiveFours > 0) return -50000000;  // 对手有活四，必败
        if (playerRushFourLiveThree) return -30000000;  // 对手有冲四活三，几乎必败

        return aiScore * 19 - playerScore; // 95:5 = 19:1
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
        return lineScore(count, block, (o1?1:0)+(o2?1:0), jump);
    }

    function lineScore(count, block, openEnds, jump) {
        if (count >= 5) return 10000000;
        if (block === 2 && jump === 0) return 0;
        switch (count) {
            case 4: return openEnds === 2 ? 1000000 : (openEnds === 1 ? 8000 : 0);
            case 3: return openEnds === 2 ? (jump > 0 ? 22000 : 10000) : (openEnds === 1 ? (jump > 0 ? 2500 : 800) : 0);
            case 2: return openEnds === 2 ? (jump > 0 ? 550 : 300) : (openEnds === 1 ? (jump > 0 ? 150 : 80) : 0);
            case 1: return openEnds === 2 ? 15 : (openEnds === 1 ? 5 : 0);
            default: return 0;
        }
    }

    // ========== 工具函数 ==========

    function patternScore(info) {
        const { count, openEnds, jumps } = info;
        if (count >= 5) return 10000000;
        if (openEnds === 0 && jumps === 0) return 0;
        switch (count) {
            case 4: return openEnds === 2 ? 1000000 : (openEnds === 1 ? 8000 : 0);
            case 3: return openEnds === 2 ? (jumps > 0 ? 22000 : 10000) : (openEnds === 1 ? (jumps > 0 ? 2500 : 800) : 0);
            case 2: return openEnds === 2 ? (jumps > 0 ? 550 : 300) : (openEnds === 1 ? (jumps > 0 ? 180 : 80) : 0);
            case 1: return openEnds === 2 ? 18 : (openEnds === 1 ? 5 : 0);
            default: return 0;
        }
    }

    function scanDir(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0, jumps = 0;
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r += dr; c += dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
            openEnds++;
            let jr = r + dr, jc = c + dc;
            while (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) { jumps++; jr += dr; jc += dc; }
        }
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) { count++; r -= dr; c -= dc; }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
        return { count, openEnds, jumps };
    }

    function getCandidates(board, size, maxCount) {
        const map = new Map();
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
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
        // 快速评分排序（提升 alpha-beta 剪枝效率）
        const center = (size - 1) / 2;
        for (const cand of arr) {
            let score = 0;
            for (const [dr, dc] of DIRECTIONS) {
                score += quickScoreDir(board, cand.row, cand.col, dr, dc, size);
            }
            // 中心位置加分
            score += Math.max(0, size - Math.abs(cand.row - center) - Math.abs(cand.col - center)) * 3;
            cand.score = score;
        }
        arr.sort((a, b) => b.score - a.score);
        return arr.slice(0, maxCount);
    }

    function quickScoreDir(board, row, col, dr, dc, size) {
        let score = 0;
        const piece1 = board[row + dr]?.[col + dc];
        const piece2 = board[row - dr]?.[col - dc];
        if (piece1 !== undefined && piece1 !== EMPTY) score += 10;
        if (piece2 !== undefined && piece2 !== EMPTY) score += 10;
        // 检查更远的连子
        if (piece1 !== undefined && piece1 !== EMPTY) {
            const p3 = board[row + 2*dr]?.[col + 2*dc];
            if (p3 === piece1) score += 30;
        }
        if (piece2 !== undefined && piece2 !== EMPTY) {
            const p3 = board[row - 2*dr]?.[col - 2*dc];
            if (p3 === piece2) score += 30;
        }
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

    function detectFocus(board, size) {
        let bestR = Math.floor(size / 2), bestC = Math.floor(size / 2), bestHeat = 0;
        const heatMap = Array.from({ length: size }, () => new Array(size).fill(0));
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                for (let dr = -3; dr <= 3; dr++) {
                    for (let dc = -3; dc <= 3; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                            heatMap[nr][nc] += Math.max(0, 4 - Math.abs(dr) - Math.abs(dc));
                        }
                    }
                }
            }
        }
        for (let r = 1; r < size - 1; r++) {
            for (let c = 1; c < size - 1; c++) {
                const h = heatMap[r][c] + heatMap[r-1][c] + heatMap[r+1][c] + heatMap[r][c-1] + heatMap[r][c+1];
                if (h > bestHeat) { bestHeat = h; bestR = r; bestC = c; }
            }
        }
        return { row: bestR, col: bestC, radius: 5 };
    }

    return {
        isEnabled, setEnabled, getBestMove, getConfig: () => ({ ...EXTREME_CONFIG })
    };
})();
