/*
 * Guided Practice: runs the learner's Python in the browser (Pyodide, CPython compiled to WebAssembly), inside this worker so
 * the page never freezes and an endless loop can be ended by terminating the worker (src/modules/labs/dsa-lab/guided/runner.ts
 * does that after a time limit).
 *
 * Messages in:  { id, type: 'init' }  or  { id, type: 'run', code, fn, tests, compare }
 * Messages out: { id, type: 'ready' } | { id, type: 'result', result } | { id, type: 'error', message }
 *
 * The runtime is downloaded once from jsDelivr (cached by the browser afterwards). Once it is up, the worker drops its network
 * APIs and the Python `js` bridge, so the code under test (the learner's, and the AI's reference solution) cannot reach the
 * network. It still has no access to the page: a worker has no DOM, no localStorage and no cookies.
 */
'use strict';

var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

var HARNESS = String.raw`
import json, copy, math, sys, io, contextlib, builtins

def _no_input(*args, **kwargs):
    raise EOFError("input() is not available in the test runner")

builtins.input = _no_input

def _key(v):
    return json.dumps(v, sort_keys=True, default=str)

def _plain(x):
    if x is None or isinstance(x, (bool, int, float, str)):
        return x
    if isinstance(x, (list, tuple)):
        return [_plain(i) for i in x]
    if isinstance(x, (set, frozenset)):
        return sorted((_plain(i) for i in x), key=_key)
    if isinstance(x, dict):
        return {str(k): _plain(v) for k, v in x.items()}
    return repr(x)

def _canon(x):
    if isinstance(x, list):
        return sorted((_canon(i) for i in x), key=_key)
    if isinstance(x, dict):
        return {k: _canon(v) for k, v in x.items()}
    return x

def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)

def _same(a, b):
    if _num(a) and _num(b):
        return a == b or math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-9)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_same(a[k], b[k]) for k in a)
    if type(a) is not type(b):
        return False
    return a == b

def _show(x):
    try:
        s = json.dumps(_plain(x))
    except Exception:
        s = repr(x)
    return s if len(s) <= 300 else s[:297] + "..."

def _describe(e):
    return "%s: %s" % (type(e).__name__, e)

def run_suite(code, fn_name, tests_json, compare):
    out = {"error": None, "results": [], "stdout": ""}
    tests = json.loads(tests_json)
    buf = io.StringIO()
    try:
        compiled = compile(code, "your_code.py", "exec")
    except SyntaxError as e:
        out["error"] = "SyntaxError: %s (line %s)" % (e.msg, e.lineno)
        return json.dumps(out)
    ns = {"__name__": "__main__"}
    try:
        with contextlib.redirect_stdout(buf):
            exec(compiled, ns)
    except BaseException as e:
        out["error"] = _describe(e)
        out["stdout"] = buf.getvalue()[:2000]
        return json.dumps(out)
    fn = ns.get(fn_name)
    if not callable(fn):
        out["error"] = "Define a function named %s." % fn_name
        return json.dumps(out)
    for i, t in enumerate(tests):
        entry = {"index": i, "label": t.get("label") or ("Test %d" % (i + 1)), "expected": _show(t.get("expected")), "passed": False}
        try:
            args = copy.deepcopy(t.get("args", []))
            with contextlib.redirect_stdout(buf):
                got = fn(*args)
            entry["got"] = _show(got)
            a = _plain(got)
            b = _plain(t.get("expected"))
            if compare == "unordered":
                a, b = _canon(a), _canon(b)
            entry["passed"] = bool(_same(a, b))
        except BaseException as e:
            entry["error"] = _describe(e)
        out["results"].append(entry)
    out["stdout"] = buf.getvalue()[:2000]
    return json.dumps(out)

for _name in ("js", "pyodide_js"):
    sys.modules[_name] = None
`;

var pyodide = null;
var ready = null;

function init() {
  if (!ready) {
    ready = (async function () {
      importScripts(PYODIDE_URL + 'pyodide.js');
      pyodide = await self.loadPyodide({ indexURL: PYODIDE_URL });
      pyodide.runPython(HARNESS);
      // From here on the code under test has no way out: no network APIs (the stdlib it may import is already loaded).
      ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].forEach(function (name) {
        try {
          self[name] = undefined;
        } catch (e) {
          /* not configurable: nothing more to do */
        }
      });
    })();
  }
  return ready;
}

self.onmessage = async function (event) {
  var msg = event.data || {};
  try {
    await init();
    if (msg.type === 'init') {
      self.postMessage({ id: msg.id, type: 'ready' });
      return;
    }
    if (msg.type === 'run') {
      var runSuite = pyodide.globals.get('run_suite');
      var json;
      try {
        json = runSuite(msg.code, msg.fn, JSON.stringify(msg.tests), msg.compare);
      } finally {
        runSuite.destroy();
      }
      self.postMessage({ id: msg.id, type: 'result', result: JSON.parse(json) });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, type: 'error', message: String((err && err.message) || err) });
  }
};
