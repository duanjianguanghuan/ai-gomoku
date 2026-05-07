/**
 * 灵动岛动画系统 v2
 * 双模式独立动画系统：Standard（标准模式）+ Refined（精炼模式，含 luxury/minimal/glassmorphism 三种子风格）
 * 通过 MutationObserver 监听 MusicIsland 的 CSS class 变化来驱动动画
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
            // Theme colors
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
            // Theme colors
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
            // Theme colors
            gradientStart: 'rgba(99,102,241,0.4)',
            gradientEnd: 'rgba(168,85,247,0.4)',
            barGradient: ['#818cf8', '#a78bfa', '#c084fc', '#e879f9'],
            glowColor: 'rgba(139,92,246,0.4)',
            borderGlow: 'rgba(255,255,255,0.12)',
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

        // Inject visualizer once (DOM structure reused across modes)
        injectVisualizer();

        // Initialize blur (glassmorphism style only)
        applyBlur('pill');

        // Note: backdrop-filter transitions removed for performance
        // Only transform and opacity are animated for 60fps smoothness

        // Observe MusicIsland state changes
        observeState();

        // Mouse tracking (standard mode only by default)
        setupMouseTracking();

        // Song change observer
        observeSongChange();

        // Check initial data-perf attribute
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
        const wasExpanded = isExpanded;

        // Stop current animations
        if (isRefinedMode) {
            Refined.onPlayStop();
        } else {
            Standard.onPlayStop();
        }

        currentStyle = style;

        // Re-style visualizer bars
        restyleVisualizer();

        // Apply theme colors
        Refined[currentStyle].applyThemeColors();

        // Apply blur for current state
        applyBlur(currentBlurState);

        // Update mouse tracking
        updateMouseTracking();

        // Restart animations if needed
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
        const wasExpanded = isExpanded;

        // Stop standard animations
        Standard.onPlayStop();

        isRefinedMode = true;

        // Apply refined theme
        Refined[currentStyle].applyThemeColors();
        restyleVisualizer();
        applyBlur(currentBlurState);
        updateMouseTracking();

        // Restart animations if needed
        if (wasPlaying) {
            Refined.onPlayStart();
        }
    }

    function disableRefinedMode() {
        if (!isRefinedMode) return;

        const wasPlaying = isPlaying;

        // Stop refined animations
        Refined.onPlayStop();

        isRefinedMode = false;

        // Clear refined theme overrides
        clearRefinedTheme();

        // Restore standard visualizer
        restyleVisualizer();
        applyBlur(currentBlurState);
        updateMouseTracking();

        // Restart animations if needed
        if (wasPlaying) {
            Standard.onPlayStart();
        }
    }

    function updateMouseTracking() {
        // Mouse tracking only for standard mode and glassmorphism
        const shouldTrack = !isRefinedMode || currentStyle === 'glassmorphism';
        if (shouldTrack && !mouseTrackingAttached) {
            attachMouseTracking();
        } else if (!shouldTrack && mouseTrackingAttached) {
            detachMouseTracking();
        }
    }

    // ========== Visualizer Injection (shared, DOM created once) ==========

    function injectVisualizer() {
        if (!pill || visualizerContainer) return;

        visualizerContainer = document.createElement('div');
        visualizerContainer.className = 'island-visualizer';
        visualizerContainer.style.cssText = `
            display: flex; align-items: flex-end; gap: 2px;
            height: ${STANDARD_CONFIG.visualizerMaxHeight}px; padding: 0 2px;
            opacity: 0; transition: opacity 0.3s ease;
        `;

        // Create max bars needed (5 for luxury)
        const maxBars = 5;
        for (let i = 0; i < maxBars; i++) {
            const bar = document.createElement('div');
            bar.className = 'island-vis-bar';
            bar.style.cssText = `
                width: 2.5px; border-radius: 1px;
                background: var(--accent);
                height: ${STANDARD_CONFIG.visualizerMinHeight}px;
                display: none;
            `;
            visualizerBars.push(bar);
            visualizerContainer.appendChild(bar);
        }

        pill.appendChild(visualizerContainer);
    }

    function restyleVisualizer() {
        const cfg = isRefinedMode ? REFINED_CONFIG[currentStyle] : STANDARD_CONFIG;

        // Show/hide bars based on count
        const barCount = cfg.visualizerBars;
        for (let i = 0; i < visualizerBars.length; i++) {
            if (i < barCount) {
                visualizerBars[i].style.display = '';
            } else {
                visualizerBars[i].style.display = 'none';
            }
        }

        // Update container height
        if (visualizerContainer) {
            visualizerContainer.style.height = `${cfg.visualizerMaxHeight}px`;
        }

        // Style bars per mode
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
            }
        } else {
            // Standard mode
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
                    pill.style.webkitBackdropFilter = `blur(${cfg.pillBlurDefault + 10}px) saturate(${cfg.saturatePill + 0.2})`;
                }
                if (isExpanded && expanded) {
                    expanded.style.backdropFilter = `blur(${cfg.panelBlurExpanded + 8}px) saturate(${cfg.saturatePanel + 0.2})`;
                    expanded.style.webkitBackdropFilter = `blur(${cfg.panelBlurExpanded + 8}px) saturate(${cfg.saturatePanel + 0.2})`;
                }
            }
            // luxury and minimal don't enhance on hover
        } else {
            if (!isExpanded && pill) {
                pill.style.backdropFilter = `blur(${STANDARD_CONFIG.pillBlurDefault + 10}px) saturate(1.6)`;
                pill.style.webkitBackdropFilter = `blur(${STANDARD_CONFIG.pillBlurDefault + 10}px) saturate(1.6)`;
            }
            if (isExpanded && expanded) {
                expanded.style.backdropFilter = `blur(${STANDARD_CONFIG.panelBlurExpanded + 8}px) saturate(1.7)`;
                expanded.style.webkitBackdropFilter = `blur(${STANDARD_CONFIG.panelBlurExpanded + 8}px) saturate(1.7)`;
            }
        }
    }

    function onMouseLeave() {
        applyBlur(currentBlurState);
    }

    // ========== Song Change Observer (shared) ==========

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

        // Safely set transitions with null checks
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
            expanded.style.webkitBackdropFilter = '';
        }
        if (pill) {
            pill.classList.remove('restoring');
            pill.style.transform = '';
            pill.style.opacity = '';
            pill.style.backdropFilter = '';
            pill.style.webkitBackdropFilter = '';
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
                pill.style.webkitBackdropFilter = `blur(${blur}px) saturate(1.4)`;
            }
            if (expanded) {
                const blur = state === 'panel' ? STANDARD_CONFIG.panelBlurExpanded : STANDARD_CONFIG.panelBlurDefault;
                expanded.style.backdropFilter = `blur(${blur}px) saturate(1.5)`;
                expanded.style.webkitBackdropFilter = `blur(${blur}px) saturate(1.5)`;
            }
        },

        onExpand() {
            // Interrupt any ongoing collapse
            cleanupCollapseAnimation();
            clearTimeout(blurTimeout);

            this.applyBlur('panel');
            blurTimeout = setTimeout(() => {
                // Animation complete, nothing more to do
            }, STANDARD_CONFIG.expandDuration);
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
                expanded.style.webkitBackdropFilter = '';
                pill.style.transform = '';
                pill.style.opacity = '';
                pill.style.backdropFilter = '';
                pill.style.webkitBackdropFilter = '';

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
                // Only remove transform transition, preserve backdrop-filter transition
                const current = pill.style.transition || '';
                const kept = current.split(',').filter(t =>
                    t.includes('backdrop-filter') || t.includes('-webkit-backdrop-filter')
                ).join(',').trim();
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

            const icon = pill.querySelector('.island-icon');
            if (icon) icon.style.opacity = '0';

            const FRAME_INTERVAL = 1000 / 30;
            let lastFrameTime = 0;

            const self = this;
            function tick(now) {
                if (!isPlaying) { self.stopVisualizer(); return; }

                if (now - lastFrameTime < FRAME_INTERVAL) {
                    visualizerRAF = requestAnimationFrame(tick);
                    return;
                }
                lastFrameTime = now;

                visualizerPhase += 0.08;
                // Use array length to prevent out-of-bounds if config changes
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
                // Minimal: no blur at all
                return;
            }

            if (pill) {
                const blur = state === 'panel' ? cfg.pillBlurExpanded : cfg.pillBlurDefault;
                pill.style.backdropFilter = `blur(${blur}px) saturate(${cfg.saturatePill})`;
                pill.style.webkitBackdropFilter = `blur(${blur}px) saturate(${cfg.saturatePill})`;
            }
            if (expanded) {
                const blur = state === 'panel' ? cfg.panelBlurExpanded : cfg.panelBlurDefault;
                expanded.style.backdropFilter = `blur(${blur}px) saturate(${cfg.saturatePanel})`;
                expanded.style.webkitBackdropFilter = `blur(${blur}px) saturate(${cfg.saturatePanel})`;
            }
        },

        onExpand() {
            cleanupCollapseAnimation();
            clearTimeout(blurTimeout);

            this.applyBlur('panel');

            const cfg = REFINED_CONFIG[currentStyle];
            blurTimeout = setTimeout(() => {
                // Animation complete
            }, cfg.expandDuration);
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
                expanded.style.webkitBackdropFilter = '';
                pill.style.transform = '';
                pill.style.opacity = '';
                pill.style.backdropFilter = '';
                pill.style.webkitBackdropFilter = '';

                collapseAnimListener = null;
                self.applyBlur('pill');
            };

            expanded.addEventListener('animationend', collapseAnimListener);
            pill.addEventListener('animationend', collapseAnimListener);
        },

        onPlayStart() {
            // Delegate to current style
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

                // Pill: 金色边框 + 内发光 + 外发光
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

                // Expanded panel: 深棕底 + 金色边框 + 多层阴影
                expanded.style.width = `${cfg.expandedWidth}px`;
                expanded.style.background = 'linear-gradient(160deg, rgba(42,31,20,0.92), rgba(26,18,10,0.96))';
                expanded.style.border = `1px solid ${cfg.goldBorder}`;
                expanded.style.boxShadow = `
                    0 20px 60px rgba(0,0,0,0.4),
                    0 0 0 0.5px rgba(212,175,55,0.2),
                    0 0 30px rgba(212,175,55,0.08),
                    inset 0 1px 0 rgba(212,175,55,0.1)
                `;

                // Font: 衬线感，金色标题
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

                // Cover: 金色光环
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
                    const current = pill.style.transition || '';
                    const kept = current.split(',').filter(t =>
                        t.includes('backdrop-filter') || t.includes('-webkit-backdrop-filter')
                    ).join(',').trim();
                    if (kept) {
                        pill.style.transition = kept;
                    } else {
                        pill.style.removeProperty('transition');
                    }
                }
            },

            startVisualizer() {
                Refined.luxury.stopVisualizer();
                if (!visualizerContainer) return;

                const cfg = REFINED_CONFIG.luxury;
                visualizerContainer.style.opacity = '1';
                visualizerPhase = 0;

                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '0';

                const FRAME_INTERVAL = 1000 / 30;
                let lastFrameTime = 0;

                function tick(now) {
                    if (!isPlaying) { Refined.luxury.stopVisualizer(); return; }

                    if (now - lastFrameTime < FRAME_INTERVAL) {
                        visualizerRAF = requestAnimationFrame(tick);
                        return;
                    }
                    lastFrameTime = now;

                    visualizerPhase += 0.06; // Slower, smoother
                    for (let i = 0; i < cfg.visualizerBars; i++) {
                        // Smooth sine wave for luxury
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

                // Pill: 纯黑/深色 + 极细白边 + 无模糊
                pill.style.width = `${cfg.pillWidth}px`;
                pill.style.height = `${cfg.pillHeight}px`;
                pill.style.border = `1px solid ${cfg.border}`;
                pill.style.backdropFilter = 'none';
                pill.style.webkitBackdropFilter = 'none';
                pill.style.boxShadow = 'none';
                pill.style.background = 'rgba(255,255,255,0.04)';

                // Expanded panel: 纯净无装饰
                expanded.style.width = `${cfg.expandedWidth}px`;
                expanded.style.backdropFilter = 'none';
                expanded.style.webkitBackdropFilter = 'none';
                expanded.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';
                expanded.style.background = 'rgba(255,255,255,0.03)';
                expanded.style.border = `1px solid ${cfg.border}`;

                // Font: 超细字重 + 大字间距
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

                // Cover: 无装饰
                if (cover) {
                    cover.style.boxShadow = 'none';
                    cover.style.border = 'none';
                }
            },

            startPulse() {
                // Minimal: no pulse animation
            },

            stopPulse() {
                // Nothing to clean up
            },

            startVisualizer() {
                Refined.minimal.stopVisualizer();
                if (!visualizerContainer) return;

                const cfg = REFINED_CONFIG.minimal;
                visualizerContainer.style.opacity = '1';
                visualizerPhase = 0;

                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '0';

                const FRAME_INTERVAL = 1000 / 20; // Slower for minimal
                let lastFrameTime = 0;

                function tick(now) {
                    if (!isPlaying) { Refined.minimal.stopVisualizer(); return; }

                    if (now - lastFrameTime < FRAME_INTERVAL) {
                        visualizerRAF = requestAnimationFrame(tick);
                        return;
                    }
                    lastFrameTime = now;

                    visualizerPhase += 0.04; // Very slow, subtle
                    for (let i = 0; i < cfg.visualizerBars; i++) {
                        const base = Math.sin(visualizerPhase + i * 1.5) * 0.5 + 0.5;
                        const t = Math.max(0, Math.min(1, base * 0.6)); // Damped
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

                // Pill: 强模糊 + 紫蓝渐变 + 发光边框
                pill.style.width = `${cfg.pillWidth}px`;
                pill.style.height = `${cfg.pillHeight}px`;
                pill.style.border = `1px solid ${cfg.borderGlow}`;
                pill.style.background = `linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))`;
                pill.style.boxShadow = `
                    0 4px 20px rgba(0,0,0,0.15),
                    0 0 16px ${cfg.glowColor},
                    inset 0 1px 0 rgba(255,255,255,0.1)
                `;

                // Expanded panel: 毛玻璃 + 渐变 + 彩色阴影
                expanded.style.width = `${cfg.expandedWidth}px`;
                expanded.style.background = `linear-gradient(145deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08), rgba(236,72,153,0.04))`;
                expanded.style.border = `1px solid ${cfg.borderGlow}`;
                expanded.style.boxShadow = `
                    0 20px 60px rgba(0,0,0,0.25),
                    0 0 24px rgba(139,92,246,0.15),
                    0 0 0 0.5px rgba(139,92,246,0.2),
                    inset 0 1px 0 rgba(255,255,255,0.08)
                `;

                // Font: 中等字重
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

                // Cover: 彩色玻璃效果
                if (cover) {
                    cover.style.backdropFilter = 'blur(6px)';
                    cover.style.webkitBackdropFilter = 'blur(6px)';
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
                    const current = pill.style.transition || '';
                    const kept = current.split(',').filter(t =>
                        t.includes('backdrop-filter') || t.includes('-webkit-backdrop-filter')
                    ).join(',').trim();
                    if (kept) {
                        pill.style.transition = kept;
                    } else {
                        pill.style.removeProperty('transition');
                    }
                }
            },

            startVisualizer() {
                Refined.glassmorphism.stopVisualizer();
                if (!visualizerContainer) return;

                const cfg = REFINED_CONFIG.glassmorphism;
                visualizerContainer.style.opacity = '1';
                visualizerPhase = 0;

                const icon = pill.querySelector('.island-icon');
                if (icon) icon.style.opacity = '0';

                const FRAME_INTERVAL = 1000 / 30;
                let lastFrameTime = 0;

                function tick(now) {
                    if (!isPlaying) { Refined.glassmorphism.stopVisualizer(); return; }

                    if (now - lastFrameTime < FRAME_INTERVAL) {
                        visualizerRAF = requestAnimationFrame(tick);
                        return;
                    }
                    lastFrameTime = now;

                    visualizerPhase += 0.07;
                    for (let i = 0; i < cfg.visualizerBars; i++) {
                        // Smooth wave with gradient-like progression
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
        }
        if (artistName) {
            artistName.style.fontWeight = '';
            artistName.style.letterSpacing = '';
            artistName.style.color = '';
        }
        if (cover) {
            cover.style.backdropFilter = '';
            cover.style.webkitBackdropFilter = '';
            cover.style.boxShadow = '';
        }
    }

    // ========== Unified applyBlur ==========

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
    };
})();
