import { VSLang, WorkspaceSymbol, detectLanguage, extractWorkspaceSymbols } from './tsEngine';

export interface CompletionItem {
  label: string;
  insertText: string;
  kind: 'keyword' | 'type' | 'function' | 'property' | 'variable' | 'tag' | 'attr' | 'snippet' | 'file' | 'value';
  detail?: string;
  documentation?: string;
  /** Characters to replace before the cursor */
  replaceLength: number;
  /** Relative offset inside insertText where cursor should land (if undefined, end of insertText) */
  cursorBackOffset?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const JS_CONTROL_KW = new Set([
  'import', 'from', 'export', 'default', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw',
  'await', 'yield', 'as', 'satisfies',
]);

const JS_DECL_KW = new Set([
  'const', 'let', 'var', 'function', 'async', 'class', 'extends', 'implements',
  'interface', 'type', 'enum', 'declare', 'public', 'private', 'protected',
  'readonly', 'static', 'abstract', 'override', 'new', 'typeof', 'keyof',
  'instanceof', 'in', 'of', 'void', 'delete', 'true', 'false', 'null', 'undefined',
  'this', 'super', 'constructor',
]);

const TS_BUILTIN_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'object', 'symbol',
  'bigint', 'Promise', 'Array', 'Record', 'Partial', 'Required', 'Readonly',
  'Pick', 'Omit', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement',
  'HTMLCanvasElement', 'HTMLSelectElement', 'MouseEvent', 'KeyboardEvent',
  'Event', 'Element', 'Document', 'Window', 'CanvasRenderingContext2D', 'Date', 'Map', 'Set',
]);

/**
 * Produces Dark+ HTML syntax-highlighted lines for synchronized <pre> overlay.
 */
export function highlightCode(code: string, lang: VSLang): string[] {
  if (lang === 'html') return highlightHtmlLines(code);
  if (lang === 'css') return highlightCssLines(code);
  if (lang === 'json') return highlightJsonLines(code);
  return highlightJsTsLines(code);
}

function highlightJsTsLines(code: string): string[] {
  const lines = code.split('\n');
  let inBlockComment = false;

  return lines.map((line) => {
    if (line.length === 0) return ' ';
    let out = '';
    let i = 0;
    const len = line.length;

    while (i < len) {
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) {
          out += `<span style="color:#6a9955">${escapeHtml(line.slice(i))}</span>`;
          i = len;
        } else {
          out += `<span style="color:#6a9955">${escapeHtml(line.slice(i, end + 2))}</span>`;
          i = end + 2;
          inBlockComment = false;
        }
        continue;
      }

      const ch = line[i];

      if (ch === '/' && line[i + 1] === '/') {
        out += `<span style="color:#6a9955">${escapeHtml(line.slice(i))}</span>`;
        break;
      }

      if (ch === '/' && line[i + 1] === '*') {
        inBlockComment = true;
        const end = line.indexOf('*/', i + 2);
        if (end === -1) {
          out += `<span style="color:#6a9955">${escapeHtml(line.slice(i))}</span>`;
          break;
        } else {
          out += `<span style="color:#6a9955">${escapeHtml(line.slice(i, end + 2))}</span>`;
          i = end + 2;
          inBlockComment = false;
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        const q = ch;
        let j = i + 1;
        while (j < len) {
          if (line[j] === '\\') {
            j += 2;
            continue;
          }
          if (line[j] === q) {
            j++;
            break;
          }
          j++;
        }
        out += `<span style="color:#ce9178">${escapeHtml(line.slice(i, j))}</span>`;
        i = j;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        let j = i + 1;
        while (j < len && /[0-9a-fA-FxXoObBn._]/.test(line[j])) j++;
        out += `<span style="color:#b5cea8">${escapeHtml(line.slice(i, j))}</span>`;
        i = j;
        continue;
      }

      if (/[a-zA-Z_$]/.test(ch)) {
        let j = i + 1;
        while (j < len && /[a-zA-Z0-9_$]/.test(line[j])) j++;
        const word = line.slice(i, j);
        const nextNonWs = line.slice(j).match(/^\s*(.)/)?.[1];

        let color = '#9cdcfe';
        if (JS_CONTROL_KW.has(word)) {
          color = '#c586c0';
        } else if (JS_DECL_KW.has(word)) {
          color = '#569cd6';
        } else if (TS_BUILTIN_TYPES.has(word) || (/^[A-Z]/.test(word) && nextNonWs !== '(')) {
          color = '#4ec9b0';
        } else if (nextNonWs === '(') {
          color = '#dcdcaa';
        }

        out += `<span style="color:${color}">${escapeHtml(word)}</span>`;
        i = j;
        continue;
      }

      out += escapeHtml(ch);
      i++;
    }

    return out || ' ';
  });
}

