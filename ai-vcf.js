/**
 * AI 五子棋 - VCF/VCT/TSS 强制攻击引擎
 *
 * 本模块实现五子棋中三种经典的威胁空间搜索算法：
 *   VCF (Victory by Continuous Fours) — 连续冲四取胜
 *   VCT (Victory by Continuous Threats) — 连续威胁取胜（冲四+活三）
 *   TSS (Threat Space Search) — 威胁空间搜索（最通用）
 *
 * 核心思想：
 *   攻击方只走"威胁棋"（冲四、活三等），防守方只能被动应答。
 *   由于搜索空间仅限于威胁走法，效率远高于全盘搜索。
 *
 * 算法复杂度：
 *   VCF — 每层只有1个防守点（冲四防守唯一），搜索极快
 *   VCT — 活三有多个防守点，需逐一验证，搜索较慢
 *   TSS — 最通用但最慢，考虑所有威胁类型
 *
 * 性能保障：
 *   - 节点数上限防止超时
 *   - 深度限制防止无限递归
 *   - 就地修改棋盘（undo）避免拷贝开销
 *   - 走法排序优先尝试强威胁
 */

const AIVCF = (() => {
    // ========== 常量定义 ==========
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // 搜索节点上限（防止超时）
    const MAX_VCF_NODES = 50000;   // 降低节点上限，VCF 通常很快
    const MAX_VCT_NODES = 30000;   // 降低节点上限，VCT 是主要耗时来源
    const MAX_TSS_NODES = 20000;   // 降低节点上限

    // 搜索深度上限
    const VCF_MAX_DEPTH = 20;
    const VCT_MAX_DEPTH = 12;
    const TSS_MAX_DEPTH = 8;

    // 模块开关与统计
    let enabled = true;
    let stats = {
        vcfNodes: 0, vctNodes: 0, tssNodes: 0,
        vcfFound: 0, vctFound: 0, tssFound: 0
    };

    // ========== 模块接口 ==========
    function isEnabled() { return enabled; }
    function setEnabled(val) { enabled = !!val; }
    function getStats() { return { ...stats }; }
    function resetStats() {
        stats = {
            vcfNodes: 0, vctNodes: 0, tssNodes: 0,
            vcfFound: 0, vctFound: 0, tssFound: 0
        };
    }

    // ========== 基础工具函数 ==========

    /**
     * 检测在 (row, col) 落子后是否形成五连
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
     * 获取候选位置列表（已有棋子附近的空位）
     * @param {Array} board - 棋盘
     * @param {number} size - 棋盘大小
     * @param {number} range - 搜索范围（默认2）
     * @returns {Array<{row: number, col: number}>}
     */
    function getCandidates(board, size, range) {
        range = range || 2;
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

    // ========== 方向分析（带跳子检测） ==========

    /**
     * 全方向分析：在 (row, col) 已落 piece 的情况下，分析 (dr, dc) 方向的棋型
     * 返回连续子数、开放端数、跳子数、总可达长度
     *
     * 与 ai-ultimate.js 中的 analyzeDirFull 保持一致的实现逻辑
     *
     * @param {Array} board - 棋盘
     * @param {number} row - 行
     * @param {number} col - 列
     * @param {number} dr - 行方向增量
     * @param {number} dc - 列方向增量
     * @param {number} piece - 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {{ count: number, openEnds: number, jumps: number, totalReach: number }}
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
            // 大跳检测：跳过一个空位后还有己方棋子
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

    // ========== 威胁统计 ==========

    /**
     * 统计在 (row, col) 落子后产生的威胁类型
     * 需要在落子后调用（board[row][col] 已设为 piece）
     *
     * @param {Array} board - 棋盘
     * @param {number} row - 行
     * @param {number} col - 列
     * @param {number} piece - 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Object} 威胁统计结果
     */
    function countThreats(board, row, col, piece, size) {
        let fives = 0, liveFours = 0, rushFours = 0, liveThrees = 0;
        let sleepThrees = 0, liveTwos = 0;
        let doubleFours = false, fourThree = false, doubleThrees = false;
        let doubleSleepThrees = false;

        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);

            // 五连
            if (info.count >= 5) {
                fives++;
                continue;
            }

            // 四的判定（含跳四）
            if (info.count === 4) {
                if (info.openEnds === 2) liveFours++;
                else if (info.openEnds === 1) rushFours++;
            } else if (info.count === 3 && info.openEnds >= 1 && info.jumps >= 1 && info.totalReach >= 4) {
                // 跳四：三子+跳+一子 = 四（如 XX_X 或 X_XX 形成冲四）
                rushFours++;
            }

            // 活三判定（含跳活三）
            if (info.count === 3 && info.openEnds === 2) {
                liveThrees++;
            } else if (info.count === 2 && info.openEnds === 2 && info.jumps >= 1 && info.totalReach >= 3) {
                // 跳活三：二子+跳+一子 = 三
                liveThrees++;
            }

            // 眠三
            if (info.count === 3 && info.openEnds === 1) {
                sleepThrees++;
            }

            // 活二
            if (info.count === 2 && info.openEnds === 2) {
                liveTwos++;
            }
        }

        // 组合威胁判定
        const totalFours = liveFours + rushFours;
        if (totalFours >= 2) doubleFours = true;
        if (totalFours >= 1 && liveThrees >= 1) fourThree = true;
        if (liveThrees >= 2) doubleThrees = true;
        if (sleepThrees >= 2) doubleSleepThrees = true;

        return {
            fives, liveFours, rushFours, liveThrees, sleepThrees, liveTwos,
            doubleFours, fourThree, doubleThrees, doubleSleepThrees,
            totalFours
        };
    }

    // ========== 冲四防守点查找 ==========

    /**
     * 查找冲四的唯一防守点
     * 冲四（含跳四）只有一个必须堵的位置
     *
     * @param {Array} board - 棋盘
     * @param {number} row - 冲四棋子的行
     * @param {number} col - 冲四棋子的列
     * @param {number} piece - 棋子颜色（攻击方）
     * @param {number} size - 棋盘大小
     * @returns {Object|null} { row, col } 或 null
     */
    function findRushFourBlock(board, row, col, piece, size) {
        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);

            // 连续四子，一端开放 → 堵开放端
            if (info.count === 4 && info.openEnds === 1) {
                // 正向找开放端
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r += dr; c += dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    return { row: r, col: c };
                }
                // 反向找开放端
                r = row - dr; c = col - dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r -= dr; c -= dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    return { row: r, col: c };
                }
            }

            // 跳四：三子+空+一子 → 堵中间空位
            if (info.count === 3 && info.openEnds >= 1 && info.jumps >= 1 && info.totalReach >= 4) {
                // 正向找跳子空位
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r += dr; c += dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    // 检查跳过去是否还有己方棋子
                    let jr = r + dr, jc = c + dc;
                    if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                        return { row: r, col: c };
                    }
                }
                // 反向找跳子空位
                r = row - dr; c = col - dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r -= dr; c -= dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    let jr = r - dr, jc = c - dc;
                    if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                        return { row: r, col: c };
                    }
                }
            }
        }
        return null;
    }

    /**
     * 查找冲四的所有防守点（用于更精确的防守分析）
     * 通常冲四只有一个防守点，但某些跳四可能有多个
     *
     * @param {Array} board - 棋盘
     * @param {number} row - 冲四棋子的行
     * @param {number} col - 冲四棋子的列
     * @param {number} piece - 棋子颜色（攻击方）
     * @param {number} size - 棋盘大小
     * @returns {Array<{row: number, col: number}>}
     */
    function findAllRushFourBlocks(board, row, col, piece, size) {
        const blocks = [];
        const seen = new Set();

        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);

            if (info.count === 4 && info.openEnds === 1) {
                // 连续四子，找开放端
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r += dr; c += dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    const key = r * size + c;
                    if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                }
                r = row - dr; c = col - dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r -= dr; c -= dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    const key = r * size + c;
                    if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                }
            }

            // 跳四：堵中间空位
            if (info.count === 3 && info.openEnds >= 1 && info.jumps >= 1 && info.totalReach >= 4) {
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r += dr; c += dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    let jr = r + dr, jc = c + dc;
                    if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                        const key = r * size + c;
                        if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                    }
                }
                r = row - dr; c = col - dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r -= dr; c -= dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    let jr = r - dr, jc = c - dc;
                    if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                        const key = r * size + c;
                        if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                    }
                }
            }
        }
        return blocks;
    }

    // ========== 活三防守点查找 ==========

    /**
     * 查找活三的所有防守点
     * 活三两端开放，防守方可以在多个位置堵截
     *
     * @param {Array} board - 棋盘
     * @param {number} row - 活三棋子的行
     * @param {number} col - 活三棋子的列
     * @param {number} piece - 棋子颜色（攻击方）
     * @param {number} size - 棋盘大小
     * @returns {Array<{row: number, col: number}>}
     */
    function findAllLiveThreeBlocks(board, row, col, piece, size) {
        const blocks = [];
        const seen = new Set();

        for (const [dr, dc] of DIRECTIONS) {
            const info = analyzeDirFull(board, row, col, dr, dc, piece, size);

            // 连续三子，两端开放
            if (info.count === 3 && info.openEnds === 2) {
                // 正向端点
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r += dr; c += dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    const key = r * size + c;
                    if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                }
                // 反向端点
                r = row - dr; c = col - dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r -= dr; c -= dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    const key = r * size + c;
                    if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                }
            }

            // 跳活三：二子+空+一子，两端开放
            if (info.count === 2 && info.openEnds === 2 && info.jumps >= 1 && info.totalReach >= 3) {
                // 找跳子空位（堵中间）
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r += dr; c += dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    let jr = r + dr, jc = c + dc;
                    if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                        const key = r * size + c;
                        if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                    }
                }
                r = row - dr; c = col - dc;
                while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === piece) {
                    r -= dr; c -= dc;
                }
                if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === EMPTY) {
                    let jr = r - dr, jc = c - dc;
                    if (jr >= 0 && jr < size && jc >= 0 && jc < size && board[jr][jc] === piece) {
                        const key = r * size + c;
                        if (!seen.has(key)) { seen.add(key); blocks.push({ row: r, col: c }); }
                    }
                }
            }
        }
        return blocks;
    }

    // ========== 冲四走法生成 ==========

    /**
     * 生成所有能形成冲四的走法
     * 冲四 = 四子连线且仅一端开放（防守方必须堵）
     *
     * @param {Array} board - 棋盘
     * @param {number} piece - 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Array<{row: number, col: number, threatLevel: number}>}
     */
    function findRushFourMoves(board, piece, size) {
        const candidates = getCandidates(board, size, 2);
        const moves = [];

        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const threats = countThreats(board, row, col, piece, size);

            // 冲四（不含活四，活四是更高优先级）
            if (threats.rushFours > 0 && threats.liveFours === 0 && threats.fives === 0) {
                // 威胁等级：冲四越多越好，同时有活三更佳
                let level = threats.rushFours * 10;
                if (threats.liveThrees > 0) level += threats.liveThrees * 5;
                if (threats.fourThree) level += 50;
                if (threats.doubleFours) level += 100;
                moves.push({ row, col, threatLevel: level });
            }

            board[row][col] = EMPTY;
        }

        // 按威胁等级降序排列（优先尝试强威胁）
        moves.sort((a, b) => b.threatLevel - a.threatLevel);
        return moves;
    }

    // ========== 活三走法生成 ==========

    /**
     * 生成所有能形成活三的走法
     * 活三 = 三子连线且两端开放（可发展为活四）
     *
     * @param {Array} board - 棋盘
     * @param {number} piece - 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Array<{row: number, col: number, threatLevel: number}>}
     */
    function findLiveThreeMoves(board, piece, size) {
        const candidates = getCandidates(board, size, 2);
        const moves = [];

        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const threats = countThreats(board, row, col, piece, size);

            // 活三（不含冲四和五连，那些是更高优先级）
            if (threats.liveThrees > 0 && threats.rushFours === 0 &&
                threats.liveFours === 0 && threats.fives === 0) {
                let level = threats.liveThrees * 5;
                if (threats.sleepThrees > 0) level += threats.sleepThrees * 2;
                if (threats.liveTwos > 0) level += threats.liveTwos;
                moves.push({ row, col, threatLevel: level });
            }

            board[row][col] = EMPTY;
        }

        // 按威胁等级降序排列
        moves.sort((a, b) => b.threatLevel - a.threatLevel);
        return moves;
    }

    // ========== 对手反威胁检测 ==========

    /**
     * 检测对手是否有必胜威胁（五连或活四）
     * 用于 VCT 中判断防守方堵完后是否有反杀
     *
     * @param {Array} board - 棋盘
     * @param {number} opp - 对手棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {boolean} 对手是否有必胜威胁
     */
    function opponentHasWinThreat(board, opp, size) {
        const candidates = getCandidates(board, size, 2);
        for (const { row, col } of candidates) {
            board[row][col] = opp;
            if (checkWin(board, row, col, opp, size)) {
                board[row][col] = EMPTY;
                return true;
            }
            // 检查是否形成活四
            const threats = countThreats(board, row, col, opp, size);
            board[row][col] = EMPTY;
            if (threats.liveFours > 0 || threats.fives > 0) return true;
        }
        return false;
    }

    /**
     * 检测对手是否有冲四威胁（用于判断防守方是否能反先）
     * @param {Array} board - 棋盘
     * @param {number} opp - 对手棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Array<{row: number, col: number}>} 对手的冲四走法
     */
    function findOpponentRushFours(board, opp, size) {
        const candidates = getCandidates(board, size, 2);
        const moves = [];

        for (const { row, col } of candidates) {
            board[row][col] = opp;
            if (checkWin(board, row, col, opp, size)) {
                board[row][col] = EMPTY;
                return [{ row, col }]; // 能直接赢，最高优先级
            }
            const threats = countThreats(board, row, col, opp, size);
            board[row][col] = EMPTY;
            if (threats.rushFours > 0 || threats.liveFours > 0) {
                moves.push({ row, col });
            }
        }
        return moves;
    }

    // ========== VCF 算法（连续冲四取胜） ==========

    /**
     * VCF 递归搜索核心
     *
     * VCF 的核心思想：
     *   攻击方每一步都只走冲四，防守方被迫在唯一位置堵截。
     *   由于冲四防守点唯一，搜索分支因子为1，效率极高。
     *   当攻击方形成双冲四或冲四活三时，防守方无法同时堵住，攻击方获胜。
     *
     * @param {Array} board - 棋盘
     * @param {number} piece - 攻击方棋子颜色
     * @param {number} size - 棋盘大小
     * @param {number} depth - 剩余搜索深度
     * @param {Object} nodeCounter - 节点计数器 { count: number }
     * @returns {Array<{row: number, col: number}>|null} 攻击序列或 null
     */
    function vcfSearch(board, piece, size, depth, nodeCounter) {
        if (depth <= 0 || nodeCounter.count > MAX_VCF_NODES) return null;

        const opp = piece === BLACK ? WHITE : BLACK;

        // 优先检查：是否有直接五连的走法（最高优先级）
        const candidates = getCandidates(board, size, 2);
        for (const { row, col } of candidates) {
            board[row][col] = piece;
            if (checkWin(board, row, col, piece, size)) {
                board[row][col] = EMPTY;
                return [{ row, col }];
            }
            board[row][col] = EMPTY;
        }

        // 生成所有冲四走法
        const rushFourMoves = findRushFourMoves(board, piece, size);

        for (const move of rushFourMoves) {
            nodeCounter.count++;

            // 落子
            board[move.row][move.col] = piece;

            // 检查是否直接五连
            if (checkWin(board, move.row, move.col, piece, size)) {
                board[move.row][move.col] = EMPTY;
                return [{ row: move.row, col: move.col }];
            }

            // 统计威胁
            const threats = countThreats(board, move.row, move.col, piece, size);

            // 双冲四或冲四活三 → 不可阻挡，直接获胜
            if (threats.doubleFours || threats.fourThree || threats.liveFours > 0) {
                board[move.row][move.col] = EMPTY;
                return [{ row: move.row, col: move.col }];
            }

            // 有冲四 → 防守方必须堵
            if (threats.rushFours > 0) {
                // 找到防守点（冲四通常只有一个防守点）
                const blockPos = findRushFourBlock(board, move.row, move.col, piece, size);
                if (blockPos) {
                    // 防守方落子
                    board[blockPos.row][blockPos.col] = opp;

                    // 检查防守方堵完后是否自己形成了五连（反杀）
                    if (checkWin(board, blockPos.row, blockPos.col, opp, size)) {
                        // 防守方反杀，此路不通
                        board[blockPos.row][blockPos.col] = EMPTY;
                        board[move.row][move.col] = EMPTY;
                        continue;
                    }

                    // 递归搜索下一步攻击
                    const result = vcfSearch(board, piece, size, depth - 1, nodeCounter);

                    // 撤销防守
                    board[blockPos.row][blockPos.col] = EMPTY;

                    if (result) {
                        board[move.row][move.col] = EMPTY;
                        return [{ row: move.row, col: move.col }, ...result];
                    }
                }
            }

            // 撤销攻击
            board[move.row][move.col] = EMPTY;
        }

        return null;
    }

    /**
     * VCF 入口函数
     * @param {Array} board - 棋盘
     * @param {number} piece - 攻击方棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Object|null} { row, col, sequence } 或 null
     */
    function findVCF(board, piece, size) {
        if (!enabled) return null;

        const nodeCounter = { count: 0 };
        const sequence = vcfSearch(board, piece, size, VCF_MAX_DEPTH, nodeCounter);

        stats.vcfNodes += nodeCounter.count;
        if (sequence) {
            stats.vcfFound++;
            return {
                row: sequence[0].row,
                col: sequence[0].col,
                sequence: sequence
            };
        }
        return null;
    }

    // ========== VCT 算法（连续威胁取胜） ==========

    /**
     * VCT 递归搜索核心
     *
     * VCT 比 VCF 更通用：
     *   - 允许冲四（强威胁，防守点唯一）
     *   - 也允许活三（弱威胁，防守方可选择堵哪端）
     *   - 活三的每个防守点都必须验证，确保无论对手怎么堵都能赢
     *
     * 搜索策略：
     *   1. 优先尝试冲四走法（分支因子小，搜索快）
     *   2. 然后尝试活三走法（分支因子大，需全验证）
     *   3. 每步都要检查对手是否有反威胁
     *
     * @param {Array} board - 棋盘
     * @param {number} piece - 攻击方棋子颜色
     * @param {number} size - 棋盘大小
     * @param {number} depth - 剩余搜索深度
     * @param {Object} nodeCounter - 节点计数器
     * @returns {Array<{row: number, col: number}>|null} 攻击序列或 null
     */
    function vctSearch(board, piece, size, depth, nodeCounter) {
        if (depth <= 0 || nodeCounter.count > MAX_VCT_NODES) return null;

        const opp = piece === BLACK ? WHITE : BLACK;

        // 优先检查：是否有直接五连的走法
        const vctCandidates = getCandidates(board, size, 2);
        for (const { row, col } of vctCandidates) {
            board[row][col] = piece;
            if (checkWin(board, row, col, piece, size)) {
                board[row][col] = EMPTY;
                return [{ row, col }];
            }
            board[row][col] = EMPTY;
        }

        // ===== 优先级1：冲四走法（强威胁，防守点唯一） =====
        const rushFourMoves = findRushFourMoves(board, piece, size);

        for (const move of rushFourMoves) {
            nodeCounter.count++;

            board[move.row][move.col] = piece;

            // 直接五连
            if (checkWin(board, move.row, move.col, piece, size)) {
                board[move.row][move.col] = EMPTY;
                return [{ row: move.row, col: move.col }];
            }

            const threats = countThreats(board, move.row, move.col, piece, size);

            // 不可阻挡的组合威胁
            if (threats.doubleFours || threats.fourThree || threats.liveFours > 0) {
                board[move.row][move.col] = EMPTY;
                return [{ row: move.row, col: move.col }];
            }

            // 冲四 → 防守方必须堵
            if (threats.rushFours > 0) {
                const blockPos = findRushFourBlock(board, move.row, move.col, piece, size);
                if (blockPos) {
                    board[blockPos.row][blockPos.col] = opp;

                    // 检查防守方反杀
                    if (checkWin(board, blockPos.row, blockPos.col, opp, size)) {
                        board[blockPos.row][blockPos.col] = EMPTY;
                        board[move.row][move.col] = EMPTY;
                        continue;
                    }

                    // 检查防守方是否有反冲四（反先手）
                    const oppRushFours = findOpponentRushFours(board, opp, size);
                    if (oppRushFours.length > 0) {
                        // 对手有反威胁，需要进一步判断
                        // 简化处理：如果对手有冲四反威胁，跳过此路
                        // （更精确的做法是进入对手的VCF搜索，但会增加复杂度）
                        board[blockPos.row][blockPos.col] = EMPTY;
                        board[move.row][move.col] = EMPTY;
                        continue;
                    }

                    const result = vctSearch(board, piece, size, depth - 1, nodeCounter);
                    board[blockPos.row][blockPos.col] = EMPTY;

                    if (result) {
                        board[move.row][move.col] = EMPTY;
                        return [{ row: move.row, col: move.col }, ...result];
                    }
                }
            }

            board[move.row][move.col] = EMPTY;
        }

        // ===== 优先级2：活三走法（弱威胁，防守方可选） =====
        const liveThreeMoves = findLiveThreeMoves(board, piece, size);

        for (const move of liveThreeMoves) {
            nodeCounter.count++;

            board[move.row][move.col] = piece;

            // 检查是否同时形成了冲四（活三走法中不应包含，但双重检查）
            const threats = countThreats(board, move.row, move.col, piece, size);

            // 如果意外形成了更强威胁，按强威胁处理
            if (threats.rushFours > 0 || threats.liveFours > 0 || threats.fives > 0) {
                board[move.row][move.col] = EMPTY;
                continue; // 已在冲四阶段处理
            }

            // 找活三的所有防守点
            const blockPositions = findAllLiveThreeBlocks(board, move.row, move.col, piece, size);

            if (blockPositions.length === 0) {
                board[move.row][move.col] = EMPTY;
                continue;
            }

            // 关键：必须验证所有防守点都能赢
            let allBlocked = true;
            let bestResult = null;

            for (const block of blockPositions) {
                board[block.row][block.col] = opp;

                // 检查防守方反杀
                if (checkWin(board, block.row, block.col, opp, size)) {
                    board[block.row][block.col] = EMPTY;
                    allBlocked = false;
                    break;
                }

                // 检查防守方反威胁
                const oppRushFours = findOpponentRushFours(board, opp, size);
                if (oppRushFours.length > 0) {
                    board[block.row][block.col] = EMPTY;
                    allBlocked = false;
                    break;
                }

                const result = vctSearch(board, piece, size, depth - 1, nodeCounter);
                board[block.row][block.col] = EMPTY;

                if (!result) {
                    allBlocked = false;
                    break;
                }
                // 保存最长路径（用于展示）
                if (!bestResult || result.length > bestResult.length) {
                    bestResult = result;
                }
            }

            if (allBlocked && bestResult) {
                board[move.row][move.col] = EMPTY;
                return [{ row: move.row, col: move.col }, ...bestResult];
            }

            board[move.row][move.col] = EMPTY;
        }

        return null;
    }

    /**
     * VCT 入口函数
     * @param {Array} board - 棋盘
     * @param {number} piece - 攻击方棋子颜色
     * @param {number} size - 棋盘大小
     * @param {number} maxDepth - 最大搜索深度（可选，默认 VCT_MAX_DEPTH）
     * @returns {Object|null} { row, col, sequence } 或 null
     */
    function findVCT(board, piece, size, maxDepth) {
        if (!enabled) return null;

        const nodeCounter = { count: 0 };
        const depth = maxDepth || VCT_MAX_DEPTH;
        const sequence = vctSearch(board, piece, size, depth, nodeCounter);

        stats.vctNodes += nodeCounter.count;
        if (sequence) {
            stats.vctFound++;
            return {
                row: sequence[0].row,
                col: sequence[0].col,
                sequence: sequence
            };
        }
        return null;
    }

    // ========== TSS 算法（威胁空间搜索） ==========

    /**
     * 生成所有威胁走法（冲四、活三、眠三）
     * TSS 考虑更广泛的威胁类型
     *
     * @param {Array} board - 棋盘
     * @param {number} piece - 棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Array<{row: number, col: number, type: string, threatLevel: number}>}
     */
    function generateThreatMoves(board, piece, size) {
        const candidates = getCandidates(board, size, 2);
        const moves = [];

        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const threats = countThreats(board, row, col, piece, size);

            // 五连 → 最高优先级
            if (threats.fives > 0) {
                moves.push({ row, col, type: 'five', threatLevel: 1000 });
                board[row][col] = EMPTY;
                continue;
            }

            // 活四 → 必胜
            if (threats.liveFours > 0) {
                moves.push({ row, col, type: 'live_four', threatLevel: 500 });
                board[row][col] = EMPTY;
                continue;
            }

            // 双冲四 / 冲四活三 → 必胜
            if (threats.doubleFours || threats.fourThree) {
                moves.push({ row, col, type: 'double_threat', threatLevel: 400 });
                board[row][col] = EMPTY;
                continue;
            }

            // 冲四 → 强威胁（防守方必须应答）
            if (threats.rushFours > 0) {
                let level = 100 + threats.rushFours * 20;
                if (threats.liveThrees > 0) level += 30;
                moves.push({ row, col, type: 'rush_four', threatLevel: level });
                board[row][col] = EMPTY;
                continue;
            }

            // 活三 → 中等威胁（防守方应答但不唯一）
            if (threats.liveThrees > 0) {
                let level = 50 + threats.liveThrees * 10;
                if (threats.sleepThrees > 0) level += 5;
                moves.push({ row, col, type: 'live_three', threatLevel: level });
                board[row][col] = EMPTY;
                continue;
            }

            // 双眠三 → 弱威胁（有发展潜力）
            if (threats.doubleSleepThrees) {
                moves.push({ row, col, type: 'double_sleep_three', threatLevel: 20 });
                board[row][col] = EMPTY;
                continue;
            }

            // 眠三+活二 → 弱威胁
            if (threats.sleepThrees > 0 && threats.liveTwos > 0) {
                moves.push({ row, col, type: 'sleep_three_live_two', threatLevel: 10 });
                board[row][col] = EMPTY;
                continue;
            }

            board[row][col] = EMPTY;
        }

        // 按威胁等级降序排列
        moves.sort((a, b) => b.threatLevel - a.threatLevel);

        // 限制候选数量，防止搜索空间爆炸
        return moves.slice(0, 30);
    }

    /**
     * 判断威胁类型是否需要防守方必须应答
     * 冲四及以上 → 必须应答
     * 活三 → 应答但不唯一
     * 眠三及以下 → 可选应答
     *
     * @param {Object} threatMove - 威胁走法
     * @returns {boolean}
     */
    function isMustRespond(threatMove) {
        return threatMove.type === 'rush_four' ||
               threatMove.type === 'live_four' ||
               threatMove.type === 'double_threat' ||
               threatMove.type === 'five';
    }

    /**
     * 查找防守方对威胁的所有应答位置
     *
     * @param {Array} board - 棋盘
     * @param {number} row - 威胁棋子行
     * @param {number} col - 威胁棋子列
     * @param {number} piece - 攻击方颜色
     * @param {number} size - 棋盘大小
     * @param {string} type - 威胁类型
     * @returns {Array<{row: number, col: number}>}
     */
    function findDefenses(board, row, col, piece, size, type) {
        const defenses = [];
        const seen = new Set();

        // 五连和活四无法防守
        if (type === 'five' || type === 'live_four' || type === 'double_threat') {
            return defenses; // 空数组表示无法防守
        }

        // 冲四 → 找唯一防守点
        if (type === 'rush_four') {
            const blocks = findAllRushFourBlocks(board, row, col, piece, size);
            for (const b of blocks) {
                const key = b.row * size + b.col;
                if (!seen.has(key)) { seen.add(key); defenses.push(b); }
            }
        }

        // 活三 → 找所有防守点
        if (type === 'live_three') {
            const blocks = findAllLiveThreeBlocks(board, row, col, piece, size);
            for (const b of blocks) {
                const key = b.row * size + b.col;
                if (!seen.has(key)) { seen.add(key); defenses.push(b); }
            }
        }

        // 眠三类 → TODO: 眠三防守点与活三不同，当前使用活三防守点作为近似
        if (type === 'double_sleep_three' || type === 'sleep_three_live_two') {
            const blocks = findAllLiveThreeBlocks(board, row, col, piece, size);
            for (const b of blocks) {
                const key = b.row * size + b.col;
                if (!seen.has(key)) { seen.add(key); defenses.push(b); }
            }
            // 限制防守点数量
            if (defenses.length > 4) defenses.length = 4;
        }

        return defenses;
    }

    /**
     * TSS 递归搜索核心
     *
     * Threat Space Search 的核心思想：
     *   攻击方只走威胁棋，防守方只走应答棋。
     *   搜索空间被限制在"威胁-应答"的交替序列中。
     *   比全盘搜索高效得多，但比 VCF/VCT 更通用。
     *
     * @param {Array} board - 棋盘
     * @param {number} piece - 攻击方棋子颜色
     * @param {number} size - 棋盘大小
     * @param {number} depth - 剩余搜索深度
     * @param {Object} nodeCounter - 节点计数器
     * @returns {Array<{row: number, col: number}>|null} 攻击序列或 null
     */
    function tssSearch(board, piece, size, depth, nodeCounter) {
        if (depth <= 0 || nodeCounter.count > MAX_TSS_NODES) return null;

        const opp = piece === BLACK ? WHITE : BLACK;

        // 生成所有威胁走法
        const threatMoves = generateThreatMoves(board, piece, size);

        for (const move of threatMoves) {
            nodeCounter.count++;

            board[move.row][move.col] = piece;

            // 直接五连
            if (move.type === 'five') {
                board[move.row][move.col] = EMPTY;
                return [{ row: move.row, col: move.col }];
            }

            // 不可阻挡的威胁
            if (move.type === 'live_four' || move.type === 'double_threat') {
                board[move.row][move.col] = EMPTY;
                return [{ row: move.row, col: move.col }];
            }

            if (isMustRespond(move)) {
                // 强威胁：防守方必须应答
                const defenses = findDefenses(board, move.row, move.col, piece, size, move.type);

                if (defenses.length === 0) {
                    // 无法防守 → 攻击方获胜
                    board[move.row][move.col] = EMPTY;
                    return [{ row: move.row, col: move.col }];
                }

                // 冲四通常只有一个防守点，活三可能有多个
                let allDefensesLeadToWin = true;
                let bestResult = null;

                for (const defense of defenses) {
                    board[defense.row][defense.col] = opp;

                    // 检查防守方反杀
                    if (checkWin(board, defense.row, defense.col, opp, size)) {
                        board[defense.row][defense.col] = EMPTY;
                        allDefensesLeadToWin = false;
                        break;
                    }

                    const result = tssSearch(board, piece, size, depth - 1, nodeCounter);
                    board[defense.row][defense.col] = EMPTY;

                    if (!result) {
                        allDefensesLeadToWin = false;
                        break;
                    }
                    if (!bestResult || result.length > bestResult.length) {
                        bestResult = result;
                    }
                }

                if (allDefensesLeadToWin && bestResult) {
                    board[move.row][move.col] = EMPTY;
                    return [{ row: move.row, col: move.col }, ...bestResult];
                }
            } else {
                // 弱威胁（活三、眠三等）：防守方可以选择不应答
                // 但如果不应答，攻击方可以继续发展

                // 策略：假设防守方会应答，验证所有应答点
                const defenses = findDefenses(board, move.row, move.col, piece, size, move.type);

                if (defenses.length === 0) {
                    // 无需防守的弱威胁，继续搜索
                    const result = tssSearch(board, piece, size, depth - 1, nodeCounter);
                    if (result) {
                        board[move.row][move.col] = EMPTY;
                        return [{ row: move.row, col: move.col }, ...result];
                    }
                } else {
                    // 验证所有防守点
                    let allDefensesLeadToWin = true;
                    let bestResult = null;

                    for (const defense of defenses) {
                        board[defense.row][defense.col] = opp;

                        if (checkWin(board, defense.row, defense.col, opp, size)) {
                            board[defense.row][defense.col] = EMPTY;
                            allDefensesLeadToWin = false;
                            break;
                        }

                        const result = tssSearch(board, piece, size, depth - 1, nodeCounter);
                        board[defense.row][defense.col] = EMPTY;

                        if (!result) {
                            allDefensesLeadToWin = false;
                            break;
                        }
                        if (!bestResult || result.length > bestResult.length) {
                            bestResult = result;
                        }
                    }

                    if (allDefensesLeadToWin && bestResult) {
                        board[move.row][move.col] = EMPTY;
                        return [{ row: move.row, col: move.col }, ...bestResult];
                    }
                }
            }

            board[move.row][move.col] = EMPTY;
        }

        return null;
    }

    /**
     * TSS 入口函数
     * @param {Array} board - 棋盘
     * @param {number} piece - 攻击方棋子颜色
     * @param {number} size - 棋盘大小
     * @param {number} maxDepth - 最大搜索深度（可选，默认 TSS_MAX_DEPTH）
     * @returns {Object|null} { row, col, sequence } 或 null
     */
    function findTSS(board, piece, size, maxDepth) {
        if (!enabled) return null;

        const nodeCounter = { count: 0 };
        const depth = maxDepth || TSS_MAX_DEPTH;
        const sequence = tssSearch(board, piece, size, depth, nodeCounter);

        stats.tssNodes += nodeCounter.count;
        if (sequence) {
            stats.tssFound++;
            return {
                row: sequence[0].row,
                col: sequence[0].col,
                sequence: sequence
            };
        }
        return null;
    }

    // ========== 威胁态势分析 ==========

    /**
     * 分析当前棋盘的威胁态势
     * 综合使用 VCF、VCT、TSS 三种搜索，返回最佳攻击序列
     *
     * 分析策略：
     *   1. 先检查 VCF（最快，如果存在则直接返回）
     *   2. 再检查 VCT（较慢但更通用）
     *   3. 最后检查 TSS（最慢但最全面）
     *   4. 如果都不存在，返回威胁统计信息
     *
     * @param {Array} board - 棋盘
     * @param {number} piece - 要分析的棋子颜色
     * @param {number} size - 棋盘大小
     * @returns {Object} { vcfExists, vctExists, tssExists, bestSequence, threatCount, details }
     */
    function analyzeThreats(board, piece, size) {
        if (!enabled) {
            return {
                vcfExists: false, vctExists: false, tssExists: false,
                bestSequence: null, threatCount: 0, details: '模块已禁用'
            };
        }

        const opp = piece === BLACK ? WHITE : BLACK;

        // 统计当前威胁
        let threatCount = 0;
        const candidates = getCandidates(board, size, 2);
        let rushFourCount = 0, liveThreeCount = 0, sleepThreeCount = 0;

        for (const { row, col } of candidates) {
            board[row][col] = piece;
            const threats = countThreats(board, row, col, piece, size);
            board[row][col] = EMPTY;

            if (threats.rushFours > 0) rushFourCount++;
            if (threats.liveThrees > 0) liveThreeCount++;
            if (threats.sleepThrees > 0) sleepThreeCount++;
        }

        threatCount = rushFourCount + liveThreeCount + sleepThreeCount;

        // 检查对手的威胁（判断是否需要防守优先）
        let oppThreatCount = 0;
        let oppRushFourCount = 0;
        for (const { row, col } of candidates) {
            board[row][col] = opp;
            const threats = countThreats(board, row, col, opp, size);
            board[row][col] = EMPTY;
            if (threats.rushFours > 0) oppRushFourCount++;
            if (threats.rushFours > 0 || threats.liveThrees > 0) oppThreatCount++;
        }

        // 优先级1：VCF 搜索（最快）
        const vcfResult = findVCF(board, piece, size);
        if (vcfResult) {
            return {
                vcfExists: true,
                vctExists: true, // VCF 存在则 VCT 必然存在
                tssExists: true,
                bestSequence: vcfResult,
                threatCount,
                rushFourCount,
                liveThreeCount,
                sleepThreeCount,
                oppThreatCount,
                oppRushFourCount,
                details: `VCF 取胜！序列长度: ${vcfResult.sequence.length}，冲四走法: ${rushFourCount}`
            };
        }

        // 优先级2：VCT 搜索
        const vctResult = findVCT(board, piece, size);
        if (vctResult) {
            return {
                vcfExists: false,
                vctExists: true,
                tssExists: true,
                bestSequence: vctResult,
                threatCount,
                rushFourCount,
                liveThreeCount,
                sleepThreeCount,
                oppThreatCount,
                oppRushFourCount,
                details: `VCT 取胜！序列长度: ${vctResult.sequence.length}，活三走法: ${liveThreeCount}`
            };
        }

        // 优先级3：TSS 搜索（仅在威胁较多时尝试，避免无意义的搜索）
        if (threatCount >= 3) {
            const tssResult = findTSS(board, piece, size);
            if (tssResult) {
                return {
                    vcfExists: false,
                    vctExists: false,
                    tssExists: true,
                    bestSequence: tssResult,
                    threatCount,
                    rushFourCount,
                    liveThreeCount,
                    sleepThreeCount,
                    oppThreatCount,
                    oppRushFourCount,
                    details: `TSS 取胜！序列长度: ${tssResult.sequence.length}`
                };
            }
        }

        // 无强制取胜序列，返回威胁统计
        return {
            vcfExists: false,
            vctExists: false,
            tssExists: false,
            bestSequence: null,
            threatCount,
            rushFourCount,
            liveThreeCount,
            sleepThreeCount,
            oppThreatCount,
            oppRushFourCount,
            details: `无强制取胜序列。己方威胁: ${threatCount}（冲四: ${rushFourCount}, 活三: ${liveThreeCount}），对手威胁: ${oppThreatCount}`
        };
    }

    // ========== 公开接口 ==========
    return {
        findVCF,            // (board, piece, size) => { row, col, sequence } | null
        findVCT,            // (board, piece, size, maxDepth?) => { row, col, sequence } | null
        findTSS,            // (board, piece, size, maxDepth?) => { row, col, sequence } | null
        analyzeThreats,     // (board, piece, size) => { vcfExists, vctExists, tssExists, bestSequence, threatCount, ... }
        isEnabled,          // () => boolean
        setEnabled,         // (val) => void
        getStats,           // () => { vcfNodes, vctNodes, tssNodes, vcfFound, vctFound, tssFound }
        resetStats          // () => void
    };
})();
