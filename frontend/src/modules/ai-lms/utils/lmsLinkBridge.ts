import type { LmsPathTarget } from '../types';

/**
 * Lesson and landing HTML is written to be hostable as plain files (classes/<class>/...),
 * so its links are relative paths between those files. Rendered in the app, the page sits
 * in a sandboxed srcdoc iframe, where such links would resolve against the app's URL and
 * load the app inside the frame. This script (injected at render time only, never saved
 * into a file) turns link clicks into postMessages that LmsHtmlFrame routes instead, and
 * reports the scroll position so a refresh can restore it.
 */
const BRIDGE_SCRIPT = `(function () {
  var RESTORE = __LMS_RESTORE__;
  var INITIAL_THEME = '__LMS_THEME__';
  function post(msg) { msg.__lms = 1; try { parent.postMessage(msg, '*'); } catch (e) {} }

  function getActiveTheme() {
    var dt = document.documentElement.getAttribute('data-theme');
    if (dt === 'light' || dt === 'dark') return dt;
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  function updateToggleButton(theme) {
    var btn = document.getElementById('lms-theme-toggle');
    if (!btn) return;
    btn.setAttribute('data-active-theme', theme);
    btn.setAttribute('title', theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode');
    var label = btn.querySelector('.lms-theme-label');
    if (label) {
      label.textContent = theme === 'dark' ? 'Light' : 'Dark';
    }
  }

  function applyTheme(theme) {
    if (!theme || (theme !== 'light' && theme !== 'dark')) return;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    if (document.body) {
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(theme);
    }
    updateToggleButton(theme);
  }

  function onToggleClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    var current = getActiveTheme();
    var next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('lms-theme-pref', next); } catch (err) {}
    applyTheme(next);
    post({ type: 'theme-toggle', theme: next });
  }

  function injectThemeToggle() {
    var existingBtn = document.getElementById('lms-theme-toggle');
    if (existingBtn) {
      existingBtn.onclick = onToggleClick;
      updateToggleButton(getActiveTheme());
      return;
    }
    var btn = document.createElement('button');
    btn.id = 'lms-theme-toggle';
    btn.className = 'lms-theme-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle theme');
    btn.innerHTML = '<svg class="lms-theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' +
      '<svg class="lms-theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
      '<span class="lms-theme-label">Theme</span>';
    btn.onclick = onToggleClick;
    var container = document.body || document.documentElement;
    if (container) container.appendChild(btn);
    updateToggleButton(getActiveTheme());
  }

  // Handle messages from host
  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.__lms !== 1) return;
    if (data.type === 'set-theme' || data.type === 'theme-change') {
      applyTheme(data.theme);
    }
  });

  // Initial theme application
  var resolvedTheme = INITIAL_THEME;
  try {
    var saved = localStorage.getItem('lms-theme-pref');
    if (saved === 'light' || saved === 'dark') resolvedTheme = saved;
  } catch (err) {}
  applyTheme(resolvedTheme);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectThemeToggle);
  } else {
    injectThemeToggle();
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var el = e.target;
    while (el && el.nodeType === 1 && el.tagName !== 'A') el = el.parentNode;
    if (!el || el.nodeType !== 1 || !el.hasAttribute('href')) return;
    var href = el.getAttribute('href') || '';
    var route = el.getAttribute('data-lms-route');
    if (route) { e.preventDefault(); post({ type: 'navigate', route: route }); return; }
    if (/^javascript:/i.test(href)) return;
    if (href.charAt(0) === '#') {
      e.preventDefault();
      var id = decodeURIComponent(href.slice(1));
      var target = id ? (document.getElementById(id) || document.getElementsByName(id)[0]) : null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (!id) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    e.preventDefault();
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.indexOf('//') === 0) post({ type: 'external', href: href });
    else post({ type: 'navigate', href: href });
  });
  var timer;
  window.addEventListener('scroll', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { post({ type: 'scroll', y: window.scrollY || 0 }); }, 150);
  }, { passive: true });
  if (RESTORE > 0) {
    var go = function () { window.scrollTo(0, RESTORE); };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  }
})();`;

export interface LmsBridgeMessage {
  __lms: 1;
  type: 'navigate' | 'external' | 'scroll' | 'theme-toggle' | 'set-theme' | 'theme-change';
  href?: string;
  route?: string;
  y?: number;
  theme?: 'light' | 'dark';
}

/** Inject the click/scroll bridge and theme controller before the document's last </body> (or at the end). */
export function withLinkBridge(
  html: string,
  restoreScrollY = 0,
  initialTheme: 'light' | 'dark' = 'dark'
): string {
  const restore = String(Math.max(0, Math.round(restoreScrollY) || 0));
  const scriptContent = BRIDGE_SCRIPT
    .replace('__LMS_RESTORE__', restore)
    .replace('__LMS_THEME__', initialTheme);
  const script = `<script data-lms-bridge>${scriptContent}</script>`;
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at === -1 ? html + script : html.slice(0, at) + script + html.slice(at);
}

/**
 * Resolve a relative href the way a static host would, against the page's own path in the
 * classes folder (e.g. "computer-vision/landingpage.html"). Returns the target path in the
 * classes folder plus any #fragment, or null for anything that leaves the folder.
 */
export function resolveClassesPath(
  href: string,
  filePath: string
): { path: string; hash: string } | null {
  try {
    const base = new URL(filePath, 'https://classes.invalid/');
    const target = new URL(href, base);
    if (target.origin !== base.origin) return null;
    return { path: decodeURIComponent(target.pathname.replace(/^\/+/, '')), hash: target.hash };
  } catch {
    return null;
  }
}

/** The app route that shows a resolved classes-folder target. */
export function lmsTargetHref(target: LmsPathTarget): string {
  const classHref = `/ai-lms/classes/${target.class_slug}`;
  switch (target.kind) {
    case 'landing':
      return `${classHref}/landing`;
    case 'subject':
      return `${classHref}/${target.subject_slug}`;
    case 'lesson':
      return target.subject_slug
        ? `${classHref}/${target.subject_slug}/${target.lesson_slug}`
        : `${classHref}/lesson/${target.lesson_slug}`;
    default:
      return classHref;
  }
}