function highlightCssLines(code: string): string[] {
  const lines = code.split('\n');
  let inBrace = false;

  return lines.map((line) => {
    if (!line) return ' ';
    if (line.trim().startsWith('/*')) {
      return `<span style="color:#6a9955">${escapeHtml(line)}</span>`;
    }
    if (line.includes('{')) inBrace = true;

    let result = escapeHtml(line);
    // Highlight comments inline
    result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6a9955">$1</span>');
    // At-rules
    result = result.replace(/(@[a-zA-Z-]+)/g, '<span style="color:#c586c0">$1</span>');
    // CSS property: value;
    if (inBrace && line.includes(':') && !line.trim().startsWith('@')) {
      result = result.replace(
        /^(\s*)([a-zA-Z-]+|--[a-zA-Z0-9_-]+)(\s*:\s*)(.*)$/,
        (_, sp, prop, colon, val) => {
          const coloredVal = val
            .replace(/(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms|deg|fr)?\b)/g, '<span style="color:#b5cea8">$1</span>')
            .replace(/('[^']*'|"[^"]*")/g, '<span style="color:#ce9178">$1</span>');
          return `${sp}<span style="color:#9cdcfe">${prop}</span>${colon}<span style="color:#ce9178">${coloredVal}</span>`;
        }
      );
    } else if (!line.includes('{') && !line.includes('}')) {
      result = `<span style="color:#d7ba7d">${result}</span>`;
    } else if (line.includes('{')) {
      const idx = line.indexOf('{');
      const sel = escapeHtml(line.slice(0, idx));
      const rest = escapeHtml(line.slice(idx));
      result = `<span style="color:#d7ba7d">${sel}</span>${rest}`;
    }

    if (line.includes('}')) inBrace = false;
    return result || ' ';
  });
}

function highlightHtmlLines(code: string): string[] {
  return code.split('\n').map((line) => {
    if (!line) return ' ';
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (line.startsWith('<!--', i)) {
        const end = line.indexOf('-->', i + 4);
        const slice = end === -1 ? line.slice(i) : line.slice(i, end + 3);
        out += `<span style="color:#6a9955">${escapeHtml(slice)}</span>`;
        i += slice.length;
        continue;
      }
      if (line[i] === '<') {
        const closeIdx = line.indexOf('>', i);
        const rawTag = closeIdx === -1 ? line.slice(i) : line.slice(i, closeIdx + 1);
        const tagMatch = rawTag.match(/^(<\/?)([a-zA-Z!][a-zA-Z0-9-]*)([\s\S]*?)(\/?>)$/);
        if (tagMatch) {
          const [, openBracket, tagName, attrsRaw, closeBracket] = tagMatch;
          const coloredAttrs = attrsRaw.replace(
            /([a-zA-Z_:][-a-zA-Z0-9_.:]*)(\s*=\s*)("[^"]*"|'[^']*')?/g,
            (_, attr, eq, val = '') =>
              `<span style="color:#9cdcfe">${escapeHtml(attr)}</span>${escapeHtml(eq || '')}<span style="color:#ce9178">${escapeHtml(val)}</span>`
          );
          out += `<span style="color:#808080">${escapeHtml(openBracket)}</span><span style="color:#569cd6">${escapeHtml(tagName)}</span>${coloredAttrs}<span style="color:#808080">${escapeHtml(closeBracket)}</span>`;
        } else {
          out += escapeHtml(rawTag);
        }
        i += rawTag.length;
        continue;
      }
      out += escapeHtml(line[i]);
      i++;
    }
    return out || ' ';
  });
}

function highlightJsonLines(code: string): string[] {
  return code.split('\n').map((line) => {
    if (!line) return ' ';
    return escapeHtml(line)
      .replace(/("([^"\\]|\\.)*")(\s*:)/g, '<span style="color:#9cdcfe">$1</span>$3')
      .replace(/:\s*("([^"\\]|\\.)*")/g, ': <span style="color:#ce9178">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span style="color:#569cd6">$1</span>')
      .replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span style="color:#b5cea8">$1</span>');
  });
}

// ─── IntelliSense Completion Catalogs ───

const HTML_TAGS = [
  'div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside',
  'h1', 'h2', 'h3', 'h4', 'p', 'span', 'a', 'button', 'input', 'textarea',
  'select', 'option', 'label', 'form', 'ul', 'ol', 'li', 'table', 'thead',
  'tbody', 'tr', 'th', 'td', 'img', 'canvas', 'svg', 'video', 'audio',
  'script', 'style', 'link', 'meta', 'title', 'head', 'body', 'html', 'pre', 'code',
];

const VOID_TAGS = new Set(['input', 'img', 'link', 'meta', 'br', 'hr']);

const HTML_ATTRS = [
  { name: 'class', doc: 'CSSクラス名' },
  { name: 'id', doc: '要素の一意ID' },
  { name: 'href', doc: 'リンク先URL/CSSパス' },
  { name: 'src', doc: 'スクリプト・画像パス' },
  { name: 'type', doc: 'input/button等の種別' },
  { name: 'placeholder', doc: '入力欄プレースホルダー' },
  { name: 'value', doc: '要素の値' },
  { name: 'style', doc: 'インラインCSS' },
  { name: 'rel', doc: 'リンク関連 (stylesheet等)' },
  { name: 'disabled', doc: '操作無効化' },
  { name: 'aria-label', doc: 'アクセシビリティラベル' },
  { name: 'data-id', doc: 'カスタムデータ属性' },
];

