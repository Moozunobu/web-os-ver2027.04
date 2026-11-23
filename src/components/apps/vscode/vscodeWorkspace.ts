import { VSLang, detectLanguage, transpileTypeScript } from './tsEngine';

export interface VSFile {
  path: string;
  content: string;
  language: VSLang;
  updatedAt: number;
}

export interface VSTemplate {
  id: string;
  nameJa: string;
  nameEn: string;
  descriptionJa: string;
  descriptionEn: string;
  files: Array<{ path: string; content: string }>;
  openTabs: string[];
  activeFile: string;
}

export interface WebOSDriveFile {
  id: string;
  name: string;
  content: string;
  parentId?: string;
  updatedAt?: string;
}

export const VSCODE_STORAGE_KEY = 'webos_vscode_workspace_v1';

export const VSCODE_TEMPLATES: VSTemplate[] = [
  {
    id: 'ts-webapp',
    nameJa: 'TypeScript Webアプリ',
    nameEn: 'TypeScript Web App',
    descriptionJa: '型定義(interface/enum)・DOM操作・CSSグリッドを備えた実践スターター',
    descriptionEn: 'Interactive TypeScript + CSS + HTML starter with interfaces and enums',
    openTabs: ['index.html', 'styles/main.css', 'src/types.ts', 'src/main.ts'],
    activeFile: 'src/main.ts',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TypeScript Task Studio</title>
  <link rel="stylesheet" href="styles/main.css" />
</head>
<body>
  <main class="shell">
    <header class="header">
      <div>
        <h1>TypeScript タスクボード</h1>
        <p class="subtitle">HTML + CSS + TypeScript リアルタイム実行</p>
      </div>
      <div class="stats" id="stats">0 / 0 完了</div>
    </header>

    <form class="composer" id="task-form">
      <input
        id="task-input"
        type="text"
        placeholder="新しいタスクを入力..."
        autocomplete="off"
      />
      <select id="priority-select">
        <option value="high">高</option>
        <option value="normal" selected>中</option>
        <option value="low">低</option>
      </select>
      <button type="submit">追加</button>
    </form>

    <ul class="task-list" id="task-list"></ul>
  </main>

  <script type="module" src="src/main.ts"></script>
</body>
</html>`,
      },
      {
        path: 'styles/main.css',
        content: `:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --border: #334155;
  --accent: #3b82f6;
  --text: #f1f5f9;
  --muted: #94a3b8;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  padding: 28px 18px;
}

.shell {
  max-width: 640px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 22px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

h1 {
  font-size: 1.25rem;
  font-weight: 700;
}

.subtitle {
  margin-top: 4px;
  font-size: 0.82rem;
  color: var(--muted);
}

.stats {
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  color: #38bdf8;
  font-weight: 600;
}

.composer {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.composer input {
  flex: 1;
  background: #0f172a;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 0.9rem;
  outline: none;
}

.composer input:focus {
  border-color: var(--accent);
}

.composer select,
.composer button {
  background: #0f172a;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 0.88rem;
}

.composer button {
  background: var(--accent);
  border-color: var(--accent);
  font-weight: 600;
  cursor: pointer;
}

.composer button:hover {
  filter: brightness(1.1);
}

.task-list {
  list-style: none;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border);
  border-radius: 8px;
  gap: 10px;
}

.task-item.done span {
  text-decoration: line-through;
  color: var(--muted);
}

.task-left {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.remove-btn {
  background: transparent;
  color: var(--muted);
  border: none;
  cursor: pointer;
  font-size: 0.82rem;
}

.remove-btn:hover {
  color: #f87171;
}`,
      },
      {
        path: 'src/types.ts',
        content: `export enum Priority {
  High = 'high',
  Normal = 'normal',
  Low = 'low',
}

export interface TaskItem {
  id: number;
  title: string;
  priority: Priority;
  done: boolean;
}

export function priorityLabel(priority: Priority): string {
  switch (priority) {
    case Priority.High:
      return '高';
    case Priority.Low:
      return '低';
    default:
      return '中';
  }
}`,
      },
      {
        path: 'src/main.ts',
        content: `import { Priority, TaskItem, priorityLabel } from './types';

let tasks: TaskItem[] = [
  { id: 1, title: 'TypeScript インターフェースを確認する', priority: Priority.High, done: true },
  { id: 2, title: 'Webビューでレイアウトを調整する', priority: Priority.Normal, done: false },
];

const formEl = document.getElementById('task-form') as HTMLFormElement | null;
const inputEl = document.getElementById('task-input') as HTMLInputElement | null;
const priorityEl = document.getElementById('priority-select') as HTMLSelectElement | null;
const listEl = document.getElementById('task-list') as HTMLUListElement | null;
const statsEl = document.getElementById('stats');

function render(): void {
  if (!listEl || !statsEl) return;
  const completed = tasks.filter((t) => t.done).length;
  statsEl.textContent = \`\${completed} / \${tasks.length} 完了\`;

  listEl.innerHTML = '';
  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = \`task-item \${task.done ? 'done' : ''}\`;

    const left = document.createElement('label');
    left.className = 'task-left';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => {
      task.done = checkbox.checked;
      console.log('Toggle task:', task.title, '->', task.done);
      render();
    });

    const text = document.createElement('span');
    text.textContent = \`[\${priorityLabel(task.priority)}] \${task.title}\`;

    const del = document.createElement('button');
    del.className = 'remove-btn';
    del.type = 'button';
    del.textContent = '削除';
    del.addEventListener('click', () => {
      tasks = tasks.filter((item) => item.id !== task.id);
      render();
    });

    left.append(checkbox, text);
    li.append(left, del);
    listEl.appendChild(li);
  }
}

formEl?.addEventListener('submit', (e: Event) => {
  e.preventDefault();
  if (!inputEl || !priorityEl) return;
  const title = inputEl.value.trim();
  if (!title) return;

  const newTask: TaskItem = {
    id: Date.now(),
    title,
    priority: priorityEl.value as Priority,
    done: false,
  };
  tasks = [newTask, ...tasks];
  inputEl.value = '';
  console.log('Added task:', newTask);
  render();
});

console.info('TypeScript Task Studio initialized');
render();`,
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "module": "ESNext"
  }
}`,
      },
    ],
  },
  {
    id: 'canvas-ts',
    nameJa: 'TypeScript Canvas物理デモ',
    nameEn: 'TypeScript Canvas Physics',
    descriptionJa: 'HTML5 Canvas + TypeScriptクラスを使ったパーティクルシミュレーション',
    descriptionEn: 'Typed HTML5 Canvas particle physics simulation',
    openTabs: ['index.html', 'style.css', 'src/particle.ts'],
    activeFile: 'src/particle.ts',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>Canvas Physics TS</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="hud">
    <span>クリックでパーティクル追加</span>
    <span id="count">0 particles</span>
  </div>
  <canvas id="stage"></canvas>
  <script src="src/particle.ts"></script>
</body>
</html>`,
      },
      {
        path: 'style.css',
        content: `html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #020617;
  font-family: system-ui, sans-serif;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.hud {
  position: fixed;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  color: #e2e8f0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}`,
      },
      {
        path: 'src/particle.ts',
        content: `interface Vec2 {
  x: number;
  y: number;
}

class Particle {
  public pos: Vec2;
  public vel: Vec2;
  public radius: number;
  public hue: number;

  constructor(x: number, y: number) {
    this.pos = { x, y };
    this.vel = {
      x: (Math.random() - 0.5) * 6,
      y: (Math.random() - 0.7) * 7,
    };
    this.radius = 4 + Math.random() * 6;
    this.hue = Math.floor(190 + Math.random() * 60);
  }

  public update(width: number, height: number): void {
    this.vel.y += 0.16;
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;

    if (this.pos.x < this.radius || this.pos.x > width - this.radius) {
      this.vel.x *= -0.9;
      this.pos.x = Math.max(this.radius, Math.min(width - this.radius, this.pos.x));
    }
    if (this.pos.y > height - this.radius) {
      this.vel.y *= -0.82;
      this.pos.y = height - this.radius;
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = \`hsl(\${this.hue}, 90%, 62%)\`;
    ctx.fill();
  }
}

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const countEl = document.getElementById('count');
const ctx = canvas.getContext('2d')!;
const particles: Particle[] = [];

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

for (let i = 0; i < 24; i++) {
  particles.push(new Particle(canvas.width / 2, canvas.height / 3));
}

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  for (let i = 0; i < 8; i++) {
    particles.push(new Particle(e.clientX, e.clientY));
  }
  console.log('Spawned particles. Total:', particles.length);
});

function tick(): void {
  ctx.fillStyle = 'rgba(2, 6, 23, 0.22)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const p of particles) {
    p.update(canvas.width, canvas.height);
    p.draw(ctx);
  }
  if (countEl) countEl.textContent = \`\${particles.length} particles\`;
  requestAnimationFrame(tick);
}

tick();`,
      },
    ],
  },
  {
    id: 'html-css-js',
    nameJa: 'HTML / CSS / JS カードUI',
    nameEn: 'HTML / CSS / JS Card UI',
    descriptionJa: '素のHTML・CSS・JavaScriptで組むインタラクティブUI',
    descriptionEn: 'Clean HTML, CSS & vanilla JavaScript interactive showcase',
    openTabs: ['index.html', 'styles.css', 'app.js'],
    activeFile: 'index.html',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>Interactive Palette</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <section class="card">
    <h1>カラーパレット生成</h1>
    <p>ボタンをクリックして配色テーマをテスト</p>
    <div class="swatch" id="swatch">#2563EB</div>
    <button id="shuffle-btn">ランダム生成</button>
  </section>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: 'styles.css',
        content: `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: #111827;
  color: #f9fafb;
}

.card {
  width: 340px;
  padding: 24px;
  border-radius: 14px;
  background: #1f2937;
  border: 1px solid #374151;
  text-align: center;
}

.swatch {
  margin: 18px 0;
  height: 110px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-family: monospace;
  font-size: 1.1rem;
  background: #2563eb;
  transition: background 0.25s ease;
}

button {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: none;
  background: #3b82f6;
  color: white;
  font-weight: 600;
  cursor: pointer;
}`,
      },
      {
        path: 'app.js',
        content: `const swatch = document.getElementById('swatch');
const btn = document.getElementById('shuffle-btn');

const palette = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2'];
let index = 0;

btn?.addEventListener('click', () => {
  index = (index + 1) % palette.length;
  const color = palette[index];
  if (swatch) {
    swatch.style.background = color;
    swatch.textContent = color;
  }
  console.log('Switched color to', color);
});`,
      },
    ],
  },
];

