# 📖 API 参考文档

> AI 五子棋游戏模块 API 参考

---

## 📋 目录

1. [GomokuAI](#gomokuai) - AI 主控制器
2. [AIPattern](#aipattern) - 模式识别
3. [AIStrategy](#aistrategy) - 攻防策略
4. [AITactics](#aitactics) - 战术调配
5. [AIExtreme](#aiextreme) - 极限模式
6. [AIBattle](#aibattle) - AI 对决
7. [GomokuMemory](#gomokumemory) - 记忆系统
8. [RefinedRenderer](#refinedrenderer) - 精致渲染
9. [Game 模块](#game-模块) - 游戏核心

---

## 数据类型

### 棋盘数据类型

```javascript
// 棋盘表示
board = [
  [0, 0, 0, 0, 0, ...],  // row 0
  [0, 1, 0, 2, 0, ...],  // row 1
  [0, 0, 1, 0, 0, ...],  // row 2
  ...
];

// 棋子常量
const EMPTY = 0;   // 空位
const BLACK = 1;    // 黑棋
const WHITE = 2;    // 白棋

// 位置对象
position = { row: number, col: number }
```

### 棋型常量

```javascript
const PATTERNS = {
  FIVE: 10000000,        // 五连
  LIVE_FOUR: 1000000,    // 活四
  RUSH_FOUR: 500000,     // 冲四
  LIVE_THREE: 15000,     // 活三
  SLEEP_THREE: 1000,     // 眠三
  LIVE_TWO: 350,         // 活二
  SLEEP_TWO: 20,         // 眠二
  LIVE_ONE: 1             // 活一
};
```

---

## GomokuAI

AI 主控制器，协调所有 AI 模块。

### 初始化

```javascript
GomokuAI.init();
```

初始化 AI 系统。自动在页面加载时调用。

### 设置难度

```javascript
GomokuAI.setDifficulty(level);
```

**参数：**
- `level` (number): 难度等级 (1-3)
  - 1: 简单
  - 2: 中等
  - 3: 困难

**示例：**
```javascript
GomokuAI.setDifficulty(2);  // 设置为中等难度
```

### 设置 AI 棋子

```javascript
GomokuAI.setAIPiece(piece);
```

**参数：**
- `piece` (number): 棋子颜色 (1=黑, 2=白)

**示例：**
```javascript
GomokuAI.setAIPiece(1);  // AI 使用黑棋
```

### 获取最佳落子

```javascript
GomokuAI.getBestMove(board);
```

**参数：**
- `board` (Array): 棋盘二维数组

**返回：**
- `{ row: number, col: number }`: 最佳位置

**示例：**
```javascript
const board = createEmptyBoard(15);
const move = GomokuAI.getBestMove(board);
console.log(`AI 建议落在 (${move.row}, ${move.col})`);
```

### 检查获胜

```javascript
GomokuAI.checkWin(board, row, col, piece, size);
```

**参数：**
- `board` (Array): 棋盘数组
- `row` (number): 最后落子行
- `col` (number): 最后落子列
- `piece` (number): 棋子颜色
- `size` (number): 棋盘大小

**返回：**
- `boolean`: 是否获胜

### 获取获胜连线

```javascript
GomokuAI.getWinLine(board, row, col, piece, size);
```

**参数：**
- 同 `checkWin`

**返回：**
- `Array<{ row, col }>`: 获胜连线的所有位置

### 评分函数

```javascript
GomokuAI.evaluateBoard(board, piece, size);
```

**参数：**
- `board` (Array): 棋盘数组
- `piece` (number): 评估方棋子
- `size` (number): 棋盘大小

**返回：**
- `number`: 评分值

### 获取思考状态

```javascript
GomokuAI.isThinking();
```

**返回：**
- `boolean`: AI 是否正在思考

### 中断思考

```javascript
GomokuAI.abort();
```

中断正在进行的 AI 思考。

---

## AIPattern

模式识别模块，检测棋盘上的威胁和机会。

### 获取建议

```javascript
AIPattern.getSuggestion(board, piece, size);
```

**参数：**
- `board` (Array): 棋盘数组
- `piece` (number): AI 棋子
- `size` (number): 棋盘大小

**返回：**
- `{ row, col, score }`: 最佳位置及评分

### 检测威胁

```javascript
AIPattern.detectThreats(board, piece, size);
```

**参数：**
- 同上

**返回：**
- `Array<ThreatInfo>`: 威胁列表

```javascript
ThreatInfo = {
  type: 'FIVE' | 'LIVE_FOUR' | 'RUSH_FOUR' | 'LIVE_THREE',
  positions: [{ row, col }],
  urgency: 'critical' | 'high' | 'medium'
};
```

### 检测紧急移动

```javascript
AIPattern.detectUrgentMoves(board, piece, size);
```

**返回：**
- `Array<{ row, col, urgency }>`: 紧急移动列表

---

## AIStrategy

攻防策略模块，评估攻势和防守。

### 获取攻击评分

```javascript
AIStrategy.getAttackScore(board, piece, size);
```

**参数：**
- 同上

**返回：**
- `number`: 攻击评分

### 获取防守评分

```javascript
AIStrategy.getDefenseScore(board, piece, size);
```

**返回：**
- `number`: 防守评分

### 预测对手

```javascript
AIStrategy.predictOpponent(board, piece, size);
```

**返回：**
- `{ row, col }`: 预测对手会落子的位置

---

## AITactics

战术调配模块，根据游戏阶段动态调整策略。

### 获取战术建议

```javascript
AITactics.getTacticsScore(board, piece, size);
```

**返回：**
- `number`: 战术评分

### 获取游戏阶段

```javascript
AITactics.getGamePhase(board, size);
```

**返回：**
- `string`: 'opening' | 'early' | 'mid' | 'late' | 'endgame'

### 获取权重配置

```javascript
AITactics.getWeights(phase);
```

**参数：**
- `phase` (string): 游戏阶段

**返回：**
- `{ attack, defense, pattern, tactics }`: 权重配置

---

## AIExtreme

极限模式 AI，使用深度搜索和多 AI 协作。

### 检查是否启用

```javascript
AIExtreme.isEnabled();
```

**返回：**
- `boolean`: 是否启用极限模式

### 获取最佳移动

```javascript
AIExtreme.getBestMove(board, piece, size);
```

**参数：**
- `board` (Array): 棋盘数组
- `piece` (number): AI 棋子
- `size` (number): 棋盘大小

**返回：**
- `{ row, col }`: 最佳位置

### 获取多个建议

```javascript
AIExtreme.getMultipleMoves(board, piece, size, count);
```

**参数：**
- `count` (number): 返回的建议数量

**返回：**
- `Array<{ row, col, score }>`: 多个建议

---

## AIBattle

AI 对决控制器，管理两个 AI 的对战。

### 开始对决

```javascript
AIBattle.start(game);
```

**参数：**
- `game` (Object): Game 模块实例

### 停止对决

```javascript
AIBattle.stop();
```

### 暂停对决

```javascript
AIBattle.pause();
```

### 继续对决

```javascript
AIBattle.resume();
```

### 切换暂停状态

```javascript
AIBattle.togglePause();
```

### 设置延迟

```javascript
AIBattle.setDelay(ms);
```

**参数：**
- `ms` (number): 每步之间的延迟（毫秒）

### 获取状态

```javascript
AIBattle.getStatus();
```

**返回：**
- `string`: 'running' | 'paused' | 'stopped'

### 获取当前回合

```javascript
AIBattle.getCurrentTurn();
```

**返回：**
- `number`: 当前回合数

---

## GomokuMemory

记忆系统，记录和分析历史对局。

### 初始化

```javascript
GomokuMemory.init();
```

初始化记忆系统。加载本地存储的历史数据。

### 记录对局

```javascript
GomokuMemory.record(result);
```

**参数：**
- `result` (Object): 对局结果

```javascript
result = {
  winner: 1 | 2 | null,      // 获胜方
  moves: number,              // 总步数
  aiDifficulty: number,       // AI 难度
  boardSize: number          // 棋盘大小
};
```

### 获取统计

```javascript
GomokuMemory.getStats();
```

**返回：**
- `Object`: 统计信息

```javascript
{
  total: number,          // 总对局数
  blackWins: number,      // 黑棋获胜
  whiteWins: number,      // 白棋获胜
  draws: number,          // 平局
  avgMoves: number        // 平均步数
}
```

### 获取历史

```javascript
GomokuMemory.getHistory(limit);
```

**参数：**
- `limit` (number): 返回的最大记录数

**返回：**
- `Array<Object>`: 历史记录列表

### 清除所有记忆

```javascript
GomokuMemory.clearAll();
```

### 获取记忆加成

```javascript
GomokuMemory.getBonus(row, col);
```

**返回：**
- `number`: 位置的记忆加成分数

---

## RefinedRenderer

精致渲染模块，提供 3D 效果的棋盘和棋子渲染。

### 检查是否激活

```javascript
RefinedRenderer.isActive();
```

**返回：**
- `boolean`: 是否处于精致模式

### 激活精致模式

```javascript
RefinedRenderer.activate();
```

### 绘制棋盘背景

```javascript
RefinedRenderer.drawBoardBackground(ctx, size, boardSize, padding, cellSize);
```

**参数：**
- `ctx` (CanvasRenderingContext2D): Canvas 上下文
- `size` (number): Canvas 尺寸
- `boardSize` (number): 棋盘大小
- `padding` (number): 内边距
- `cellSize` (number): 单元格大小

### 绘制棋子

```javascript
RefinedRenderer.drawPiece(ctx, row, col, piece, scale, padding, cellSize);
```

**参数：**
- `piece` (number): 棋子颜色 (1=黑, 2=白)
- `scale` (number): 缩放比例 (0-1)

### 绘制最后一手标记

```javascript
RefinedRenderer.drawLastMoveMark(ctx, row, col, padding, cellSize);
```

### 绘制获胜连线

```javascript
RefinedRenderer.drawWinLine(ctx, line, padding, cellSize);
```

**参数：**
- `line` (Array): 连线位置列表

---

## AIUtils

共享工具函数。

### 创建空棋盘

```javascript
AIUtils.createEmptyBoard(size);
```

**参数：**
- `size` (number): 棋盘大小

**返回：**
- `Array`: 初始化为 0 的二维数组

### 复制棋盘

```javascript
AIUtils.copyBoard(board);
```

**返回：**
- `Array`: 棋盘副本

### 获取有效位置

```javascript
AIUtils.getValidMoves(board, size);
```

**返回：**
- `Array<{ row, col }>`: 所有可落子的位置

### 计算曼哈顿距离

```javascript
AIUtils.manhattanDistance(pos1, pos2);
```

### 获取邻居位置

```javascript
AIUtils.getNeighbors(board, row, col, size, range);
```

**返回：**
- `Array<{ row, col }>`: 邻居位置列表

### 计数连续棋子

```javascript
AIUtils.countConsecutive(board, row, col, dRow, dCol, piece);
```

**参数：**
- `dRow`, `dCol`: 方向向量

**返回：**
- `number`: 连续棋子数量

### 提取棋型

```javascript
AIUtils.extractPattern(board, row, col, dRow, dCol, piece);
```

**返回：**
- `string`: 棋型字符串 (如 "XXOXOO")

---

## Game 模块

游戏核心模块，管理游戏状态和用户交互。

### 获取游戏状态

```javascript
Game.getState();
```

**返回：**
- `Object`: 当前游戏状态

```javascript
{
  board: Array,
  currentPlayer: number,
  gameOver: boolean,
  moveHistory: Array,
  boardSize: number,
  difficulty: number
}
```

### 开始新游戏

```javascript
Game.newGame(size, difficulty);
```

**参数：**
- `size` (number): 棋盘大小 (13, 15, 19)
- `difficulty` (number): 难度等级 (1-3)

### 落子

```javascript
Game.placePiece(row, col);
```

**返回：**
- `boolean`: 是否成功落子

### 悔棋

```javascript
Game.undo();
```

### 切换精致模式

```javascript
Game.togglePerfMode();
```

### 切换主题

```javascript
Game.toggleTheme();
```

### 获取对局结果

```javascript
Game.getGameResult();
```

**返回：**
- `Object`: 对局结果

---

## 事件系统

### 可用事件

```javascript
// 落子事件
'piece-placed'   // { row, col, piece }

// 游戏结束事件
'game-over'      // { winner, winLine }

// AI 思考事件
'ai-thinking'    // { thinking: boolean }

// 悔棋事件
'undo'           // { movesLeft }

// 新游戏事件
'new-game'       // {}
```

### 订阅事件

```javascript
Game.on(event, callback);
```

### 取消订阅

```javascript
Game.off(event, callback);
```

### 发布事件

```javascript
Game.emit(event, data);
```

---

## 常量

### 棋盘大小

```javascript
const BOARD_SIZES = [13, 15, 19];
```

### 难度级别

```javascript
const DIFFICULTY = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3
};
```

### 难度配置

```javascript
const DIFFICULTY_CONFIG = {
  1: { depth: 2, candidates: 12 },
  2: { depth: 3, candidates: 16 },
  3: { depth: 3, candidates: 20 }
};
```

### 搜索限制

```javascript
const MAX_NODES = 300000;      // 最大搜索节点数
const MAX_MEMORY_RECORDS = 200; // 最大记忆记录数
```

---

## 使用示例

### 人机对战

```javascript
// 初始化
GomokuAI.init();
Game.newGame(15, 2);  // 15x15 棋盘，中等难度

// 监听落子
Game.on('piece-placed', (data) => {
  console.log(`落子: (${data.row}, ${data.col})`);
  console.log(`当前玩家: ${data.piece === 1 ? '黑' : '白'}`);
});

// 玩家落子
Game.placePiece(7, 7);

// AI 自动响应
const aiMove = GomokuAI.getBestMove(Game.getState().board);
Game.placePiece(aiMove.row, aiMove.col);
```

### AI 对决

```javascript
// 开始 AI 对决
const game = Game.newGame(15, 3);
AIBattle.start(game);
AIBattle.setDelay(500);  // 每步延迟 500ms

// 暂停/继续
AIBattle.togglePause();

// 停止对决
AIBattle.stop();
```

### 自定义 AI

```javascript
// 扩展 AIPattern
const originalGetSuggestion = AIPattern.getSuggestion;

AIPattern.getSuggestion = (board, piece, size) => {
  const result = originalGetSuggestion(board, piece, size);

  // 添加自定义逻辑
  if (shouldUseCustomLogic()) {
    return customLogic(board, piece, size);
  }

  return result;
};
```

---

## 📄 相关文档

- [架构文档](./ARCHITECTURE.md) - 系统架构详解
- [开发指南](./README.md) - 开发入门
- [贡献指南](../CONTRIBUTING.md) - 如何贡献代码

---

<p align="center">
  <strong>最后更新: 2026-05-07</strong>
</p>