const CSS_PROPS: Array<{ prop: string; values: string[]; doc: string }> = [
  { prop: 'display', values: ['flex', 'grid', 'block', 'inline-flex', 'none'], doc: 'レイアウト表示方式' },
  { prop: 'flex-direction', values: ['row', 'column', 'row-reverse', 'column-reverse'], doc: 'Flexの主軸方向' },
  { prop: 'justify-content', values: ['center', 'space-between', 'space-around', 'flex-start', 'flex-end'], doc: '主軸方向の配置' },
  { prop: 'align-items', values: ['center', 'stretch', 'flex-start', 'flex-end'], doc: '交差軸方向の配置' },
  { prop: 'grid-template-columns', values: ['repeat(3, 1fr)', 'repeat(auto-fit, minmax(220px, 1fr))', '1fr 2fr'], doc: 'Grid列定義' },
  { prop: 'gap', values: ['8px', '12px', '16px', '24px', '1rem'], doc: '要素間の余白' },
  { prop: 'padding', values: ['8px', '12px 16px', '16px 24px', '1rem'], doc: '内側余白' },
  { prop: 'margin', values: ['0', '0 auto', '8px', '16px'], doc: '外側余白' },
  { prop: 'width', values: ['100%', 'auto', 'fit-content', '320px'], doc: '幅' },
  { prop: 'height', values: ['100%', '100vh', 'auto', '48px'], doc: '高さ' },
  { prop: 'max-width', values: ['1200px', '960px', '640px', '100%'], doc: '最大幅' },
  { prop: 'position', values: ['relative', 'absolute', 'fixed', 'sticky'], doc: '配置方法' },
  { prop: 'inset', values: ['0', '8px', 'auto'], doc: 'top/right/bottom/left一括指定' },
  { prop: 'background', values: ['#0f172a', 'linear-gradient(135deg, #2563eb, #06b6d4)', 'transparent'], doc: '背景色・グラデーション' },
  { prop: 'background-color', values: ['#1e293b', '#ffffff', 'rgba(15, 23, 42, 0.85)'], doc: '背景色' },
  { prop: 'color', values: ['#f8fafc', '#0f172a', '#94a3b8', '#38bdf8'], doc: '文字色' },
  { prop: 'font-family', values: ['system-ui, sans-serif', "'Inter', sans-serif", 'monospace'], doc: 'フォント' },
  { prop: 'font-size', values: ['12px', '14px', '16px', '1.25rem', '2rem'], doc: '文字サイズ' },
  { prop: 'font-weight', values: ['400', '500', '600', '700'], doc: '文字の太さ' },
  { prop: 'line-height', values: ['1.5', '1.6', '1.2'], doc: '行間' },
  { prop: 'border', values: ['1px solid #334155', '1px solid rgba(255,255,255,0.12)', 'none'], doc: '枠線' },
  { prop: 'border-radius', values: ['6px', '8px', '12px', '9999px'], doc: '角丸' },
  { prop: 'box-shadow', values: ['0 8px 24px rgba(0,0,0,0.25)', '0 1px 3px rgba(0,0,0,0.12)'], doc: '影' },
  { prop: 'backdrop-filter', values: ['blur(12px)', 'blur(8px) saturate(150%)'], doc: '背景すりガラス効果' },
  { prop: 'transition', values: ['all 0.2s ease', 'transform 0.15s ease, opacity 0.15s ease'], doc: 'トランジション' },
  { prop: 'transform', values: ['translateY(-2px)', 'scale(1.02)', 'rotate(0deg)'], doc: '変形' },
  { prop: 'opacity', values: ['1', '0.8', '0.5', '0'], doc: '不透明度' },
  { prop: 'overflow', values: ['hidden', 'auto', 'scroll', 'visible'], doc: 'はみ出し処理' },
  { prop: 'cursor', values: ['pointer', 'default', 'not-allowed'], doc: 'カーソル形状' },
  { prop: 'z-index', values: ['10', '50', '100'], doc: '重なり順' },
];

