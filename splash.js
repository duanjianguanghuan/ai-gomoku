/**
 * 启动动画系统 v6
 * Canvas 发光 · 渐变棋子 · 拖尾效果 · 30种动画
 * 90% 五子棋主题 / 10% 随机特效
 * 优化：rAF + delta-time · 120Hz 支持 · 3x DPR · prefers-reduced-motion
 * v6：localStorage 开关 · 避免连续重复 · 新增10个动画
 */
const Splash = (function() {
    'use strict';

    // ========== 常量 (Fix 14: PREVIEW_SESSION_KEY, MAX_SPLASH_TIME, MAX_PREVIEW_TIME 移至顶部) ==========
    const ANIM_DURATION = 2800;
    const TITLE_DELAY = 600;
    const EXIT_DELAY = 500;
    const MAX_PARTICLES = 200;
    const PREVIEW_SESSION_KEY = 'gomoku_splash_preview_all';
    const MAX_SPLASH_TIME = 8000; // 正常模式安全超时
    const MAX_PREVIEW_TIME = 120000; // 全量预览安全超时：2分钟
    const SPLASH_KEY = 'gomoku_splash_enabled';

    // ========== setTimeout 追踪系统（防止动画切换时旧 setTimeout 干扰） ==========
    const _pendingTimeouts = [];
    let _activePS = null; // Fix 1: 模块级引用，指向当前 ParticleSystem

    function trackedTimeout(fn, delay) {
        const id = setTimeout(() => {
            // 自动从数组中移除
            const idx = _pendingTimeouts.indexOf(id);
            if (idx !== -1) _pendingTimeouts.splice(idx, 1);
            fn();
        }, delay);
        _pendingTimeouts.push(id);
        return id;
    }
    function clearAllTimeouts() {
        for (const id of _pendingTimeouts) clearTimeout(id);
        _pendingTimeouts.length = 0;
    }

    function getColors() { // Fix 5: 移除 titleColor
        return {
            accent: '#e85d04', accentRgb: '232,93,4',
            primary: '#1a1a2e', secondary: '#666',
            bg: '#ffffff', bgRgb: '255,255,255',
            piece1: '#1a1a2e', piece1Light: '#444',
            piece2: '#f0f0f0', piece2Dark: '#bbb',
            grid: 'rgba(0,0,0,0.1)',
            glow: 'rgba(232,93,4,0.15)',
        };
    }

    // ========== Canvas 粒子系统 v5 ==========
    class ParticleSystem {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            // Fix 8: Canvas 上下文检查
            if (!this.ctx) { console.warn('[Splash] Canvas 2D context not available'); return; }
            this.particles = [];
            this.pool = [];
            this.running = false;
            this.trailAlpha = 0; // 拖尾强度 0=无拖尾
            this.resize();
            this._bgGlowRgb = '245,175,25';
            // rAF 定时器系统
            this._timers = []; // { callback, intervalMs, lastTime, id, active }
            this._timerIdCounter = 0;
        }

        // Fix 9: resize 安全检查
        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 3);
            const w = this.canvas.clientWidth;
            const h = this.canvas.clientHeight;
            if (w === 0 || h === 0) return;
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            this.ctx.scale(dpr, dpr);
            this.w = w;
            this.h = h;
        }

        _acquire() { return this.pool.length > 0 ? this.pool.pop() : {}; }
        // Fix 3: 对象池属性重置，避免残留
        _release(p) {
            if (this.pool.length < MAX_PARTICLES) {
                p.gradient = null;
                p.glow = 0;
                p.rotation = 0;
                p.rotSpeed = 0;
                this.pool.push(p);
            }
        }

        addParticle(p) {
            if (this.particles.length >= MAX_PARTICLES) return;
            const obj = this._acquire();
            obj.x = p.x != null ? p.x : this.w / 2;
            obj.y = p.y != null ? p.y : this.h / 2;
            obj.vx = p.vx || 0; obj.vy = p.vy || 0;
            obj.size = p.size || 3;
            obj.life = p.life != null ? p.life : 1;
            obj.decay = p.decay || 0.015;
            obj.color = p.color || 'rgba(245,175,25,1)';
            obj.type = p.type || 'circle';
            obj.rotation = p.rotation || 0;
            obj.rotSpeed = p.rotSpeed || 0;
            obj.gravity = p.gravity || 0;
            obj.friction = p.friction || 0.98;
            obj.glow = p.glow || 0; // 发光半径
            obj.gradient = p.gradient || null; // 渐变填充
            this.particles.push(obj);
        }

        // rAF 定时器：替代 setInterval，与渲染帧同步
        scheduleFrame(callback, intervalMs) {
            const id = ++this._timerIdCounter;
            const timer = { callback, intervalMs, lastTime: 0, id, active: true };
            this._timers.push(timer);
            return id;
        }

        cancelFrame(id) {
            const t = this._timers.find(t => t.id === id);
            if (t) t.active = false;
        }

        // Fix 13: _updateTimers 已正确清理非活跃条目
        _updateTimers(timestamp) {
            for (let i = this._timers.length - 1; i >= 0; i--) {
                const t = this._timers[i];
                if (!t.active) { this._timers.splice(i, 1); continue; }
                if (timestamp - t.lastTime >= t.intervalMs) {
                    t.lastTime = timestamp;
                    t.callback();
                }
            }
        }

        update(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.vy += (p.gravity || 0) * dt;
                p.vx *= Math.pow(p.friction || 0.98, dt);
                p.vy *= Math.pow(p.friction || 0.98, dt);
                p.rotation += (p.rotSpeed || 0) * dt;
                p.life -= (p.decay || 0.015) * dt;
                if (p.life <= 0) {
                    this._release(p);
                    // Fix 4: swap-and-pop 替代 splice，提升移除性能
                    this.particles[i] = this.particles[this.particles.length - 1];
                    this.particles.pop();
                }
            }
        }

        draw() {
            const ctx = this.ctx;
            // 拖尾效果
            if (this.trailAlpha > 0) {
                // Fix 2: 白色背景使用白色拖尾
                ctx.fillStyle = `rgba(255,255,255,${this.trailAlpha})`;
                ctx.fillRect(0, 0, this.w, this.h);
            } else {
                ctx.clearRect(0, 0, this.w, this.h);
            }

            // 背景微光效果（仅在有粒子时绘制）
            if (this.particles.length > 0) {
                const cx = this.w / 2, cy = this.h / 2;
                const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 100);
                bgGlow.addColorStop(0, `rgba(${this._bgGlowRgb || '245,175,25'},0.03)`);
                bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = bgGlow;
                ctx.fillRect(0, 0, this.w, this.h);
            }

            for (const p of this.particles) {
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);

                // 发光效果
                if (p.glow > 0) {
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = p.glow;
                } else {
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }

                // 渐变填充
                if (p.gradient) {
                    const g = ctx.createRadialGradient(
                        -p.size * 0.3, -p.size * 0.3, 0,
                        0, 0, Math.max(0.5, p.size)
                    );
                    g.addColorStop(0, p.gradient[0]);
                    g.addColorStop(1, p.gradient[1]);
                    ctx.fillStyle = g;
                } else {
                    ctx.fillStyle = p.color;
                }
                ctx.strokeStyle = p.color;

                const sz = Math.max(0.5, p.size);

                if (p.type === 'circle') {
                    ctx.beginPath();
                    ctx.arc(0, 0, sz, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.type === 'ring') {
                    ctx.lineWidth = Math.max(0.5, sz * 0.25);
                    ctx.beginPath();
                    ctx.arc(0, 0, sz, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (p.type === 'star') {
                    this._drawStar(ctx, 0, 0, 4, sz, sz * 0.4);
                } else if (p.type === 'line') {
                    ctx.lineWidth = Math.max(0.5, sz * 0.4);
                    ctx.beginPath();
                    ctx.moveTo(-sz, 0);
                    ctx.lineTo(sz, 0);
                    ctx.stroke();
                } else if (p.type === 'piece') {
                    // 3D 棋子
                    const g = ctx.createRadialGradient(-sz * 0.3, -sz * 0.3, 0, 0, 0, sz);
                    g.addColorStop(0, p.gradient ? p.gradient[0] : '#666');
                    g.addColorStop(0.7, p.gradient ? p.gradient[1] : '#222');
                    g.addColorStop(1, p.gradient ? p.gradient[2] : '#0a0a0a');
                    ctx.fillStyle = g;
                    ctx.shadowColor = 'rgba(0,0,0,0.4)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, sz, 0, Math.PI * 2);
                    ctx.fill();
                    // 高光
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.fillStyle = `rgba(255,255,255,${p.gradient && p.gradient[0] === '#fff' ? 0.4 : 0.15})`;
                    ctx.beginPath();
                    ctx.arc(-sz * 0.25, -sz * 0.25, sz * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        _drawStar(ctx, cx, cy, spikes, outerR, innerR) {
            let rot = Math.PI / 2 * 3;
            const step = Math.PI / spikes;
            ctx.beginPath();
            ctx.moveTo(cx, cy - outerR);
            for (let i = 0; i < spikes; i++) {
                ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
                rot += step;
                ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
                rot += step;
            }
            ctx.closePath();
            ctx.fill();
        }

        start() {
            this.running = true;
            _activePS = this; // Fix 1: 记录当前活跃的 ParticleSystem
            let lastTime = 0;
            const loop = (timestamp) => {
                if (!this.running) return;
                const dt = lastTime ? Math.min((timestamp - lastTime) / 16.667, 3) : 1; // 归一化到60fps，上限3倍
                lastTime = timestamp;
                this._updateTimers(timestamp);
                this.update(dt);
                this.draw();
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }

        stop() {
            this.running = false;
            this._timers.forEach(t => t.active = false);
            this._timers = [];
            // Fix 1: stop 时同时清理所有追踪的 setTimeout
            clearAllTimeouts();
        }
    }

    // ========== 辅助函数 ==========
    // Fix 5: 移除 rand()（从未调用）和 pick()（已内联到使用处）

    // 棋子渐变预设
    function blackPieceGrad() { return ['#555', '#222', '#0a0a0a']; }
    function whitePieceGrad() { return ['#fff', '#eee', '#bbb']; }

    // 发光粒子快捷方法
    function glowParticle(ps, x, y, size, color, glowSize) {
        ps.addParticle({ x, y, size, life: 1, decay: 0.008, color, type: 'circle', glow: glowSize || 8, gravity: 0, friction: 0.99 });
    }

    // 棋子快捷方法
    function pieceAt(ps, x, y, size, isBlack, opts) {
        ps.addParticle({
            x, y, size: size || 8, life: 1, decay: (opts && opts.decay) || 0.004,
            type: 'piece', gradient: isBlack ? blackPieceGrad() : whitePieceGrad(),
            gravity: (opts && opts.gravity) || 0, friction: (opts && opts.friction) || 0.99,
            vx: (opts && opts.vx) || 0, vy: (opts && opts.vy) || 0,
        });
    }

    // ========== 五子棋主题动画（18个） ==========

    // 1. 棋盘网格绘制
    function animGridDraw(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 120, lines = 7, step = gs / (lines - 1);
        const sx = cx - gs / 2, sy = cy - gs / 2;
        // 网格点逐行绘制
        let delay = 0;
        for (let i = 0; i < lines; i++) {
            trackedTimeout(() => {
                for (let j = 0; j <= 12; j++) {
                    const t = j / 12;
                    glowParticle(ps, sx + gs * t, sy + step * i, 1.2, c.grid, 0);
                    glowParticle(ps, sx + step * i, sy + gs * t, 1.2, c.grid, 0);
                }
            }, delay);
            delay += 80;
        }
        // 中心落子（带发光）
        trackedTimeout(() => {
            // 落子光晕
            for (let i = 0; i < 3; i++) {
                ps.addParticle({
                    x: cx, y: cy, size: 12 + i * 8, life: 1, decay: 0.012,
                    color: `rgba(${c.accentRgb},${0.3 - i * 0.08})`, type: 'ring', glow: 3,
                    gravity: 0, friction: 1,
                });
            }
            pieceAt(ps, cx, cy, 10, true);
        }, 800);
    }

    // 2. 五子连线
    function animFiveLine(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const sx = cx - 60, ex = cx + 60;
        // 连线发光
        for (let i = 0; i < 30; i++) {
            ps.addParticle({
                x: sx + (ex - sx) * (i / 30), y: cy,
                size: 1.8, life: 1, decay: 0.003,
                color: `rgba(${c.accentRgb},0.6)`, type: 'line', glow: 4,
                gravity: 0, friction: 0.99,
            });
        }
        // 五颗棋子依次出现
        for (let i = 0; i < 5; i++) {
            const x = sx + (ex - sx) * (i / 4);
            trackedTimeout(() => {
                // 出现光晕
                ps.addParticle({
                    x, y: cy, size: 16, life: 1, decay: 0.02,
                    color: `rgba(${c.accentRgb},0.4)`, type: 'ring', glow: 4,
                    gravity: 0, friction: 1,
                });
                pieceAt(ps, x, cy, 8, true);
            }, 150 + i * 200);
        }
        // 胜利庆祝
        trackedTimeout(() => {
            for (let i = 0; i < 20; i++) {
                const a = (i / 20) * Math.PI * 2;
                const speed = 1.5 + Math.random();
                ps.addParticle({
                    x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.5,
                    size: 2, life: 1, decay: 0.012,
                    color: `rgba(${c.accentRgb},0.8)`, type: 'star', glow: 4,
                    rotSpeed: (Math.random() - 0.5) * 0.15, gravity: 0.02, friction: 0.97,
                });
            }
        }, 1200);
    }

    // 3. 棋子对弈
    function animPieceAlternate(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 100, step = gs / 4;
        const sx = cx - gs / 2, sy = cy - gs / 2;
        const positions = [];
        for (let r = 0; r < 5; r++)
            for (let col = 0; col < 5; col++)
                positions.push({ x: sx + step * col, y: sy + step * r });
        const chosen = positions.sort(() => Math.random() - 0.5).slice(0, 8);
        chosen.forEach((pos, i) => {
            trackedTimeout(() => {
                // 落子涟漪
                ps.addParticle({
                    x: pos.x, y: pos.y, size: 14, life: 1, decay: 0.02,
                    color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 4,
                    gravity: 0, friction: 1,
                });
                pieceAt(ps, pos.x, pos.y, 7, i % 2 === 0);
            }, i * 180);
        });
    }

    // 4. 棋子汇聚
    function animPieceConverge(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2;
            const dist = 70 + Math.random() * 50;
            const sx = cx + Math.cos(a) * dist;
            const sy = cy + Math.sin(a) * dist;
            const dx = cx - sx, dy = cy - sy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const speed = 2 + Math.random() * 2;
            pieceAt(ps, sx, sy, 4 + Math.random() * 4, i % 2 === 0, {
                vx: (dx / d) * speed, vy: (dy / d) * speed, friction: 0.96, decay: 0.004,
            });
        }
        trackedTimeout(() => {
            for (let i = 0; i < 3; i++) {
                ps.addParticle({
                    x: cx, y: cy, size: 15 + i * 10, life: 1, decay: 0.01,
                    color: `rgba(${c.accentRgb},${0.25 - i * 0.06})`, type: 'ring', glow: 3,
                    gravity: 0, friction: 1,
                });
            }
            pieceAt(ps, cx, cy, 12, true);
        }, 700);
    }

    // 5. 棋盘浮现
    function animBoardEmerge(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const size = 55;
        // 散布粒子
        for (let i = 0; i < 40; i++) {
            ps.addParticle({
                x: cx + (Math.random() - 0.5) * 150, y: cy + (Math.random() - 0.5) * 150,
                size: 1 + Math.random() * 2, life: 1, decay: 0.008,
                color: `rgba(${c.accentRgb},${0.15 + Math.random() * 0.2})`,
                type: Math.random() > 0.5 ? 'circle' : 'star', glow: 3,
                rotSpeed: (Math.random() - 0.5) * 0.06, gravity: 0, friction: 0.99,
            });
        }
        // 棋盘边框
        trackedTimeout(() => {
            for (let i = 0; i < 48; i++) {
                const side = Math.floor(i / 12);
                const t = (i % 12) / 12;
                let x, y;
                if (side === 0) { x = cx - size + t * size * 2; y = cy - size; }
                else if (side === 1) { x = cx + size; y = cy - size + t * size * 2; }
                else if (side === 2) { x = cx + size - t * size * 2; y = cy + size; }
                else { x = cx - size; y = cy + size - t * size * 2; }
                glowParticle(ps, x, y, 1.5, `rgba(${c.accentRgb},0.6)`, 3);
            }
        }, 400);
        // 中心棋子
        trackedTimeout(() => {
            ps.addParticle({ x: cx, y: cy, size: 18, life: 1, decay: 0.015, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
            pieceAt(ps, cx, cy, 10, true);
        }, 900);
    }

    // 6. 星位点亮
    function animStarPoints(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 90;
        const stars = [
            { x: cx, y: cy },
            { x: cx - gs / 2, y: cy - gs / 2 },
            { x: cx + gs / 2, y: cy - gs / 2 },
            { x: cx - gs / 2, y: cy + gs / 2 },
            { x: cx + gs / 2, y: cy + gs / 2 },
        ];
        // 淡网格
        for (let i = 0; i < 16; i++) {
            const t = i / 16;
            ps.addParticle({ x: cx - gs / 2 + gs * t, y: cy - gs / 2, size: 0.8, life: 1, decay: 0.003, color: c.grid, type: 'circle' });
            ps.addParticle({ x: cx - gs / 2 + gs * t, y: cy + gs / 2, size: 0.8, life: 1, decay: 0.003, color: c.grid, type: 'circle' });
            ps.addParticle({ x: cx - gs / 2, y: cy - gs / 2 + gs * t, size: 0.8, life: 1, decay: 0.003, color: c.grid, type: 'circle' });
            ps.addParticle({ x: cx + gs / 2, y: cy - gs / 2 + gs * t, size: 0.8, life: 1, decay: 0.003, color: c.grid, type: 'circle' });
        }
        stars.forEach((pos, i) => {
            trackedTimeout(() => {
                // 光晕扩散
                for (let j = 0; j < 3; j++) {
                    ps.addParticle({
                        x: pos.x, y: pos.y, size: 8 + j * 5, life: 1, decay: 0.012,
                        color: `rgba(${c.accentRgb},${0.3 - j * 0.08})`, type: 'ring', glow: 2,
                        gravity: 0, friction: 1,
                    });
                }
                pieceAt(ps, pos.x, pos.y, 6, i === 0);
            }, 200 + i * 280);
        });
    }

    // 7. 黑白交锋
    function animBlackWhiteClash(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 15; i++) {
            const y = cy + (Math.random() - 0.5) * 70;
            pieceAt(ps, cx - 80, y, 4 + Math.random() * 3, true, { vx: 2 + Math.random() * 1.5, vy: (Math.random() - 0.5) * 0.5, friction: 0.97, decay: 0.005 });
        }
        for (let i = 0; i < 15; i++) {
            const y = cy + (Math.random() - 0.5) * 70;
            pieceAt(ps, cx + 80, y, 4 + Math.random() * 3, false, { vx: -(2 + Math.random() * 1.5), vy: (Math.random() - 0.5) * 0.5, friction: 0.97, decay: 0.005 });
        }
        trackedTimeout(() => {
            for (let i = 0; i < 20; i++) {
                const a = (i / 20) * Math.PI * 2;
                const speed = 1.5 + Math.random() * 2;
                ps.addParticle({
                    x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                    size: 2, life: 1, decay: 0.014,
                    color: `rgba(${c.accentRgb},0.8)`, type: 'star', glow: 2,
                    rotSpeed: (Math.random() - 0.5) * 0.2, gravity: 0, friction: 0.97,
                });
            }
        }, 500);
    }

    // 8. 棋子雨
    function animPieceRain(ps, c) {
        const w = ps.w;
        for (let i = 0; i < 14; i++) {
            pieceAt(ps, w * 0.15 + Math.random() * w * 0.7, -20 - Math.random() * 80,
                5 + Math.random() * 7, Math.random() > 0.5,
                { vy: 1 + Math.random() * 2, vx: (Math.random() - 0.5) * 0.4, gravity: 0.06, friction: 0.995, decay: 0.004 });
        }
        for (let i = 0; i < 12; i++) {
            ps.addParticle({
                x: Math.random() * w, y: -10 - Math.random() * 60,
                vy: 0.5 + Math.random() * 1.5, size: 1.5, life: 1, decay: 0.006,
                color: `rgba(${c.accentRgb},0.5)`, type: 'star', glow: 3,
                rotSpeed: (Math.random() - 0.5) * 0.12, gravity: 0.02, friction: 0.998,
            });
        }
    }

    // 9. 落子涟漪
    function animDropRipple(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const drops = [
            { x: cx - 30, y: cy - 20, d: 0 },
            { x: cx + 25, y: cy - 10, d: 350 },
            { x: cx, y: cy + 15, d: 700 },
            { x: cx - 15, y: cy + 5, d: 1050 },
        ];
        drops.forEach((drop) => {
            trackedTimeout(() => {
                ps.addParticle({ x: drop.x, y: drop.y, size: 16, life: 1, decay: 0.02, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 2, gravity: 0, friction: 1 });
                pieceAt(ps, drop.x, drop.y, 7, true);
                for (let j = 0; j < 12; j++) {
                    const a = (j / 12) * Math.PI * 2;
                    ps.addParticle({
                        x: drop.x, y: drop.y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2,
                        size: 1, life: 1, decay: 0.016,
                        color: `rgba(${c.accentRgb},0.5)`, type: 'circle', glow: 2,
                        gravity: 0, friction: 0.99,
                    });
                }
            }, drop.d);
        });
    }

    // 10. 棋盘旋转
    function animBoardRotate(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 100, lines = 5, step = gs / (lines - 1);
        let angle = 0, frame = 0;
        const timerId = ps.scheduleFrame(() => {
            if (frame > 20) { ps.cancelFrame(timerId); return; }
            angle += 0.15;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            for (let i = 0; i < lines; i++) {
                const lx = (cx - gs / 2 + step * i) - cx;
                for (let j = 0; j < 8; j++) {
                    const ly = (cy - gs / 2 + (gs / 8) * j) - cy;
                    glowParticle(ps, cx + lx * cos - ly * sin, cy + lx * sin + ly * cos, 1, c.grid, 0);
                }
            }
            frame++;
        }, 80);
        trackedTimeout(() => {
            ps.addParticle({ x: cx, y: cy, size: 16, life: 1, decay: 0.012, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
            pieceAt(ps, cx, cy, 9, true);
        }, 1600);
    }

    // 11. 螺旋落子
    function animSpiralDrop(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 28; i++) {
            const t = i / 28 * Math.PI * 4;
            const r = 8 + t * 5;
            const x = cx + Math.cos(t) * r;
            const y = cy + Math.sin(t) * r - 15;
            trackedTimeout(() => {
                pieceAt(ps, x, y, 5, i % 2 === 0, { vy: 0.5, gravity: 0.04, friction: 0.99, decay: 0.004 });
            }, i * 50);
        }
    }

    // 12. 棋子爆炸
    function animPieceExplode(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        pieceAt(ps, cx, cy, 12, true);
        trackedTimeout(() => {
            for (let i = 0; i < 25; i++) {
                const a = (i / 25) * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                ps.addParticle({
                    x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                    size: 2 + Math.random() * 2, life: 1, decay: 0.011,
                    color: i % 3 === 0 ? `rgba(${c.accentRgb},0.8)` : i % 3 === 1 ? `rgba(26,26,46,0.7)` : `rgba(220,220,220,0.7)`,
                    type: Math.random() > 0.5 ? 'circle' : 'star', glow: 3,
                    rotSpeed: (Math.random() - 0.5) * 0.15, gravity: 0, friction: 0.97,
                });
            }
        }, 500);
        trackedTimeout(() => {
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                const dist = 40 + Math.random() * 25;
                const sx = cx + Math.cos(a) * dist, sy = cy + Math.sin(a) * dist;
                const dx = cx - sx, dy = cy - sy, d = Math.sqrt(dx * dx + dy * dy);
                ps.addParticle({
                    x: sx, y: sy, vx: (dx / d) * 2.5, vy: (dy / d) * 2.5,
                    size: 2 + Math.random() * 2, life: 1, decay: 0.004,
                    color: `rgba(${c.accentRgb},0.8)`, type: 'star', glow: 3,
                    rotSpeed: (Math.random() - 0.5) * 0.1, gravity: 0, friction: 0.96,
                });
            }
        }, 1000);
    }

    // 13. 网格呼吸
    function animGridBreathe(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 100, lines = 5, step = gs / (lines - 1);
        const sx = cx - gs / 2, sy = cy - gs / 2;
        let frame = 0;
        const timerId = ps.scheduleFrame(() => {
            if (frame > 22) { ps.cancelFrame(timerId); return; }
            const pulse = Math.sin(frame / 22 * Math.PI * 2) * 0.5 + 0.5;
            for (let i = 0; i < lines; i++) {
                for (let j = 0; j < 8; j++) {
                    glowParticle(ps, sx + (gs / 8) * j, sy + step * i, 1 + pulse * 0.5, `rgba(${c.accentRgb},${(0.2 + pulse * 0.3).toFixed(2)})`, 2);
                    glowParticle(ps, sx + step * i, sy + (gs / 8) * j, 1 + pulse * 0.5, `rgba(${c.accentRgb},${(0.2 + pulse * 0.3).toFixed(2)})`, 2);
                }
            }
            frame++;
        }, 80);
        let rf = 0;
        const timerId2 = ps.scheduleFrame(() => {
            if (rf > 12) { ps.cancelFrame(timerId2); return; }
            ps.addParticle({ x: cx, y: cy, size: 6 + rf * 4, life: 1, decay: 0.02, color: `rgba(${c.accentRgb},${0.35 - rf * 0.02})`, type: 'ring', glow: 4, gravity: 0, friction: 1 });
            rf++;
        }, 120);
    }

    // 14. 连五胜利
    function animWinFive(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const sx = cx - 56, ex = cx + 56;
        for (let i = 0; i < 25; i++) {
            ps.addParticle({ x: sx + (ex - sx) * (i / 25), y: cy, size: 1.8, life: 1, decay: 0.003, color: `rgba(${c.accentRgb},0.6)`, type: 'line', glow: 4, gravity: 0, friction: 0.99 });
        }
        for (let i = 0; i < 5; i++) {
            const x = sx + (ex - sx) * (i / 4);
            trackedTimeout(() => {
                ps.addParticle({ x, y: cy, size: 14, life: 1, decay: 0.018, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
                pieceAt(ps, x, cy, 7, true);
            }, 150 + i * 130);
        }
        trackedTimeout(() => {
            for (let b = 0; b < 3; b++) {
                trackedTimeout(() => {
                    const bx = cx + (b - 1) * 35, by = cy - 15 - b * 8;
                    for (let i = 0; i < 14; i++) {
                        const a = (i / 14) * Math.PI * 2;
                        const speed = 1.5 + Math.random() * 2;
                        ps.addParticle({
                            x: bx, y: by, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.5,
                            size: 2, life: 1, decay: 0.012,
                            // Fix 5: 内联 pick()
                            color: [`rgba(${c.accentRgb},0.9)`, `rgba(255,215,0,0.8)`, `rgba(255,255,255,0.7)`][Math.floor(Math.random() * 3)],
                            type: ['circle', 'star'][Math.floor(Math.random() * 2)], glow: 4,
                            rotSpeed: (Math.random() - 0.5) * 0.2, gravity: 0.03, friction: 0.97,
                        });
                    }
                }, b * 200);
            }
        }, 900);
    }

    // 15. 棋子瀑布
    function animPieceWaterfall(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 80, step = gs / 4, sx = cx - gs / 2, sy = cy - gs / 2;
        for (let i = 0; i < 20; i++) {
            pieceAt(ps, cx - 80, cy - 50 + Math.random() * 100, 3 + Math.random() * 4, Math.random() > 0.5,
                { vx: 2 + Math.random() * 2, vy: (Math.random() - 0.5) * 0.5, gravity: 0.02, friction: 0.98, decay: 0.004 });
        }
        trackedTimeout(() => {
            for (let r = 0; r < 5; r++) {
                for (let col = 0; col < 5; col++) {
                    if ((r + col) % 2 !== 0) continue;
                    pieceAt(ps, sx + step * col, sy + step * r, 5, (r + col) % 4 < 2, { decay: 0.003 });
                }
            }
        }, 600);
    }

    // 16. 星座连线
    function animConstellation(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const pts = [];
        for (let i = 0; i < 7; i++) {
            pts.push({ x: cx + (Math.random() - 0.5) * 110, y: cy + (Math.random() - 0.5) * 90 });
        }
        pts.forEach((p, i) => {
            trackedTimeout(() => {
                ps.addParticle({ x: p.x, y: p.y, size: 10, life: 1, decay: 0.015, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 4, gravity: 0, friction: 1 });
                pieceAt(ps, p.x, p.y, 4, i % 2 === 0);
            }, i * 120);
        });
        trackedTimeout(() => {
            for (let i = 0; i < pts.length - 1; i++) {
                const p1 = pts[i], p2 = pts[i + 1];
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const count = Math.max(4, Math.floor(dist / 7));
                for (let j = 0; j < count; j++) {
                    const t = j / count;
                    glowParticle(ps, p1.x + dx * t, p1.y + dy * t, 0.8, `rgba(${c.accentRgb},0.4)`, 2);
                }
            }
        }, 900);
    }

    // 17. 棋盘碎片化
    function animBoardShatter(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2, size = 50;
        for (let i = 0; i < 36; i++) {
            const side = Math.floor(i / 9), t = (i % 9) / 9;
            let x, y;
            if (side === 0) { x = cx - size + t * size * 2; y = cy - size; }
            else if (side === 1) { x = cx + size; y = cy - size + t * size * 2; }
            else if (side === 2) { x = cx + size - t * size * 2; y = cy + size; }
            else { x = cx - size; y = cy + size - t * size * 2; }
            glowParticle(ps, x, y, 1.5, `rgba(${c.accentRgb},0.5)`, 3);
        }
        trackedTimeout(() => {
            for (let i = 0; i < 28; i++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 1.5 + Math.random() * 2.5;
                ps.addParticle({
                    x: cx + (Math.random() - 0.5) * 35, y: cy + (Math.random() - 0.5) * 35,
                    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                    size: 2 + Math.random() * 3, life: 1, decay: 0.009,
                    // Fix 5: 内联 pick()
                    color: [`rgba(${c.accentRgb},0.6)`, `rgba(26,26,46,0.5)`, `rgba(220,220,220,0.5)`][Math.floor(Math.random() * 3)],
                    type: ['circle', 'star'][Math.floor(Math.random() * 2)], glow: 3,
                    rotSpeed: (Math.random() - 0.5) * 0.2, gravity: 0.02, friction: 0.97,
                });
            }
        }, 500);
        trackedTimeout(() => {
            ps.addParticle({ x: cx, y: cy, size: 14, life: 1, decay: 0.012, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
            pieceAt(ps, cx, cy, 10, true);
        }, 1000);
    }

    // 18. 最后一手
    function animLastMove(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        // 背景棋子
        const bgPos = [{ x: cx - 35, y: cy - 25 }, { x: cx + 20, y: cy - 30 }, { x: cx - 40, y: cy + 15 }, { x: cx + 30, y: cy + 20 }];
        bgPos.forEach((pos, i) => {
            pieceAt(ps, pos.x, pos.y, 4, i % 2 === 0, { decay: 0.003 });
        });
        // 最后一手落下
        trackedTimeout(() => {
            pieceAt(ps, cx, cy - 35, 10, true, { vy: 2, gravity: 0.08, friction: 0.99, decay: 0.003 });
        }, 300);
        // 落定标记
        trackedTimeout(() => {
            for (let i = 0; i < 3; i++) {
                ps.addParticle({ x: cx, y: cy, size: 12 + i * 8, life: 1, decay: 0.01, color: `rgba(${c.accentRgb},${0.3 - i * 0.08})`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
            }
            pieceAt(ps, cx, cy, 10, true);
            // 标记红点
            ps.addParticle({ x: cx, y: cy, size: 3, life: 1, decay: 0.003, color: `rgba(${c.accentRgb},1)`, type: 'circle', glow: 3, gravity: 0, friction: 0.99 });
        }, 800);
    }

    // ========== 随机特效（2个） ==========

    // 19. 粒子漩涡
    function animParticleVortex(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 45; i++) {
            const a = (i / 45) * Math.PI * 6;
            const r = 5 + (i / 45) * 55;
            const speed = 0.02 + (i / 45) * 0.03;
            ps.addParticle({
                x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
                vx: -Math.sin(a) * speed * r + (Math.random() - 0.5) * 0.3,
                vy: Math.cos(a) * speed * r + (Math.random() - 0.5) * 0.3,
                size: 1.5 + Math.random() * 2, life: 1, decay: 0.004,
                color: `rgba(${c.accentRgb},${0.5 + Math.random() * 0.4})`,
                type: Math.random() > 0.7 ? 'star' : 'circle', glow: 3,
                rotSpeed: (Math.random() - 0.5) * 0.1, gravity: 0, friction: 0.998,
            });
        }
        for (let i = 0; i < 4; i++) {
            ps.addParticle({ x: cx, y: cy, size: 4 + i * 3, life: 1, decay: 0.003, color: `rgba(${c.accentRgb},${0.35 - i * 0.06})`, type: 'ring', glow: 2, gravity: 0, friction: 1 });
        }
    }

    // 20. 星空闪烁
    function animStarTwinkle(ps, c) {
        const w = ps.w, h = ps.h;
        for (let i = 0; i < 40; i++) {
            ps.addParticle({
                x: Math.random() * w, y: Math.random() * h, size: 1 + Math.random() * 3,
                life: 1, decay: 0.003 + Math.random() * 0.004,
                color: Math.random() > 0.3 ? `rgba(255,255,255,${0.3 + Math.random() * 0.5})` : `rgba(${c.accentRgb},${0.5 + Math.random() * 0.4})`,
                type: Math.random() > 0.5 ? 'star' : 'circle', glow: 3,
                rotSpeed: (Math.random() - 0.5) * 0.05, gravity: 0, friction: 1,
            });
        }
        // 流星
        trackedTimeout(() => {
            const sx = w * 0.2 + Math.random() * w * 0.3, sy = h * 0.1;
            for (let i = 0; i < 10; i++) {
                ps.addParticle({
                    x: sx + i * 5, y: sy + i * 3, vx: 2, vy: 1.2,
                    size: 2 - i * 0.12, life: 1, decay: 0.014,
                    color: `rgba(${c.accentRgb},${0.8 - i * 0.05})`, type: 'circle', glow: 3,
                    gravity: 0, friction: 0.99,
                });
            }
        }, 800);
    }

    // ========== 新增动画（10个） ==========

    // 21. 棋子弹跳
    function animPieceBounce(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 6; i++) {
            const x = cx + (i - 2.5) * 28;
            trackedTimeout(() => {
                pieceAt(ps, x, cy + 30, 7, i % 2 === 0, { vy: -3.5, gravity: 0.12, friction: 0.995, decay: 0.003 });
                trackedTimeout(() => {
                    ps.addParticle({ x, y: cy, size: 14, life: 1, decay: 0.025, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 2, gravity: 0, friction: 1 });
                }, 350);
            }, i * 150);
        }
    }

    // 22. 光环扩散
    function animRingExpand(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 6; i++) {
            trackedTimeout(() => {
                for (let j = 0; j < 4; j++) {
                    ps.addParticle({ x: cx, y: cy, size: 5 + j * 12, life: 1, decay: 0.008 + j * 0.002, color: `rgba(${c.accentRgb},${0.4 - j * 0.08})`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
                }
            }, i * 250);
        }
        trackedTimeout(() => {
            pieceAt(ps, cx, cy, 12, true);
            for (let i = 0; i < 15; i++) {
                const a = (i / 15) * Math.PI * 2;
                ps.addParticle({ x: cx, y: cy, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, size: 1.5, life: 1, decay: 0.01, color: `rgba(${c.accentRgb},0.7)`, type: 'circle', glow: 3, gravity: 0, friction: 0.98 });
            }
        }, 1500);
    }

    // 23. 棋盘波浪
    function animBoardWave(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 100, lines = 7, step = gs / (lines - 1);
        const sx = cx - gs / 2, sy = cy - gs / 2;
        let row = 0;
        const timerId = ps.scheduleFrame(() => {
            if (row >= lines) { ps.cancelFrame(timerId); return; }
            for (let j = 0; j < lines; j++) {
                const x = sx + step * j, y = sy + step * row;
                const delay = (Math.abs(j - 3) + row) * 30;
                trackedTimeout(() => {
                    glowParticle(ps, x, y, 1.5, c.grid, 0);
                    if (row === 3 && j === 3) {
                        trackedTimeout(() => {
                            ps.addParticle({ x, y, size: 14, life: 1, decay: 0.015, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
                            pieceAt(ps, x, y, 8, true);
                        }, 100);
                    }
                }, delay);
            }
            row++;
        }, 120);
    }

    // 24. 双子对弈
    function animDualPieces(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const positions = [
            { x: cx - 25, y: cy - 25 }, { x: cx + 25, y: cy - 25 },
            { x: cx - 25, y: cy + 25 }, { x: cx + 25, y: cy + 25 },
            { x: cx, y: cy },
        ];
        positions.forEach((pos, i) => {
            trackedTimeout(() => {
                ps.addParticle({ x: pos.x, y: pos.y, size: 16, life: 1, decay: 0.02, color: `rgba(${c.accentRgb},0.25)`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
                pieceAt(ps, pos.x, pos.y, 8, i % 2 === 0);
            }, i * 200);
        });
        trackedTimeout(() => {
            // 连线
            for (let i = 0; i < positions.length - 1; i++) {
                const p1 = positions[i], p2 = positions[i + 1];
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const count = Math.max(3, Math.floor(dist / 6));
                for (let j = 0; j < count; j++) {
                    const t = j / count;
                    glowParticle(ps, p1.x + dx * t, p1.y + dy * t, 0.6, `rgba(${c.accentRgb},0.3)`, 1);
                }
            }
        }, 1100);
    }

    // 25. 棋子散射
    function animPieceScatter(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        pieceAt(ps, cx, cy, 14, true);
        trackedTimeout(() => {
            for (let i = 0; i < 20; i++) {
                const a = (i / 20) * Math.PI * 2;
                const speed = 1.5 + Math.random() * 2.5;
                pieceAt(ps, cx, cy, 3 + Math.random() * 4, i % 2 === 0, {
                    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                    gravity: 0.03, friction: 0.97, decay: 0.005,
                });
            }
        }, 400);
        trackedTimeout(() => {
            for (let i = 0; i < 30; i++) {
                ps.addParticle({
                    x: cx + (Math.random() - 0.5) * 120, y: cy + (Math.random() - 0.5) * 120,
                    size: 1 + Math.random(), life: 1, decay: 0.006,
                    color: `rgba(${c.accentRgb},${0.3 + Math.random() * 0.3})`, type: 'circle', glow: 2,
                    gravity: 0, friction: 0.99,
                });
            }
        }, 800);
    }

    // 26. 脉冲网格
    function animPulseGrid(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const gs = 110, lines = 6, step = gs / (lines - 1);
        const sx = cx - gs / 2, sy = cy - gs / 2;
        // 从中心向外脉冲
        const center = Math.floor(lines / 2);
        for (let ring = 0; ring <= center; ring++) {
            trackedTimeout(() => {
                for (let i = 0; i < lines; i++) {
                    for (let j = 0; j < lines; j++) {
                        const dist = Math.max(Math.abs(i - center), Math.abs(j - center));
                        if (dist === ring) {
                            glowParticle(ps, sx + step * j, sy + step * i, 1.2 + (center - ring) * 0.3, `rgba(${c.accentRgb},${0.3 + (center - ring) * 0.1})`, 2);
                        }
                    }
                }
            }, ring * 180);
        }
        trackedTimeout(() => {
            pieceAt(ps, cx, cy, 10, true);
            ps.addParticle({ x: cx, y: cy, size: 20, life: 1, decay: 0.01, color: `rgba(${c.accentRgb},0.25)`, type: 'ring', glow: 4, gravity: 0, friction: 1 });
        }, center * 180 + 200);
    }

    // 27. 棋子旋转轨道
    function animOrbitPieces(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = 45;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            const speed = 0.015;
            const dir = i % 2 === 0 ? 1 : -1;
            pieceAt(ps, x, y, 5, i % 2 === 0, {
                vx: -Math.sin(a) * speed * r * dir,
                vy: Math.cos(a) * speed * r * dir,
                gravity: 0, friction: 0.999, decay: 0.003,
            });
        }
        trackedTimeout(() => {
            pieceAt(ps, cx, cy, 10, true);
            ps.addParticle({ x: cx, y: cy, size: 18, life: 1, decay: 0.012, color: `rgba(${c.accentRgb},0.3)`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
        }, 800);
    }

    // 28. 棋子矩阵
    function animPieceMatrix(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const size = 4, gap = 18;
        const sx = cx - (size - 1) * gap / 2, sy = cy - (size - 1) * gap / 2;
        let count = 0;
        for (let r = 0; r < size; r++) {
            for (let col = 0; col < size; col++) {
                const x = sx + col * gap, y = sy + r * gap;
                trackedTimeout(() => {
                    pieceAt(ps, x, y, 5, (r + col) % 2 === 0, { decay: 0.003 });
                    ps.addParticle({ x, y, size: 10, life: 1, decay: 0.025, color: `rgba(${c.accentRgb},0.2)`, type: 'ring', glow: 2, gravity: 0, friction: 1 });
                }, count * 80);
                count++;
            }
        }
    }

    // 29. 光线放射
    function animLightBurst(ps, c) {
        const cx = ps.w / 2, cy = ps.h / 2;
        const rays = 16;
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2;
            const len = 50 + Math.random() * 30;
            for (let j = 0; j < 8; j++) {
                const t = j / 8;
                ps.addParticle({
                    x: cx + Math.cos(a) * len * t, y: cy + Math.sin(a) * len * t,
                    size: 2 - t * 1.2, life: 1, decay: 0.006,
                    color: `rgba(${c.accentRgb},${0.6 - t * 0.3})`, type: 'circle', glow: 3,
                    gravity: 0, friction: 0.99,
                });
            }
        }
        trackedTimeout(() => {
            pieceAt(ps, cx, cy, 11, true);
            for (let i = 0; i < 5; i++) {
                ps.addParticle({ x: cx, y: cy, size: 10 + i * 10, life: 1, decay: 0.008, color: `rgba(${c.accentRgb},${0.3 - i * 0.05})`, type: 'ring', glow: 3, gravity: 0, friction: 1 });
            }
        }, 500);
    }

    // 30. 棋子飘落
    function animPieceFloat(ps, c) {
        const w = ps.w;
        for (let i = 0; i < 10; i++) {
            trackedTimeout(() => {
                const x = w * 0.2 + Math.random() * w * 0.6;
                pieceAt(ps, x, -15, 5 + Math.random() * 5, Math.random() > 0.5, {
                    vy: 0.8 + Math.random() * 1.2,
                    vx: (Math.random() - 0.5) * 0.8,
                    gravity: 0.02, friction: 0.998, decay: 0.003,
                });
                // 落地涟漪
                const landY = ps.h / 2 + (Math.random() - 0.5) * 40;
                trackedTimeout(() => {
                    ps.addParticle({ x, y: landY, size: 12, life: 1, decay: 0.03, color: `rgba(${c.accentRgb},0.2)`, type: 'ring', glow: 2, gravity: 0, friction: 1 });
                }, 600);
            }, i * 120);
        }
    }

    // 上次播放的动画索引（避免连续重复）
    let _lastAnimIndex = -1;

    // ========== 动画池（30个） ==========
    const gomokuAnimations = [
        animGridDraw, animFiveLine, animPieceAlternate, animPieceConverge,
        animBoardEmerge, animStarPoints, animBlackWhiteClash, animPieceRain,
        animDropRipple, animBoardRotate, animSpiralDrop, animPieceExplode,
        animGridBreathe, animWinFive, animPieceWaterfall, animConstellation,
        animBoardShatter, animLastMove,
        // v6 新增
        animPieceBounce, animRingExpand, animBoardWave, animDualPieces,
        animPieceScatter, animPulseGrid, animOrbitPieces, animPieceMatrix,
        animLightBurst, animPieceFloat,
    ];
    const randomAnimations = [animParticleVortex, animStarTwinkle];
    const allAnimations = [...gomokuAnimations, ...randomAnimations];

    // ========== 标题动画 ==========
    // Fix 11: animateTitle 使用 trackedTimeout
    function animateTitle(titleEl, c) {
        const text = titleEl.textContent;
        titleEl.textContent = '';
        titleEl.style.opacity = '1';
        [...text].forEach((char, i) => {
            const span = document.createElement('span');
            span.textContent = char;
            span.style.cssText = `display:inline-block;opacity:0;transform:translateY(12px);transition:opacity 0.35s cubic-bezier(0.16,1,0.3,1) ${i * 40}ms, transform 0.35s cubic-bezier(0.34,1.56,0.64,1) ${i * 40}ms;`;
            titleEl.appendChild(span);
            requestAnimationFrame(() => {
                span.style.opacity = '1';
                span.style.transform = 'translateY(0)';
                // 标题字符微光效果
                trackedTimeout(() => {
                    span.style.textShadow = `0 0 12px ${c.glow}`;
                }, 400 + i * 40);
            });
        });
    }

    // ========== 退出动画 ==========
    // Fix 10: exitAnimation 使用 trackedTimeout
    function exitAnimation(ps, screen, callback) {
        // 粒子向外扩散
        const cx = ps.w / 2, cy = ps.h / 2;
        for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            const speed = 2 + Math.random() * 2;
            ps.addParticle({
                x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                size: 2 + Math.random() * 2, life: 1, decay: 0.02,
                color: `rgba(${getColors().accentRgb},0.5)`, type: 'circle', glow: 4,
                gravity: 0, friction: 0.98,
            });
        }
        trackedTimeout(() => {
            // 闪光过渡效果
            const flash = document.createElement('div');
            flash.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.08);pointer-events:none;opacity:0;transition:opacity 0.15s ease;will-change:opacity;';
            screen.appendChild(flash);
            requestAnimationFrame(() => { flash.style.opacity = '1'; });
            trackedTimeout(() => {
                flash.style.opacity = '0';
                trackedTimeout(() => {
                    if (flash.parentNode) flash.parentNode.removeChild(flash); // 清理 DOM
                    screen.classList.add('fade-out');
                    trackedTimeout(callback, 500);
                }, 150);
            }, 100);
        }, 300);
    }

    // ========== 开屏动画开关（localStorage 持久化） ==========
    // Fix 7: localStorage 安全包装
    function isSplashEnabled() {
        try { return localStorage.getItem(SPLASH_KEY) !== 'false'; }
        catch { return true; }
    }

    function setSplashEnabled(enabled) {
        try { localStorage.setItem(SPLASH_KEY, enabled ? 'true' : 'false'); }
        catch { /* ignore */ }
    }

    // ========== Fix 6: 共享预览序列函数 ==========
    function _runPreviewSequence(ps, c, container, titleEl) {
        // container: #splash-screen (init 模式) 或 overlay div (previewAll 模式)
        // 创建进度条、计数器、跳过按钮
        const progress = document.createElement('div');
        progress.style.cssText = 'position:absolute;bottom:12%;left:50%;transform:translateX(-50%);width:180px;height:3px;background:rgba(128,128,128,0.2);border-radius:2px;overflow:hidden;z-index:10;';
        const progressFill = document.createElement('div');
        progressFill.style.cssText = 'width:0%;height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s ease;';
        progress.appendChild(progressFill);
        container.appendChild(progress);

        const counter = document.createElement('div');
        counter.style.cssText = 'position:absolute;bottom:16%;left:50%;transform:translateX(-50%);font-size:0.75rem;color:var(--text-secondary);opacity:0.7;white-space:nowrap;pointer-events:none;z-index:10;';
        counter.textContent = '1 / 30';
        container.appendChild(counter);

        const skipBtn = document.createElement('button');
        skipBtn.style.cssText = 'position:absolute;top:16px;right:16px;padding:6px 14px;font-size:0.8rem;color:var(--text-secondary);background:rgba(128,128,128,0.15);border:1px solid rgba(128,128,128,0.2);border-radius:8px;cursor:pointer;z-index:10;transition:opacity 0.2s ease;';
        skipBtn.textContent = '跳过';
        container.appendChild(skipBtn);

        let currentIdx = 0;
        const total = allAnimations.length;
        let skipped = false;
        let cancelled = false;

        function playNext() {
            if (skipped || cancelled) return;
            if (currentIdx >= total) {
                // 全部播放完毕 → 退出
                exitAnimation(ps, container, () => { ps.stop(); container.remove(); });
                return;
            }

            // 清除旧粒子和延迟任务
            clearAllTimeouts();
            ps.particles = [];
            ps._timers.forEach(t => t.active = false);
            ps._timers = [];

            // 播放当前动画
            allAnimations[currentIdx](ps, c);

            // 更新 UI
            counter.textContent = `${currentIdx + 1} / ${total}`;
            progressFill.style.width = `${((currentIdx + 1) / total) * 100}%`;

            currentIdx++;
            if (currentIdx < total && !skipped) {
                trackedTimeout(playNext, 3000);
            } else if (!skipped) {
                trackedTimeout(() => {
                    exitAnimation(ps, container, () => { ps.stop(); container.remove(); });
                }, 3000);
            }
        }

        skipBtn.addEventListener('click', () => {
            skipped = true;
            clearAllTimeouts();
            ps.stop();
            container.classList.add('fade-out');
            trackedTimeout(() => { if (container.parentNode) container.remove(); }, 500);
        });

        // 标题动画
        trackedTimeout(() => {
            if (titleEl) animateTitle(titleEl, c);
        }, TITLE_DELAY);

        // 开始播放
        trackedTimeout(playNext, 300);

        return {
            cancel() {
                cancelled = true;
                clearAllTimeouts();
                ps.stop();
            },
        };
    }

    // ========== 预览全部动画 ==========
    let _previewRunning = false;

    function previewAll() {
        if (_previewRunning) return;
        _previewRunning = true;

        // 创建全屏预览容器
        const overlay = document.createElement('div');
        overlay.id = 'splash-preview-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;background:linear-gradient(135deg,var(--bg-primary) 0%,var(--bg-secondary) 50%,var(--bg-tertiary) 100%);transition:opacity 0.45s cubic-bezier(0.16,1,0.3,1),transform 0.45s cubic-bezier(0.16,1,0.3,1);overflow:hidden;will-change:opacity,transform;backface-visibility:hidden;-webkit-backface-visibility:hidden;';

        // 舞台
        const stage = document.createElement('div');
        stage.style.cssText = 'position:relative;width:200px;height:200px;display:flex;align-items:center;justify-content:center;will-change:transform;transform:translateZ(0);';
        overlay.appendChild(stage);

        document.body.appendChild(overlay);

        // Canvas
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;will-change:transform;';
        stage.appendChild(canvas);

        const c = getColors();
        const ps = new ParticleSystem(canvas);
        ps._bgGlowRgb = c.accentRgb;
        ps.start();

        // 使用共享预览序列
        _runPreviewSequence(ps, c, overlay, null);

        // 监听移除以重置状态
        const observer = new MutationObserver(() => {
            if (!document.body.contains(overlay)) {
                observer.disconnect();
                _previewRunning = false;
            }
        });
        observer.observe(document.body, { childList: true });
    }

    function isPreviewRunning() {
        return _previewRunning;
    }

    // ========== 主流程 ==========
    function init() {
        const screen = document.getElementById('splash-screen');
        if (!screen) return;

        // 检查用户是否关闭了开屏动画（全量播放模式忽略此设置）
        const isPreviewMode = sessionStorage.getItem(PREVIEW_SESSION_KEY) === 'true';
        if (!isPreviewMode && !isSplashEnabled()) {
            screen.remove();
            return;
        }

        // 清除标记
        if (isPreviewMode) sessionStorage.removeItem(PREVIEW_SESSION_KEY);

        // Fix 15: safetyTimer 使用 trackedTimeout
        trackedTimeout(() => {
            clearAllTimeouts();
            if (screen.parentNode) {
                screen.style.pointerEvents = 'none'; // 立即允许交互
                screen.classList.add('fade-out');
                trackedTimeout(() => { if (screen.parentNode) screen.remove(); }, 500);
            }
        }, isPreviewMode ? MAX_PREVIEW_TIME : MAX_SPLASH_TIME);

        const title = document.getElementById('splash-title');

        // 减弱动画偏好
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            if (title) { title.style.opacity = '1'; title.classList.add('show'); }
            trackedTimeout(() => {
                screen.classList.add('fade-out');
                trackedTimeout(() => screen.remove(), 500);
            }, 400);
            return;
        }

        const stage = document.getElementById('splash-stage');
        const c = getColors();

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;will-change:transform;';
        stage.appendChild(canvas);

        const ps = new ParticleSystem(canvas);
        ps._bgGlowRgb = c.accentRgb;
        ps.start();

        if (isPreviewMode) {
            // ========== 全量播放模式：使用共享预览序列 ==========
            _runPreviewSequence(ps, c, screen, title);
        } else {
            // ========== 正常模式：随机播放一个动画 ==========
            // 随机选择动画（避免连续重复）
            let idx;
            do {
                idx = Math.floor(Math.random() * allAnimations.length);
            } while (idx === _lastAnimIndex && allAnimations.length > 1);
            _lastAnimIndex = idx;
            allAnimations[idx](ps, c);

            // 标题逐字动画
            trackedTimeout(() => {
                if (title) animateTitle(title, c);
            }, TITLE_DELAY);

            // 退出
            trackedTimeout(() => {
                exitAnimation(ps, screen, () => {
                    ps.stop();
                    screen.remove();
                });
            }, ANIM_DURATION + EXIT_DELAY);
        }
    }

    // Fix 12: 导出 PREVIEW_SESSION_KEY
    return { init, isSplashEnabled, setSplashEnabled, previewAll, isPreviewRunning, allAnimations, PREVIEW_SESSION_KEY };
})();