export function createFilesFromTemplate(tpl: VSTemplate): Record<string, VSFile> {
  const now = Date.now();
  const map: Record<string, VSFile> = {};
  for (const f of tpl.files) {
    map[f.path] = {
      path: f.path,
      content: f.content,
      language: detectLanguage(f.path),
      updatedAt: now,
    };
  }
  return map;
}

function normalizeRelPath(basePath: string, relPath: string): string {
  const cleanRel = relPath.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!relPath.startsWith('./') && !relPath.startsWith('../')) return cleanRel;
  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : '';
  const parts = baseDir ? baseDir.split('/') : [];
  for (const seg of relPath.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function resolveWorkspaceScript(files: Record<string, VSFile>, baseFile: string, refPath: string): VSFile | undefined {
  const norm = normalizeRelPath(baseFile, refPath);
  const candidates = [
    norm,
    `${norm}.ts`,
    `${norm}.tsx`,
    `${norm}.js`,
    `${norm}.mjs`,
    refPath.replace(/^\.\//, ''),
  ];
  for (const c of candidates) {
    if (files[c]) return files[c];
  }
  return undefined;
}

/**
 * Converts ES import/export syntax into a synchronous __vsRequire module factory
 * so multi-file TypeScript/JS modules run smoothly inside sandboxed iframe srcDoc.
 */
function wrapAsCommonJsModule(jsCode: string, currentPath: string, files: Record<string, VSFile>): string {
  let code = jsCode;

  // Side-effect imports: import './foo';
  code = code.replace(/^\s*import\s+['"]([^'"]+)['"];?\s*$/gm, (_, spec) => {
    const target = resolveWorkspaceScript(files, currentPath, spec);
    return target ? `__vsRequire(${JSON.stringify(target.path)});` : '';
  });

  // Named + default imports: import Def, { a, b as c } from './foo';
  code = code.replace(
    /^\s*import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (_, clause, spec) => {
      const target = resolveWorkspaceScript(files, currentPath, spec);
      if (!target) return '';
      const reqExpr = `__vsRequire(${JSON.stringify(target.path)})`;
      const trimmed = clause.trim();
      if (trimmed.startsWith('* as ')) {
        const ns = trimmed.slice(5).trim();
        return `const ${ns} = ${reqExpr};`;
      }
      if (trimmed.startsWith('{')) {
        const inner = trimmed.slice(1, -1).replace(/\s+as\s+/g, ': ');
        return `const { ${inner} } = ${reqExpr};`;
      }
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx !== -1) {
        const defName = trimmed.slice(0, commaIdx).trim();
        const rest = trimmed.slice(commaIdx + 1).trim();
        const inner = rest.replace(/^\{|\}$/g, '').replace(/\s+as\s+/g, ': ');
        return `const __mod_${defName} = ${reqExpr}; const ${defName} = __mod_${defName}.default ?? __mod_${defName}; const { ${inner} } = __mod_${defName};`;
      }
      return `const ${trimmed} = (${reqExpr}.default ?? ${reqExpr});`;
    }
  );

  // `export default ...`
  code = code.replace(/^\s*export\s+default\s+/gm, 'exports.default = ');

  // `export { a, b }`
  code = code.replace(/^\s*export\s*\{([^}]+)\};?\s*$/gm, (_, names) => {
    return names
      .split(',')
      .map((n: string) => {
        const parts = n.trim().split(/\s+as\s+/);
        const local = parts[0]?.trim();
        const exported = (parts[1] || parts[0])?.trim();
        return local && exported ? `exports[${JSON.stringify(exported)}] = ${local};` : '';
      })
      .join(' ');
  });

  // `export async function foo`, `export function foo`, `export class Foo`
  code = code.replace(/^\s*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (_, asyncKw = '', name) => {
    return `exports.${name} = ${asyncKw}function ${name}`;
  });
  code = code.replace(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm, (_, name) => {
    return `exports.${name} = class ${name}`;
  });
  code = code.replace(/^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_, decl, name) => {
    return `${decl} ${name} = exports.${name}`;
  });

  // Handle `export var EnumName; ...` produced by TypeScript enum compilation cleanly:
  // If `export` preceded `var X; (function (X) ...`, expose X on exports at end
  const exportedEnumMatches = [...jsCode.matchAll(/^\s*export\s+(?:var|const\s+enum|enum)\s+([A-Za-z_$][\w$]*)/gm)];
  if (exportedEnumMatches.length > 0) {
    code = code.replace(/^\s*export\s+var\s+/gm, 'var ');
    for (const m of exportedEnumMatches) {
      code += `\nif (typeof ${m[1]} !== 'undefined') exports[${JSON.stringify(m[1])}] = ${m[1]};`;
    }
  }

  return code;
}

