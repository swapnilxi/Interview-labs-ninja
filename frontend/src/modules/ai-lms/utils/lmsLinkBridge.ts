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
  function post(msg) { msg.__lms = 1; try { parent.postMessage(msg, '*'); } catch (e) {} }
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
  type: 'navigate' | 'external' | 'scroll';
  href?: string;
  route?: string;
  y?: number;
}

/** Inject the click/scroll bridge before the document's last </body> (or at the end). */
export function withLinkBridge(html: string, restoreScrollY = 0): string {
  const restore = String(Math.max(0, Math.round(restoreScrollY) || 0));
  const script = `<script data-lms-bridge>${BRIDGE_SCRIPT.replace('__LMS_RESTORE__', restore)}</script>`;
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
