// OpenAI-compatible mock: POST /v1/chat/completions. Deterministic landing/section replies.
const http = require('http');
let n = 0;
const lessonHtml = (title, extra = '') => '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + title + '</title></head><body><h1>' + title + '</h1><section class="objectives"><h2>Learning objectives</h2><ul><li>Understand the quiz flow</li><li>Build the visual</li></ul></section><p>' + 'Mock lesson body text for testing the pipeline end to end. '.repeat(20) + '</p>' + extra + '<section class="quiz"><h2>Quiz</h2><p>Q1?</p></section></body></html>';
function reply(prompt) {
  if (prompt.includes('"modules": [')) return JSON.stringify({ modules: [1, 2, 3].map((i) => ({ title: 'Mock Module ' + i, focus: 'Build step ' + i })) });
  if (prompt.includes('"sublessons": [')) return JSON.stringify({ sublessons: [1, 2].map((i) => ({ title: 'Mock Sub ' + i, focus: 'Sub step ' + i })) });
  if (prompt.includes('updating an existing interactive HTML lesson')) {
    const cur = /Current lesson HTML:\n"""\n([\s\S]*?)\n"""\n\nRULES/.exec(prompt);
    const ins = /instruction:\n"""\n([\s\S]*?)\n"""/.exec(prompt);
    return (cur ? cur[1] : lessonHtml('revised')).replace('</body>', '<p class="revised">REVISED: ' + (ins ? ins[1].trim() : '') + '</p></body>');
  }
  if (prompt.includes('SAFETY & INTERACTIVITY') || prompt.includes('run cleanly inside a sandboxed iframe')) return lessonHtml('Mock Lesson ' + (++n));
  const m = /(?:instruction|brief):\n"""\n([\s\S]*?)\n"""/.exec(prompt);
  const text = m ? m[1].trim() : 'stub';
  if (prompt.includes('Write ONE new section'))
    return '```html\n<section class="ai-sec"><h2>AI: ' + text + '</h2><p>Generated body for ' + text + '</p></section>\n```';
  const page = /(?:Current landing page HTML|Start from this page[^\n]*):\n"""\n([\s\S]*?)\n"""\n\nRULES/.exec(prompt);
  if (page) return page[1].replace('</main>', '<section class="ai-page-edit"><h2>AIEDIT: ' + text + '</h2></section></main>');
  return 'ok';
}
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const prompt = (JSON.parse(b || '{}').messages || []).map((x) => x.content).join('\n');
    const out = reply(prompt); if (out === 'ok') console.log('UNMATCHED:', prompt.slice(0, 160).replace(/\n/g, ' '), '...', prompt.slice(-300).replace(/\n/g, ' '));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: out } }] }));
  });
}).listen(9099, () => console.log('mock llm on 9099'));
