/**
 * AI 五子棋 - AI 配置管理器 v2
 * 难度级别和算法配置
 */

const AIConfig = (() => {
    'use strict';

    // 棋子常量
    const EMPTY = 0, BLACK = 1, WHITE = 2;

    // AI 算法类型
    const ALGORITHM = {
        MINIMAX: 'minimax',      // 传统 Minimax
        NEGAMAX: 'negamax',      // NegaMax (优化版)
        MCTS: 'mcts',            // 蒙特卡洛树搜索
        ENSEMBLE: 'ensemble'     // 多算法集成
    };

    // 难度级别定义
    const DIFFICULTY = {
        EASY: 1,           // 简单
        NORMAL: 2,         // 普通
        HARD: 3,          // 困难
        EXPERT: 4,        // 专家
        MASTER: 5         // 大师
    };

    // 难度配置详情
    const DIFFICULTY_CONFIG = {
        [DIFFICULTY.EASY]: {
            name: '简单',
            nameCn: '简单',
            description: '适合新手练习',
            depth: 2,
            candidates: 10,
            maxNodes: 50000,
            maxTime: 1500,
            algorithm: ALGORITHM.MINIMAX,
            usePattern: false,
            useStrategy: false,
            useTactics: true,
            useMemory: true,
            aggressive: 0.8,
            defensive: 1.0
        },
        [DIFFICULTY.NORMAL]: {
            name: '普通',
            nameCn: '普通',
            description: '一般玩家',
            depth: 3,
            candidates: 15,
            maxNodes: 150000,
            maxTime: 2500,
            algorithm: ALGORITHM.MINIMAX,
            usePattern: true,
            useStrategy: true,
            useTactics: true,
            useMemory: true,
            aggressive: 1.0,
            defensive: 1.0
        },
        [DIFFICULTY.HARD]: {
            name: '困难',
            nameCn: '困难',
            description: '具有挑战性',
            depth: 4,
            candidates: 20,
            maxNodes: 300000,
            maxTime: 4000,
            algorithm: ALGORITHM.NEGAMAX,
            usePattern: true,
            useStrategy: true,
            useTactics: true,
            useMemory: true,
            aggressive: 1.2,
            defensive: 1.1
        },
        [DIFFICULTY.EXPERT]: {
            name: '专家',
            nameCn: '专家',
            description: '高手级别',
            depth: 4,
            candidates: 25,
            maxNodes: 500000,
            maxTime: 5000,
            algorithm: ALGORITHM.ENSEMBLE,
            ensembleAlgorithms: [ALGORITHM.NEGAMAX, ALGORITHM.MCTS],
            usePattern: true,
            useStrategy: true,
            useTactics: true,
            useMemory: true,
            useVCT: true,
            aggressive: 1.3,
            defensive: 1.2
        },
        [DIFFICULTY.MASTER]: {
            name: '大师',
            nameCn: '大师',
            description: '接近顶级水平',
            depth: 5,
            candidates: 30,
            maxNodes: 800000,
            maxTime: 6000,
            algorithm: ALGORITHM.ENSEMBLE,
            ensembleAlgorithms: [ALGORITHM.NEGAMAX, ALGORITHM.MCTS, ALGORITHM.MINIMAX],
            usePattern: true,
            useStrategy: true,
            useTactics: true,
            useMemory: true,
            useVCT: true,
            useOpening: true,
            aggressive: 1.5,
            defensive: 1.3
        }
    };

    // 棋型评分（根据难度调整）
    const SCORES = {
        FIVE:           10000000,
        LIVE_FOUR:      1000000,
        RUSH_FOUR_LIVE: 500000,
        DOUBLE_FOUR:    200000,
        DOUBLE_THREE:   100000,
        LIVE_THREE:     15000,
        RUSH_FOUR:      8000,
        SLEEP_THREE:    1000,
        JUMP_LIVE_TWO:  500,
        LIVE_TWO:       350,
        BIG_JUMP_TWO:   200,
        SLEEP_TWO:      100,
        LIVE_ONE:       20
    };

    // VCT 配置
    const VCT_CONFIG = {
        [DIFFICULTY.EASY]: { enabled: false, maxDepth: 2, maxNodes: 5000 },
        [DIFFICULTY.NORMAL]: { enabled: true, maxDepth: 3, maxNodes: 15000 },
        [DIFFICULTY.HARD]: { enabled: true, maxDepth: 4, maxNodes: 30000 },
        [DIFFICULTY.EXPERT]: { enabled: true, maxDepth: 4, maxNodes: 50000 },
        [DIFFICULTY.MASTER]: { enabled: true, maxDepth: 5, maxNodes: 80000 }
    };

    // MCTS 配置
    const MCTS_CONFIG = {
        [DIFFICULTY.EASY]: { iterations: 10000, time: 500 },
        [DIFFICULTY.NORMAL]: { iterations: 20000, time: 1000 },
        [DIFFICULTY.HARD]: { iterations: 40000, time: 2000 },
        [DIFFICULTY.EXPERT]: { iterations: 60000, time: 3000 },
        [DIFFICULTY.MASTER]: { iterations: 100000, time: 4000 }
    };

    let currentDifficulty = DIFFICULTY.NORMAL;

    function setDifficulty(level) {
        if (DIFFICULTY_CONFIG[level]) {
            currentDifficulty = level;
            return true;
        }
        return false;
    }

    function getDifficulty() {
        return currentDifficulty;
    }

    function getConfig(difficulty = currentDifficulty) {
        return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG[DIFFICULTY.NORMAL];
    }

    function getVCTConfig(difficulty = currentDifficulty) {
        return VCT_CONFIG[difficulty] || VCT_CONFIG[DIFFICULTY.NORMAL];
    }

    function getMCTSConfig(difficulty = currentDifficulty) {
        return MCTS_CONFIG[difficulty] || MCTS_CONFIG[DIFFICULTY.NORMAL];
    }

    function getAllDifficulties() {
        return Object.entries(DIFFICULTY_CONFIG).map(([level, config]) => ({
            level: parseInt(level),
            name: config.name,
            nameCn: config.nameCn,
            description: config.description
        }));
    }

    function adjustScoreByDifficulty(score, difficulty = currentDifficulty) {
        const config = DIFFICULTY_CONFIG[difficulty];
        if (!config) return score;

        // 根据攻防倾向调整评分
        if (config.aggressive > 1.0) {
            // 更激进的 AI：提高进攻评分
            return score * config.aggressive;
        } else {
            // 更保守的 AI：提高防守评分
            return score * config.defensive;
        }
    }

    return {
        DIFFICULTY,
        ALGORITHM,
        DIFFICULTY_CONFIG,
        SCORES,
        VCT_CONFIG,
        MCTS_CONFIG,
        setDifficulty,
        getDifficulty,
        getConfig,
        getVCTConfig,
        getMCTSConfig,
        getAllDifficulties,
        adjustScoreByDifficulty
    };
})();
