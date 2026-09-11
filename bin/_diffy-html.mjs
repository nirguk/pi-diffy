#!/usr/bin/env node
/**
 * _diffy-html.mjs — Standalone HTML diff viewer for any two text files.
 *
 * Usage:
 *   node _diffy-html.mjs [--out <path>] <FROM> <TO>
 *
 * Produces a self-contained HTML file with the unified diff rendered
 * by diff2html (word-level diffing + coloring) and an inline toggle to
 * switch between side-by-side and line-by-line views.
 *
 * diff2html owns ALL rendering: we do not re-scrape or post-process its
 * output. The earlier approach (a regex that stripped <ins>/<del> and
 * re-ran highlight.js) violated diff2html's escaping contract and caused
 * asymmetric <ins> retention and `&amp;` double-escaping — removed.
 *
 * Dependencies (installed locally):
 *   diff2html  (under .pi/scripts/diffdeps/)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { createRequire } from 'node:module';

// ── Resolve paths relative to this script's location ──────────────────────
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEPS_DIR = join(SCRIPT_DIR, 'diffdeps');

// ── Exit-code contract (shared) ────────────────────────────────────────
//   0 = files identical
//   1 = files differ
//   2 = usage error (bad/malformed invocation)
//   3 = input not found / not a regular file
//   4 = internal error (git diff / deps missing)

// ── Parse CLI arguments ───────────────────────────────────────────────────
const args = process.argv.slice(2);
let outPath = null;
const positional = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') {
    // --out must be followed by a value that isn't itself a flag
    if (i + 1 < args.length && !args[i + 1].startsWith('--') && !args[i + 1].startsWith('-')) {
      outPath = args[++i];
    } else {
      console.error('Usage: node _diffy-html.mjs [--out <path>] <FROM> <TO>');
      console.error('error: --out requires a destination path (e.g. --out /tmp/my-diff.html)');
      process.exit(2);
    }
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('_diffy-html — self-contained HTML diff of two text files');
    console.log('Usage: node _diffy-html.mjs [--out <path>] <FROM> <TO>');
    console.log();
    console.log('  --out <path>   write HTML here (default: .pi/diffout/<FROM>__vs__<TO>.diff.html)');
    console.log('  --help, -h     show this help');
    console.log();
    console.log('Exit codes: 0 identical · 1 diff · 2 usage · 3 bad input · 4 internal');
    process.exit(0);
  } else {
    positional.push(args[i]);
  }
}

if (positional.length < 2) {
  console.error('Usage: node _diffy-html.mjs [--out <path>] <FROM> <TO>');
  if (positional.length === 0) {
    console.error('error: missing both <FROM> and <TO> — run with --help for details');
  } else {
    console.error(`error: missing second argument <TO> (got ${positional.length} path(s))`);
  }
  process.exit(2);
}
if (positional.length > 2) {
  console.error('Usage: node _diffy-html.mjs [--out <path>] <FROM> <TO>');
  console.error(`error: expected exactly 2 positional arguments, got ${positional.length}`);
  process.exit(2);
}

const fromPath = positional[0];
const toPath = positional[1];

// ── Resolve paths relative to script dir (work from any cwd) ──────────────
const resolvePath = (p) => {
  if (p.startsWith('/') || p.startsWith('./') || p.startsWith('../')) return p;
  return join(process.cwd(), p);
};

const fromResolved = resolvePath(fromPath);
const toResolved = resolvePath(toPath);

// ── Verify input files exist and are regular files ──────────────────────
function checkInput(path, label) {
  let st;
  try {
    st = statSync(path);
  } catch {
    console.error(`error: ${label} not found: ${path}`);
    process.exit(3);
  }
  if (!st.isFile()) {
    console.error(`error: ${label} is not a regular file (is it a directory?): ${path}`);
    process.exit(3);
  }
}
checkInput(fromResolved, 'FROM');
checkInput(toResolved, 'TO');

// ── Determine output path ─────────────────────────────────────────────────
if (!outPath) {
  const fromBase = basename(fromResolved);
  const toBase = basename(toResolved);
  outPath = join(SCRIPT_DIR, '..', 'diffout', `${fromBase}__vs__${toBase}.diff.html`);
}

// ── Load diff2html from local deps (CJS build) ─────────────────────────
// We use createRequire rooted at the deps' node_modules so package `main`
// entries resolve normally. A bare `import 'diff2html'` here would resolve
// against this script's location, NOT the vendored diffdeps, so 'require'
// with an explicit base path is the robust choice.
let depsRequire, diff2htmlHtml, diff2htmlParse;
const loadDeps = () => {
  depsRequire = createRequire(join(DEPS_DIR, 'package.json'));
  ({ html: diff2htmlHtml, parse: diff2htmlParse } = depsRequire('diff2html'));
};
try {
  loadDeps();
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND') {
    // Auto-heal: npm install the vendored deps, then retry once.
    if (process.env.DIFFY_HEAL !== '0' && process.env.HEAL !== '0') {
      console.error('healing: html dependencies missing — npm install in ' + DEPS_DIR);
      try {
        execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: DEPS_DIR, stdio: 'inherit' });
        loadDeps(); // retry
      } catch (healErr) {
        console.error('error: npm install failed in ' + DEPS_DIR);
        console.error('       run: cd ' + DEPS_DIR + ' && npm install');
        process.exit(4);
      }
    } else {
      console.error('error: vendored dependencies missing under ' + DEPS_DIR);
      console.error('       run: cd ' + DEPS_DIR + ' && npm install');
      process.exit(4);
    }
  } else {
    throw e;
  }
}

// ── Read CSS asset ───────────────────────────────────────────────────────
const diff2htmlCss = readFileSync(
  join(DEPS_DIR, 'node_modules', 'diff2html', 'bundles', 'css', 'diff2html.min.css'),
  'utf8'
);

// diff2html owns rendering: its output and its own stylesheet are embedded
// verbatim. The output HTML is self-contained with no JS library runtime;
// the only script is the tiny inline view toggle.

// ── Run git diff ──────────────────────────────────────────────────────────
let diffText;
try {
  diffText = execFileSync('git', ['diff', '--no-index', '--unified=3', '--text', fromResolved, toResolved], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  // exit code 1 means differences found — that's expected
  if (e.stdout) {
    diffText = e.stdout;
  } else if (e.status && e.status >= 2) {
    // git diff --no-index: >=2 means a real error (e.g. file vanished mid-run)
    const detail = (e.stderr || '').toString().trim();
    console.error('error: git diff failed (exit ' + e.status + ')' + (detail ? ': ' + detail : ''));
    process.exit(4);
  } else {
    console.error('error: could not run git diff: ' + (e.message || e));
    process.exit(4);
  }
}

// ── HTML escape helper ─────────────────────────────────────────────
function htmlEscape(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Check for empty diff (identical files) ───────────────────────────────
if (!diffText || diffText.trim() === '') {
  console.log('NO Differences');
  process.exit(0);
}

// ── Generate diff2html HTML ───────────────────────────────────────────────
// Generate both side-by-side and line-by-line views. diff2html owns all
// rendering — its output is embedded verbatim (no regex post-processing).
const ssConfig = { outputFormat: 'side-by-side', colorScheme: 'dark', drawFileList: true };
const lbConfig = { outputFormat: 'line-by-line', colorScheme: 'dark', drawFileList: true };

const ssHtml = diff2htmlHtml(diffText, ssConfig);
const lbHtml = diff2htmlHtml(diffText, lbConfig);

// ── Build standalone HTML document ────────────────────────────────────────
const fromBaseName = basename(fromResolved);
const toBaseName = basename(toResolved);

const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Diff: ${htmlEscape(fromBaseName)} → ${htmlEscape(toBaseName)}</title>
<style>
${diff2htmlCss}
/* Custom page styling (light wrapper only — diff2html provides all diff styles) */
body {
  margin: 0;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0d1117;
  color: #e6edf3;
}
.diff-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.diff-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
}
.diff-header .file-info {
  font-size: 13px;
  color: #8b949e;
}
.diff-header .file-info span {
  color: #58a6ff;
  font-family: monospace;
}
.toggle-btn {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 6px 14px;
  color: #c9d1d9;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  margin-left: auto;
}
.toggle-btn:hover {
  background: #30363d;
}
.toggle-btn.active {
  background: #1f6feb;
  border-color: #1f6feb;
  color: #fff;
}
.view-hidden {
  display: none;
}
</style>
</head>
<body>
<div class="diff-header">
  <h1>📄 Diff View</h1>
  <div class="file-info">
    <span>${htmlEscape(fromBaseName)}</span> <span style="margin:0 4px;color:#8b949e">→</span>
    <span>${htmlEscape(toBaseName)}</span>
  </div>
  <button class="toggle-btn active" id="toggleView" title="Toggle between side-by-side and inline view">⇔ Side-by-Side</button>