const DOT_APIS: Record<string, Array<{ label: string; insert: string; kind: CompletionItem['kind']; detail: string; doc: string }>> = {
  document: [
    { label: 'querySelector', insert: 'querySelector()', kind: 'function', detail: '<E extends Element>(selector: string): E | null', doc: 'CSSセレクタで最初の要素を取得' },
    { label: 'querySelectorAll', insert: 'querySelectorAll()', kind: 'function', detail: '<E extends Element>(selector: string): NodeListOf<E>', doc: 'CSSセレクタに一致する全要素を取得' },
    { label: 'getElementById', insert: 'getElementById()', kind: 'function', detail: '(id: string): HTMLElement | null', doc: 'ID属性で要素を取得' },
    { label: 'createElement', insert: 'createElement()', kind: 'function', detail: '<K extends keyof HTMLElementTagNameMap>(tag: K)', doc: '新しいHTML要素を生成' },
    { label: 'addEventListener', insert: 'addEventListener()', kind: 'function', detail: '(type: string, listener: EventListener)', doc: 'イベントリスナーを登録' },
    { label: 'body', insert: 'body', kind: 'property', detail: 'HTMLElement', doc: '<body>要素' },
    { label: 'title', insert: 'title', kind: 'property', detail: 'string', doc: 'ドキュメントタイトル' },
  ],
  console: [
    { label: 'log', insert: 'log()', kind: 'function', detail: '(...data: any[]): void', doc: 'WebViewコンソールにログ出力' },
    { label: 'warn', insert: 'warn()', kind: 'function', detail: '(...data: any[]): void', doc: '警告メッセージを出力' },
    { label: 'error', insert: 'error()', kind: 'function', detail: '(...data: any[]): void', doc: 'エラーメッセージを出力' },
    { label: 'info', insert: 'info()', kind: 'function', detail: '(...data: any[]): void', doc: '情報メッセージを出力' },
    { label: 'table', insert: 'table()', kind: 'function', detail: '(data: any): void', doc: '配列・オブジェクトを表形式で出力' },
    { label: 'clear', insert: 'clear()', kind: 'function', detail: '(): void', doc: 'コンソールをクリア' },
  ],
  Math: [
    { label: 'round', insert: 'round()', kind: 'function', detail: '(x: number): number', doc: '四捨五入' },
    { label: 'floor', insert: 'floor()', kind: 'function', detail: '(x: number): number', doc: '切り捨て' },
    { label: 'ceil', insert: 'ceil()', kind: 'function', detail: '(x: number): number', doc: '切り上げ' },
    { label: 'random', insert: 'random()', kind: 'function', detail: '(): number', doc: '0以上1未満の乱数' },
    { label: 'max', insert: 'max()', kind: 'function', detail: '(...values: number[]): number', doc: '最大値' },
    { label: 'min', insert: 'min()', kind: 'function', detail: '(...values: number[]): number', doc: '最小値' },
    { label: 'abs', insert: 'abs()', kind: 'function', detail: '(x: number): number', doc: '絶対値' },
    { label: 'sin', insert: 'sin()', kind: 'function', detail: '(x: number): number', doc: '正弦' },
    { label: 'cos', insert: 'cos()', kind: 'function', detail: '(x: number): number', doc: '余弦' },
    { label: 'PI', insert: 'PI', kind: 'property', detail: 'number (3.14159...)', doc: '円周率' },
  ],
  JSON: [
    { label: 'parse', insert: 'parse()', kind: 'function', detail: '(text: string): any', doc: 'JSON文字列をオブジェクトへ変換' },
    { label: 'stringify', insert: 'stringify()', kind: 'function', detail: '(value: any, replacer?, space?): string', doc: '値をJSON文字列へ変換' },
  ],
  localStorage: [
    { label: 'getItem', insert: 'getItem()', kind: 'function', detail: '(key: string): string | null', doc: '値を取得' },
    { label: 'setItem', insert: 'setItem()', kind: 'function', detail: '(key: string, value: string): void', doc: '値を保存' },
    { label: 'removeItem', insert: 'removeItem()', kind: 'function', detail: '(key: string): void', doc: 'キーを削除' },
    { label: 'clear', insert: 'clear()', kind: 'function', detail: '(): void', doc: '全削除' },
  ],
  Promise: [
    { label: 'all', insert: 'all()', kind: 'function', detail: '<T>(values: Iterable<Promise<T>>)', doc: '全Promise完了を待機' },
    { label: 'resolve', insert: 'resolve()', kind: 'function', detail: '<T>(value: T): Promise<T>', doc: '解決済みPromiseを作成' },
    { label: 'reject', insert: 'reject()', kind: 'function', detail: '(reason?: any): Promise<never>', doc: '拒否されたPromiseを作成' },
  ],
  window: [
    { label: 'requestAnimationFrame', insert: 'requestAnimationFrame()', kind: 'function', detail: '(cb: FrameRequestCallback): number', doc: '次の描画フレームでコールバック実行' },
    { label: 'addEventListener', insert: 'addEventListener()', kind: 'function', detail: '(type: string, listener: EventListener)', doc: 'ウィンドウイベント登録' },
    { label: 'innerWidth', insert: 'innerWidth', kind: 'property', detail: 'number', doc: 'ビューポート幅' },
    { label: 'innerHeight', insert: 'innerHeight', kind: 'property', detail: 'number', doc: 'ビューポート高さ' },
  ],
  classList: [
    { label: 'add', insert: 'add()', kind: 'function', detail: '(...tokens: string[]): void', doc: 'クラスを追加' },
    { label: 'remove', insert: 'remove()', kind: 'function', detail: '(...tokens: string[]): void', doc: 'クラスを削除' },
    { label: 'toggle', insert: 'toggle()', kind: 'function', detail: '(token: string, force?: boolean): boolean', doc: 'クラスをトグル' },
    { label: 'contains', insert: 'contains()', kind: 'function', detail: '(token: string): boolean', doc: 'クラスが含まれるか確認' },
  ],
  style: [
    { label: 'display', insert: 'display = ', kind: 'property', detail: 'string', doc: 'CSS displayプロパティ' },
    { label: 'color', insert: 'color = ', kind: 'property', detail: 'string', doc: '文字色' },
    { label: 'backgroundColor', insert: 'backgroundColor = ', kind: 'property', detail: 'string', doc: '背景色' },
    { label: 'transform', insert: 'transform = ', kind: 'property', detail: 'string', doc: 'CSS transform' },
    { label: 'opacity', insert: 'opacity = ', kind: 'property', detail: 'string', doc: '不透明度' },
  ],
};

