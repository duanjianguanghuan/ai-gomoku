# � Contributing to AI 五子棋

感谢您对 AI 五子棋项目的兴趣！我们欢迎各种形式的贡献。

---

## 📋 贡献方式

### 🐛 报告问题
- 使用 [Issue Tracker](https://github.com/yourusername/gomoku-ai/issues)
- 描述具体问题或建议
- 提供复现步骤（如果是 bug）

### 💡 提出建议
- 打开 [Discussion](https://github.com/yourusername/gomoku-ai/discussions)
- 描述您的想法
- 讨论实现可行性

### 🔧 提交代码

#### 开发流程

1. **Fork 项目**
   ```bash
   git clone https://github.com/yourusername/gomoku-ai.git
   cd gomoku-ai
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

3. **进行开发**
   - 遵循代码规范
   - 添加必要的注释
   - 测试您的更改

4. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加新功能描述"
   ```

5. **推送到远程**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **创建 Pull Request**

---

## 📐 代码规范

### 命名规范
- 变量：`camelCase`（如 `boardSize`）
- 常量：`UPPER_SNAKE_CASE`（如 `MAX_NODES`）
- 函数：`camelCase`（如 `getBestMove()`）
- 模块/类：`PascalCase`（如 `GomokuAI`）

### 注释规范
```javascript
/**
 * 函数描述
 * @param {type} paramName - 参数描述
 * @returns {type} 返回值描述
 */
```

### 模块模式
```javascript
const MyModule = (() => {
    'use strict';

    // 私有变量
    let privateVar = 0;

    // 公开 API
    return {
        publicMethod: () => privateVar
    };
})();
```

---

## 🧪 测试要求

提交 PR 前，请确保：

- [ ] 新功能有基本的测试
- [ ] 现有功能未被破坏
- [ ] 代码符合规范
- [ ] 无语法错误

### 测试清单
- [ ] 游戏开始/重新开始
- [ ] 落子功能
- [ ] AI 对战
- [ ] 主题切换
- [ ] 响应式布局

---

## 📝 提交信息规范

使用语义化提交信息：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构（不是新功能或修复）
test: 测试相关
chore: 构建/工具相关
```

### 示例
```
feat: 添加极限模式 AI
fix: 修复悔棋后 AI 重复落子的问题
docs: 更新 README 添加截图
style: 格式化代码
refactor: 提取公共 AI 函数
```

---

## 🔍 代码审查

PR 提交后，维护者会进行审查：

1. 代码质量
2. 功能正确性
3. 测试覆盖
4. 文档更新

请耐心等待，保持友好沟通。

---

## 📜 许可证

通过贡献代码，您同意您的贡献遵循项目的 MIT 许可证。

---

## ❓ 需要帮助？

- 📖 查看 [开发文档](../docs/README.md)
- 💬 加入 [Discussions](https://github.com/yourusername/gomoku-ai/discussions)
- 🐛 报告 [Issues](https://github.com/yourusername/gomoku-ai/issues)

---

<p align="center">
  感谢您的贡献！ 🎉
</p>
