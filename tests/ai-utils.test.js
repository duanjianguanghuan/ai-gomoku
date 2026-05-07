/**
 * AI 工具函数测试
 * 测试 src/ai/ai-utils.js 中的核心功能
 */

describe('AIUtils', () => {
  let AIUtils;

  beforeAll(() => {
    // 加载 AIUtils 模块
    require('../src/ai/ai-utils.js');
    AIUtils = window.AIUtils;
  });

  describe('createEmptyBoard', () => {
    test('应该创建正确大小的空棋盘', () => {
      const board = AIUtils.createEmptyBoard(15);
      expect(board.length).toBe(15);
      expect(board[0].length).toBe(15);
    });

    test('空棋盘所有位置应该为空', () => {
      const board = AIUtils.createEmptyBoard(13);
      for (let i = 0; i < 13; i++) {
        for (let j = 0; j < 13; j++) {
          expect(board[i][j]).toBe(0);
        }
      }
    });
  });

  describe('copyBoard', () => {
    test('应该创建棋盘的深拷贝', () => {
      const original = AIUtils.createEmptyBoard(15);
      original[7][7] = 1;
      original[7][8] = 2;

      const copy = AIUtils.copyBoard(original);

      // 修改副本不应影响原棋盘
      copy[7][7] = 2;
      expect(original[7][7]).toBe(1);

      // 复制应该相等
      copy[7][7] = 1;
      expect(copy).toEqual(original);
    });
  });

  describe('getValidMoves', () => {
    test('空棋盘应返回中心位置作为有效移动', () => {
      const board = AIUtils.createEmptyBoard(15);
      const moves = AIUtils.getValidMoves(board, 15);

      // 初始应该返回中心点
      expect(moves.length).toBeGreaterThan(0);
    });

    test('有棋子的棋盘应排除已有位置', () => {
      const board = AIUtils.createEmptyBoard(15);
      board[7][7] = 1;
      board[7][8] = 2;

      const moves = AIUtils.getValidMoves(board, 15);

      // 不应包含已有棋子的位置
      const hasOccupied = moves.some(
        m => (m.row === 7 && m.col === 7) || (m.row === 7 && m.col === 8)
      );
      expect(hasOccupied).toBe(false);
    });

    test('填满的棋盘应返回空数组', () => {
      const board = AIUtils.createEmptyBoard(3);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          board[i][j] = 1;
        }
      }

      const moves = AIUtils.getValidMoves(board, 3);
      expect(moves.length).toBe(0);
    });
  });

  describe('isValidPosition', () => {
    test('边界内位置应该有效', () => {
      expect(AIUtils.isValidPosition(7, 7, 15)).toBe(true);
      expect(AIUtils.isValidPosition(0, 0, 15)).toBe(true);
      expect(AIUtils.isValidPosition(14, 14, 15)).toBe(true);
    });

    test('边界外位置应该无效', () => {
      expect(AIUtils.isValidPosition(-1, 7, 15)).toBe(false);
      expect(AIUtils.isValidPosition(7, 15, 15)).toBe(false);
      expect(AIUtils.isValidPosition(15, 15, 15)).toBe(false);
    });
  });

  describe('countConsecutive', () => {
    test('应该正确计数连续棋子', () => {
      const board = AIUtils.createEmptyBoard(15);
      // 创建水平方向的三个连续黑棋
      board[7][7] = 1;
      board[7][8] = 1;
      board[7][9] = 1;

      const count = AIUtils.countConsecutive(board, 7, 7, 0, 1, 1);
      expect(count).toBe(3);
    });

    test('遇到空位或边界应停止计数', () => {
      const board = AIUtils.createEmptyBoard(15);
      board[7][7] = 1;
      board[7][8] = 1;
      // 7,9 是空的
      board[7][10] = 1;

      const count = AIUtils.countConsecutive(board, 7, 7, 0, 1, 1);
      expect(count).toBe(2);
    });
  });

  describe('getNeighbors', () => {
    test('应该返回正确的邻居位置', () => {
      const board = AIUtils.createEmptyBoard(15);
      const neighbors = AIUtils.getNeighbors(board, 7, 7, 15, 1);

      // 3x3 范围内应该返回 8 个邻居（去掉中心点）
      expect(neighbors.length).toBe(8);
    });

    test('边角位置应返回较少的邻居', () => {
      const board = AIUtils.createEmptyBoard(15);

      // 左上角
      const topLeft = AIUtils.getNeighbors(board, 0, 0, 15, 1);
      expect(topLeft.length).toBe(3);

      // 顶部边缘中间
      const topEdge = AIUtils.getNeighbors(board, 0, 7, 15, 1);
      expect(topEdge.length).toBe(5);
    });
  });

  describe('manhattanDistance', () => {
    test('应该正确计算曼哈顿距离', () => {
      expect(AIUtils.manhattanDistance({ row: 0, col: 0 }, { row: 3, col: 4 })).toBe(7);
      expect(AIUtils.manhattanDistance({ row: 5, col: 5 }, { row: 5, col: 5 })).toBe(0);
      expect(AIUtils.manhattanDistance({ row: 1, col: 1 }, { row: 0, col: 0 })).toBe(2);
    });
  });

  describe('extractPattern', () => {
    test('应该正确提取棋型', () => {
      const board = AIUtils.createEmptyBoard(15);
      board[7][5] = 1;
      board[7][6] = 1;
      board[7][7] = 0; // 空位
      board[7][8] = 2;
      board[7][9] = 2;

      const pattern = AIUtils.extractPattern(board, 7, 6, 0, 1, 1);
      expect(pattern).toBe('XX_OO');
    });
  });
});