/**
 * Bundles the workspace's entry HTML, linked CSS stylesheets, and TypeScript/JS modules
 * into a self-contained HTML string ready for WebView <iframe srcDoc> or download export.
 */
export function buildWebViewHtml(
  files: Record<string, VSFile>,
  entryHtmlPath = 'index.html',
  options?: { includeBridge?: boolean }
): string {
  const includeBridge = options?.includeBridge ?? true;
  const htmlFile =
    files[entryHtmlPath] ||
    Object.values(files).find((f) => f.language === 'html');

  let html =
    htmlFile?.content ||
    `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body><div id="app"></div></body></html>`;
  const baseHtmlPath = htmlFile?.path || 'index.html';

  // 1. Replace <link rel="stylesheet" href="..."> with inline <style>
  html = html.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>|<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi,
    (full, href1, href2) => {
      const href = (href1 || href2 || '').trim();
      if (!href || href.startsWith('http://') || href.startsWith('https://')) return full;
      const cssFile = resolveWorkspaceScript(files, baseHtmlPath, href);
      if (!cssFile) return full;
      return `<style data-source="${cssFile.path}">\n${cssFile.content}\n</style>`;
    }
  );

  // 2. Collect JS/TS modules and build module registry runtime
  const codeFiles = Object.values(files).filter(
    (f) => f.language === 'typescript' || f.language === 'javascript'
  );
  const moduleRegistryEntries: string[] = [];
  for (const cf of codeFiles) {
    const compiled =
      cf.language === 'typescript'
        ? transpileTypeScript(cf.content, cf.path).js
        : cf.content;
    const cjsBody = wrapAsCommonJsModule(compiled, cf.path, files);
    moduleRegistryEntries.push(
      `${JSON.stringify(cf.path)}: function(exports, __vsRequire) {\n${cjsBody}\n}`
    );
  }

  const runtimeScript =
    moduleRegistryEntries.length > 0
      ? `<script>
(function(){
  var __modules = {\n${moduleRegistryEntries.join(',\n')}\n  };
  var __cache = {};
  window.__vsRequire = function(id) {
    if (__cache[id]) return __cache[id].exports;
    var factory = __modules[id];
    if (!factory) throw new Error('Module not found: ' + id);
    var mod = { exports: {} };
    __cache[id] = mod;
    factory(mod.exports, window.__vsRequire);
    return mod.exports;
  };
})();
</script>`
      : '';

  // 3. Replace <script src="..."></script> references with __vsRequire execution
  let replacedAnyScript = false;
  html = html.replace(
    /<script\b([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/gi,
    (full, _a1, src) => {
      const cleanSrc = src.trim();
      if (cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://')) return full;
      const target = resolveWorkspaceScript(files, baseHtmlPath, cleanSrc);
      if (!target) return full;
      replacedAnyScript = true;
      return `<script>window.__vsRequire(${JSON.stringify(target.path)});</script>`;
    }
  );

  // If HTML didn't explicitly include a <script src>, auto-run main.ts/app.ts/app.js if present
  if (!replacedAnyScript && !htmlFile) {
    const autoEntry =
      files['src/main.ts'] || files['main.ts'] || files['app.ts'] || files['app.js'] || codeFiles[0];
    if (autoEntry) {
      html = html.replace(
        '</body>',
        `<script>window.__vsRequire(${JSON.stringify(autoEntry.path)});</script></body>`
      );
    }
  }

  // 4. Console & Error Bridge for Integrated VS Code Console
  const bridgeScript = includeBridge
    ? `<script>
(function(){
  var send = function(level, args) {
    try {
      var text = Array.prototype.slice.call(args).map(function(a) {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.stack || a.message;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
      }).join(' ');
      window.parent.postMessage({ source: 'vscode-webview', type: 'console', level: level, text: text }, '*');
    } catch(e) {}
  };
  ['log', 'info', 'warn', 'error'].forEach(function(lvl) {
    var orig = console[lvl];
    console[lvl] = function() {
      send(lvl, arguments);
      if (orig) return orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function(e) {
    send('error', [e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')]);
  });
  window.addEventListener('unhandledrejection', function(e) {
    send('error', ['Unhandled Promise Rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))]);
  });
  window.addEventListener('message', function(ev) {
    if (ev.data && ev.data.source === 'vscode-host' && ev.data.type === 'eval') {
      try {
        var result = (0, eval)(ev.data.code);
        send('log', [result === undefined ? 'undefined' : result]);
      } catch (err) {
        send('error', [err && err.message ? err.message : String(err)]);
      }
    }
  });
})();
</script>`
    : '';

  const headInject = `${bridgeScript}\n${runtimeScript}`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${headInject}`);
  } else {
    html = `${headInject}\n${html}`;
  }

  return html;
}

// ─── WebOS Virtual Drive (C: Drive / webos_files) Bridge ───

const CODE_EXT_RE = /\.(html?|css|scss|js|jsx|mjs|ts|tsx|json|txt)$/i;

export function listWebOSDriveCodeFiles(): WebOSDriveFile[] {
  try {
    const raw = localStorage.getItem('webos_files');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<any>;
    return parsed
      .filter((item) => item && item.type !== 'folder' && typeof item.name === 'string' && CODE_EXT_RE.test(item.name))
      .map((item) => ({
        id: item.id,
        name: item.name,
        content: typeof item.content === 'string' ? item.content : '',
        parentId: item.parentId,
        updatedAt: item.updatedAt,
      }));
  } catch {
    return [];
  }
}

export function saveFileToWebOSDrive(fileName: string, content: string): void {
  const cleanName = fileName.split('/').pop() || fileName;
  try {
    const raw = localStorage.getItem('webos_files');
    const files: any[] = raw ? JSON.parse(raw) : [];
    const nowStr = new Date().toISOString();
    const existingIdx = files.findIndex(
      (f) => f && f.type !== 'folder' && (f.name === cleanName || f.name === fileName)
    );
    if (existingIdx !== -1) {
      files[existingIdx] = {
        ...files[existingIdx],
        content,
        size: `${Math.max(1, Math.ceil(content.length / 1024))} KB`,
        updatedAt: nowStr,
      };
    } else {
      files.push({
        id: `vscode_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        parentId: 'documents',
        type: 'file',
        content,
        size: `${Math.max(1, Math.ceil(content.length / 1024))} KB`,
        updatedAt: nowStr,
      });
    }
    localStorage.setItem('webos_files', JSON.stringify(files));
    window.dispatchEvent(new Event('webos_files_changed'));
  } catch (err) {
    console.error('Failed saving file to WebOS drive:', err);
  }
}
