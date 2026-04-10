/**
 * i18n.js — Lightweight i18n for static HTML sites
 *
 * Usage:
 *   1. Define translations: window.I18N = { zh: { key: '中文' }, en: { key: 'English' } }
 *   2. Add data-i18n="key" to elements (textContent) or data-i18n-placeholder="key" (placeholder)
 *   3. <script src="i18n.js"></script> at end of body — auto-inits on load
 *
 * API:
 *   I18n.lang          — current language ('zh' | 'en')
 *   I18n.t(key)        — translate a key
 *   I18n.toggle()      — switch language
 *   I18n.apply()       — re-apply translations to DOM
 *   I18n.onSwitch(fn)  — register callback on language change
 */
const I18n = (() => {
    let _lang = localStorage.getItem('lang') || 'zh';
    let _dict = {};
    const _callbacks = [];

    function t(key) {
        return _dict[_lang]?.[key] ?? _dict['zh']?.[key] ?? key;
    }

    function apply() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.dataset.i18nTitle);
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            el.innerHTML = t(el.dataset.i18nHtml);
        });
        document.documentElement.lang = _lang === 'zh' ? 'zh-CN' : 'en';
        _updateToggle();
    }

    function switchLang(lang) {
        _lang = lang;
        localStorage.setItem('lang', lang);
        apply();
        _callbacks.forEach(fn => fn(lang));
    }

    function toggle() {
        switchLang(_lang === 'zh' ? 'en' : 'zh');
    }

    function onSwitch(fn) {
        _callbacks.push(fn);
    }

    function _updateToggle() {
        document.querySelectorAll('.i18n-toggle').forEach(btn => {
            btn.textContent = _lang === 'zh' ? 'EN' : '中文';
            btn.title = _lang === 'zh' ? 'Switch to English' : '切换到中文';
        });
    }

    function init(dict) {
        _dict = dict || window.I18N || {};
        apply();
    }

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init(window.I18N));
    } else {
        // Script loaded after DOM ready — defer to next tick so I18N dict is defined
        setTimeout(() => init(window.I18N), 0);
    }

    return {
        get lang() { return _lang; },
        t, apply, toggle, switchLang, onSwitch, init
    };
})();
