/**
 * AI 五子棋 - 蒙特卡洛树搜索引擎 v1 (MCTS)
 * 基于蒙特卡洛树搜索的 AI 决策引擎
 *
 * 核心算法：
 *   1. Selection（选择）：UCB1 公式选择最优子节点
 *   2. Expansion（扩展）：展开未访问的子节点
 *   3. Simulation（模拟）：随机模拟至终局
 *   4. Backpropagation（回传）：更新路径上所有节点的胜率
 *
 * 优化特性：
 *   - RAVE (Rapid Action Value Estimation)：加速收敛
 *   - 智能模拟：非纯随机，基于启发式规则模拟
 *   - 即时获胜/防守权重提升
 *   - 时间限制 + 迭代次数双控制
 *   - 与现有模块兼容（IIFE 模式，标准接口）
 */

const AIMCTS = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // MCTS 配置
    const MCTS_CONFIG = {
        maxIterations: 5000,     // 降低迭代次数，提升响应速度
        maxTimeMs: 1500,         // 降低时间限制
        explorationConstant: 1.2, // UCB1 探索常数（五子棋偏向利用）
        raveWeight: 0.5,        // RAVE 权重（0=关闭RAVE，1=纯RAVE）
        raveDecay: 0.01,        // RAVE 衰减因子
        smartSimulation: true,  // 启用智能模拟（非纯随机）
        winBonus: 100,          // 即时获胜节点额外奖励
        blockBonus: 80,         // 即时防守节点额外奖励
    };

    let enabled = false;

    function isEnabled() { return enabled; }
    function setEnabled(val) { enabled = !!val; }

    // ========== MCTS 树节点 ==========

    class MCTSNode {
        constructor(board, row, col, piece, parent, moveNumber) {
            this.row = row;
            this.col = col;
            this.piece = piece;       // 落子方
            this.parent = parent;
            this.children = [];
            this.untriedMoves = [];    // 未展开的候选位置

            // 统计数据
            this.visits = 0;
            this.wins = 0;
            this.draws = 0;

            // RAVE 统计
            this.raveWins = 0;
            this.raveVisits = 0;

            // 落子编号（用于RAVE映射）
            this.moveNumber = moveNumber;
        }

        get ucb1() {
            if (this.visits === 0) return Infinity;
            const exploitation = this.wins / this.visits;
            const exploration = MCTS_CONFIG.explorationConstant *
                Math.sqrt(Math.log(this.parent.visits) / this.visits);
            return exploitation + exploration;
        }

        get raveValue() {
            if (this.raveVisits === 0) return 0;
            return this.raveWins / this.raveVisits;
        }

        get ucb1Rave() {
            if (this.visits === 0) return Infinity;
            const beta = Math.sqrt(MCTS_CONFIG.raveWeight /
                (3 * this.visits + MCTS_CONFIG.raveDecay * this.visits * this.visits));
            const mcValue = this.wins / this.visits;
            const raveVal = this.raveVisits > 0 ? this.raveWins / this.raveVisits : mcValue;
            const exploration = MCTS_CONFIG.explorationConstant *
                Math.sqrt(Math.log(this.parent.visits) / this.visits);
            return (1 - beta) * mcValue + beta * raveVal + exploration;
        }
    }

    // ========== 主入口 ==========

    function getBestMove(board, aiPiece, size) {
        if (!enabled) return null;
        const playerPiece = aiPiece === BLACK ? WHITE : BLACK;

        // 空棋盘：抢占天元
        if (isBoardEmpty(board, size)) {
            const c = Math.floor(size / 2);
            return { row: c, col: c };
        }

        // 即时获胜检测
        const winMove = findWinMove(board, aiPiece, size);
        if (winMove) return { ...winMove, from: 'mcts_win', priority: 100 };

        // 即时防守检测
        const blockMove = findBlockMove(board, playerPiece, size);
        if (blockMove) return { ...blockMove, from: 'mcts_block', priority: 99 };

        // MCTS 搜索
        const candidates = getCandidates(board, size, 30);
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return { row: candidates[0].row, col: candidates[0].col };

        const root = new MCTSNode(board, -1, -1, null, 0);
        root.untriedMoves = candidates.map(c => ({ row: c.row, col: c.col }));

        const startTime = performance.now();
        let iterations = 0;

        // 迭代搜索
        while (iterations < MCTS_CONFIG.maxIterations &&
               (performance.now() - startTime) < MCTS_CONFIG.maxTimeMs) {
            const path = selectNode(root, board, size);
            const leaf = path[path.length - 1];
            const result = expandAndSimulate(leaf, board, aiPiece, size);
            backpropagate(leaf, result, aiPiece);

            // 清理 selectNode 放置的棋子（逆序移除）
            for (let i = path.length - 1; i >= 1; i--) {
                // 仅当棋子仍存在时才移除（避免与 expandAndSimulate 重复清理）
                if (board[path[i].row][path[i].col] === path[i].piece) {
                    board[path[i].row][path[i].col] = EMPTY;
                }
            }

            iterations++;
        }

        // 选择访问次数最多的子节点
        let bestChild = null, bestVisits = -1;
        for (const child of root.children) {
            if (child.visits > bestVisits) {
                bestVisits = child.visits;
                bestChild = child;
            }
        }

        if (!bestChild) return { row: candidates[0].row, col: candidates[0].col };

        return {
            row: bestChild.row,
            col: bestChild.col,
            from: 'mcts',
            priority: 75,
            score: bestChild.visits,
            winRate: (bestChild.wins / bestChild.visits * 100).toFixed(1) + '%',
            iterations
        };
    }

    // ========== Selection（选择） ==========

    function selectNode(node, board, size) {
        const path = [node];
        while (node.untriedMoves.length === 0 && node.children.length > 0) {
            // UCB1 + RAVE 选择最优子节点
            let bestChild = null, bestUCB = -Infinity;
            for (const child of node.children) {
                const ucb = child.ucb1Rave;
                if (ucb > bestUCB) {
                    bestUCB = ucb;
                    bestChild = child;
                }
            }
            if (bestChild) {
                board[bestChild.row][bestChild.col] = bestChild.piece;
                node = bestChild;
                path.push(node);
            } else break;
        }
        return path;
    }

    // ========== Expansion + Simulation（扩展 + 模拟） ==========

    function expandAndSimulate(node, board, aiPiece, size) {
        // 扩展：选择一个未尝试的移动
        if (node.untriedMoves.length > 0) {
            const idx = Math.floor(Math.random() * node.untriedMoves.length);
            const move = node.untriedMoves.splice(idx, 1)[0];
            const nextPiece = node.piece === EMPTY ? aiPiece :
                (node.piece === BLACK ? WHITE : BLACK);

            const child = new MCTSNode(board, move.row, move.col, nextPiece, node,
                node.moveNumber + 1);

            // 智能排序未尝试的移动（优先高价值位置）
            if (node.untriedMoves.length > 0) {
                sortUntriedMoves(node.untriedMoves, board, nextPiece, size);
            }

            node.children.push(child);
            board[move.row][move.col] = nextPiece;

            // 检查是否即时获胜
            if (checkWin(board, move.row, move.col, nextPiece, size)) {
                const result = { winner: nextPiece, moves: 1 };
                board[move.row][move.col] = EMPTY;
                return result;
            }

            node = child;
        }

        // 模拟：从当前节点随机模拟至终局
        const result = simulate(board, node.piece, aiPiece, size);

        // 清理扩展阶段放置的棋子（非根节点且非即时获胜时需要清理）
        if (node.row >= 0 && node.col >= 0) {
            board[node.row][node.col] = EMPTY;
        }

        return result;
    }

    // ========== Simulation（模拟） ==========

    function simulate(board, currentPiece, aiPiece, size) {
        const simBoard = board.map(row => [...row]);
        let simPiece = currentPiece;
        let moveCount = 0;
        const maxMoves = size * size;
        const simMoves = []; // 记录模拟中的所有走子（用于 RAVE/AMAF）

        // 收集候选位置
        let candidates = getCandidatesFast(simBoard, size);

        while (candidates.length > 0 && moveCount < maxMoves) {
            let move;

            if (MCTS_CONFIG.smartSimulation && moveCount < 30) {
                // 智能模拟：优先检查即时获胜/防守
                move = findSmartSimMove(simBoard, simPiece, candidates, size);
            } else {
                // 随机模拟
                const idx = Math.floor(Math.random() * candidates.length);
                move = candidates[idx];
            }

            simBoard[move.row][move.col] = simPiece;
            simMoves.push({ row: move.row, col: move.col });

            if (checkWin(simBoard, move.row, move.col, simPiece, size)) {
                return { winner: simPiece, moves: moveCount + 1, simMoves };
            }

            simPiece = simPiece === BLACK ? WHITE : BLACK;
            moveCount++;

            // 更新候选（只添加新邻居，不移除旧的以提升性能）
            if (moveCount % 5 === 0) {
                candidates = getCandidatesFast(simBoard, size);
            } else {
                addNeighbors(candidates, simBoard, move.row, move.col, size);
            }
        }

        return { winner: 'draw', moves: moveCount, simMoves };
    }

    /**
     * 智能模拟移动选择
     */
    function findSmartSimMove(board, piece, candidates, size) {
        const opp = piece === BLACK ? WHITE : BLACK;

        // Only check last few candidates (most likely to have winning moves)
        const checkCount = Math.min(candidates.length, 12);
        const startIdx = Math.max(0, candidates.length - checkCount);

        // 1. Check for immediate win
        for (let i = startIdx; i < candidates.length; i++) {
            const { row, col } = candidates[i];
            board[row][col] = piece;
            if (checkWin(board, row, col, piece, size)) {
                board[row][col] = EMPTY;
                return { row, col };
            }
            board[row][col] = EMPTY;
        }

        // 2. Check for immediate block
        for (let i = startIdx; i < candidates.length; i++) {
            const { row, col } = candidates[i];
            board[row][col] = opp;
            if (checkWin(board, row, col, opp, size)) {
                board[row][col] = EMPTY;
                return { row, col };
            }
            board[row][col] = EMPTY;
        }

        // 3. Heuristic selection (sample-based, faster than evaluating all)
        const sampleSize = Math.min(candidates.length, 5);
        let bestMove = candidates[Math.floor(Math.random() * candidates.length)];
        let bestScore = -1;
        for (let i = 0; i < sampleSize; i++) {
            const idx = Math.floor(Math.random() * candidates.length);
            const { row, col } = candidates[idx];
            const score = quickEvalPosition(board, row, col, piece, size);
            if (score > bestScore) {
                bestScore = score;
                bestMove = { row, col };
            }
        }
        return bestMove;
    }

    // ========== Backpropagation（回传） ==========

    function backpropagate(node, result, aiPiece) {
        while (node !== null) {
            node.visits++;

            // 判断此节点对 AI 是否为胜
            if (result.winner === 'draw') {
                node.draws++;
            } else if (result.winner === aiPiece) {
                node.wins++;
            }

            // RAVE 更新（AMAF：All Moves As First）
            // 检查模拟中走过的位置是否与当前节点位置匹配
            if (result.simMoves) {
                for (const m of result.simMoves) {
                    if (m.row === node.row && m.col === node.col) {
                        node.raveVisits++;
                        if (result.winner === node.piece) node.raveWins++;
                        break; // 每个节点位置最多匹配一次
                    }
                }
            }

            node = node.parent;
        }
    }

    // ========== 辅助函数 ==========

    function findWinMove(board, piece, size) {
        const candidates = getCandidatesFast(board, size);
        for (const { row, col } of candidates) {
            board[row][col] = piece;
            if (checkWin(board, row, col, piece, size)) {
                board[row][col] = EMPTY;
                return { row, col };
            }
            board[row][col] = EMPTY;
        }
        return null;
    }

    function findBlockMove(board, oppPiece, size) {
        const candidates = getCandidatesFast(board, size);
        for (const { row, col } of candidates) {
            board[row][col] = oppPiece;
            if (checkWin(board, row, col, oppPiece, size)) {
                board[row][col] = EMPTY;
                return { row, col };
            }
            board[row][col] = EMPTY;
        }
        return null;
    }

    function getCandidates(board, size, maxCount) {
        const candidates = getCandidatesFast(board, size);
        // 按启发式评分排序
        for (const cand of candidates) {
            cand.score = quickEvalPosition(board, cand.row, cand.col, BLACK, size) +
                         quickEvalPosition(board, cand.row, cand.col, WHITE, size);
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, maxCount);
    }

    function getCandidatesFast(board, size) {
        const set = new Set();
        const candidates = [];
        const range = 2;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === EMPTY) continue;
                for (let dr = -range; dr <= range; dr++) {
                    for (let dc = -range; dc <= range; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size &&
                            board[nr][nc] === EMPTY) {
                            const key = nr * size + nc;
                            if (!set.has(key)) {
                                set.add(key);
                                candidates.push({ row: nr, col: nc });
                            }
                        }
                    }
                }
            }
        }
        return candidates;
    }

    function addNeighbors(candidates, board, row, col, size) {
        const range = 2;
        // Build a Set of existing positions for O(1) lookup
        const existing = new Set();
        for (const c of candidates) existing.add(c.row * size + c.col);

        for (let dr = -range; dr <= range; dr++) {
            for (let dc = -range; dc <= range; dc++) {
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size &&
                    board[nr][nc] === EMPTY) {
                    const key = nr * size + nc;
                    if (!existing.has(key)) {
                        existing.add(key);
                        candidates.push({ row: nr, col: nc });
                    }
                }
            }
        }
    }

    function sortUntriedMoves(moves, board, piece, size) {
        // 按快速评估排序（高价值优先展开）
        for (const move of moves) {
            move.score = quickEvalPosition(board, move.row, move.col, piece, size);
        }
        moves.sort((a, b) => b.score - a.score);
    }

    function quickEvalPosition(board, row, col, piece, size) {
        let score = 0;
        for (const [dr, dc] of DIRECTIONS) {
            let count = 1, openEnds = 0;
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++; r += dr; c += dc;
            }
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;
            r = row - dr; c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++; r -= dr; c -= dc;
            }
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

            if (count >= 5) return 100000;
            if (count === 4 && openEnds >= 1) score += 50000;
            else if (count === 3 && openEnds === 2) score += 5000;
            else if (count === 3 && openEnds === 1) score += 500;
            else if (count === 2 && openEnds === 2) score += 200;
            else if (count === 2 && openEnds === 1) score += 50;
        }
        const center = (size - 1) / 2;
        score += Math.max(0, (size - Math.abs(row - center) - Math.abs(col - center))) * 2;
        return score;
    }

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

    function isBoardEmpty(board, size) {
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c] !== EMPTY) return false;
        return true;
    }

    return {
        isEnabled, setEnabled, getBestMove,
        getConfig: () => ({ ...MCTS_CONFIG }),
    };
})();