const GENERIC_MEMBER_COMPLETIONS: Array<{ label: string; insert: string; kind: CompletionItem['kind']; detail: string; doc: string }> = [
  { label: 'addEventListener', insert: "addEventListener('click', (e) => {\n  \n})", kind: 'function', detail: 'Element method', doc: 'DOMイベントを購読' },
  { label: 'textContent', insert: 'textContent', kind: 'property', detail: 'string | null', doc: '要素のテキスト内容' },
  { label: 'innerHTML', insert: 'innerHTML', kind: 'property', detail: 'string', doc: '内部HTML文字列' },
  { label: 'value', insert: 'value', kind: 'property', detail: 'string', doc: '入力コントロールの値' },
  { label: 'classList', insert: 'classList', kind: 'property', detail: 'DOMTokenList', doc: 'クラス操作API' },
  { label: 'style', insert: 'style', kind: 'property', detail: 'CSSStyleDeclaration', doc: 'インラインスタイル' },
  { label: 'map', insert: 'map((item) => )', kind: 'function', detail: 'Array<T>.map', doc: '各要素を変換した新配列を返す' },
  { label: 'filter', insert: 'filter((item) => )', kind: 'function', detail: 'Array<T>.filter', doc: '条件に合う要素を抽出' },
  { label: 'forEach', insert: 'forEach((item) => {\n  \n})', kind: 'function', detail: 'Array<T>.forEach', doc: '各要素に対して処理を実行' },
  { label: 'find', insert: 'find((item) => )', kind: 'function', detail: 'Array<T>.find', doc: '最初に一致した要素を返す' },
  { label: 'reduce', insert: 'reduce((acc, cur) => acc, 0)', kind: 'function', detail: 'Array<T>.reduce', doc: '配列を単一値に畳み込む' },
  { label: 'push', insert: 'push()', kind: 'function', detail: 'Array<T>.push', doc: '配列末尾に要素追加' },
  { label: 'includes', insert: 'includes()', kind: 'function', detail: 'boolean', doc: '要素/文字列が含まれるか判定' },
  { label: 'trim', insert: 'trim()', kind: 'function', detail: 'string.trim', doc: '前後の空白を除去' },
  { label: 'split', insert: 'split()', kind: 'function', detail: 'string.split', doc: '区切り文字で配列に分割' },
  { label: 'join', insert: "join(', ')", kind: 'function', detail: 'Array.join', doc: '配列を文字列結合' },
  { label: 'length', insert: 'length', kind: 'property', detail: 'number', doc: '配列・文字列の長さ' },
];

export function getCompletions(
  filePath: string,
  code: string,
  cursorOffset: number,
  allFiles: Array<{ path: string; content: string }>,
  forceTrigger = false
): CompletionItem[] {
  const lang = detectLanguage(filePath);
  const before = code.slice(0, cursorOffset);
  const lineStart = before.lastIndexOf('\n') + 1;
  const linePrefix = before.slice(lineStart);
  const symbols = extractWorkspaceSymbols(allFiles);

  if (lang === 'html') {
    return getHtmlCompletions(before, linePrefix, allFiles, forceTrigger);
  }
  if (lang === 'css') {
    return getCssCompletions(before, linePrefix, symbols, forceTrigger);
  }
  if (lang === 'javascript' || lang === 'typescript') {
    return getJsTsCompletions(lang, code, before, linePrefix, symbols, forceTrigger);
  }
  return [];
}

