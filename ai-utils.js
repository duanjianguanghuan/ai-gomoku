/**
 * AI 五子棋 - 共享工具函数
 * 避免在多个 AI 模块中重复定义
 */

const AIUtils = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

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

    return { EMPTY, BLACK, WHITE, DIRECTIONS, checkWin, isBoardEmpty };
})();
