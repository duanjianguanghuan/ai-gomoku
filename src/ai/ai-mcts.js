/**
 * AI 五子棋 - MCTS (蒙特卡洛树搜索) 算法模块 v1
 * 
 * MCTS 算法特点：
 * - 不需要评估函数，通过随机模拟评估位置
 * - 适合复杂棋类游戏
 * - 可以与深度搜索结合使用
 * 
 * 核心概念：
 * - UCT (Upper Confidence Bound applied to Trees)
 * - 选择、扩展、模拟、反向传播
 */

const AIMCTS = (() => {
    'use strict';

    const EMPTY = 0, BLACK = 1, WHITE = 2;
    
    // 配置参数
    const CONFIG = {
        maxIterations: 50000,        // 最大迭代次数
        maxTime: 3000,              // 最大计算时间（毫秒）
        exploration: Math.sqrt(2),  // UCT 探索参数
        simulationDepth: 15,         // 模拟深度
        earlyStopping: true,         // 提前停止（发现必胜）
        reuseTree: false             // 是否复用搜索树
    };

    let rootNode = null;
    let currentBoard = null;
    let aiPiece = WHITE;
    let nodeCount = 0;

    // MCTS 树节点
    class MCTSNode {
        constructor(board, piece, parent = null, move = null) {
            this.board = board;           // 棋盘状态
            this.piece = piece;          // 当前要落子的玩家
            this.parent = parent;        // 父节点
            this.move = move;            // 导致此节点的落子
            this.children = [];          // 子节点
            this.wins = 0;              // 获胜次数
            this.visits = 0;             // 访问次数
            this.untriedMoves = null;    // 未尝试的落子
        }

        // UCT 值计算
        getUCTValue(exploration) {
            if (this.visits === 0) return Infinity;
            return (this.wins / this.visits) + 
                   exploration * Math.sqrt(Math.log(this.parent.visits) / this.visits);
        }

        // 是否是叶子节点
        isLeaf() {
            return this.children.length === 0;
        }

        // 是否是完全展开
        isFullyExpanded() {
            return this.untriedMoves !== null && this.untriedMoves.length === 0;
        }
    }

    // 初始化
    function init() {
        rootNode = null;
        currentBoard = null;
        nodeCount = 0;
    }

    // 设置 AI 棋子
    function setAIPiece(piece) {
        aiPiece = piece;
    }

    // 获取有效落子（带邻居检测）
    function getValidMoves(board, size, range = 2) {
        if (typeof AIUtils !== 'undefined') {
            return AIUtils.getValidMoves(board, size, range);
        }

        const moves = new Map();
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) continue;
                
                let hasNeighbor = false;
                const minR = Math.max(0, r - range);
                const maxR = Math.min(size - 1, r + range);
                const minC = Math.max(0, c - range);
                const maxC = Math.min(size - 1, c + range);

                outer:
                for (let nr = minR; nr <= maxR; nr++) {
                    for (let nc = minC; nc <= maxC; nc++) {
                        if (nr === r && nc === c) continue;
                        if (board[nr][nc] !== EMPTY) {
                            hasNeighbor = true;
                            break outer;
                        }
                    }
                }

                if (hasNeighbor) {
                    moves.set(r * size + c, { row: r, col: c });
                }
            }
        }
        return Array.from(moves.values());
    }

    // 检查获胜
    function checkWin(board, row, col, piece, size) {
        if (typeof AIUtils !== 'undefined') {
            return AIUtils.checkWin(board, row, col, piece, size);
        }

        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (const [dr, dc] of directions) {
            let count = 1;
            
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++;
                r += dr;
                c += dc;
            }
            
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

    // 获取对手
    function getOpponent(piece) {
        return piece === BLACK ? WHITE : BLACK;
    }

    // 复制棋盘
    function copyBoard(board) {
        return board.map(row => [...row]);
    }

    // 选择最佳子节点（UCT）
    function selectBestChild(node) {
        let bestChild = null;
        let bestValue = -Infinity;

        for (const child of node.children) {
            const uctValue = child.getUCTValue(CONFIG.exploration);
            if (uctValue > bestValue) {
                bestValue = uctValue;
                bestChild = child;
            }
        }

        return bestChild;
    }

    // 扩展节点
    function expandNode(node, board, size) {
        if (node.untriedMoves === null) {
            node.untriedMoves = getValidMoves(board, size, 2);
        }

        if (node.untriedMoves.length === 0) return null;

        // 随机选择一个未尝试的落子
        const moveIndex = Math.floor(Math.random() * node.untriedMoves.length);
        const move = node.untriedMoves.splice(moveIndex, 1)[0];

        // 创建新棋盘
        const newBoard = copyBoard(board);
        newBoard[move.row][move.col] = node.piece;

        // 创建新节点
        const childNode = new MCTSNode(newBoard, getOpponent(node.piece), node, move);
        node.children.push(childNode);

        return childNode;
    }

    // 模拟游戏（随机落子）
    function simulate(node, board, size) {
        let currentPiece = node.piece;
        let simBoard = copyBoard(board);
        let moves = 0;

        // 检查当前位置是否已获胜
        if (node.move) {
            if (checkWin(simBoard, node.move.row, node.move.col, 
                        currentPiece === aiPiece ? getOpponent(aiPiece) : aiPiece, size)) {
                return currentPiece === aiPiece ? 0 : 1; // AI 输了或赢了
            }
        }

        while (moves < CONFIG.simulationDepth) {
            const validMoves = getValidMoves(simBoard, size, 2);
            if (validMoves.length === 0) break;

            // 优先选择能获胜的落子
            for (const move of validMoves) {
                simBoard[move.row][move.col] = currentPiece;
                if (checkWin(simBoard, move.row, move.col, currentPiece, size)) {
                    simBoard[move.row][move.col] = EMPTY;
                    return currentPiece === aiPiece ? 1 : 0;
                }
                simBoard[move.row][move.col] = EMPTY;
            }

            // 随机选择
            const move = validMoves[Math.floor(Math.random() * validMoves.length)];
            simBoard[move.row][move.col] = currentPiece;

            currentPiece = getOpponent(currentPiece);
            moves++;
        }

        // 模拟结束，返回平局或评估
        return 0.5;
    }

    // 反向传播
    function backpropagate(node, result) {
        let currentNode = node;
        
        while (currentNode !== null) {
            currentNode.visits++;
            
            // 如果是 AI 的节点，增加胜率
            // 注意：result 是相对于 AI 的结果
            if (currentNode.piece === getOpponent(aiPiece)) {
                currentNode.wins += result;
            }
            
            currentNode = currentNode.parent;
        }
    }

    // MCTS 主循环
    function search(board, piece, size) {
        const startTime = performance.now();
        nodeCount = 0;

        // 初始化根节点
        if (CONFIG.reuseTree && rootNode && currentBoard) {
            // 尝试复用之前的树
            rootNode = findExistingNode(board, rootNode);
        } else {
            rootNode = new MCTSNode(copyBoard(board), piece);
        }

        currentBoard = copyBoard(board);
        aiPiece = piece;

        // 迭代搜索
        while (nodeCount < CONFIG.maxIterations) {
            // 超时检查
            if (performance.now() - startTime > CONFIG.maxTime) {
                console.log(`[MCTS] Timeout after ${nodeCount} iterations`);
                break;
            }

            nodeCount++;
            let node = rootNode;
            let simBoard = copyBoard(rootNode.board);

            // 选择阶段
            while (!node.isLeaf() && node.isFullyExpanded()) {
                node = selectBestChild(node);
                simBoard[node.move.row][node.move.col] = node.parent.piece;
            }

            // 检查游戏是否结束
            if (node.move && checkWin(simBoard, node.move.row, node.move.col, 
                                     getOpponent(node.piece), size)) {
                // 父节点获胜
                backpropagate(node, node.piece === aiPiece ? 0 : 1);
                continue;
            }

            // 扩展阶段
            if (!node.isFullyExpanded()) {
                node = expandNode(node, simBoard, size);
                if (node) {
                    simBoard[node.move.row][node.move.col] = getOpponent(node.parent.piece);
                }
            }

            // 模拟阶段
            if (node) {
                const result = simulate(node, simBoard, size);
                backpropagate(node, result);
            }
        }

        // 选择访问次数最多的子节点
        let bestChild = null;
        let bestVisits = -1;

        for (const child of rootNode.children) {
            if (child.visits > bestVisits) {
                bestVisits = child.visits;
                bestChild = child;
            }
        }

        const thinkTime = performance.now() - startTime;
        console.log(`[MCTS] Completed: ${nodeCount} iterations, ${thinkTime.toFixed(2)}ms`);

        return bestChild ? bestChild.move : getValidMoves(board, size, 2)[0];
    }

    // 查找现有节点（用于树复用）
    function findExistingNode(board, node) {
        if (node.move === null) return node;

        for (const child of node.children) {
            if (child.move && child.move.row === node.move?.row && 
                child.move.col === node.move?.col) {
                return child;
            }
        }
        return new MCTSNode(copyBoard(board), node.piece);
    }

    // 获取最佳移动
    function getBestMove(board, piece, size) {
        try {
            return search(board, piece, size);
        } catch (error) {
            console.error('[MCTS] Error:', error);
            // 回退到随机落子
            const moves = getValidMoves(board, size, 2);
            return moves.length > 0 ? moves[0] : { row: 7, col: 7 };
        }
    }

    // 获取统计信息
    function getStats() {
        if (!rootNode) return null;
        return {
            iterations: nodeCount,
            rootVisits: rootNode.visits,
            children: rootNode.children.map(c => ({
                move: c.move,
                visits: c.visits,
                wins: c.wins,
                winRate: c.visits > 0 ? (c.wins / c.visits * 100).toFixed(1) + '%' : '0%'
            }))
        };
    }

    return {
        init,
        setAIPiece,
        getBestMove,
        getStats,
        CONFIG,
        search
    };
})();
