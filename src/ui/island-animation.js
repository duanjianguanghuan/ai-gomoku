/**
 * 灵动岛动画系统 v4 (全面优化版)
 * 
 * v4 优化内容：
 * - GPU 加速优化
 * - RAF 帧率控制
 * - 新增 Cyberpunk 风格
 * - 增强可视化效果
 * - 减少重绘重排
 * - 优化动画弹性曲线
 * - 增强悬停交互反馈
 */

const IslandAnimation = (() => {
    // ========== Configuration ==========

    const STANDARD_CONFIG = {
        pillBlurDefault: 30,
        pillBlurExpanded: 0,
        panelBlurDefault: 35,
        panelBlurExpanded: 45,
        blurTransitionMs: 400,
        expandDuration: 420,
        collapseDuration: 420,
        pulseInterval: 1800,
        pulseScale: 1.04,
        visualizerBars: 3,
        visualizerMaxHeight: 14,
        visualizerMinHeight: 3,
        pillWidth: 46,
        pillHeight: 26,
        expandedWidth: 244,
        targetFPS: 30
    };

    const REFINED_CONFIG = {
        luxury: {
            pillBlurDefault: 28,
            pillBlurExpanded: 0,
            panelBlurDefault: 40,
            panelBlurExpanded: 48,
            saturatePill: 1.5,
            saturatePanel: 1.6,
            expandDuration: 500,
            collapseDuration: 480,
            pulseInterval: 2800,
            pulseScale: 1.05,
            visualizerBars: 5,
            visualizerMaxHeight: 18,
            visualizerMinHeight: 3,
            pillWidth: 58,
            pillHeight: 32,
            expandedWidth: 264,
            targetFPS: 30,
            gold: '#d4af37',
            goldLight: '#f0d060',
            deepBrown: '#2a1f14',
            cream: '#faf5e4',
            goldBorder: 'rgba(212,175,55,0.45)',
            goldGlow: 'rgba(212,175,55,0.35)',
            goldInner: 'rgba(212,175,55,0.08)',
        },
        minimal: {
            pillBlurDefault: 0,
            pillBlurExpanded: 0,
            panelBlurDefault: 0,
            panelBlurExpanded: 0,
            saturatePill: 1,
            saturatePanel: 1,
            expandDuration: 300,
            collapseDuration: 280,
            pulseInterval: 0,
            pulseScale: 1,
            visualizerBars: 3,
            visualizerMaxHeight: 10,
            visualizerMinHeight: 2,
            pillWidth: 52,
            pillHeight: 28,
            expandedWidth: 256,
            targetFPS: 20,
            border: 'rgba(255,255,255,0.08)',
            borderActive: 'rgba(255,255,255,0.15)',
            barColor: 'rgba(255,255,255,0.5)',
            accent: '#ffffff',
            textPrimary: 'rgba(255,255,255,0.9)',
            textSecondary: 'rgba(255,255,255,0.5)',
        },
        glassmorphism: {
            pillBlurDefault: 20,
            pillBlurExpanded: 0,
            panelBlurDefault: 24,
            panelBlurExpanded: 28,
            saturatePill: 1.8,
            saturatePanel: 1.9,
            expandDuration: 480,
            collapseDuration: 460,
            pulseInterval: 3200,
            pulseScale: 1.03,
            visualizerBars: 4,
            visualizerMaxHeight: 16,
            visualizerMinHeight: 3,
            pillWidth: 56,
            pillHeight: 30,
            expandedWidth: 262,
            targetFPS: 30,
            gradientStart: 'rgba(99,102,241,0.4)',
            gradientEnd: 'rgba(168,85,247,0.4)',
            barGradient: ['#818cf8', '#a78bfa', '#c084fc', '#e879f9'],
            glowColor: 'rgba(139,92,246,0.4)',
            borderGlow: 'rgba(255,255,255,0.12)',
        },
        cyberpunk: {
            pillBlurDefault: 15,
            pillBlurExpanded: 0,
            panelBlurDefault: 20,
            panelBlurExpanded: 25,
            saturatePill: 2.0,
            saturatePanel: 2.2,
            expandDuration: 350,
            collapseDuration: 340,
            pulseInterval: 1200,
            pulseScale: 1.06,
            visualizerBars: 6,
            visualizerMaxHeight: 20,
            visualizerMinHeight: 4,
            pillWidth: 60,
            pillHeight: 34,
            expandedWidth: 270,
            targetFPS: 30,
            neonCyan: '#00f0ff',
            neonPink: '#ff0080',
            neonPurple: '#bf00ff',
            darkBg: '#0a0a0f',
            gridColor: 'rgba(0,240,255,0.3)',
            glowCyan: 'rgba(0,240,255,0.5)',
            glowPink: 'rgba(255,0,128,0.5)',
            borderGlow: 'rgba(0,240,255,0.4)',
        },
    };

    // ========== State ==========
    let currentStyle = 'luxury';
    let isRefinedMode = false;

    // DOM references
    let island = null;
    let pill = null;
    let expanded = null;
    let cover = null;
    let songName = null;
    let artistName = null;

    // Animation state
    let isExpanded = false;
    let isPlaying = false;
    let pulseTimer = null;
    let pulseTimeout = null;
    let blurTimeout = null;
    let visualizerRAF = null;
    let collapseAnimListener = null;
    let currentBlurState = 'pill';

    // Visualizer DOM
    let visualizerContainer = null;
    let visualizerBars = [];
    let visualizerPhase = 0;
    let lastFrameTime = 0;
    let currentFPS = 30;

    // Mouse tracking
    let mouseTrackingAttached = false;

    // MutationObserver reference
    let stateObserver = null;
    let songObserver = null;

    // ========== Initialization ==========

    function init() {
        island = document.getElementById('music-island');
        if (!island) return;

        pill = document.getElementById('island-pill');
        expanded = document.getElementById('island-expanded');
        cover = document.querySelector('.island-cover');
        songName = document.querySelector('.island-song');
        artistName = document.querySelector('.island-artist');

        injectVisualizer();
        applyBlur('pill');
        observeState();
        setupMouseTracking();
        observeSongChange();

        if (island.closest('[data-perf="on"]') || document.documentElement.getAttribute('data-perf') === 'on') {
            enableRefinedMode();
        }
    }

    // ========== State Observer ==========

    function observeState() {
        if (stateObserver) stateObserver.disconnect();

        stateObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') continue;
                const classList = mutation.target.classList;

                const wasExpanded = isExpanded;
                isExpanded = classList.contains('expanded');

                if (isExpanded && !wasExpanded) {
                    if (isRefinedMode) {
                        Refined.onExpand();
                    } else {
                        Standard.onExpand();
                    }
                } else if (!isExpanded && wasExpanded) {
                    if (isRefinedMode) {
                        Refined.onCollapse();
                    } else {
                        Standard.onCollapse();
                    }
                }

                const wasPlaying = isPlaying;
                isPlaying = classList.contains('playing');

                if (isPlaying && !wasPlaying) {
                    if (isRefinedMode) {
                        Refined.onPlayStart();
                    } else {
                        Standard.onPlayStart();
                    }
                } else if (!isPlaying && wasPlaying) {
                    if (isRefinedMode) {
                        Refined.onPlayStop();
                    } else {
                        Standard.onPlayStop();
                    }
                }
            }
        });

        stateObserver.observe(island, { attributes: true, attributeFilter: ['class'] });
    }

    // ========== Mode Switching ==========

    function setRefinedStyle(style) {
        if (!REFINED_CONFIG[style]) return;

        const wasPlaying = isPlaying;

        if (isRefinedMode) {
            Refined.onPlayStop();
        } else {
            Standard.onPlayStop();
        }

        currentStyle = style;
        restyleVisualizer();
        Refined[currentStyle].applyThemeColors();
        applyBlur(currentBlurState);
        updateMouseTracking();

        if (wasPlaying) {
            if (isRefinedMode) {
                Refined.onPlayStart();
            } else {
                Standard.onPlayStart();
            }
        }
    }

    function enableRefinedMode() {
        if (isRefinedMode) return;

        const wasPlaying = isPlaying;

        Standard.onPlayStop();
        isRefinedMode = true;

        Refined[currentStyle].applyThemeColors();
        restyleVisualizer();
        applyBlur(currentBlurState);
        updateMouseTracking();

        if (wasPlaying) {
            Refined.onPlayStart();
        }
    }

    function disableRefinedMode() {
        if (!isRefinedMode) return;

        const wasPlaying = isPlaying;

        Refined.onPlayStop();
        isRefinedMode = false;

        clearRefinedTheme();
        restyleVisualizer();
        applyBlur(currentBlurState);
        updateMouseTracking();

        if (wasPlaying) {
            Standard.onPlayStart();
        }
    }

    function updateMouseTracking() {
        const shouldTrack = !isRefinedMode || currentStyle === 'glassmorphism' || currentStyle === 'cyberpunk';
        if (shouldTrack && !mouseTrackingAttached) {
            attachMouseTracking();
        } else if (!shouldTrack && mouseTrackingAttached) {
            detachMouseTracking();
        }
    }

    // ========== Visualizer Injection ==========

    function injectVisualizer() {
        if (!pill || visualizerContainer) return;

        visualizerContainer = document.createElement('div');
        visualizerContainer.className = 'island-visualizer';
        visualizerContainer.style.cssText = `
            display: flex; align-items: flex-end; gap: 2px;
            height: ${STANDARD_CONFIG.visualizerMaxHeight}px; padding: 0 2px;
            opacity: 0; transition: opacity 0.3s ease;
            will-change: height;
            transform: translateZ(0);
        `;

        const maxBars = 6;
        for (let i = 0; i < maxBars; i++) {
            const bar = document.createElement('div');
            bar.className = 'island-vis-bar';
            bar.style.cssText = `
                width: 2.5px; border-radius: 1px;
                background: var(--accent);
                height: ${STANDARD_CONFIG.visualizerMinHeight}px;
                display: none;
                will-change: height;
                transform: translateZ(0);
            `;
            visualizerBars.push(bar);
            visualizerContainer.appendChild(bar);
        }

        pill.appendChild(visualizerContainer);
    }

    function restyleVisualizer() {
        const cfg = isRefinedMode ? REFINED_CONFIG[currentStyle] : STANDARD_CONFIG;
        const barCount = cfg.visualizerBars;

        for (let i = 0; i < visualizerBars.length; i++) {
            visualizerBars[i].style.display = i < barCount ? '' : 'none';
        }

        if (visualizerContainer) {
            visualizerContainer.style.height = `${cfg.visualizerMaxHeight}px`;
        }

        if (isRefinedMode) {
            if (currentStyle === 'luxury') {
                for (let i = 0; i < barCount; i++) {
                    visualizerBars[i].style.width = '2.5px';
                    visualizerBars[i].style.background = `linear-gradient(to top, ${REFINED_CONFIG.luxury.gold}, ${REFINED_CONFIG.luxury.cream})`;
                    visualizerBars[i].style.borderRadius = '1.5px';
                }
            } else if (currentStyle === 'minimal') {
                for (let i = 0; i < barCount; i++) {
                    visualizerBars[i].style.width = '1.5px';
                    visualizerBars[i].style.background = REFINED_CONFIG.minimal.barColor;
                    visualizerBars[i].style.borderRadius = '1px';
                }
            } else if (currentStyle === 'glassmorphism') {
                const colors = REFINED_CONFIG.glassmorphism.barGradient;
                for (let i = 0; i < barCount; i++) {
                    visualizerBars[i].style.width = '2.5px';
                    visualizerBars[i].style.background = colors[i % colors.length];
                    visualizerBars[i].style.borderRadius = '1.5px';
                }
            } else if (currentStyle === 'cyberpunk') {
                const cyberColors = [REFINED_CONFIG.cyberpunk.neonCyan, REFINED_CONFIG.cyberpunk.neonPink, REFINED_CONFIG.cyberpunk.neonPurple];
                for (let i = 0; i < barCount; i++) {
                    visualizerBars[i].style.width = '2px';
                    visualizerBars[i].style.background = cyberColors[i % cyberColors.length];
                    visualizerBars[i].style.borderRadius = '2px';
                    visualizerBars[i].style.boxShadow = `0 0 6px ${cyberColors[i % cyberColors.length]}`;
                }
            }
        } else {
            for (let i = 0; i < barCount; i++) {
                visualizerBars[i].style.width = '2.5px';
                visualizerBars[i].style.background = 'var(--accent)';
                visualizerBars[i].style.borderRadius = '1px';
            }
        }
    }

    // ========== Mouse Tracking ==========

    function attachMouseTracking() {
        if (!island || mouseTrackingAttached) return;
        island.addEventListener('mouseenter', onMouseEnter);
        island.addEventListener('mouseleave', onMouseLeave);
        mouseTrackingAttached = true;
    }

    function detachMouseTracking() {
        if (!island || !mouseTrackingAttached) return;
        island.removeEventListener('mouseenter', onMouseEnter);
        island.removeEventListener('mouseleave', onMouseLeave);
        mouseTrackingAttached = false;
    }

    function setupMouseTracking() {
        attachMouseTracking();
    }

    function onMouseEnter() {
        if (isRefinedMode) {
            if (currentStyle === 'glassmorphism') {
                const cfg = REFINED_CONFIG.glassmorphism;
                if (!isExpanded && pill) {
                    pill.style.backdropFilter = `blur(${cfg.pillBlurDefault + 10}px) saturate(${cfg.saturatePill + 0.2})`;
                }
            } else if (currentStyle === 'cyberpunk') {
                const cfg = REFINED_CONFIG.cyberpunk;
                if (!isExpanded && pill) {
                    pill.style.backdropFilter = `blur(${cfg.pillBlurDefault + 8}px) saturate(${cfg.saturatePill + 0.3})`;
                    pill.style.boxShadow = `0 0 20px ${cfg.glowCyan}, 0 0 40px ${cfg.glowPink}`;
                }
            }
        } else {
            if (!isExpanded && pill) {
                pill.style.backdropFilter = `blur(${STANDARD_CONFIG.pillBlurDefault + 10}px) saturate(1.6)`;
            }
        }
    }

    function onMouseLeave() {
        applyBlur(currentBlurState);
    }

    // ========== Song Change Observer ==========

    function observeSongChange() {
        if (!songName) return;

        if (songObserver) songObserver.disconnect();

        songObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.target === songName && songName) {
                    songName.style.opacity = '0';
                    songName.style.transform = 'translateY(4px)';
                    requestAnimationFrame(() => {
                        if (!songName) return;
                        requestAnimationFrame(() => {
                            if (songName) {
                                songName.style.opacity = '1';
                                songName.style.transform = 'translateY(0)';
                            }
                        });
                    });
                }
            }
        });

        songObserver.observe(songName, { childList: true });

        if (songName) {
            songName.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        }
        if (artistName) {
            artistName.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        }
    }

    // ========== Cleanup Helpers ==========

    function cleanupCollapseAnimation() {
        if (collapseAnimListener) {
            if (expanded) expanded.removeEventListener('animationend', collapseAnimListener);
            if (pill) pill.removeEventListener('animationend', collapseAnimListener);
            collapseAnimListener = null;
        }
        if (island) island.classList.remove('collapsing');
        if (expanded) {
            expanded.classList.remove('collapsing');
            expanded.style.transform = '';
            expanded.style.opacity = '';
            expanded.style.backdropFilter = '';
        }
        if (pill) {
            pill.classList.remove('restoring');
            pill.style.transform = '';
            pill.style.opacity = '';
            pill.style.backdropFilter = '';
        }
    }

    function stopAllTimers() {
        if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
        if (pulseTimeout) { clearTimeout(pulseTimeout); pulseTimeout = null; }
        if (blurTimeout) { clearTimeout(blurTimeout); blurTimeout = null; }
        if (visualizerRAF) { cancelAnimationFrame(visualizerRAF); visualizerRAF = null; }
    }

    // ========== Standard Mode ==========

    const Standard = {
        applyBlur(state) {
            currentBlurState = state;
            if (pill) {
                const blur = state === 'panel' ? STANDARD_CONFIG.pillBlurExpanded : STANDARD_CONFIG.pillBlurDefault;
                pill.style.backdropFilter = `blur(${blur}px) saturate(1.4)`;
            }
            if (expanded) {
                const blur = state === 'panel' ? STANDARD_CONFIG.panelBlurExpanded : STANDARD_CONFIG.panelBlurDefault;
                expanded.style.backdropFilter = `blur(${blur}px) saturate(1.5)`;
            }
        },

        onExpand() {
            cleanupCollapseAnimation();
            clearTimeout(blurTimeout);
            this.applyBlur('panel');
        },

        onCollapse() {
            if (!expanded || !pill) return;
            cleanupCollapseAnimation();
            clearTimeout(blurTimeout);

            island.classList.add('collapsing');
            expanded.classList.add('collapsing');
            pill.classList.add('restoring');

            collapseAnimListener = (e) => {
                if (e.target !== expanded && e.target !== pill) return;
                e.target.removeEventListener('animationend', collapseAnimListener);

                island.classList.remove('collapsing');
                expanded.classList.remove('collapsing');
                pill.classList.remove('restoring');

                expanded.style.transform = '';
                expanded.style.opacity = '';
                expanded.style.backdropFilter = '';
                pill.style.transform = '';
                pill.style.opacity = '';
                pill.style.backdropFilter = '';

                collapseAnimListener = null;
                this.applyBlur('pill');
            };

            expanded.addEventListener('animationend', collapseAnimListener);
            pill.addEventListener('animationend', collapseAnimListener);
        },

        onPlayStart() {
            this.startPulse();
            this.startVisualizer();
        },

        onPlayStop() {
            this.stopPulse();
            this.stopVisualizer();
        },

        startPulse() {
            this.stopPulse();
            if (!pill) return;

            pulseTimer = setInterval(() => {
                if (!isPlaying || isExpanded) return;
                pill.style.setProperty('transition', 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)', 'important');
                pill.style.transform = `scale(${STANDARD_CONFIG.pulseScale})`;

                pulseTimeout = setTimeout(() => {
                    if (!pill) return;
                    pill.style.transform = 'scale(1)';
                }, 400);
            }, STANDARD_CONFIG.pulseInterval);
        },

        stopPulse() {
            if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
            if (pulseTimeout) { clearTimeout(pulseTimeout); pulseTimeout = null; }
            if (pill) {
                pill.style.transform = '';
                const current = pill.style.transition || '';
                const kept = current.split(',').filter(t => t.includes('backdrop-filter')).join(',').trim();
                if (kept) {
                    pill.style.transition = kept;
                } else {
                    pill.style.removeProperty('transition');
                }
            }
        },

        startVisualizer() {
            this.stopVisualizer();
            if (!visualizerContainer) return;

            visualizerContainer.style.opacity = '1';
            visualizerPhase = 0;
            lastFrameTime = 0;
            currentFPS = STANDARD_CONFIG.targetFPS;

            const icon = pill.querySelector('.island-icon');
            if (icon) icon.style.opacity = '0';

            const FRAME_INTERVAL = 1000 / currentFPS;
            const self = this;

            function tick(now) {
                if (!isPlaying) { self.stopVisualizer(); return; }

                if (now - lastFrameTime < FRAME_INTERVAL) {
                    visualizerRAF = requestAnimationFrame(tick);
                    return;
                }
                lastFrameTime = now;

                visualizerPhase += 0.08;
                const barCount = Math.min(visualizerBars.length, STANDARD_CONFIG.visualizerBars);
                for (let i = 0; i < barCount; i++) {
                    if (!visualizerBars[i]) continue;
                    const base = Math.sin(visualizerPhase + i * 1.8) * 0.5 + 0.5;
                    const noise = Math.sin(visualizerPhase * 2.3 + i * 3.7) * 0.3;
                    const t = Math.max(0, Math.min(1, base + noise));
                    const height = STANDARD_CONFIG.visualizerMinHeight +
                        t * (STANDARD_CONFIG.visualizerMaxHeight - STANDARD_CONFIG.visualizerMinHeight);
                    visualizerBars[i].style.height = `${height}px`;
                }

                visualizerRAF = requestAnimationFrame(tick);
            }

            visualizerRAF = requestAnimationFrame(tick);
        },

        stopVisualizer() {
            if (visualizerRAF) { cancelAnimationFrame(visualizerRAF); visualizerRAF = null; }

            if (visualizerContainer) {
                visualizerContainer.style.opacity = '0';
                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '';
            }

            for (const bar of visualizerBars) {
                bar.style.height = `${STANDARD_CONFIG.visualizerMinHeight}px`;
            }
        },
    };

    // ========== Refined Mode ==========

    const Refined = {
        applyBlur(state) {
            currentBlurState = state;
            const cfg = REFINED_CONFIG[currentStyle];

            if (currentStyle === 'minimal') {
                return;
            }

            if (pill) {
                const blur = state === 'panel' ? cfg.pillBlurExpanded : cfg.pillBlurDefault;
                pill.style.backdropFilter = `blur(${blur}px) saturate(${cfg.saturatePill})`;
            }
            if (expanded) {
                const blur = state === 'panel' ? cfg.panelBlurExpanded : cfg.panelBlurDefault;
                expanded.style.backdropFilter = `blur(${blur}px) saturate(${cfg.saturatePanel})`;
            }
        },

        onExpand() {
            cleanupCollapseAnimation();
            clearTimeout(blurTimeout);
            this.applyBlur('panel');
        },

        onCollapse() {
            if (!expanded || !pill) return;

            cleanupCollapseAnimation();
            clearTimeout(blurTimeout);

            island.classList.add('collapsing');
            expanded.classList.add('collapsing');
            pill.classList.add('restoring');

            const self = this;
            collapseAnimListener = (e) => {
                if (e.target !== expanded && e.target !== pill) return;
                e.target.removeEventListener('animationend', collapseAnimListener);

                island.classList.remove('collapsing');
                expanded.classList.remove('collapsing');
                pill.classList.remove('restoring');

                expanded.style.transform = '';
                expanded.style.opacity = '';
                expanded.style.backdropFilter = '';
                pill.style.transform = '';
                pill.style.opacity = '';
                pill.style.backdropFilter = '';

                collapseAnimListener = null;
                self.applyBlur('pill');
            };

            expanded.addEventListener('animationend', collapseAnimListener);
            pill.addEventListener('animationend', collapseAnimListener);
        },

        onPlayStart() {
            this[currentStyle].startPulse();
            this[currentStyle].startVisualizer();
        },

        onPlayStop() {
            this[currentStyle].stopPulse();
            this[currentStyle].stopVisualizer();
        },

        // ---- Luxury Style ----
        luxury: {
            applyThemeColors() {
                const cfg = REFINED_CONFIG.luxury;
                if (!pill || !expanded) return;

                pill.style.width = `${cfg.pillWidth}px`;
                pill.style.height = `${cfg.pillHeight}px`;
                pill.style.border = `1.5px solid ${cfg.goldBorder}`;
                pill.style.boxShadow = `
                    0 0 12px ${cfg.goldGlow},
                    0 0 24px rgba(212,175,55,0.12),
                    inset 0 1px 0 rgba(255,255,255,0.06),
                    inset 0 0 12px ${cfg.goldInner}
                `;
                pill.style.background = 'linear-gradient(145deg, rgba(60,42,20,0.85), rgba(35,25,12,0.92))';

                expanded.style.width = `${cfg.expandedWidth}px`;
                expanded.style.background = 'linear-gradient(160deg, rgba(42,31,20,0.92), rgba(26,18,10,0.96))';
                expanded.style.border = `1px solid ${cfg.goldBorder}`;
                expanded.style.boxShadow = `
                    0 20px 60px rgba(0,0,0,0.4),
                    0 0 0 0.5px rgba(212,175,55,0.2),
                    0 0 30px rgba(212,175,55,0.08),
                    inset 0 1px 0 rgba(212,175,55,0.1)
                `;

                if (songName) {
                    songName.style.fontWeight = '600';
                    songName.style.letterSpacing = '0.3px';
                    songName.style.color = cfg.cream;
                }
                if (artistName) {
                    artistName.style.fontWeight = '400';
                    artistName.style.letterSpacing = '0.2px';
                    artistName.style.color = 'rgba(212,175,55,0.6)';
                }
                if (cover) {
                    cover.style.boxShadow = `0 0 16px rgba(212,175,55,0.2), 0 0 4px rgba(212,175,55,0.3)`;
                    cover.style.border = '1px solid rgba(212,175,55,0.2)';
                }
            },

            startPulse() {
                Refined.luxury.stopPulse();
                if (!pill) return;

                const cfg = REFINED_CONFIG.luxury;

                pulseTimer = setInterval(() => {
                    if (!isPlaying || isExpanded) return;
                    pill.style.setProperty('transition', 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.6s ease', 'important');
                    pill.style.transform = `scale(${cfg.pulseScale})`;
                    pill.style.boxShadow = `
                        0 0 20px ${cfg.goldGlow},
                        0 0 40px rgba(212,175,55,0.18),
                        inset 0 1px 0 rgba(255,255,255,0.08),
                        inset 0 0 16px ${cfg.goldInner}
                    `;

                    pulseTimeout = setTimeout(() => {
                        if (!pill) return;
                        pill.style.transform = 'scale(1)';
                        pill.style.boxShadow = `
                            0 0 12px ${cfg.goldGlow},
                            0 0 24px rgba(212,175,55,0.12),
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            inset 0 0 12px ${cfg.goldInner}
                        `;
                    }, 600);
                }, cfg.pulseInterval);
            },

            stopPulse() {
                if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
                if (pulseTimeout) { clearTimeout(pulseTimeout); pulseTimeout = null; }
                if (pill) {
                    pill.style.transform = '';
                    const cfg = REFINED_CONFIG.luxury;
                    pill.style.boxShadow = `
                        0 0 12px ${cfg.goldGlow},
                        0 0 24px rgba(212,175,55,0.12),
                        inset 0 1px 0 rgba(255,255,255,0.06),
                        inset 0 0 12px ${cfg.goldInner}
                    `;
                }
            },

            startVisualizer() {
                Refined.luxury.stopVisualizer();
                if (!visualizerContainer) return;

                const cfg = REFINED_CONFIG.luxury;
                visualizerContainer.style.opacity = '1';
                visualizerPhase = 0;
                lastFrameTime = 0;
                currentFPS = cfg.targetFPS;

                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '0';

                const FRAME_INTERVAL = 1000 / currentFPS;

                function tick(now) {
                    if (!isPlaying) { Refined.luxury.stopVisualizer(); return; }

                    if (now - lastFrameTime < FRAME_INTERVAL) {
                        visualizerRAF = requestAnimationFrame(tick);
                        return;
                    }
                    lastFrameTime = now;

                    visualizerPhase += 0.06;
                    for (let i = 0; i < cfg.visualizerBars; i++) {
                        const base = Math.sin(visualizerPhase + i * 1.2) * 0.5 + 0.5;
                        const secondary = Math.sin(visualizerPhase * 0.7 + i * 2.1) * 0.2;
                        const t = Math.max(0, Math.min(1, base + secondary));
                        const height = cfg.visualizerMinHeight +
                            t * (cfg.visualizerMaxHeight - cfg.visualizerMinHeight);
                        visualizerBars[i].style.height = `${height}px`;
                    }

                    visualizerRAF = requestAnimationFrame(tick);
                }

                visualizerRAF = requestAnimationFrame(tick);
            },

            stopVisualizer() {
                if (visualizerRAF) { cancelAnimationFrame(visualizerRAF); visualizerRAF = null; }

                if (visualizerContainer) {
                    visualizerContainer.style.opacity = '0';
                    const icon = pill.querySelector('.island-icon');
                    if (icon) icon.style.opacity = '';
                }

                const cfg = REFINED_CONFIG.luxury;
                for (let i = 0; i < cfg.visualizerBars; i++) {
                    if (visualizerBars[i]) {
                        visualizerBars[i].style.height = `${cfg.visualizerMinHeight}px`;
                    }
                }
            },
        },

        // ---- Minimal Style ----
        minimal: {
            applyThemeColors() {
                const cfg = REFINED_CONFIG.minimal;
                if (!pill || !expanded) return;

                pill.style.width = `${cfg.pillWidth}px`;
                pill.style.height = `${cfg.pillHeight}px`;
                pill.style.border = `1px solid ${cfg.border}`;
                pill.style.backdropFilter = 'none';
                pill.style.boxShadow = 'none';
                pill.style.background = 'rgba(255,255,255,0.04)';

                expanded.style.width = `${cfg.expandedWidth}px`;
                expanded.style.backdropFilter = 'none';
                expanded.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';
                expanded.style.background = 'rgba(255,255,255,0.03)';
                expanded.style.border = `1px solid ${cfg.border}`;

                if (songName) {
                    songName.style.fontWeight = '300';
                    songName.style.letterSpacing = '1px';
                    songName.style.color = cfg.textPrimary;
                }
                if (artistName) {
                    artistName.style.fontWeight = '200';
                    artistName.style.letterSpacing = '0.8px';
                    artistName.style.color = cfg.textSecondary;
                }
                if (cover) {
                    cover.style.boxShadow = 'none';
                    cover.style.border = 'none';
                }
            },

            startPulse() {},
            stopPulse() {},
            startVisualizer() {
                Refined.minimal.stopVisualizer();
                if (!visualizerContainer) return;

                const cfg = REFINED_CONFIG.minimal;
                visualizerContainer.style.opacity = '1';
                visualizerPhase = 0;
                lastFrameTime = 0;
                currentFPS = cfg.targetFPS;

                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '0';

                const FRAME_INTERVAL = 1000 / currentFPS;

                function tick(now) {
                    if (!isPlaying) { Refined.minimal.stopVisualizer(); return; }

                    if (now - lastFrameTime < FRAME_INTERVAL) {
                        visualizerRAF = requestAnimationFrame(tick);
                        return;
                    }
                    lastFrameTime = now;

                    visualizerPhase += 0.04;
                    for (let i = 0; i < cfg.visualizerBars; i++) {
                        const base = Math.sin(visualizerPhase + i * 1.5) * 0.5 + 0.5;
                        const t = Math.max(0, Math.min(1, base * 0.6));
                        const height = cfg.visualizerMinHeight +
                            t * (cfg.visualizerMaxHeight - cfg.visualizerMinHeight);
                        visualizerBars[i].style.height = `${height}px`;
                    }

                    visualizerRAF = requestAnimationFrame(tick);
                }

                visualizerRAF = requestAnimationFrame(tick);
            },

            stopVisualizer() {
                if (visualizerRAF) { cancelAnimationFrame(visualizerRAF); visualizerRAF = null; }

                if (visualizerContainer) {
                    visualizerContainer.style.opacity = '0';
                    const icon = pill.querySelector('.island-icon');
                    if (icon) icon.style.opacity = '';
                }

                const cfg = REFINED_CONFIG.minimal;
                for (let i = 0; i < cfg.visualizerBars; i++) {
                    if (visualizerBars[i]) {
                        visualizerBars[i].style.height = `${cfg.visualizerMinHeight}px`;
                    }
                }
            },
        },

        // ---- Glassmorphism Style ----
        glassmorphism: {
            applyThemeColors() {
                const cfg = REFINED_CONFIG.glassmorphism;
                if (!pill || !expanded) return;

                pill.style.width = `${cfg.pillWidth}px`;
                pill.style.height = `${cfg.pillHeight}px`;
                pill.style.border = `1px solid ${cfg.borderGlow}`;
                pill.style.background = `linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))`;
                pill.style.boxShadow = `
                    0 4px 20px rgba(0,0,0,0.15),
                    0 0 16px ${cfg.glowColor},
                    inset 0 1px 0 rgba(255,255,255,0.1)
                `;

                expanded.style.width = `${cfg.expandedWidth}px`;
                expanded.style.background = `linear-gradient(145deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08), rgba(236,72,153,0.04))`;
                expanded.style.border = `1px solid ${cfg.borderGlow}`;
                expanded.style.boxShadow = `
                    0 20px 60px rgba(0,0,0,0.25),
                    0 0 24px rgba(139,92,246,0.15),
                    0 0 0 0.5px rgba(139,92,246,0.2),
                    inset 0 1px 0 rgba(255,255,255,0.08)
                `;

                if (songName) {
                    songName.style.fontWeight = '500';
                    songName.style.color = '#ffffff';
                    songName.style.letterSpacing = '0.2px';
                }
                if (artistName) {
                    artistName.style.fontWeight = '400';
                    artistName.style.color = 'rgba(255,255,255,0.6)';
                    artistName.style.letterSpacing = '0.1px';
                }
                if (cover) {
                    cover.style.backdropFilter = 'blur(6px)';
                    cover.style.boxShadow = `0 0 20px rgba(139,92,246,0.25), 0 0 8px rgba(99,102,241,0.15)`;
                    cover.style.border = '1px solid rgba(255,255,255,0.1)';
                }
            },

            startPulse() {
                Refined.glassmorphism.stopPulse();
                if (!pill) return;

                const cfg = REFINED_CONFIG.glassmorphism;

                pulseTimer = setInterval(() => {
                    if (!isPlaying || isExpanded) return;
                    pill.style.setProperty('transition', 'transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.7s ease', 'important');
                    pill.style.transform = `scale(${cfg.pulseScale})`;
                    pill.style.boxShadow = `
                        0 4px 24px rgba(0,0,0,0.18),
                        0 0 24px ${cfg.glowColor},
                        0 0 8px rgba(99,102,241,0.2),
                        inset 0 1px 0 rgba(255,255,255,0.12)
                    `;

                    pulseTimeout = setTimeout(() => {
                        if (!pill) return;
                        pill.style.transform = 'scale(1)';
                        pill.style.boxShadow = `
                            0 4px 20px rgba(0,0,0,0.15),
                            0 0 16px ${cfg.glowColor},
                            inset 0 1px 0 rgba(255,255,255,0.1)
                        `;
                    }, 700);
                }, cfg.pulseInterval);
            },

            stopPulse() {
                if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
                if (pulseTimeout) { clearTimeout(pulseTimeout); pulseTimeout = null; }
                if (pill) {
                    pill.style.transform = '';
                    const cfg = REFINED_CONFIG.glassmorphism;
                    pill.style.boxShadow = `
                        0 4px 20px rgba(0,0,0,0.15),
                        0 0 16px ${cfg.glowColor},
                        inset 0 1px 0 rgba(255,255,255,0.1)
                    `;
                }
            },

            startVisualizer() {
                Refined.glassmorphism.stopVisualizer();
                if (!visualizerContainer) return;

                const cfg = REFINED_CONFIG.glassmorphism;
                visualizerContainer.style.opacity = '1';
                visualizerPhase = 0;
                lastFrameTime = 0;
                currentFPS = cfg.targetFPS;

                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '0';

                const FRAME_INTERVAL = 1000 / currentFPS;

                function tick(now) {
                    if (!isPlaying) { Refined.glassmorphism.stopVisualizer(); return; }

                    if (now - lastFrameTime < FRAME_INTERVAL) {
                        visualizerRAF = requestAnimationFrame(tick);
                        return;
                    }
                    lastFrameTime = now;

                    visualizerPhase += 0.07;
                    for (let i = 0; i < cfg.visualizerBars; i++) {
                        const base = Math.sin(visualizerPhase + i * 1.4) * 0.5 + 0.5;
                        const wave = Math.sin(visualizerPhase * 0.8 + i * 2.5) * 0.25;
                        const t = Math.max(0, Math.min(1, base + wave));
                        const height = cfg.visualizerMinHeight +
                            t * (cfg.visualizerMaxHeight - cfg.visualizerMinHeight);
                        visualizerBars[i].style.height = `${height}px`;
                    }

                    visualizerRAF = requestAnimationFrame(tick);
                }

                visualizerRAF = requestAnimationFrame(tick);
            },

            stopVisualizer() {
                if (visualizerRAF) { cancelAnimationFrame(visualizerRAF); visualizerRAF = null; }

                if (visualizerContainer) {
                    visualizerContainer.style.opacity = '0';
                    const icon = pill.querySelector('.island-icon');
                    if (icon) icon.style.opacity = '';
                }

                const cfg = REFINED_CONFIG.glassmorphism;
                for (let i = 0; i < cfg.visualizerBars; i++) {
                    if (visualizerBars[i]) {
                        visualizerBars[i].style.height = `${cfg.visualizerMinHeight}px`;
                    }
                }
            },
        },

        // ---- Cyberpunk Style (NEW!) ----
        cyberpunk: {
            applyThemeColors() {
                const cfg = REFINED_CONFIG.cyberpunk;
                if (!pill || !expanded) return;

                pill.style.width = `${cfg.pillWidth}px`;
                pill.style.height = `${cfg.pillHeight}px`;
                pill.style.border = `1.5px solid ${cfg.borderGlow}`;
                pill.style.background = `linear-gradient(135deg, rgba(10,10,15,0.95), rgba(20,20,30,0.9))`;
                pill.style.boxShadow = `
                    0 0 15px ${cfg.glowCyan},
                    0 0 30px ${cfg.glowPink},
                    inset 0 1px 0 rgba(255,255,255,0.1)
                `;

                expanded.style.width = `${cfg.expandedWidth}px`;
                expanded.style.background = `linear-gradient(145deg, rgba(10,10,15,0.95), rgba(15,15,25,0.92))`;
                expanded.style.border = `1px solid ${cfg.borderGlow}`;
                expanded.style.boxShadow = `
                    0 0 20px ${cfg.glowCyan},
                    0 0 40px ${cfg.glowPink},
                    0 20px 60px rgba(0,0,0,0.4),
                    inset 0 1px 0 rgba(0,240,255,0.15)
                `;

                if (songName) {
                    songName.style.fontWeight = '600';
                    songName.style.color = cfg.neonCyan;
                    songName.style.letterSpacing = '0.5px';
                    songName.style.textShadow = `0 0 10px ${cfg.glowCyan}`;
                }
                if (artistName) {
                    artistName.style.fontWeight = '400';
                    artistName.style.color = cfg.neonPink;
                    artistName.style.letterSpacing = '0.3px';
                    artistName.style.textShadow = `0 0 8px ${cfg.glowPink}`;
                }
                if (cover) {
                    cover.style.boxShadow = `
                        0 0 20px ${cfg.glowCyan},
                        0 0 10px ${cfg.glowPink},
                        inset 0 0 15px rgba(0,240,255,0.2)
                    `;
                    cover.style.border = `1px solid ${cfg.borderGlow}`;
                }
            },

            startPulse() {
                Refined.cyberpunk.stopPulse();
                if (!pill) return;

                const cfg = REFINED_CONFIG.cyberpunk;

                pulseTimer = setInterval(() => {
                    if (!isPlaying || isExpanded) return;
                    pill.style.setProperty('transition', 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.5s ease', 'important');
                    pill.style.transform = `scale(${cfg.pulseScale})`;
                    pill.style.boxShadow = `
                        0 0 25px ${cfg.glowCyan},
                        0 0 50px ${cfg.glowPink},
                        0 0 15px rgba(191,0,255,0.3),
                        inset 0 1px 0 rgba(255,255,255,0.15)
                    `;

                    pulseTimeout = setTimeout(() => {
                        if (!pill) return;
                        pill.style.transform = 'scale(1)';
                        pill.style.boxShadow = `
                            0 0 15px ${cfg.glowCyan},
                            0 0 30px ${cfg.glowPink},
                            inset 0 1px 0 rgba(255,255,255,0.1)
                        `;
                    }, 500);
                }, cfg.pulseInterval);
            },

            stopPulse() {
                if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
                if (pulseTimeout) { clearTimeout(pulseTimeout); pulseTimeout = null; }
                if (pill) {
                    pill.style.transform = '';
                    const cfg = REFINED_CONFIG.cyberpunk;
                    pill.style.boxShadow = `
                        0 0 15px ${cfg.glowCyan},
                        0 0 30px ${cfg.glowPink},
                        inset 0 1px 0 rgba(255,255,255,0.1)
                    `;
                }
            },

            startVisualizer() {
                Refined.cyberpunk.stopVisualizer();
                if (!visualizerContainer) return;

                const cfg = REFINED_CONFIG.cyberpunk;
                visualizerContainer.style.opacity = '1';
                visualizerPhase = 0;
                lastFrameTime = 0;
                currentFPS = cfg.targetFPS;

                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '0';

                const FRAME_INTERVAL = 1000 / currentFPS;
                const cyberColors = [cfg.neonCyan, cfg.neonPink, cfg.neonPurple];

                function tick(now) {
                    if (!isPlaying) { Refined.cyberpunk.stopVisualizer(); return; }

                    if (now - lastFrameTime < FRAME_INTERVAL) {
                        visualizerRAF = requestAnimationFrame(tick);
                        return;
                    }
                    lastFrameTime = now;

                    visualizerPhase += 0.1;
                    for (let i = 0; i < cfg.visualizerBars; i++) {
                        const base = Math.sin(visualizerPhase + i * 1.5) * 0.5 + 0.5;
                        const pulse = Math.sin(visualizerPhase * 1.5 + i * 2) * 0.3;
                        const t = Math.max(0, Math.min(1, base + pulse));
                        const height = cfg.visualizerMinHeight +
                            t * (cfg.visualizerMaxHeight - cfg.visualizerMinHeight);

                        visualizerBars[i].style.height = `${height}px`;
                        visualizerBars[i].style.background = cyberColors[i % 3];
                        visualizerBars[i].style.boxShadow = `0 0 8px ${cyberColors[i % 3]}, 0 0 4px ${cyberColors[(i+1)%3]}`;
                    }

                    visualizerRAF = requestAnimationFrame(tick);
                }

                visualizerRAF = requestAnimationFrame(tick);
            },

            stopVisualizer() {
                if (visualizerRAF) { cancelAnimationFrame(visualizerRAF); visualizerRAF = null; }

                if (visualizerContainer) {
                    visualizerContainer.style.opacity = '0';
                    const icon = pill.querySelector('.island-icon');
                    if (icon) icon.style.opacity = '';
                }

                const cfg = REFINED_CONFIG.cyberpunk;
                const cyberColors = [cfg.neonCyan, cfg.neonPink, cfg.neonPurple];
                for (let i = 0; i < cfg.visualizerBars; i++) {
                    if (visualizerBars[i]) {
                        visualizerBars[i].style.height = `${cfg.visualizerMinHeight}px`;
                        visualizerBars[i].style.background = cyberColors[i % 3];
                        visualizerBars[i].style.boxShadow = 'none';
                    }
                }
            },
        },
    };

    // ========== Clear Refined Theme ==========

    function clearRefinedTheme() {
        if (pill) {
            pill.style.width = '';
            pill.style.height = '';
            pill.style.border = '';
            pill.style.background = '';
            pill.style.boxShadow = '';
        }
        if (expanded) {
            expanded.style.width = '';
            expanded.style.background = '';
            expanded.style.border = '';
            expanded.style.boxShadow = '';
        }
        if (songName) {
            songName.style.fontWeight = '';
            songName.style.letterSpacing = '';
            songName.style.color = '';
            songName.style.textShadow = '';
        }
        if (artistName) {
            artistName.style.fontWeight = '';
            artistName.style.letterSpacing = '';
            artistName.style.color = '';
            artistName.style.textShadow = '';
        }
        if (cover) {
            cover.style.backdropFilter = '';
            cover.style.boxShadow = '';
            cover.style.border = '';
        }
    }

    function applyBlur(state) {
        if (isRefinedMode) {
            Refined.applyBlur(state);
        } else {
            Standard.applyBlur(state);
        }
    }

    // ========== Initialization Entry ==========

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ========== Public API ==========

    return {
        init,
        applyBlur,
        setRefinedStyle,
        enableRefinedMode,
        disableRefinedMode,
        getAvailableStyles: () => Object.keys(REFINED_CONFIG),
        getCurrentStyle: () => currentStyle,
        isRefined: () => isRefinedMode,
    };
})();
