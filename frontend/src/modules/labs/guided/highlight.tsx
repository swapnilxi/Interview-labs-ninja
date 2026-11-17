import type { ReactNode } from 'react';

/**
 * A small Python highlighter: keywords, builtins, def/class names, strings, numbers, comments and decorators. It colours
 * with the semantic tokens (`.gp-tok-*` in styles/guided-practice.css), so it reads in light and dark, and needs no
 * dependency. A lexer this small is wrong in corners (nested f-string braces, say); it only ever changes colour, never text.
 */

const KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
  'match',
  'case',
]);

const BUILTINS = new Set([
  'print',
  'len',
  'range',
  'enumerate',
  'zip',
  'map',
  'filter',
  'sorted',
  'reversed',
  'sum',
  'min',
  'max',
  'abs',
  'any',
  'all',
  'list',
  'dict',
  'set',
  'tuple',
  'str',
  'int',
  'float',
  'bool',
  'type',
  'isinstance',
  'iter',
  'next',
  'divmod',
  'round',
  'pow',
  'chr',
  'ord',
  'hash',
  'bin',
  'hex',
  'heappush',
  'heappop',
  'deque',
  'defaultdict',
  'Counter',
  'self',
]);

// comment | string (triple-quoted first) | number | decorator | word
const TOKEN =
  /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|[rRbBfFuU]{0,2}"(?:\\.|[^"\\\n])*"|[rRbBfFuU]{0,2}'(?:\\.|[^'\\\n])*')|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(@[A-Za-z_][\w.]*)|([A-Za-z_]\w*)/g;

export function highlightPython(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(TOKEN.source, 'g');
  let last = 0;
  let previousWord = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [text, comment, string, number, decorator, word] = m;
    let cls = '';
    if (comment) cls = 'gp-tok-c';
    else if (string) cls = 'gp-tok-s';
    else if (number) cls = 'gp-tok-n';
    else if (decorator) cls = 'gp-tok-d';
    else if (word) {
      if (KEYWORDS.has(word)) cls = 'gp-tok-k';
      else if (previousWord === 'def' || previousWord === 'class' || BUILTINS.has(word))
        cls = 'gp-tok-f';
    }
    out.push(
      cls ? (
        <span key={m.index} className={cls}>
          {text}
        </span>
      ) : (
        text
      )
    );
    previousWord = word ?? '';
    last = m.index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/** For fenced blocks in Markdown (`Markdown`'s `highlight` prop): Python gets colour, everything else (diagrams, text) stays plain. */
export function highlightFence(code: string, lang: string): ReactNode {
  return /^(py|python|python3)$/i.test(lang) ? highlightPython(code) : code;
}
