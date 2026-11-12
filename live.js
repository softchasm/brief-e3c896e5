/*
 * 晨间简报 · 页面自动更新
 *
 * 页面开着的时候，每 30 秒（以及切回这个标签页、点回这个窗口时）向服务器要一份这一页的最新版本，
 * 和正在显示的版本比较；内容变了，就自动换成新版，并回到原来读到的位置。
 *
 * 为什么要自己比：网站让浏览器把页面缓存 10 分钟，服务器每次部署又会改掉所有文件的
 * 修改时间，所以既不能指望普通刷新，也不能看修改时间，只能比内容本身。
 *
 * 本地打开文件、生成 PDF 时不运行。
 */
(function () {
  'use strict';
  if (!/^https?:$/.test(location.protocol) || !window.fetch || !window.Promise) { return; }

  var CHECK_EVERY_MS = 30 * 1000;
  var MIN_GAP_MS = 2 * 60 * 1000;   // 两次自动刷新至少隔 2 分钟，防止来回跳
  var path = location.pathname;
  var shownURL = location.href.split('#')[0];
  var key = 'brief-live:' + path;

  function sGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function sDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  function notice(text, onClick) {
    var el = document.createElement(onClick ? 'button' : 'div');
    el.className = 'brief-live-notice';
    el.textContent = text;
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;' +
      'max-width:calc(100% - 32px);padding:9px 16px;border:0;border-radius:8px;' +
      'background:#2E2C27;color:#FCFCFB;box-shadow:0 2px 10px rgba(0,0,0,.15);' +
      'font:500 13px/1.4 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;' +
      (onClick ? 'cursor:pointer;' : '');
    if (onClick) { el.addEventListener('click', onClick); }
    var add = function () {
      if (!document.getElementById('brief-live-print')) {
        var st = document.createElement('style');
        st.id = 'brief-live-print';
        st.textContent = '@media print{.brief-live-notice{display:none!important}}';
        document.head.appendChild(st);
      }
      document.body.appendChild(el);
    };
    if (document.body) { add(); } else { document.addEventListener('DOMContentLoaded', add); }
    if (!onClick) {
      setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 4000);
    }
  }

  function goFresh() {
    sSet(key + ':y', String(window.pageYOffset || 0));
    location.replace(path + '?v=' + Date.now() + location.hash);
  }

  // 刚由自动更新跳过来：地址栏去掉 ?v=…，回到原来的阅读位置，提示一句
  var cameFromUpdate = /[?&]v=\d+/.test(location.search);
  if (cameFromUpdate) {
    try { history.replaceState(history.state, '', path + location.hash); } catch (e) {}
  }
  var savedY = sGet(key + ':y');
  if (savedY !== null) {
    sDel(key + ':y');
    var restore = function () { window.scrollTo(0, parseInt(savedY, 10) || 0); };
    if (document.readyState === 'complete') { restore(); } else { window.addEventListener('load', restore); }
  }
  if (cameFromUpdate) { notice('已自动更新到最新版本'); }

  function fingerprint(text) {
    var h = 5381;
    for (var i = 0; i < text.length; i++) { h = ((h << 5) + h + text.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(36) + '.' + text.length;
  }

  function get(url, mode) {
    return fetch(url, { cache: mode, credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.text();
    });
  }

  var shown = null;      // 正在显示的这一版（从浏览器缓存里取，和屏幕上的是同一份）
  var busy = false;
  var checks = 0;
  var offered = false;

  function check() {
    if (busy || document.visibilityState === 'hidden') { return; }
    busy = true;
    var ready = shown !== null ? Promise.resolve() :
      get(shownURL, 'force-cache').then(function (t) { shown = fingerprint(t); });
    ready
      .then(function () {
        if (sGet(key + ':to') === shown) { sDel(key + ':to'); }   // 上次的自动更新成功了
        return get(path, 'no-store');
      })
      .then(function (t) {
        checks++;
        var fresh = fingerprint(t);
        if (fresh === shown || t.length < 500) { return; }
        var last = parseInt(sGet(key + ':at') || '0', 10);
        if (sGet(key + ':to') === fresh) {
          // 已经为这一版自动刷新过一次却没换成：不再自动跳，留一个按钮让人自己点
          if (!offered) { offered = true; notice('有新版本 · 点这里刷新', goFresh); }
          return;
        }
        if (Date.now() - last < MIN_GAP_MS) { return; }
        sSet(key + ':to', fresh);
        sSet(key + ':at', String(Date.now()));
        goFresh();
      })
      .catch(function () {})
      .then(function () { busy = false; });
  }

  window.briefLive = {
    check: check,
    state: function () { return { shown: shown, checks: checks, busy: busy }; }
  };

  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { check(); }
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { check(); } });
  window.addEventListener('focus', check);   // 从别的程序点回 Chrome 窗口时立刻查一次
  check();
})();
