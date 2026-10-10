/** Injects a minimal, defensive stylesheet into an AI-generated lesson's <head> so
 * headings/dividers/links stay visible even if the model's own CSS only fully
 * accounted for one color-scheme (light or dark), not both.
 *
 * Inserted as the FIRST thing in <head>, so the lesson's own <style> block (which
 * always appears later in source order) still wins on equal-specificity rules for
 * elements it actually styled -- this is a fallback, not an override. The one
 * exception is `hr`: given `!important` so it can never end up fully invisible
 * regardless of what (if anything) the lesson's own CSS declares for it, since a
 * plain unstyled divider is the single most commonly reported invisible element.
 */
export function withVisibilitySafetyNet(html: string): string {
  if (!html) return html;

  const safetyNet = `<style id="lms-visibility-safetynet">
    :root {
      color-scheme: light dark;
      --bg: #f7f3ec;
      --surface: #fffaf2;
      --surface-2: #efe7d9;
      --text: #24201b;
      --text-muted: #71695f;
      --border: rgba(64, 55, 45, 0.14);
      --border-strong: rgba(64, 55, 45, 0.22);
      --primary: #5b5bd6;
      --primary-soft: rgba(91, 91, 214, 0.1);
      --secondary: #127c7a;
      --secondary-soft: rgba(18, 124, 122, 0.1);
      --accent: #b36b17;
      --accent-soft: rgba(179, 107, 23, 0.12);
      --success: #14845f;
      --success-soft: rgba(20, 132, 95, 0.12);
      --danger: #c24151;
      --danger-soft: rgba(194, 65, 81, 0.12);
      --code-bg: #1c1a17;
      --code-text: #f2ede2;
      --code-border: rgba(255, 255, 255, 0.08);
      --shadow: 0 1px 2px rgba(36, 32, 27, 0.05), 0 12px 28px -14px rgba(36, 32, 27, 0.2);
      --ink: #1d1b17;
      --muted: #6b665c;
      --line: #e7e1d4;
    }
    :root[data-theme="light"], html.light, body.light {
      color-scheme: light;
      --bg: #f7f3ec;
      --surface: #fffaf2;
      --surface-2: #efe7d9;
      --text: #24201b;
      --text-muted: #71695f;
      --border: rgba(64, 55, 45, 0.14);
      --border-strong: rgba(64, 55, 45, 0.22);
      --primary: #5b5bd6;
      --primary-soft: rgba(91, 91, 214, 0.1);
      --secondary: #127c7a;
      --secondary-soft: rgba(18, 124, 122, 0.1);
      --accent: #b36b17;
      --accent-soft: rgba(179, 107, 23, 0.12);
      --success: #14845f;
      --success-soft: rgba(20, 132, 95, 0.12);
      --danger: #c24151;
      --danger-soft: rgba(194, 65, 81, 0.12);
      --code-bg: #1c1a17;
      --code-text: #f2ede2;
      --code-border: rgba(255, 255, 255, 0.08);
      --shadow: 0 1px 2px rgba(36, 32, 27, 0.05), 0 12px 28px -14px rgba(36, 32, 27, 0.2);
      --ink: #1d1b17;
      --muted: #6b665c;
      --line: #e7e1d4;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        color-scheme: dark;
        --bg: #17140f;
        --surface: #201c16;
        --surface-2: #2a251d;
        --text: #f4efe7;
        --text-muted: #b3a696;
        --border: rgba(255, 246, 235, 0.1);
        --border-strong: rgba(255, 246, 235, 0.16);
        --primary: #9694f5;
        --primary-soft: rgba(150, 148, 245, 0.14);
        --secondary: #5fc6bd;
        --secondary-soft: rgba(95, 198, 189, 0.12);
        --accent: #f1ad55;
        --accent-soft: rgba(241, 173, 85, 0.14);
        --success: #54c79a;
        --success-soft: rgba(84, 199, 154, 0.14);
        --danger: #fb7185;
        --danger-soft: rgba(251, 113, 133, 0.14);
        --code-bg: #14110d;
        --code-text: #f2ede2;
        --code-border: rgba(255, 255, 255, 0.07);
        --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 14px 32px -16px rgba(0, 0, 0, 0.6);
        --ink: #f1ede4;
        --muted: #a39d90;
        --line: #33302a;
      }
    }
    :root[data-theme="dark"], html.dark, body.dark {
      color-scheme: dark;
      --bg: #17140f;
      --surface: #201c16;
      --surface-2: #2a251d;
      --text: #f4efe7;
      --text-muted: #b3a696;
      --border: rgba(255, 246, 235, 0.1);
      --border-strong: rgba(255, 246, 235, 0.16);
      --primary: #9694f5;
      --primary-soft: rgba(150, 148, 245, 0.14);
      --secondary: #5fc6bd;
      --secondary-soft: rgba(95, 198, 189, 0.12);
      --accent: #f1ad55;
      --accent-soft: rgba(241, 173, 85, 0.14);
      --success: #54c79a;
      --success-soft: rgba(84, 199, 154, 0.14);
      --danger: #fb7185;
      --danger-soft: rgba(251, 113, 133, 0.14);
      --code-bg: #14110d;
      --code-text: #f2ede2;
      --code-border: rgba(255, 255, 255, 0.07);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 14px 32px -16px rgba(0, 0, 0, 0.6);
      --ink: #f1ede4;
      --muted: #a39d90;
      --line: #33302a;
    }
    html[data-theme="light"] body, body.light {
      background-color: var(--bg);
      color: var(--text);
    }
    html[data-theme="dark"] body, body.dark {
      background-color: var(--bg);
      color: var(--text);
    }
    hr { border: none !important; border-top: 1px solid rgba(128, 128, 128, 0.4) !important; margin: 2rem 0; }
    .lms-theme-toggle {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 99999;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 9999px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    }
    :root[data-theme="dark"] .lms-theme-toggle, html.dark .lms-theme-toggle, body.dark .lms-theme-toggle {
      background: rgba(32, 28, 22, 0.88);
      color: #f4efe7;
      border: 1px solid rgba(255, 246, 235, 0.2);
    }
    :root[data-theme="light"] .lms-theme-toggle, html.light .lms-theme-toggle, body.light .lms-theme-toggle {
      background: rgba(255, 250, 242, 0.92);
      color: #24201b;
      border: 1px solid rgba(64, 55, 45, 0.2);
    }
    .lms-theme-toggle:hover {
      transform: translateY(-1px) scale(1.03);
    }
    .lms-theme-toggle:active {
      transform: translateY(0) scale(0.98);
    }
    :root[data-theme="dark"] .lms-theme-icon-moon, html.dark .lms-theme-icon-moon { display: none; }
    :root[data-theme="dark"] .lms-theme-icon-sun, html.dark .lms-theme-icon-sun { display: inline-block; }
    :root[data-theme="light"] .lms-theme-icon-sun, html.light .lms-theme-icon-sun { display: none; }
    :root[data-theme="light"] .lms-theme-icon-moon, html.light .lms-theme-icon-moon { display: inline-block; }
    @media print {
      .lms-theme-toggle { display: none !important; }
    }
  </style>`;

  const headMatch = html.match(/<head[^>]*>/i);
  if (!headMatch || headMatch.index === undefined) return html;

  const insertAt = headMatch.index + headMatch[0].length;
  return html.slice(0, insertAt) + safetyNet + html.slice(insertAt);
}
