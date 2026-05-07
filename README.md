# 🎮 AI 五子棋

> 一款具有多个 AI 引擎的智能五子棋游戏，支持人机对战和 AI 对决

[English](./README_en.md) | 简体中文

---

## ✨ 功能特性

### 🎯 游戏模式
- **人机对战** - 与 AI 进行一对一的对决
- **AI 对决** - 观看两个 AI 互相博弈
- **难度选择** - 简单 / 中等 / 困难 三个难度级别
- **棋盘大小** - 支持 13×13、15×15、19×19 三种棋盘

### 🤖 AI 系统
- **多引擎协作** - 11 个专业 AI 模块协同工作
- **模式识别** - 智能识别棋盘模式和威胁
- **攻防策略** - 自动推测对手意图，动态调整策略
- **VCT/VCF** - 连续进攻和防守检测
- **记忆系统** - 从历史对局中学习优化

### 🎨 视觉效果
- **精致渲染模式** - 3D 立体棋子、木纹棋盘
- **主题切换** - 深色/浅色主题一键切换
- **灵动岛动画** - 音乐播放器的精美动画效果
- **流畅动画** - 落子动画、胜利动画、入场动画

### 📱 用户体验
- **响应式设计** - 完美适配桌面和移动设备
- **音效系统** - 丰富的音效反馈
- **触觉反馈** - 支持手机震动
- **快捷键支持** - Ctrl+Z 悔棋

---

## 🚀 快速开始

### 在线体验
直接在浏览器中打开 `index.html` 即可开始游戏

### 本地运行
```bash
# 克隆项目
git clone https://github.com/yourusername/gomoku-ai.git
cd gomoku-ai

# 使用任意 HTTP 服务器
python -m http.server 8000
# 或使用 npx
npx serve .

# 浏览器访问 http://localhost:8000
```

---

## 🏗️ 项目结构

```
gomoku-ai/
├── index.html              # 主页面
├── src/
│   ├── ai/                 # AI 模块
│   │   ├── ai.js          # AI 主模块
│   │   ├── ai-utils.js    # 工具函数
│   │   ├── ai-pattern.js  # 模式识别
│   │   ├── ai-strategy.js # 攻防策略
│   │   ├── ai-tactics.js  # 战术调配
│   │   ├── ai-extreme.js  # 极限模式
│   │   ├── ai-mcts.js     # MCTS 算法
│   │   ├── ai-vcf.js      # VCF 检测
│   │   ├── ai-search.js   # 搜索算法
│   │   ├── ai-opening.js  # 开局库
│   │   └── ai-battle.js   # AI 对决
│   ├── core/               # 核心逻辑
│   │   └── game.js        # 游戏主逻辑
│   ├── ui/                 # UI 模块
│   │   ├── refined-render.js   # 精致渲染
│   │   ├── refined-ui.js       # UI 管理
│   │   ├── island-animation.js # 灵动岛动画
│   │   └── music-island.js    # 音乐播放器
│   ├── utils/              # 工具函数
│   │   └── memory.js      # 记忆系统
│   └── styles/             # 样式文件
│       ├── style.css
│       ├── splash.css
│       ├── island-animation.css
│       └── refined-style.css
├── docs/                   # 开发文档
│   ├── README.md
│   └── ARCHITECTURE.md    # 架构文档
├── assets/                 # 静态资源（可选）
├── .gitignore
├── CONTRIBUTING.md
└── README.md
```

---

## 🎓 技术架构

### AI 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     GomokuAI (主控制器)                   │
└─────────────┬───────────────────────────────────────────┘
              │
    ┌─────────┼─────────┬──────────┬──────────┐
    ▼         ▼         ▼          ▼          ▼
┌────────┐┌─────────┐┌─────────┐┌─────────┐┌────────┐
│Pattern ││Strategy ││Tactics  ││Extreme  ││Memory  │
│模式识别 ││攻防策略 ││战术调配 ││极限模式 ││记忆系统 │
└───┬────┘└────┬────┘└────┬────┘└────┬────┘└───┬────┘
    │         │          │          │          │
    └─────────┴──────────┴──────────┴──────────┘
                          │
              ┌───────────┴───────────┐
              │    Consensus Engine    │
              │      (共识决策引擎)      │
              └───────────────────────┘
```

### 核心 AI 模块

| 模块 | 功能描述 |
|------|---------|
| `ai.js` | 主控制器，协调各 AI 模块 |
| `ai-pattern.js` | 模式识别，威胁预测 |
| `ai-strategy.js` | 攻防策略，攻势推演 |
| `ai-tactics.js` | 实时战术调配，权重动态调整 |
| `ai-extreme.js` | 极限模式，6 个 AI 同时运算 |
| `ai-utils.js` | 共享工具函数 |
| `memory.js` | 对局记忆，学习优化 |

---

## 🎮 游戏截图

> 截图待添加

---

## 🛠️ 开发指南

请查看 [开发文档](./docs/README.md) 了解详细的开发信息。

### 环境要求
- 现代浏览器（Chrome, Firefox, Safari, Edge）
- 无需构建工具，直接运行

### 代码规范
- 使用 IIFE 模式实现模块化
- 遵循 JSDoc 注释规范
- `'use strict'` 严格模式

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 了解详情

---

## 🙏 致谢

- 五子棋专业攻防策略参考
- 优质 UI/UX 设计灵感

---

## 📬 联系

如果您有任何问题或建议，欢迎：
- 提交 [Issue](https://github.com/yourusername/gomoku-ai/issues)
- 发送 Pull Request
- 联系维护者

---

<p align="center">
  <strong>Made with ❤️ for Gomoku lovers</strong>
</p>
