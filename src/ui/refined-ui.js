/**
 * AI 五子棋 - 精致模式 UI 动画 v1
 * 管理精致模式 CSS 的动态加载/卸载
 */

const RefinedUI = (() => {
    let cssLink = null;
    let loaded = false;

    function isLoaded() { return loaded; }

    /**
     * 加载精致模式 CSS
     */
    function loadCSS() {
        if (loaded) return;
        cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'src/styles/refined-style.css';
        cssLink.id = 'refined-css-link';
        document.head.appendChild(cssLink);
        loaded = true;
    }

    /**
     * 卸载精致模式 CSS
     */
    function unloadCSS() {
        if (!loaded || !cssLink) return;
        cssLink.remove();
        cssLink = null;
        loaded = false;
    }

    return { isLoaded, loadCSS, unloadCSS };
})();