function getHtmlCompletions(
  before: string,
  linePrefix: string,
  allFiles: Array<{ path: string; content: string }>,
  forceTrigger: boolean
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // 1. Inside attribute value src="..." or href="..."
  const srcMatch = linePrefix.match(/(?:src|href)=["']([^"']*)$/);
  if (srcMatch) {
    const query = srcMatch[1].toLowerCase();
    for (const f of allFiles) {
      if (f.path.toLowerCase().includes(query) && f.path !== 'index.html') {
        items.push({
          label: f.path,
          insertText: f.path,
          kind: 'file',
          detail: 'プロジェクトファイル',
          replaceLength: srcMatch[1].length,
        });
      }
    }
    return items;
  }

  // 2. Inside open tag attributes: `<div cla`
  const openTagSlice = before.slice(before.lastIndexOf('<'));
  if (openTagSlice.startsWith('<') && !openTagSlice.includes('>') && !openTagSlice.startsWith('</')) {
    const tagSpace = openTagSlice.match(/^<([a-zA-Z0-9-]+)\s+([a-zA-Z-]*)$/);
    if (tagSpace) {
      const prefix = tagSpace[2].toLowerCase();
      for (const attr of HTML_ATTRS) {
        if (!prefix || attr.name.startsWith(prefix)) {
          items.push({
            label: attr.name,
            insertText: attr.name === 'disabled' ? 'disabled' : `${attr.name}=""`,
            kind: 'attr',
            detail: 'HTML Attribute',
            documentation: attr.doc,
            replaceLength: prefix.length,
            cursorBackOffset: attr.name === 'disabled' ? 0 : 1,
          });
        }
      }
      return items;
    }

    // Tag name `<di`
    const tagNameMatch = linePrefix.match(/<([a-zA-Z0-9-]*)$/);
    if (tagNameMatch) {
      const prefix = tagNameMatch[1].toLowerCase();
      for (const tag of HTML_TAGS) {
        if (!prefix || tag.startsWith(prefix)) {
          const isVoid = VOID_TAGS.has(tag);
          const snippet = isVoid ? `${tag}>` : `${tag}></${tag}>`;
          items.push({
            label: `<${tag}>`,
            insertText: snippet,
            kind: 'tag',
            detail: isVoid ? 'Void HTML Tag' : 'HTML Element',
            replaceLength: prefix.length,
            cursorBackOffset: isVoid ? 0 : tag.length + 3,
          });
        }
      }
      return items;
    }
  }

  // 3. Emmet `!` boilerplate or `tag.class#id`
  const emmetMatch = linePrefix.match(/(?:^|\s)(!|[a-zA-Z][a-zA-Z0-9]*(?:[.#][a-zA-Z0-9_-]+)+)$/);
  if (emmetMatch) {
    const raw = emmetMatch[1];
    if (raw === '!') {
      items.push({
        label: '! (HTML5 ボイラープレート)',
        insertText:
          '<!DOCTYPE html>\n<html lang="ja">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Document</title>\n  <link rel="stylesheet" href="styles/main.css" />\n</head>\n<body>\n  \n  <script src="src/main.ts"></script>\n</body>\n</html>',
        kind: 'snippet',
        detail: 'HTML5 Template',
        documentation: 'HTML5基本テンプレートを展開',
        replaceLength: 1,
      });
      return items;
    }
    const expanded = expandEmmet(raw);
    if (expanded) {
      items.push({
        label: `${raw} (Emmet展開)`,
        insertText: expanded.text,
        kind: 'snippet',
        detail: 'Emmet',
        documentation: expanded.text,
        replaceLength: raw.length,
        cursorBackOffset: expanded.cursorBack,
      });
    }
  }

  // 4. Plain word inside HTML body -> tag snippets
  const wordMatch = linePrefix.match(/([a-zA-Z][a-zA-Z0-9-]*)$/);
  if (wordMatch || forceTrigger) {
    const prefix = (wordMatch?.[1] || '').toLowerCase();
    for (const tag of HTML_TAGS) {
      if (!prefix || tag.startsWith(prefix)) {
        const isVoid = VOID_TAGS.has(tag);
        items.push({
          label: tag,
          insertText: isVoid ? `<${tag} />` : `<${tag}></${tag}>`,
          kind: 'tag',
          detail: 'HTML Tag',
          replaceLength: prefix.length,
          cursorBackOffset: isVoid ? 0 : tag.length + 3,
        });
      }
    }
  }

  return items.slice(0, 20);
}

function expandEmmet(expr: string): { text: string; cursorBack: number } | null {
  const m = expr.match(/^([a-zA-Z][a-zA-Z0-9]*)((?:[.#][a-zA-Z0-9_-]+)+)$/);
  if (!m) return null;
  const tag = m[1];
  const mods = m[2];
  let id = '';
  const classes: string[] = [];
  for (const part of mods.matchAll(/([.#])([a-zA-Z0-9_-]+)/g)) {
    if (part[1] === '#') id = part[2];
    else classes.push(part[2]);
  }
  const attrs = [id ? `id="${id}"` : '', classes.length ? `class="${classes.join(' ')}"` : '']
    .filter(Boolean)
    .join(' ');
  const close = `</${tag}>`;
  return {
    text: `<${tag}${attrs ? ' ' + attrs : ''}>${close}`,
    cursorBack: close.length,
  };
}

function getCssCompletions(
  before: string,
  linePrefix: string,
  symbols: WorkspaceSymbol[],
  forceTrigger: boolean
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Inside `var(--...)`
  const varMatch = linePrefix.match(/var\((--[a-zA-Z0-9_-]*)$/);
  if (varMatch) {
    const prefix = varMatch[1];
    for (const sym of symbols.filter((s) => s.kind === 'cssVar')) {
      if (sym.name.startsWith(prefix)) {
        items.push({
          label: sym.name,
          insertText: `${sym.name})`,
          kind: 'variable',
          detail: sym.detail,
          documentation: `${sym.filePath}:${sym.line}`,
          replaceLength: prefix.length,
        });
      }
    }
    return items;
  }

  // Value completion after `prop: val`
  const valMatch = linePrefix.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;]*)$/);
  if (valMatch) {
    const propName = valMatch[1].toLowerCase();
    const typedVal = valMatch[2].toLowerCase();
    const def = CSS_PROPS.find((p) => p.prop === propName);
    if (def) {
      for (const v of def.values) {
        if (!typedVal || v.toLowerCase().includes(typedVal)) {
          items.push({
            label: v,
            insertText: `${v};`,
            kind: 'value',
            detail: propName,
            replaceLength: valMatch[2].length,
          });
        }
      }
    }
    for (const sym of symbols.filter((s) => s.kind === 'cssVar')) {
      items.push({
        label: `var(${sym.name})`,
        insertText: `var(${sym.name});`,
        kind: 'variable',
        detail: sym.detail,
        replaceLength: valMatch[2].length,
      });
    }
    return items.slice(0, 16);
  }

  // Property completion inside `{ ... }`
  const lastOpen = before.lastIndexOf('{');
  const lastClose = before.lastIndexOf('}');
  const insideRule = lastOpen > lastClose;
  const wordMatch = linePrefix.match(/^\s*([a-zA-Z@-][a-zA-Z0-9-]*)$/);

  if (insideRule && (wordMatch || forceTrigger)) {
    const prefix = (wordMatch?.[1] || '').toLowerCase();
    for (const p of CSS_PROPS) {
      if (!prefix || p.prop.includes(prefix)) {
        items.push({
          label: p.prop,
          insertText: `${p.prop}: ;`,
          kind: 'property',
          detail: 'CSS Property',
          documentation: p.doc,
          replaceLength: prefix.length,
          cursorBackOffset: 1,
        });
      }
    }
    return items.slice(0, 20);
  }

  // Selector / At-rule snippets outside `{}`
  if (!insideRule && (wordMatch || forceTrigger)) {
    const prefix = wordMatch?.[1] || '';
    const snippets = [
      { label: '@media', insert: '@media (max-width: 768px) {\n  \n}', doc: 'レスポンシブメディアクエリ', back: 2 },
      { label: ':root', insert: ':root {\n  --primary: #3b82f6;\n}', doc: 'CSSカスタム変数定義', back: 2 },
      { label: '@keyframes', insert: '@keyframes fadeIn {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}', doc: 'アニメーション定義', back: 2 },
    ];
    for (const s of snippets) {
      if (!prefix || s.label.startsWith(prefix)) {
        items.push({
          label: s.label,
          insertText: s.insert,
          kind: 'snippet',
          detail: 'CSS Rule',
          documentation: s.doc,
          replaceLength: prefix.length,
          cursorBackOffset: s.back,
        });
      }
    }
  }

  return items;
}

function getJsTsCompletions(
  lang: 'javascript' | 'typescript',
  fullCode: string,
  before: string,
  linePrefix: string,
  symbols: WorkspaceSymbol[],
  forceTrigger: boolean
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // 1. Dot completion `obj.prop`
  const dotMatch = linePrefix.match(/([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)?$/);
  if (dotMatch) {
    const targetObj = dotMatch[1];
    const memberPrefix = (dotMatch[2] || '').toLowerCase();

    // Check known global/DOM APIs
    if (DOT_APIS[targetObj]) {
      for (const api of DOT_APIS[targetObj]) {
        if (!memberPrefix || api.label.toLowerCase().startsWith(memberPrefix)) {
          items.push({
            label: api.label,
            insertText: api.insert,
            kind: api.kind,
            detail: api.detail,
            documentation: api.doc,
            replaceLength: memberPrefix.length,
            cursorBackOffset: api.insert.endsWith('()') ? 1 : 0,
          });
        }
      }
      return items.slice(0, 20);
    }

    // Infer variable's TypeScript interface/type annotation in current file: e.g. `const task: TaskItem = ...` or `(task: TaskItem)`
    const typeRegex = new RegExp(`(?:const|let|var|\\(|,)\\s*${targetObj}\\??\\s*:\\s*([A-Za-z_$][\\w$]*)`);
    const typeHit = fullCode.match(typeRegex);
    if (typeHit) {
      const typeName = typeHit[1];
      const sym = symbols.find((s) => s.kind === 'interface' && s.name === typeName);
      if (sym?.members) {
        for (const mem of sym.members) {
          if (!memberPrefix || mem.name.toLowerCase().startsWith(memberPrefix)) {
            items.push({
              label: mem.name,
              insertText: mem.name,
              kind: 'property',
              detail: `${typeName}.${mem.name}: ${mem.type}`,
              documentation: `Defined in ${sym.filePath}`,
              replaceLength: memberPrefix.length,
            });
          }
        }
      }
    }

    // Generic DOM / Array / String member completions
    for (const gm of GENERIC_MEMBER_COMPLETIONS) {
      if (!memberPrefix || gm.label.toLowerCase().startsWith(memberPrefix)) {
        items.push({
          label: gm.label,
          insertText: gm.insert,
          kind: gm.kind,
          detail: gm.detail,
          documentation: gm.doc,
          replaceLength: memberPrefix.length,
          cursorBackOffset: gm.insert.endsWith('()') ? 1 : 0,
        });
      }
    }
    return items.slice(0, 20);
  }

  // 2. Identifier / snippet completion
  const wordMatch = linePrefix.match(/([a-zA-Z_$][\w$]*)$/);
  if (!wordMatch && !forceTrigger) return [];
  const prefix = (wordMatch?.[1] || '').toLowerCase();

  // Type annotation context after `:`
  const isTypeContext = /:\s*[a-zA-Z_$]*$/.test(linePrefix) && !linePrefix.includes('? ');

  if (lang === 'typescript' && isTypeContext) {
    const tsTypes = [
      'string', 'number', 'boolean', 'void', 'unknown', 'never', 'any',
      'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLCanvasElement',
      'MouseEvent', 'KeyboardEvent', 'Promise<>', 'Record<string, >', 'Partial<>',
    ];
    for (const tp of tsTypes) {
      if (!prefix || tp.toLowerCase().startsWith(prefix)) {
        items.push({
          label: tp,
          insertText: tp,
          kind: 'type',
          detail: 'TypeScript Type',
          replaceLength: prefix.length,
          cursorBackOffset: tp.endsWith('>') ? 1 : 0,
        });
      }
    }
  }

  // Workspace project symbols (functions, interfaces, types, variables, enums, classes)
  const seen = new Set<string>();
  for (const sym of symbols) {
    if (sym.kind === 'cssVar') continue;
    if (seen.has(sym.name)) continue;
    if (!prefix || sym.name.toLowerCase().includes(prefix)) {
      seen.add(sym.name);
      items.push({
        label: sym.name,
        insertText: sym.kind === 'function' ? `${sym.name}()` : sym.name,
        kind: sym.kind === 'interface' || sym.kind === 'type' || sym.kind === 'enum' ? 'type' : sym.kind === 'class' ? 'type' : sym.kind,
        detail: sym.detail,
        documentation: `${sym.filePath}:${sym.line}`,
        replaceLength: prefix.length,
        cursorBackOffset: sym.kind === 'function' ? 1 : 0,
      });
    }
  }

  // Useful code snippets
  const snippets: Array<{ label: string; insert: string; doc: string; kind: CompletionItem['kind']; back?: number }> = [
    { label: 'console.log', insert: 'console.log()', doc: 'WebViewコンソールへ出力', kind: 'snippet', back: 1 },
    { label: 'interface', insert: 'interface Name {\n  id: string;\n}', doc: 'TypeScriptインターフェース定義', kind: 'keyword', back: 2 },
    { label: 'type', insert: 'type Name = string | number;', doc: 'TypeScript型エイリアス', kind: 'keyword', back: 1 },
    { label: 'enum', insert: "enum Status {\n  Active = 'ACTIVE',\n  Done = 'DONE',\n}", doc: 'TypeScript Enum定義', kind: 'keyword', back: 2 },
    { label: 'function', insert: 'function name(arg: string): void {\n  \n}', doc: '関数宣言', kind: 'keyword', back: 2 },
    { label: 'async function', insert: 'async function fetchData(url: string): Promise<void> {\n  \n}', doc: '非同期関数', kind: 'snippet', back: 2 },
    { label: 'forof', insert: 'for (const item of items) {\n  \n}', doc: 'for...of ループ', kind: 'snippet', back: 2 },
    { label: 'trycatch', insert: 'try {\n  \n} catch (err) {\n  console.error(err);\n}', doc: '例外処理', kind: 'snippet' },
    { label: 'querySelector', insert: "document.querySelector('')", doc: 'DOM要素取得', kind: 'function', back: 2 },
    { label: 'getElementById', insert: "document.getElementById('')", doc: 'IDでDOM要素取得', kind: 'function', back: 2 },
    { label: 'addEventListener', insert: "addEventListener('click', () => {\n  \n})", doc: 'イベント登録', kind: 'function', back: 2 },
  ];

  for (const sn of snippets) {
    if (seen.has(sn.label)) continue;
    if (!prefix || sn.label.toLowerCase().includes(prefix)) {
      seen.add(sn.label);
      items.push({
        label: sn.label,
        insertText: sn.insert,
        kind: sn.kind,
        detail: 'Snippet',
        documentation: sn.doc,
        replaceLength: prefix.length,
        cursorBackOffset: sn.back || 0,
      });
    }
  }

  const globals = ['document', 'window', 'console', 'Math', 'JSON', 'localStorage', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'const', 'let', 'return', 'export', 'import', 'if', 'else', 'class', 'extends', 'implements', 'readonly'];
  for (const g of globals) {
    if (seen.has(g)) continue;
    if (!prefix || g.toLowerCase().startsWith(prefix)) {
      seen.add(g);
      items.push({
        label: g,
        insertText: g,
        kind: JS_DECL_KW.has(g) || JS_CONTROL_KW.has(g) ? 'keyword' : 'variable',
        detail: JS_DECL_KW.has(g) || JS_CONTROL_KW.has(g) ? 'Keyword' : 'Global API',
        replaceLength: prefix.length,
      });
    }
  }

  // Sort exact prefix matches first
  items.sort((a, b) => {
    const aStarts = a.label.toLowerCase().startsWith(prefix) ? 0 : 1;
    const bStarts = b.label.toLowerCase().startsWith(prefix) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.label.localeCompare(b.label);
  });

  return items.slice(0, 22);
}

/**
 * Clean indentation & JSON formatting for Shift+Alt+F / Format button.
 */
export function formatCode(code: string, lang: VSLang): string {
  if (lang === 'json') {
    try {
      return JSON.stringify(JSON.parse(code), null, 2);
    } catch {
      return code;
    }
  }

  const lines = code.replace(/\r\n/g, '\n').split('\n');
  let indent = 0;
  const formatted: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      formatted.push('');
      continue;
    }

    if (lang === 'html') {
      const isClosingTag = /^<\//.test(trimmed);
      if (isClosingTag) indent = Math.max(0, indent - 1);
      formatted.push('  '.repeat(indent) + trimmed);
      const opensTag = /^<([a-zA-Z0-9-]+)(?![^>]*\/>)[^>]*>$/.test(trimmed);
      const isSameLineClosed = /<\/[a-zA-Z0-9-]+>\s*$/.test(trimmed);
      const isVoid = VOID_TAGS.has((trimmed.match(/^<([a-zA-Z0-9-]+)/)?.[1] || '').toLowerCase());
      if (opensTag && !isSameLineClosed && !isVoid && !trimmed.startsWith('<!')) {
        indent++;
      }
      continue;
    }

    // JS / TS / CSS brace formatting
    if (/^[}\])]/.test(trimmed)) {
      indent = Math.max(0, indent - 1);
    }
    formatted.push('  '.repeat(indent) + trimmed);
    const openCount = (trimmed.match(/[{[(]/g) || []).length;
    const closeCount = (trimmed.match(/[}\])]/g) || []).length;
    const net = openCount - closeCount;
    if (net > 0) indent += net;
    else if (net < 0 && !/^[}\])]/.test(trimmed)) indent = Math.max(0, indent + net);
  }

  return formatted.join('\n');
}
