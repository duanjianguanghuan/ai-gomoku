/**
 * 灵动岛音乐播放器 v4
 * 100% 纯随机播放 · 防重复机制 · 流畅动画
 * 音乐源：https://60s.viki.moe/v2/changya
 */

const MusicIsland = (() => {
    const MUSIC_API = 'https://60s.viki.moe/v2/changya';

    let audio = null;
    let isExpanded = false;
    let isPlaying = false;
    let isLoading = false;
    let currentUrl = '';
    let progressRAF = null;

    // 防重复：记录最近播放的 URL
    const recentUrls = [];
    const MAX_RECENT = 5;
    let retryCount = 0;
    const MAX_RETRY = 3;

    // DOM 缓存
    let island, pill, expanded;
    let playBtn, iconPlay, iconPause, prevBtn, nextBtn;
    let songName, artistName, progressFill, currentTimeEl, totalTimeEl;
    let progressBar;

    function init() {
        island = document.getElementById('music-island');
        if (!island) return;

        pill = document.getElementById('island-pill');
        expanded = document.getElementById('island-expanded');
        playBtn = document.getElementById('music-play');
        iconPlay = document.getElementById('icon-play');
        iconPause = document.getElementById('icon-pause');
        prevBtn = document.getElementById('music-prev');
        nextBtn = document.getElementById('music-next');
        songName = document.getElementById('island-song');
        artistName = document.getElementById('island-artist');
        progressFill = document.getElementById('music-progress-fill');
        currentTimeEl = document.getElementById('music-current-time');
        totalTimeEl = document.getElementById('music-total-time');
        progressBar = document.getElementById('music-progress');

        audio = new Audio();
        audio.preload = 'auto';
        audio.volume = 0.6;

        // 药丸点击展开
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isExpanded) expand();
        });

        // 面板内阻止冒泡
        expanded.addEventListener('click', (e) => e.stopPropagation());

        // 点击空白收起（包括棋盘、按钮等非灵动岛区域）
        document.addEventListener('click', (e) => {
            if (isExpanded && !island.contains(e.target)) collapse();
        });

        // 触摸空白收起（移动端下棋等触摸操作）
        document.addEventListener('touchstart', (e) => {
            if (isExpanded && !island.contains(e.target)) collapse();
        }, { passive: true });

        // 播放控制
        playBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
        prevBtn.addEventListener('click', (e) => { e.stopPropagation(); playRandom(); });
        nextBtn.addEventListener('click', (e) => { e.stopPropagation(); playRandom(); });
        progressBar.addEventListener('click', (e) => { e.stopPropagation(); onProgressClick(e); });

        // Audio 事件
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onMetadataLoaded);
        audio.addEventListener('error', onError);
        audio.addEventListener('waiting', () => island.classList.add('loading'));
        audio.addEventListener('canplay', () => island.classList.remove('loading'));
    }

    function expand() {
        isExpanded = true;
        island.classList.add('expanded');
        if (!currentUrl) loadNewSong();
    }

    function collapse() {
        isExpanded = false;
        island.classList.remove('expanded');
    }

    function togglePlay() {
        if (!audio || !currentUrl) { loadNewSong(); return; }
        if (isPlaying) audio.pause();
        else audio.play().catch(() => {});
    }

    /**
     * 100% 纯随机播放新歌曲
     * 防重复机制：记录最近播放的 URL，避免连续重复
     */
    function playRandom() {
        retryCount = 0;
        loadNewSong();
    }

    function onPlay() {
        isPlaying = true;
        island.classList.add('playing');
        island.classList.remove('loading');
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
        startProgressRAF();
    }

    function onPause() {
        isPlaying = false;
        island.classList.remove('playing');
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        stopProgressRAF();
    }

    function onEnded() {
        isPlaying = false;
        island.classList.remove('playing');
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        stopProgressRAF();
        // 自动播放下一首随机歌曲
        setTimeout(() => playRandom(), 600);
    }

    function onError() {
        island.classList.remove('loading');
        island.classList.add('error');
        songName.textContent = '加载失败';
        artistName.textContent = '自动重试中...';
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        isPlaying = false;
        stopProgressRAF();
        // 自动重试
        setTimeout(() => {
            island.classList.remove('error');
            playRandom();
        }, 3000);
    }

    /**
     * 加载新歌曲（100% 随机，防重复）
     */
    async function loadNewSong() {
        if (isLoading) return;
        isLoading = true;
        island.classList.add('loading');
        island.classList.remove('error', 'playing');
        songName.textContent = '随机加载中...';
        artistName.textContent = '';
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        isPlaying = false;
        stopProgressRAF();
        progressFill.style.width = '0%';
        currentTimeEl.textContent = '0:00';
        totalTimeEl.textContent = '0:00';

        try {
            const response = await fetch(MUSIC_API);
            if (!response.ok) throw new Error('API 请求失败');
            const json = await response.json();

            const audioData = json.data?.audio || json.audio || json;
            const songData = json.data?.song || json.song || {};
            const url = audioData.url || '';
            if (!url) throw new Error('未获取到音乐地址');

            // 防重复检查
            if (recentUrls.includes(url) && retryCount < MAX_RETRY) {
                retryCount++;
                isLoading = false;
                // 短暂延迟后重新请求
                setTimeout(() => loadNewSong(), 300 * (retryCount + 1));
                return;
            }

            // 记录到最近播放列表
            recentUrls.push(url);
            if (recentUrls.length > MAX_RECENT) recentUrls.shift();
            retryCount = 0;

            currentUrl = url;
            audio.src = url;
            audio.load();

            songName.textContent = songData.name || '未知歌曲';
            artistName.textContent = songData.singer || '网络音乐';

            if (audioData.duration) {
                totalTimeEl.textContent = formatTime(audioData.duration / 1000);
            }

            try { await audio.play(); }
            catch (e) { iconPlay.style.display = 'block'; iconPause.style.display = 'none'; }
        } catch (err) {
            console.warn('MusicIsland:', err);
            island.classList.add('error');
            songName.textContent = '网络错误';
            artistName.textContent = '自动重试中...';
        } finally {
            isLoading = false;
        }
    }

    function onTimeUpdate() {
        if (!audio || !audio.duration) return;
        progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }

    function onMetadataLoaded() {
        if (audio && audio.duration && isFinite(audio.duration)) {
            totalTimeEl.textContent = formatTime(audio.duration);
        }
    }

    function onProgressClick(e) {
        if (!audio || !audio.duration) return;
        const rect = progressBar.getBoundingClientRect();
        audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audio.duration;
    }

    function startProgressRAF() {
        stopProgressRAF();
        let last = 0;
        function tick(now) {
            if (!audio || audio.paused) return;
            if (now - last > 250) { onTimeUpdate(); last = now; }
            progressRAF = requestAnimationFrame(tick);
        }
        progressRAF = requestAnimationFrame(tick);
    }

    function stopProgressRAF() {
        if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; }
    }

    function formatTime(s) {
        if (!s || !isFinite(s)) return '0:00';
        return Math.floor(s / 60) + ':' + (Math.floor(s % 60) < 10 ? '0' : '') + Math.floor(s % 60);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { init, expand, collapse, togglePlay, playRandom, loadNewSong };
})();
