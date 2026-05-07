/**
 * AI 五子棋 - AI 对决模块 v4
 * ⚫ 和 ⚪ 都由 AI 控制，自动对弈，用户观战
 * 新增：自动连续对弈、记忆系统集成、对局计数、先手选择
 */

const AIBattle = (() => {
    const EMPTY = 0, BLACK = 1, WHITE = 2;

    let running = false;
    let paused = false;
    let speed = 500;           // 每手间隔（毫秒）
    let battleTimer = null;
    let moveCount = 0;
    let gameRef = null;        // 游戏实例引用
    let autoMode = false;      // 自动连续对弈
    let autoTimer = null;      // 自动下一局定时器
    let totalGames = 0;        // 总对局数
    let sessionBlackWins = 0;  // 本轮黑棋胜
    let sessionWhiteWins = 0;  // 本轮白棋胜
    let sessionDraws = 0;      // 本轮平局
    let battleFirstPiece = BLACK; // AI 对决先手

    function setBattleFirstPiece(piece) { battleFirstPiece = piece; }
    function getBattleFirstPiece() { return battleFirstPiece; }

    /**
     * 开始 AI 对决
     * @param {Object} game - 游戏实例引用
     */
    function start(game) {
        if (running) stop();
        running = true;
        paused = false;
        moveCount = 0;
        gameRef = game;

        // 禁用玩家交互
        game.setPlayerControl(false);

        // 通知游戏设置先手
        if (typeof game.setBattleFirst === 'function') game.setBattleFirst(battleFirstPiece);

        // 开始对弈循环
        battleStep(game);
    }

    /**
     * 停止 AI 对决
     */
    function stop() {
        running = false;
        paused = false;
        gameRef = null;
        if (battleTimer) {
            clearTimeout(battleTimer);
            battleTimer = null;
        }
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
    }

    /**
     * 暂停 AI 对决
     */
    function pause() {
        if (!running || paused) return;
        paused = true;
        if (battleTimer) {
            clearTimeout(battleTimer);
            battleTimer = null;
        }
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
    }

    /**
     * 恢复 AI 对决
     */
    function resume() {
        if (!running || !paused) return;
        paused = false;
        if (gameRef && !gameRef.isGameOver()) {
            battleStep(gameRef);
        }
    }

    /**
     * 切换暂停/恢复
     * @returns {boolean} 当前是否暂停
     */
    function togglePause() {
        if (paused) { resume(); return false; }
        else { pause(); return true; }
    }

    /**
     * 是否正在运行
     */
    function isRunning() {
        return running;
    }

    /**
     * 是否暂停中
     */
    function isPaused() {
        return paused;
    }

    /**
     * 设置速度
     */
    function setSpeed(ms) {
        speed = ms;
    }

    /**
     * 设置自动连续对弈
     */
    function setAutoMode(enabled) {
        autoMode = enabled;
    }

    /**
     * 是否自动模式
     */
    function isAutoMode() {
        return autoMode;
    }

    /**
     * 获取本局统计
     */
    function getSessionStats() {
        return {
            totalGames,
            blackWins: sessionBlackWins,
            whiteWins: sessionWhiteWins,
            draws: sessionDraws
        };
    }

    /**
     * 重置本局统计
     */
    function resetSessionStats() {
        totalGames = 0;
        sessionBlackWins = 0;
        sessionWhiteWins = 0;
        sessionDraws = 0;
    }

    /**
     * 单步执行
     */
    function battleStep(game) {
        if (!running || paused || game.isGameOver()) {
            if (game.isGameOver()) {
                running = false;
                onGameEnd(game);
            }
            return;
        }

        game.aiAutoMove(() => {
            moveCount++;
            if (game.isGameOver()) {
                running = false;
                onGameEnd(game);
                return;
            }
            battleTimer = setTimeout(() => battleStep(game), speed);
        });
    }

    /**
     * 对局结束处理
     */
    function onGameEnd(game) {
        totalGames++;

        // 记录到记忆系统
        const result = game.getGameResult ? game.getGameResult() : null;
        if (result && typeof GomokuMemory !== 'undefined') {
            GomokuMemory.record(result);
        }

        // 自动连续对弈
        if (autoMode && !paused) {
            const delay = Math.max(1500, speed * 3); // 至少 1.5 秒间隔
            autoTimer = setTimeout(() => {
                if (paused || !autoMode) return;
                // 通知游戏重新开始
                if (gameRef && typeof gameRef.autoRestart === 'function') {
                    gameRef.autoRestart();
                }
            }, delay);
        }
    }

    return {
        start, stop, pause, resume, togglePause,
        isRunning, isPaused, setSpeed, getSpeed: () => speed,
        setAutoMode, isAutoMode,
        getSessionStats, resetSessionStats,
        setBattleFirstPiece, getBattleFirstPiece
    };
})();
