/**
 * Jest 测试设置文件
 * 加载所有源代码模块到全局变量
 */

// 模拟 localStorage
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    }
  };
})();

global.localStorage = localStorageMock;

// 加载源代码文件
const fs = require('fs');
const path = require('path');

// 动态加载所有 JavaScript 文件
function loadModules() {
  const srcDir = path.join(__dirname, '..', 'src');

  // 加载顺序很重要（依赖关系）
  const loadOrder = [
    'src/ai/ai-utils.js',
    'src/ai/ai-pattern.js',
    'src/ai/ai-strategy.js',
    'src/ai/ai-tactics.js',
  ];

  loadOrder.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');

      // 提取 IIFE 内容并在 vm 上下文中执行
      const iifeMatch = code.match(/\(\(\)\s*=>\s*\{([\s\S]*?)\}\)\(\s*\)|\(\s*function\s*\(\)\s*\{([\s\S]*?)\}\s*\(\s*\)/);

      if (iifeMatch) {
        const moduleCode = iifeMatch[0];
        try {
          eval(moduleCode);
        } catch (e) {
          console.warn(`Failed to load ${file}:`, e.message);
        }
      }
    }
  });
}

// 在每个测试文件运行前执行
beforeAll(() => {
  loadModules();
});

// 模拟 Canvas API
class MockCanvasRenderingContext2D {
  constructor() {
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.font = '';
    this.textAlign = '';
    this.textBaseline = '';
  }

  clearRect() {}
  fillRect() {}
  strokeRect() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  fill() {}
  stroke() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  rotate() {}
  drawImage() {}
  createLinearGradient() {
    return {
      addColorStop: () => {}
    };
  }
  createRadialGradient() {
    return {
      addColorStop: () => {}
    };
  }
  measureText() {
    return { width: 0 };
  }
  setLineDash() {}
  ellipse() {}
}

global.CanvasRenderingContext2D = MockCanvasRenderingContext2D;

// 模拟 console 方法以避免测试输出混乱
const originalConsole = { ...console };

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});
