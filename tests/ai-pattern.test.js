/**
 * 模式识别测试
 * 测试 src/ai/ai-pattern.js 中的威胁检测功能
 */

describe('AIPattern', () => {
  let AIPattern;
  let AIUtils;

  beforeAll(() => {
    // 加载依赖模块
    require('../src/ai/ai-utils.js');
    AIUtils = window.AIUtils;

    require('../src/ai/ai-pattern.js');
    AIPattern = window.AIPattern;
  });

  describe('getSuggestion', () => {
    test('应该返回有效位置', () => {
      const board = AIUtils.createEmptyBoard(15);
      const result = AIPattern.getSuggestion(board, 1, 15);

      expect(result).toHaveProperty('row');
      expect(result).toHaveProperty('col');
      expect(result.row).toBeGreaterThanOrEqual(0);
      expect(result.row).toBeLessThan(15);
    });

    test('应该优先选择中心区域', () => {
      const board = AIUtils.createEmptyBoard(15);
      const result = AIPattern.getSuggestion(board, 1, 15);

      // 中心区域 (6-8, 6-8) 应该有更高的优先级
      const isCenter = result.row >= 6 && result.row <= 8 &&
                       result.col >= 6 && result.col <= 8;
      expect(isCenter).toBe(true);
    });
  });

  describe('detectThreats', () => {
    test('应该检测到五连威胁', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 放置四连
      board[7][5] = 1;
      board[7][6] = 1;
      board[7][7] = 1;
      board[7][8] = 1;

      const threats = AIPattern.detectThreats(board, 1, 15);

      // 应该有威胁（对手的）
      expect(threats.length).toBeGreaterThan(0);
    });

    test('应该检测到活四威胁', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 活四：两边都有空间
      board[7][5] = 1;
      board[7][6] = 1;
      board[7][7] = 1;
      board[7][8] = 1;
      // 两边是空的

      const threats = AIPattern.detectThreats(board, 1, 15);
      const threatTypes = threats.map(t => t.type);

      expect(threatTypes).toContain('LIVE_FOUR');
    });

    test('应该检测到冲四威胁', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 冲四：一端被堵
      board[7][5] = 2; // 堵住一端
      board[7][6] = 1;
      board[7][7] = 1;
      board[7][8] = 1;
      board[7][9] = 1;

      const threats = AIPattern.detectThreats(board, 1, 15);
      const threatTypes = threats.map(t => t.type);

      // 应该检测到冲四
      expect(threatTypes.some(t => t === 'RUSH_FOUR' || t === 'LIVE_FOUR')).toBe(true);
    });

    test('应该检测到活三威胁', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 活三
      board[7][6] = 1;
      board[7][7] = 1;
      board[7][8] = 1;

      const threats = AIPattern.detectThreats(board, 1, 15);
      const threatTypes = threats.map(t => t.type);

      expect(threatTypes).toContain('LIVE_THREE');
    });
  });

  describe('detectUrgentMoves', () => {
    test('应该检测到紧急移动（必杀棋）', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 我方四连，必须落子获胜
      board[7][5] = 1;
      board[7][6] = 1;
      board[7][7] = 1;
      board[7][8] = 1;

      const urgentMoves = AIPattern.detectUrgentMoves(board, 1, 15);

      expect(urgentMoves.length).toBeGreaterThan(0);
      expect(urgentMoves[0].urgency).toBe('critical');
    });

    test('应该检测到防守紧急移动', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 对方四连，必须防守
      board[7][5] = 2;
      board[7][6] = 2;
      board[7][7] = 2;
      board[7][8] = 2;

      const urgentMoves = AIPattern.detectUrgentMoves(board, 1, 15);

      expect(urgentMoves.length).toBeGreaterThan(0);
      expect(urgentMoves[0].urgency).toBe('critical');
    });

    test('空棋盘不应有紧急移动', () => {
      const board = AIUtils.createEmptyBoard(15);
      const urgentMoves = AIPattern.detectUrgentMoves(board, 1, 15);

      expect(urgentMoves.length).toBe(0);
    });
  });

  describe('共识决策', () => {
    test('应该考虑多个维度的评分', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 创建一些棋子让决策更复杂
      board[7][7] = 1;
      board[7][8] = 1;
      board[8][7] = 2;

      const result = AIPattern.getSuggestion(board, 1, 15);

      expect(result).toHaveProperty('score');
      expect(typeof result.score).toBe('number');
    });
  });
});
