/**
 * AI 五子棋 - 高性能工具函数 v2
 * 优化版本：添加缓存机制、批量操作、性能监控
 */

const AIUtils = (() => {
    'use strict';

    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // 性能缓存
    const cache = {
        positionScores: new Map(),
        validMoves: new Map(),
        lastBoardHash: null,
        enabled: true
    };

    // 简单棋盘哈希（用于缓存验证）
    function boardHash(board) {
        let hash = 0;
        for (let i = 0; i < board.length; i++) {
            for (let j = 0; j < board[i].length; j++) {
                hash = ((hash << 5) - hash + board[i][j]) | 0;
            }
        }
        return hash;
    }

    function clearCache() {
        cache.positionScores.clear();
        cache.validMoves.clear();
        cache.lastBoardHash = null;
    }

    function checkWin(board, row, col, piece, size) {
        for (const [dr, dc] of DIRECTIONS) {
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

    function isBoardEmpty(board, size) {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) return false;
            }
        }
        return true;
    }

    // 优化：批量检查获胜位置
    function findWinningMove(board, piece, size, candidates) {
        if (!candidates || candidates.length === 0) return null;

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

    // 优化：获取有效移动（带缓存）
    function getValidMoves(board, size, range = 2) {
        if (!cache.enabled) return getValidMovesNoCache(board, size, range);

        const hash = boardHash(board) ^ (range << 16);
        if (cache.validMoves.has(hash)) {
            return cache.validMoves.get(hash);
        }

        const moves = getValidMovesNoCache(board, size, range);
        cache.validMoves.set(hash, moves);
        cache.lastBoardHash = hash;
        return moves;
    }

    function getValidMovesNoCache(board, size, range = 2) {
        const map = new Map();

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) continue;

                // 检查是否在棋子范围内
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
                    map.set(r * size + c, { row: r, col: c });
                }
            }
        }

        return Array.from(map.values());
    }

    // 优化：检查位置是否有效
    function isValidPosition(row, col, size) {
        return row >= 0 && row < size && col >= 0 && col < size;
    }

    // 优化：计算曼哈顿距离
    function manhattanDistance(pos1, pos2) {
        return Math.abs(pos1.row - pos2.row) + Math.abs(pos1.col - pos2.col);
    }

    // 优化：获取中心距离（用于位置排序）
    function getCenterDistance(row, col, size) {
        const center = (size - 1) / 2;
        return Math.abs(row - center) + Math.abs(col - center);
    }

    // 优化：批量计数连续棋子（四个方向）
    function countAllDirections(board, row, col, piece, size) {
        const counts = [0, 0, 0, 0]; // 四个方向

        for (let d = 0; d < 4; d++) {
            const [dr, dc] = DIRECTIONS[d];
            let count = 1;

            // 正方向
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++;
                r += dr;
                c += dc;
            }

            // 反方向
            r = row - dr;
            c = col - dc;
            while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                count++;
                r -= dr;
                c -= dc;
            }

            counts[d] = count;
        }

        return counts;
    }

    // 优化：分析单个方向
    function analyzeDirection(board, row, col, dr, dc, piece, size) {
        let count = 1, openEnds = 0;

        // 正方向
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++;
            r += dr;
            c += dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        // 反方向
        r = row - dr;
        c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
            count++;
            r -= dr;
            c -= dc;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) openEnds++;

        return { count, openEnds };
    }

    // 优化：复制棋盘（浅拷贝优化）
    function copyBoard(board) {
        return board.map(row => [...row]);
    }

    // 优化：创建空棋盘
    function createEmptyBoard(size) {
        return Array.from({ length: size }, () => Array(size).fill(EMPTY));
    }

    // 获取对手棋子
    function getOpponent(piece) {
        return piece === BLACK ? WHITE : BLACK;
    }

    // 性能监控
    const perf = {
        lastCheckTime: 0,
        lastMoveCount: 0,
        totalEvaluations: 0
    };

    function performanceCheck(tag) {
        const now = performance.now();
        if (perf.lastCheckTime > 0) {
            const elapsed = now - perf.lastCheckTime;
            if (elapsed > 100) {
                console.warn(`[AIUtils Perf] ${tag}: ${elapsed.toFixed(2)}ms`);
            }
        }
        perf.lastCheckTime = now;
    }

    return {
        EMPTY, BLACK, WHITE, DIRECTIONS,
        checkWin,
        isBoardEmpty,
        findWinningMove,
        getValidMoves,
        getValidMovesNoCache,
        isValidPosition,
        manhattanDistance,
        getCenterDistance,
        countAllDirections,
        analyzeDirection,
        copyBoard,
        createEmptyBoard,
        getOpponent,
        clearCache,
        boardHash,
        cache,
        perf,
        performanceCheck
    };
})();