</div>
<div id="sideBySideView" class="d2h-wrapper d2h-dark-color-scheme">${ssHtml}</div>
<div id="lineByLineView" class="view-hidden d2h-wrapper d2h-dark-color-scheme">${lbHtml}</div>
<script>
(function() {
  const btn = document.getElementById('toggleView');
  const ssView = document.getElementById('sideBySideView');
  const lbView = document.getElementById('lineByLineView');
  let isSideBySide = true;
  btn.addEventListener('click', function() {
    isSideBySide = !isSideBySide;
    if (isSideBySide) {
      ssView.classList.remove('view-hidden');
      lbView.classList.add('view-hidden');
      btn.textContent = '⇔ Side-by-Side';
      btn.classList.add('active');
    } else {
      ssView.classList.add('view-hidden');
      lbView.classList.remove('view-hidden');
      btn.textContent = '⇕ Inline';
      btn.classList.remove('active');
    }
  });
})();
</script>
</body>
</html>`;

// ── Write output ──────────────────────────────────────────────────────────
const outDir = dirname(outPath);
try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, htmlDoc, 'utf8');
} catch (e) {
  console.error(`error: could not write output to ${outPath}: ${e.message || e}`);
  process.exit(4);
}

const outSize = statSync(outPath).size;
console.log(`Diff HTML written to: ${outPath}`);
console.log(`File size: ${outSize} bytes (${(outSize / 1024).toFixed(1)} KB)`);
console.log(`Diff lines: ${diffText.split('\n').length}`);
