/**
 * The HTML document of a lesson imported from a lab ("Import from labs" on a class page).
 *
 * A lesson is a standalone page (own CSS, no dependency on the app): it is stored in `lms_lessons.generated_html`,
 * mirrored to the class folder and shown in a sandboxed iframe. It uses the same design tokens as every
 * AI-generated lesson, so it follows the app's light/dark theme and the theme button the iframe host injects.
 */

/** Mirror of PREMIUM_DESIGN_TOKENS_CSS (backend/modules/ai_lms/visual_engine.py, fe-apis/lms/visualEngine.ts). Keep in step. */
const LESSON_TOKENS_CSS = `:root {
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
      --radius: 14px;
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
      --radius: 14px;
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
      --radius: 14px;
    }`;

const LESSON_CSS = `
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.7;
    }
    ::selection { background: var(--primary-soft); color: var(--text); }
    main { max-width: 800px; margin: 0 auto; padding: 3.5rem 1.5rem 5rem; }
    header { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
    .badge { font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.65rem; border-radius: 999px; background: var(--primary-soft); color: var(--primary); }
    .badge.muted { background: var(--surface-2); color: var(--text-muted); }
    h1 { font-size: 2rem; line-height: 1.2; letter-spacing: -0.01em; margin: 0 0 0.75rem; }
    .lead { margin: 0; color: var(--text-muted); font-size: 1.05rem; }
    a { color: var(--primary); }
    nav.toc { margin: 0 0 2.5rem; padding: 1rem 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    nav.toc strong { font-size: 0.8rem; color: var(--text-muted); }
    nav.toc ol { margin: 0.5rem 0 0; padding-left: 1.25rem; }
    nav.toc a { color: var(--text); text-decoration: none; }
    nav.toc a:hover { color: var(--primary); }
    section { margin: 0 0 3rem; }
    h2 { font-size: 1.4rem; line-height: 1.3; margin: 0 0 0.25rem; }
    .sec-sub { margin: 0 0 1.25rem; color: var(--text-muted); font-size: 0.9rem; }
    .body > :first-child { margin-top: 0; }
    .body p { margin: 0 0 1rem; white-space: pre-line; }
    .body h1, .body h2, .body h3, .body h4, .body h5, .body h6 { margin: 1.75rem 0 0.5rem; line-height: 1.3; }
    .body h3, .body h4 { font-size: 1.08rem; }
    .body ul, .body ol { margin: 0 0 1rem; padding-left: 1.4rem; }
    .body li { margin: 0.3rem 0; }
    .body code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.88em; background: var(--surface-2); padding: 0.12em 0.4em; border-radius: 6px; }
    .body pre { margin: 0 0 1.25rem; padding: 1rem 1.1rem; overflow-x: auto; background: var(--code-bg); color: var(--code-text); border: 1px solid var(--code-border); border-radius: 12px; line-height: 1.55; }
    .body pre code { background: none; padding: 0; color: inherit; font-size: 0.85rem; }
    .body blockquote { margin: 0 0 1rem; padding: 0.25rem 1rem; border-left: 3px solid var(--primary); color: var(--text-muted); }
    .body hr { border: 0; border-top: 1px solid var(--border-strong); margin: 2rem 0; }
    .table-wrap { overflow-x: auto; margin: 0 0 1.25rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
    th, td { border: 1px solid var(--border); padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
    th { background: var(--surface-2); }
    .outline { list-style: none; margin: 0; padding: 0; }
    .outline li { padding: 0.75rem 0; border-top: 1px solid var(--border); }
    .outline strong { display: block; }
    .outline span { color: var(--text-muted); font-size: 0.92rem; }
    .quiz-q { margin: 0 0 1rem; padding: 1rem 1.1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .quiz-q p { margin: 0 0 0.75rem; font-weight: 600; }
    .quiz-opt { display: block; width: 100%; margin: 0.4rem 0; padding: 0.55rem 0.8rem; text-align: left; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: 10px; cursor: pointer; }
    .quiz-opt:hover:not([disabled]) { border-color: var(--primary); }
    .quiz-opt.correct { border-color: var(--success); background: var(--success-soft); }
    .quiz-opt.wrong { border-color: var(--danger); background: var(--danger-soft); }
    .quiz-fb { margin-top: 0.6rem; font-size: 0.92rem; color: var(--text-muted); }
    @media (max-width: 600px) { main { padding: 2rem 1rem 4rem; } h1 { font-size: 1.6rem; } }
`;

