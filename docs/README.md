# 📚 开发文档

> AI 五子棋游戏开发指南

---

## 📋 目录

1. [项目概述](#项目概述)
2. [开发环境](#开发环境)
3. [代码规范](#代码规范)
4. [模块说明](#模块说明)
5. [API 参考](#api-参考)
6. [测试指南](#测试指南)
7. [部署说明](#部署说明)

---

## 项目概述

AI 五子棋是一个纯前端项目，无需构建工具即可运行。项目采用模块化架构，将不同的功能分离到独立的 JavaScript 文件中。

### 技术栈
- **HTML5** - 页面结构
- **CSS3** - 样式和动画
- **Canvas API** - 棋盘渲染
- **Web Audio API** - 音效系统
- **LocalStorage** - 数据持久化

---

## 开发环境

### 环境要求
- Node.js >= 14.0（可选，用于本地服务器）
- 现代浏览器（Chrome 80+, Firefox 75+, Safari 13+, Edge 80+）

### 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/gomoku-ai.git
cd gomoku-ai

# 2. 启动本地服务器
npx serve .

# 3. 访问 http://localhost:3000
```

### 使用 Python（无需 Node.js）

```bash
# Python 3
python -m http.server 8000

# 访问 http://localhost:8000
```

---

## 代码规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量 | 驼峰命名 | `boardSize`, `currentPlayer` |
| 常量 | 全大写下划线 | `MAX_NODES`, `EMPTY` |
| 函数 | 驼峰命名 | `getBestMove()`, `checkWin()` |
| 类/模块 | PascalCase | `GomokuAI`, `RefinedRenderer` |
| 私有变量 | 下划线前缀 | `_memBonusCache` |

### 模块模式

所有模块使用 IIFE（立即调用函数表达式）封装：

```javascript
const MyModule = (() => {
    'use strict';

    // 私有变量
    let privateVar = 0;

    // 私有函数
    function privateFunction() {
        return privateVar;
    }

    // 公开 API
    return {
        publicMethod: () => privateFunction()
    };
})();
```

### 注释规范

使用 JSDoc 风格注释：

```javascript
/**
 * 获取最佳落子位置
 * @param {Array} board - 棋盘二维数组
 * @param {number} piece - 当前棋子颜色 (1=黑, 2=白)
 * @returns {Object} 最佳位置 {row, col}
 */
function getBestMove(board, piece) {
    // ...
}
```

### 严格模式

所有模块必须在文件开头启用严格模式：

```javascript
(() => {
    'use strict';
    // 模块代码
})();
```

---

## 模块说明

### AI 模块 (src/ai/)

| 文件 | 功能 | 依赖 |
|------|------|------|
| `ai.js` | 主控制器，协调各 AI 模块 | 所有其他 AI 模块 |
| `ai-utils.js` | 共享工具函数 | 无 |
| `ai-pattern.js` | 棋盘模式识别 | ai-utils.js |
| `ai-strategy.js` | 攻防策略分析 | ai-utils.js |
| `ai-tactics.js` | 实时战术调配 | ai-utils.js |
| `ai-extreme.js` | 极限模式 AI | ai-utils.js, memory.js |
| `ai-battle.js` | AI 对决控制器 | ai.js |

### 核心模块 (src/core/)

| 文件 | 功能 |
|------|------|
| `game.js` | 游戏主逻辑，事件处理，UI 交互 |

### UI 模块 (src/ui/)

| 文件 | 功能 |
|------|------|
| `refined-render.js` | 精致渲染模式（3D 棋子等） |
| `refined-ui.js` | UI 样式动态加载 |
| `island-animation.js` | 灵动岛动画系统 |
| `music-island.js` | 音乐播放器 |

### 工具模块 (src/utils/)

| 文件 | 功能 |
|------|------|
| `memory.js` | 对局记忆系统 |

### 样式文件 (src/styles/)

| 文件 | 功能 |
|------|------|
| `style.css` | 主样式 |
| `splash.css` | 启动画面样式 |
| `island-animation.css` | 灵动岛样式 |
| `refined-style.css` | 精致模式样式 |

---

## API 参考

### GomokuAI

```javascript
// 设置难度
GomokuAI.setDifficulty(level); // level: 1-3

// 设置 AI 棋子颜色
GomokuAI.setAIPiece(piece); // piece: 1(黑) 或 2(白)

// 获取最佳落子
GomokuAI.getBestMove(board); // 返回 {row, col}

// 检查获胜
GomokuAI.checkWin(board, row, col, piece, size);

// 获取获胜连线
GomokuAI.getWinLine(board, row, col, piece, size);
```

### GomokuMemory

```javascript
// 初始化
GomokuMemory.init();

// 记录对局
GomokuMemory.record(result);

// 获取统计
GomokuMemory.getStats();
// 返回 { total, blackWins, whiteWins, draws, avgMoves }

// 清除记忆
GomokuMemory.clearAll();
```

### AIBattle

```javascript
// 开始对决
AIBattle.start(gameRef);

// 停止对决
AIBattle.stop();

// 暂停/继续
AIBattle.togglePause();

// 设置速度
AIBattle.setSpeed(ms);
```

### RefinedRenderer

```javascript
// 激活精致模式
RefinedRenderer.activate();

// 绘制棋盘背景
RefinedRenderer.drawBoardBackground(ctx, size, boardSize, padding, cellSize);

// 绘制棋子
RefinedRenderer.drawPiece(ctx, row, col, piece, scale, padding, cellSize);
```

---

## 测试指南

### 手动测试清单

- [ ] 游戏开始/重新开始
- [ ] 落子交互
- [ ] 悔棋功能
- [ ] 主题切换
- [ ] 难度切换
- [ ] AI 对决模式
- [ ] 精致渲染模式
- [ ] 移动端适配
- [ ] 音效播放

### AI 测试

1. **基本功能测试**
   - AI 能否正确识别获胜
   - AI 能否正确防守

2. **难度测试**
   - 简单模式：AI 应该经常失误
   - 困难模式：AI 应该几乎不失误

3. **极限模式测试**
   - 6 个 AI 同时运算
   - 确认 UI 不冻结

---

## 部署说明

### 静态部署

项目可部署到任何静态文件服务器：

- GitHub Pages
- Vercel
- Netlify
- 阿里云 OSS
- 腾讯云 COS

### 部署配置

无需特殊配置，直接上传所有文件即可。

---

## 常见问题

### Q: 为什么 AI 思考时间很长？
A: 检查是否开启了极限模式，该模式会进行深度搜索。

### Q: 精致模式无法启用？
A: 确保 `refined-style.css` 文件存在且可访问。

### Q: 记忆数据丢失？
A: 检查浏览器是否支持 localStorage，且未使用隐私模式。

---

## 更新日志

### v1.0.0
- 初始版本
- 支持人机对战和 AI 对决
- 精致渲染模式
- 记忆系统