/** Picks an answer: marks the right and the chosen option and shows the explanation. Plain ES5, no dependencies. */
const QUIZ_SCRIPT = `(function () {
  var cards = document.querySelectorAll('.quiz-q');
  Array.prototype.forEach.call(cards, function (card) {
    var answer = parseInt(card.getAttribute('data-answer'), 10);
    var feedback = card.querySelector('.quiz-fb');
    var options = card.querySelectorAll('.quiz-opt');
    Array.prototype.forEach.call(options, function (option, index) {
      option.addEventListener('click', function () {
        Array.prototype.forEach.call(options, function (other, i) {
          other.disabled = true;
          if (i === answer) other.className += ' correct';
        });
        if (index !== answer) option.className += ' wrong';
        feedback.hidden = false;
        feedback.querySelector('.quiz-res').textContent = index === answer ? 'Correct.' : 'Not quite.';
      });
    });
  });
})();`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LabLessonSection {
  id: string;
  label: string;
  subtitle?: string;
  /** The section body as an HTML fragment (markdownToHtml output; trusted: react-markdown escapes raw HTML). */
  html: string;
}

export interface LabLessonQuizQuestion {
  q: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  explanation: string;
}

export interface LabLessonInput {
  /** The lesson's title (also the page title and heading). */
  title: string;
  labName: string;
  /** Small chips under the lab name: category, difficulty, "Overview". */
  chips: string[];
  /** The line under the heading. */
  brief: string;
  sections: LabLessonSection[];
  /** The module's pages, listed at the end of its overview lesson. */
  outline?: { name: string; brief: string }[];
  quiz?: LabLessonQuizQuestion[];
}

export function buildLabLessonHtml(input: LabLessonInput): string {
  const sections = input.sections;
  const quiz = (input.quiz ?? []).filter((item) => item.options.length > 0);

  const toc: { id: string; label: string }[] = [
    ...sections.map((s) => ({ id: `s-${s.id}`, label: s.label })),
    ...(input.outline?.length ? [{ id: 'outline', label: 'In this module' }] : []),
    ...(quiz.length ? [{ id: 'quiz', label: 'Quiz' }] : []),
  ];

  const tocHtml =
    toc.length >= 3
      ? `<nav class="toc" aria-label="On this page"><strong>On this page</strong><ol>${toc
          .map((t) => `<li><a href="#${t.id}">${escapeHtml(t.label)}</a></li>`)
          .join('')}</ol></nav>`
      : '';

  const sectionsHtml = sections
    .map(
      (s) =>
        `<section id="s-${escapeHtml(s.id)}"><h2>${escapeHtml(s.label)}</h2>${
          s.subtitle ? `<p class="sec-sub">${escapeHtml(s.subtitle)}</p>` : ''
        }<div class="body">${s.html}</div></section>`
    )
    .join('\n');

  const outlineHtml = input.outline?.length
    ? `<section id="outline"><h2>In this module</h2><ul class="outline">${input.outline
        .map(
          (o) =>
            `<li><strong>${escapeHtml(o.name)}</strong>${o.brief ? `<span>${escapeHtml(o.brief)}</span>` : ''}</li>`
        )
        .join('')}</ul></section>`
    : '';

  const quizHtml = quiz.length
    ? `<section id="quiz"><h2>Quiz</h2>${quiz
        .map(
          (item, index) =>
            `<div class="quiz-q" data-answer="${item.answer}"><p>${index + 1}. ${escapeHtml(item.q)}</p>${item.options
              .map(
                (option, i) =>
                  `<button type="button" class="quiz-opt">${String.fromCharCode(65 + i)}) ${escapeHtml(option)}</button>`
              )
              .join(
                ''
              )}<div class="quiz-fb" hidden><strong class="quiz-res"></strong> ${escapeHtml(item.explanation)}</div></div>`
        )
        .join('')}</section><script>${QUIZ_SCRIPT}</script>`
    : '';

  const chips = [input.labName, ...input.chips.filter(Boolean)]
    .map((chip, i) => `<span class="badge${i === 0 ? '' : ' muted'}">${escapeHtml(chip)}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.title)} | AI LMS</title>
  <style>
    ${LESSON_TOKENS_CSS}
    ${LESSON_CSS}
  </style>
</head>
<body>
  <main>
    <header>
      <div class="badges">${chips}</div>
      <h1>${escapeHtml(input.title)}</h1>
      ${input.brief ? `<p class="lead">${escapeHtml(input.brief)}</p>` : ''}
    </header>
    ${tocHtml}
    ${sectionsHtml}
    ${outlineHtml}
    ${quizHtml}
  </main>
</body>
</html>
`;
}

/** Whole minutes at 200 words a minute, for the lesson's "read time" (1 to 240, what the LMS accepts). */
export function estimateReadMinutes(html: string): number {
  const words = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.min(240, Math.max(1, Math.round(words / 200)));
}
