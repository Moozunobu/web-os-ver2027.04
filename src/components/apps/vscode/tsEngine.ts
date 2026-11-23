export type VSLang = 'html' | 'css' | 'javascript' | 'typescript' | 'json';

export interface Diagnostic {
  filePath: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface WorkspaceSymbol {
  name: string;
  kind: 'function' | 'variable' | 'interface' | 'type' | 'class' | 'enum' | 'cssVar';
  filePath: string;
  line: number;
  detail: string;
  members?: Array<{ name: string; type: string }>;
}

interface Token {
  type: 'ws' | 'comment' | 'string' | 'regex' | 'number' | 'ident' | 'punct' | 'newline';
  value: string;
  line: number;
  col: number;
}

const TS_MODIFIERS = new Set([
  'public',
  'private',
  'protected',
  'readonly',
  'override',
  'abstract',
  'declare',
]);

const NON_EXPR_END_KW = new Set([
  'return',
  'throw',
  'case',
  'typeof',
  'void',
  'delete',
  'await',
  'yield',
  'in',
  'of',
  'instanceof',
  'new',
  'else',
  'do',
]);

export function detectLanguage(filePath: string): VSLang {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.json')) return 'json';
  return 'javascript';
}

/**
 * Tokenizer for JS / TS that preserves whitespace & newlines for clean source mapping.
 */
export function tokenizeJsTs(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const len = code.length;

  const lastSigToken = (): Token | undefined => {
    for (let k = tokens.length - 1; k >= 0; k--) {
      if (tokens[k].type !== 'ws' && tokens[k].type !== 'comment' && tokens[k].type !== 'newline') {
        return tokens[k];
      }
    }
    return undefined;
  };

  while (i < len) {
    const ch = code[i];

    // Newline
    if (ch === '\n' || (ch === '\r' && code[i + 1] === '\n')) {
      const val = ch === '\r' ? '\r\n' : '\n';
      tokens.push({ type: 'newline', value: val, line, col });
      i += val.length;
      line++;
      col = 1;
      continue;
    }

    // Horizontal whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      let j = i + 1;
      while (j < len && (code[j] === ' ' || code[j] === '\t')) j++;
      const val = code.slice(i, j);
      tokens.push({ type: 'ws', value: val, line, col });
      col += val.length;
      i = j;
      continue;
    }

    // Line comment
    if (ch === '/' && code[i + 1] === '/') {
      let j = i + 2;
      while (j < len && code[j] !== '\n' && code[j] !== '\r') j++;
      const val = code.slice(i, j);
      tokens.push({ type: 'comment', value: val, line, col });
      col += val.length;
      i = j;
      continue;
    }

    // Block comment
    if (ch === '/' && code[i + 1] === '*') {
      const startLine = line;
      const startCol = col;
      let j = i + 2;
      while (j < len && !(code[j] === '*' && code[j + 1] === '/')) {
        if (code[j] === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
        j++;
      }
      if (j < len) {
        j += 2;
        col += 2;
      }
      tokens.push({ type: 'comment', value: code.slice(i, j), line: startLine, col: startCol });
      i = j;
      continue;
    }

    // Strings (' or ")
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startLine = line;
      const startCol = col;
      let j = i + 1;
      col++;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          col += 2;
          continue;
        }
        if (c === quote) {
          j++;
          col++;
          break;
        }
        if (c === '\n') break;
        j++;
        col++;
      }
      tokens.push({ type: 'string', value: code.slice(i, j), line: startLine, col: startCol });
      i = j;
      continue;
    }

    // Template string (`...`)
    if (ch === '`') {
      const startLine = line;
      const startCol = col;
      let j = i + 1;
      col++;
      let interpDepth = 0;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          col += 2;
          continue;
        }
        if (c === '\n') {
          line++;
          col = 1;
          j++;
          continue;
        }
        if (c === '$' && code[j + 1] === '{') {
          interpDepth++;
          j += 2;
          col += 2;
          continue;
        }
        if (interpDepth > 0) {
          if (c === '{') interpDepth++;
          else if (c === '}') interpDepth--;
          j++;
          col++;
          continue;
        }
        if (c === '`') {
          j++;
          col++;
          break;
        }
        j++;
        col++;
      }
      tokens.push({ type: 'string', value: code.slice(i, j), line: startLine, col: startCol });
      i = j;
      continue;
    }

    // Regex literal heuristic
    if (ch === '/') {
      const prev = lastSigToken();
      const canBeRegex =
        !prev ||
        (prev.type === 'punct' && !['}', ')', ']', '++', '--'].includes(prev.value)) ||
        (prev.type === 'ident' && NON_EXPR_END_KW.has(prev.value));
      if (canBeRegex) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < len && code[j] !== '\n' && code[j] !== '\r') {
          const c = code[j];
          if (c === '\\') {
            j += 2;
            continue;
          }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) {
            j++;
            while (j < len && /[a-zA-Z]/.test(code[j])) j++;
            closed = true;
            break;
          }
          j++;
        }
        if (closed) {
          const val = code.slice(i, j);
          tokens.push({ type: 'regex', value: val, line, col });
          col += val.length;
          i = j;
          continue;
        }
      }
    }

    // Number
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      let j = i;
      while (j < len && /[0-9a-fA-FxXoObBn._eE]/.test(code[j])) {
        if ((code[j] === 'e' || code[j] === 'E') && (code[j + 1] === '+' || code[j + 1] === '-')) {
          j += 2;
        } else {
          j++;
        }
      }
      const val = code.slice(i, j);
      tokens.push({ type: 'number', value: val, line, col });
      col += val.length;
      i = j;
      continue;
    }

    // Identifier / Keyword
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const val = code.slice(i, j);
      tokens.push({ type: 'ident', value: val, line, col });
      col += val.length;
      i = j;
      continue;
    }

    // Multi-character operators / punctuation
    const three = code.slice(i, i + 3);
    const two = code.slice(i, i + 2);
    let op = ch;
    if (['===', '!==', '...', '??=', '&&=', '||=', '>>>', '**='].includes(three)) {
      op = three;
    } else if (
      ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '<<', '>>', '**'].includes(two)
    ) {
      op = two;
    }
    tokens.push({ type: 'punct', value: op, line, col });
    col += op.length;
    i += op.length;
  }

  return tokens;
}

/**
 * Browser-safe TypeScript -> JavaScript transpiler & syntax checker.
 * Strips type annotations, interfaces, type aliases, generics, modifiers,
 * constructor parameter properties, and compiles enums into JS objects.
 */
export function transpileTypeScript(
  code: string,
  filePath = 'main.ts'
): { js: string; diagnostics: Diagnostic[] } {
  const tokens = tokenizeJsTs(code);
  const diagnostics: Diagnostic[] = [];

  // Structural bracket & unclosed string checks
  checkJsTsSyntax(tokens, filePath, diagnostics);

  const isWsOrComment = (t?: Token) =>
    !t || t.type === 'ws' || t.type === 'comment' || t.type === 'newline';

  const nextSigIdx = (idx: number): number => {
    let k = idx + 1;
    while (k < tokens.length && isWsOrComment(tokens[k])) k++;
    return k;
  };

  const prevSigIdx = (idx: number): number => {
    let k = idx - 1;
    while (k >= 0 && isWsOrComment(tokens[k])) k--;
    return k;
  };

  const skipBlock = (idx: number, openChar: string, closeChar: string): number => {
    let depth = 0;
    let k = idx;
    while (k < tokens.length) {
      const t = tokens[k];
      if (t.type === 'punct') {
        if (t.value === openChar) depth++;
        else if (t.value === closeChar) {
          depth--;
          if (depth === 0) return k;
        }
      }
      k++;
    }
    return tokens.length - 1;
  };

  const skipAngleBrackets = (idx: number): number | null => {
    // Expects tokens[idx].value === '<'
    let depth = 0;
    let paren = 0;
    let brace = 0;
    let bracket = 0;
    let k = idx;
    while (k < tokens.length) {
      const t = tokens[k];
      if (t.type === 'punct') {
        if (t.value === '(') paren++;
        else if (t.value === ')') paren = Math.max(0, paren - 1);
        else if (t.value === '{') brace++;
        else if (t.value === '}') brace = Math.max(0, brace - 1);
        else if (t.value === '[') bracket++;
        else if (t.value === ']') bracket = Math.max(0, bracket - 1);
        else if (paren === 0 && brace === 0 && bracket === 0) {
          if (t.value === '<') depth++;
          else if (t.value === '>') {
            depth--;
            if (depth === 0) return k;
          } else if (t.value === '>>') {
            depth -= 2;
            if (depth <= 0) return k;
          } else if (t.value === ';') {
            return null;
          }
        }
      }
      k++;
    }
    return null;
  };

  // Skip a TypeScript type expression starting at idx.
  // Returns the index of the LAST token belonging to the type expression.
  const skipTypeExpr = (startIdx: number, stopAtEquals = true, stopAtArrow = false): number => {
    let k = startIdx;
    let paren = 0;
    let bracket = 0;
    let brace = 0;
    let angle = 0;
    let lastValid = startIdx - 1;
    let expectingTypeAtom = true;

    while (k < tokens.length) {
      const t = tokens[k];
      if (isWsOrComment(t)) {
        if (t.type === 'newline' && paren === 0 && bracket === 0 && brace === 0 && angle === 0) {
          // If next sig token starts a new statement, stop before newline
          const ns = nextSigIdx(k);
          const nt = tokens[ns];
          if (
            nt &&
            !['|', '&', '=>', '.', '[', '<', '?'].includes(nt.value)
          ) {
            break;
          }
        }
        k++;
        continue;
      }

      if (t.type === 'punct') {
        if (paren === 0 && bracket === 0 && brace === 0 && angle === 0) {
          if (t.value === ',' || t.value === ';' || t.value === ')' || t.value === ']' || t.value === '}' || t.value === ':') {
            break;
          }
          if (stopAtEquals && t.value === '=') {
            break;
          }
          if (t.value === '{' && !expectingTypeAtom) {
            // Function/method body `{` starts here, do not consume!
            break;
          }
          if (t.value === '=>') {
            if (stopAtArrow) {
              break;
            }
            expectingTypeAtom = true;
            lastValid = k;
            k++;
            continue;
          }
          if (t.value === '|' || t.value === '&') {
            expectingTypeAtom = true;
            lastValid = k;
            k++;
            continue;
          }
        }

        if (t.value === '(') {
          paren++;
          expectingTypeAtom = true;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === '[') {
          bracket++;
          expectingTypeAtom = true;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === '{') {
          brace++;
          expectingTypeAtom = true;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === '<') {
          angle++;
          expectingTypeAtom = true;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === ')' && paren > 0) {
          paren--;
          expectingTypeAtom = false;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === ']' && bracket > 0) {
          bracket--;
          expectingTypeAtom = false;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === '}' && brace > 0) {
          brace--;
          expectingTypeAtom = false;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === '>' && angle > 0) {
          angle--;
          expectingTypeAtom = false;
          lastValid = k;
          k++;
          continue;
        }
        if (t.value === '>>' && angle > 0) {
          angle = Math.max(0, angle - 2);
          expectingTypeAtom = false;
          lastValid = k;
          k++;
          continue;
        }
      }

      if (paren === 0 && bracket === 0 && brace === 0 && angle === 0) {
        if (t.type === 'ident' && ['as', 'satisfies', 'implements', 'extends'].includes(t.value)) {
          if (t.value === 'implements') break;
        }
        if (t.type === 'ident' && t.value === 'is') {
          // Return type predicate `x is Foo`
          expectingTypeAtom = true;
          lastValid = k;
          k++;
          continue;
        }
      }

      expectingTypeAtom = false;
      lastValid = k;
      k++;
    }

    return lastValid >= startIdx ? lastValid : startIdx;
  };

  // Detect whether we are inside a statement where `:` is a type annotation vs ternary/object literal
  const out: string[] = [];
  let braceStack: Array<'block' | 'object' | 'class'> = [];
  let parenDepth = 0;

  // Lightweight state tracking for class constructor parameter properties
  let inClassBodyDepth = -1;
  let inConstructorParams = false;
  let ctorParamNames: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    // Emit whitespace/comments/newlines untouched
    if (isWsOrComment(t)) {
      out.push(t.value);
      i++;
      continue;
    }

    // Track parens & braces context
    if (t.type === 'punct') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        if (inConstructorParams && parenDepth === 0) {
          // Wait for constructor `{` to inject `this.x = x;`
        }
      } else if (t.value === '{') {
        const prevI = prevSigIdx(i);
        const prevT = tokens[prevI];
        let kind: 'block' | 'object' | 'class' = 'block';
        if (prevT && prevT.type === 'punct' && ['=', ':', '(', ',', '[', '?', '=>', '&&', '||', '??'].includes(prevT.value)) {
          // Check if `=> {` (block) vs `({` (object)
          if (prevT.value === '=>') kind = 'block';
          else kind = 'object';
        } else if (prevT && prevT.type === 'ident' && ['return', 'throw', 'export', 'default'].includes(prevT.value)) {
          kind = 'object';
        }
        // Check if previous tokens were `class Foo ...`
        for (let b = i - 1; b >= Math.max(0, i - 25); b--) {
          if (tokens[b].type === 'ident' && tokens[b].value === 'class') {
            kind = 'class';
            inClassBodyDepth = braceStack.length + 1;
            break;
          }
          if (tokens[b].type === 'punct' && (tokens[b].value === ';' || tokens[b].value === '{')) break;
        }

        braceStack.push(kind);
        out.push(t.value);

        if (inConstructorParams) {
          inConstructorParams = false;
          if (ctorParamNames.length > 0) {
            out.push(' ' + ctorParamNames.map((n) => `this.${n} = ${n};`).join(' '));
            ctorParamNames = [];
          }
        }
        i++;
        continue;
      } else if (t.value === '}') {
        if (braceStack.length === inClassBodyDepth) {
          inClassBodyDepth = -1;
        }
        braceStack.pop();
        out.push(t.value);
        i++;
        continue;
      }
    }

    const currentBrace = braceStack[braceStack.length - 1] || 'block';
    const prevIdx = prevSigIdx(i);
    const prev = prevIdx >= 0 ? tokens[prevIdx] : undefined;
    const isStmtStart =
      !prev ||
      (prev.type === 'punct' && [';', '{', '}'].includes(prev.value)) ||
      (prev.type === 'ident' && prev.value === 'export');

    // 1. `import type ...` or `import { type Foo, bar } ...`
    if (t.type === 'ident' && t.value === 'import') {
      const n1 = nextSigIdx(i);
      if (tokens[n1]?.type === 'ident' && tokens[n1].value === 'type') {
        // Skip entire statement up to semicolon or newline
        let k = i;
        while (k < tokens.length && tokens[k].value !== ';' && tokens[k].type !== 'newline') k++;
        if (tokens[k]?.value === ';') k++;
        i = k;
        continue;
      }
    }

    // 2. `export type` / `export interface` / `export declare` / top-level `interface` / `type` / `declare`
    if (t.type === 'ident' && t.value === 'export') {
      const n1 = nextSigIdx(i);
      const nt = tokens[n1];
      if (nt?.type === 'ident' && (nt.value === 'interface' || nt.value === 'type' || nt.value === 'declare')) {
        if (nt.value === 'interface') {
          let k = n1;
          while (k < tokens.length && tokens[k].value !== '{') k++;
          k = skipBlock(k, '{', '}');
          i = k + 1;
          continue;
        }
        if (nt.value === 'type') {
          let k = n1;
          while (k < tokens.length && tokens[k].value !== ';') {
            if (tokens[k].value === '{') k = skipBlock(k, '{', '}');
            k++;
          }
          i = k + 1;
          continue;
        }
      }
    }

    if (isStmtStart && t.type === 'ident' && t.value === 'interface') {
      let k = i;
      while (k < tokens.length && tokens[k].value !== '{') k++;
      k = skipBlock(k, '{', '}');
      i = k + 1;
      continue;
    }

    if (isStmtStart && t.type === 'ident' && t.value === 'type') {
      const n1 = nextSigIdx(i);
      const n2 = nextSigIdx(n1);
      if (tokens[n1]?.type === 'ident' && (tokens[n2]?.value === '=' || tokens[n2]?.value === '<')) {
        let k = i;
        while (k < tokens.length && tokens[k].value !== ';') {
          if (tokens[k].value === '{') k = skipBlock(k, '{', '}');
          if (tokens[k].type === 'newline') {
            const nxt = tokens[nextSigIdx(k)];
            if (nxt && !['|', '&', '='].includes(nxt.value)) break;
          }
          k++;
        }
        if (tokens[k]?.value === ';') k++;
        i = k;
        continue;
      }
    }

    if (isStmtStart && t.type === 'ident' && t.value === 'declare') {
      let k = i;
      while (k < tokens.length && tokens[k].value !== ';') {
        if (tokens[k].value === '{') {
          k = skipBlock(k, '{', '}');
          break;
        }
        k++;
      }
      i = k + 1;
      continue;
    }

    // 3. `enum Name { A, B = 'B' }` or `const enum Name { ... }`
    if (
      t.type === 'ident' &&
      (t.value === 'enum' || (t.value === 'const' && tokens[nextSigIdx(i)]?.value === 'enum'))
    ) {
      let k = t.value === 'const' ? nextSigIdx(i) : i;
      const nameIdx = nextSigIdx(k);
      const enumName = tokens[nameIdx]?.value || 'Enum';
      let braceStart = nextSigIdx(nameIdx);
      while (braceStart < tokens.length && tokens[braceStart].value !== '{') braceStart++;
      const braceEnd = skipBlock(braceStart, '{', '}');

      // Parse enum members inside braceStart..braceEnd
      const bodyStr = tokens
        .slice(braceStart + 1, braceEnd)
        .map((x) => x.value)
        .join('');
      const members = bodyStr
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      let nextAutoNum = 0;
      const entries: string[] = [];
      for (const member of members) {
        const eqIdx = member.indexOf('=');
        if (eqIdx === -1) {
          const val = nextAutoNum++;
          entries.push(`${enumName}[${enumName}[${JSON.stringify(member)}] = ${val}] = ${JSON.stringify(member)}`);
        } else {
          const key = member.slice(0, eqIdx).trim();
          const rawVal = member.slice(eqIdx + 1).trim();
          const num = Number(rawVal);
          if (!Number.isNaN(num)) {
            nextAutoNum = num + 1;
            entries.push(`${enumName}[${enumName}[${JSON.stringify(key)}] = ${rawVal}] = ${JSON.stringify(key)}`);
          } else {
            entries.push(`${enumName}[${JSON.stringify(key)}] = ${rawVal}`);
          }
        }
      }
      out.push(`var ${enumName}; (function (${enumName}) { ${entries.join('; ')}; })(${enumName} || (${enumName} = {}));`);
      i = braceEnd + 1;
      continue;
    }

    // 4. `implements Foo, Bar` in class declarations
    if (t.type === 'ident' && t.value === 'implements') {
      let k = i + 1;
      while (k < tokens.length && tokens[k].value !== '{') k++;
      i = k;
      continue;
    }

    // 5. Class access modifiers (`public`, `private`, `protected`, `readonly`, `override`, `abstract`)
    if (t.type === 'ident' && TS_MODIFIERS.has(t.value)) {
      const n1 = nextSigIdx(i);
      const nt = tokens[n1];
      if (nt && (nt.type === 'ident' || nt.value === '[')) {
        if (inConstructorParams && nt.type === 'ident') {
          ctorParamNames.push(nt.value);
        }
        // Skip modifier + trailing space
        i++;
        if (tokens[i]?.type === 'ws') i++;
        continue;
      }
    }

    // Detect `constructor(` inside class
    if (
      inClassBodyDepth !== -1 &&
      braceStack.length === inClassBodyDepth &&
      t.type === 'ident' &&
      t.value === 'constructor' &&
      tokens[nextSigIdx(i)]?.value === '('
    ) {
      inConstructorParams = true;
      ctorParamNames = [];
      out.push(t.value);
      i++;
      continue;
    }

    // 6. Strip `as Type` and `satisfies Type`
    if (t.type === 'ident' && (t.value === 'as' || t.value === 'satisfies')) {
      if (prev && prev.value !== '.') {
        const endType = skipTypeExpr(nextSigIdx(i), true, true);
        i = endType + 1;
        continue;
      }
    }

    // 7. Generic type parameters `<T>` on functions/classes/calls like `fn<string>(x)` or `function foo<T>(...)`
    if (t.type === 'punct' && t.value === '<') {
      const n1 = nextSigIdx(i);
      const n2 = nextSigIdx(n1);
      // Case A: `function name<T>(` or `class Name<T>` or `= <T>(`
      const isDeclarationGeneric =
        prev &&
        prev.type === 'ident' &&
        tokens[n1]?.type === 'ident' &&
        (tokens[n2]?.value === '>' ||
          tokens[n2]?.value === ',' ||
          tokens[n2]?.value === 'extends' ||
          tokens[n2]?.value === '=');
      // Case B: Call expression generics like `document.querySelector<HTMLButtonElement>('#btn')`
      const endAngle = isDeclarationGeneric || (prev?.type === 'ident' && tokens[n1]?.type === 'ident') ? skipAngleBrackets(i) : null;
      if (endAngle !== null) {
        const afterAngle = tokens[nextSigIdx(endAngle)];
        if (
          afterAngle &&
          (afterAngle.value === '(' || afterAngle.value === '{' || afterAngle.value === 'implements' || afterAngle.value === 'extends')
        ) {
          i = endAngle + 1;
          continue;
        }
      }
    }

    // 8. Optional property / parameter `?` before `:` or `,` or `)`
    if (t.type === 'punct' && t.value === '?') {
      const n1 = nextSigIdx(i);
      const nt = tokens[n1];
      if (nt && (nt.value === ':' || nt.value === ',' || nt.value === ')') && prev?.type === 'ident') {
        i++;
        continue;
      }
    }

    // 9. Postfix non-null assertion `!` (e.g. `el!.value`, `arr.pop()!`)
    if (t.type === 'punct' && t.value === '!') {
      const isPostfix =
        prev &&
        ((prev.type === 'ident' && !NON_EXPR_END_KW.has(prev.value)) ||
          (prev.type === 'punct' && [')', ']', '}'].includes(prev.value)));
      if (isPostfix) {
        i++;
        continue;
      }
    }

    // 10. Type annotations `: Type`
    // Determine if `:` is a type annotation (NOT object literal `{ k: v }`, NOT ternary `a ? b : c`, NOT `case x:`)
    if (t.type === 'punct' && t.value === ':') {
      const isParamOrVarOrReturn = (() => {
        if (currentBrace === 'object') return false;
        // Return type after `)` e.g. `function foo(): string {` or `(): void =>`
        if (prev?.value === ')') return true;
        // Variable declaration or parameter `x: string` or optional `y?: string`
        if (prev && (prev.type === 'ident' || prev.value === ']' || prev.value === '?')) {
          // Check backward for ternary `?` on same expression or `case`
          let depth = 0;
          for (let b = i - 1; b >= 0; b--) {
            const bt = tokens[b];
            if (bt.type === 'punct') {
              if (bt.value === ')' || bt.value === ']' || bt.value === '}') depth++;
              else if (bt.value === '(' || bt.value === '[' || bt.value === '{') {
                if (depth === 0) {
                  // Inside `(param: Type)` -> yes!
                  return bt.value === '(' || (bt.value === '{' && currentBrace === 'class');
                }
                depth--;
              } else if (depth === 0 && bt.value === '?') {
                if (b === prevIdx) continue;
                return false; // Ternary `cond ? a : b`
              } else if (depth === 0 && bt.value === ';') {
                return currentBrace === 'class';
              } else if (depth === 0 && bt.value === '=') {
                return false;
              }
            } else if (depth === 0 && bt.type === 'ident') {
              if (['const', 'let', 'var', 'function'].includes(bt.value)) return true;
              if (bt.value === 'case' || bt.value === 'default') return false;
            }
          }
          if (currentBrace === 'class') return true;
        }
        return false;
      })();

      if (isParamOrVarOrReturn) {
        const stopAtArrow = prev?.value === ')';
        const endType = skipTypeExpr(nextSigIdx(i), true, stopAtArrow);
        i = endType + 1;
        continue;
      }
    }

    // 11. Class field declarations without initializer (`name: string;` was already stripped to `name;`)
    out.push(t.value);
    i++;
  }

  return { js: out.join(''), diagnostics };
}

function checkJsTsSyntax(tokens: Token[], filePath: string, diagnostics: Diagnostic[]) {
  const stack: Array<{ ch: string; line: number; col: number }> = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closeToOpen: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  for (const t of tokens) {
    if (t.type === 'string') {
      const q = t.value[0];
      if (t.value.length < 2 || t.value[t.value.length - 1] !== q) {
        diagnostics.push({
          filePath,
          line: t.line,
          col: t.col,
          severity: 'error',
          message: '文字列リテラルが閉じられていません (Unterminated string literal)',
        });
      }
    } else if (t.type === 'comment' && t.value.startsWith('/*') && !t.value.endsWith('*/')) {
      diagnostics.push({
        filePath,
        line: t.line,
        col: t.col,
        severity: 'error',
        message: 'ブロックコメント /* が閉じられていません',
      });
    } else if (t.type === 'punct') {
      if (pairs[t.value]) {
        stack.push({ ch: t.value, line: t.line, col: t.col });
      } else if (closeToOpen[t.value]) {
        const expectedOpen = closeToOpen[t.value];
        const top = stack[stack.length - 1];
        if (!top || top.ch !== expectedOpen) {
          diagnostics.push({
            filePath,
            line: t.line,
            col: t.col,
            severity: 'error',
            message: `対応する '${expectedOpen}' がない閉じ括弧 '${t.value}' があります`,
          });
        } else {
          stack.pop();
        }
      }
    }
  }

  for (const unclosed of stack) {
    diagnostics.push({
      filePath,
      line: unclosed.line,
      col: unclosed.col,
      severity: 'error',
      message: `'${unclosed.ch}' が閉じられていません (Expected '${pairs[unclosed.ch]}')`,
    });
  }
}

export function validateCss(code: string, filePath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = code.split(/\r?\n/);
  let braceDepth = 0;
  let inComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let inStr: string | null = null;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (inComment) {
        if (ch === '*' && line[c + 1] === '/') {
          inComment = false;
          c++;
        }
        continue;
      }
      if (!inStr && ch === '/' && line[c + 1] === '*') {
        inComment = true;
        c++;
        continue;
      }
      if (inStr) {
        if (ch === '\\') c++;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === '{') braceDepth++;
      else if (ch === '}') {
        if (braceDepth === 0) {
          diagnostics.push({
            filePath,
            line: lineIdx + 1,
            col: c + 1,
            severity: 'error',
            message: "余分な '}' があります (Unexpected '}')",
          });
        } else {
          braceDepth--;
        }
      }
    }
    if (inStr) {
      diagnostics.push({
        filePath,
        line: lineIdx + 1,
        col: line.length,
        severity: 'error',
        message: 'CSS内の文字列が閉じられていません',
      });
    }
  }

  if (braceDepth > 0) {
    diagnostics.push({
      filePath,
      line: lines.length,
      col: 1,
      severity: 'error',
      message: `${braceDepth} 個の '{' が閉じられていません`,
    });
  }
  return diagnostics;
}

const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr', '!doctype',
]);

export function validateHtml(code: string, filePath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const stack: Array<{ tag: string; line: number; col: number }> = [];
  const tagRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z!][a-zA-Z0-9-]*)([^>]*)>/g;

  const getLineCol = (offset: number) => {
    const before = code.slice(0, offset);
    const parts = before.split('\n');
    return { line: parts.length, col: parts[parts.length - 1].length + 1 };
  };

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(code)) !== null) {
    const full = match[0];
    if (full.startsWith('<!--')) continue;
    const rawTag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const isClosing = full.startsWith('</');
    const isSelfClosing = attrs.trim().endsWith('/') || VOID_HTML_TAGS.has(rawTag);
    const pos = getLineCol(match.index);

    if (rawTag === 'script' || rawTag === 'style') {
      // Skip content inside script/style until its closing tag
      if (!isClosing) {
        const closeRe = new RegExp(`</${rawTag}\\s*>`, 'i');
        closeRe.lastIndex = tagRe.lastIndex;
        const sliceAfter = code.slice(tagRe.lastIndex);
        const closeMatch = closeRe.exec(sliceAfter);
        if (!closeMatch) {
          diagnostics.push({
            filePath,
            line: pos.line,
            col: pos.col,
            severity: 'error',
            message: `<${rawTag}> タグが閉じられていません`,
          });
        } else {
          tagRe.lastIndex += closeMatch.index + closeMatch[0].length;
        }
      }
      continue;
    }

    if (isClosing) {
      if (VOID_HTML_TAGS.has(rawTag)) continue;
      const top = stack[stack.length - 1];
      if (!top) {
        diagnostics.push({
          filePath,
          line: pos.line,
          col: pos.col,
          severity: 'warning',
          message: `開始タグのない </${rawTag}> があります`,
        });
      } else if (top.tag !== rawTag) {
        const idx = stack.map((s) => s.tag).lastIndexOf(rawTag);
        if (idx !== -1) {
          const unclosed = stack.pop()!;
          diagnostics.push({
            filePath,
            line: unclosed.line,
            col: unclosed.col,
            severity: 'warning',
            message: `<${unclosed.tag}> が </${rawTag}> より前に閉じられていません`,
          });
          while (stack.length > idx) stack.pop();
        } else {
          diagnostics.push({
            filePath,
            line: pos.line,
            col: pos.col,
            severity: 'warning',
            message: `</${rawTag}> に対応する開始タグが見つかりません`,
          });
        }
      } else {
        stack.pop();
      }
    } else if (!isSelfClosing) {
      stack.push({ tag: rawTag, line: pos.line, col: pos.col });
    }
  }

  for (const unclosed of stack) {
    diagnostics.push({
      filePath,
      line: unclosed.line,
      col: unclosed.col,
      severity: 'warning',
      message: `<${unclosed.tag}> タグが閉じられていません`,
    });
  }

  return diagnostics;
}

export function validateJson(code: string, filePath: string): Diagnostic[] {
  try {
    JSON.parse(code);
    return [];
  } catch (err: any) {
    const msg = String(err?.message || 'Invalid JSON');
    const posMatch = msg.match(/position\s+(\d+)/i);
    let line = 1;
    let col = 1;
    if (posMatch) {
      const pos = Number(posMatch[1]);
      const before = code.slice(0, pos).split('\n');
      line = before.length;
      col = before[before.length - 1].length + 1;
    }
    return [{ filePath, line, col, severity: 'error', message: `JSON構文エラー: ${msg}` }];
  }
}

export function validateWorkspaceFile(filePath: string, content: string): Diagnostic[] {
  const lang = detectLanguage(filePath);
  if (lang === 'typescript' || lang === 'javascript') {
    const res = transpileTypeScript(content, filePath);
    // Also run syntax parse via Function constructor in safe non-executing mode for extra JS check
    try {
      const cleanForCheck = res.js
        .replace(/^\s*import\s+[\s\S]*?;?\s*$/gm, '')
        .replace(/^\s*export\s+(default\s+)?/gm, '');
      // eslint-disable-next-line no-new-func
      new Function(cleanForCheck);
    } catch (e: any) {
      if (res.diagnostics.length === 0) {
        res.diagnostics.push({
          filePath,
          line: 1,
          col: 1,
          severity: 'error',
          message: `構文エラー: ${e?.message || 'SyntaxError'}`,
        });
      }
    }
    return res.diagnostics;
  }
  if (lang === 'css') return validateCss(content, filePath);
  if (lang === 'html') return validateHtml(content, filePath);
  if (lang === 'json') return validateJson(content, filePath);
  return [];
}

/**
 * Extracts functions, variables, interfaces, types, classes, enums, and CSS variables across all workspace files
 * for real cross-file IntelliSense.
 */
export function extractWorkspaceSymbols(
  files: Array<{ path: string; content: string }>
): WorkspaceSymbol[] {
  const symbols: WorkspaceSymbol[] = [];

  for (const file of files) {
    const lang = detectLanguage(file.path);
    const lines = file.content.split(/\r?\n/);

    if (lang === 'css') {
      lines.forEach((line, idx) => {
        const m = line.match(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+)/);
        if (m) {
          symbols.push({
            name: m[1],
            kind: 'cssVar',
            filePath: file.path,
            line: idx + 1,
            detail: m[2].trim(),
          });
        }
      });
      continue;
    }

    if (lang !== 'typescript' && lang !== 'javascript') continue;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];

      // interface Foo { ... }
      const ifaceMatch = line.match(/^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/);
      if (ifaceMatch) {
        const members: Array<{ name: string; type: string }> = [];
        for (let j = idx + 1; j < Math.min(lines.length, idx + 30); j++) {
          if (lines[j].includes('}')) break;
          const propM = lines[j].match(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:\s*([^;]+)/);
          if (propM) members.push({ name: propM[1], type: propM[2].trim() });
        }
        symbols.push({
          name: ifaceMatch[1],
          kind: 'interface',
          filePath: file.path,
          line: idx + 1,
          detail: `interface ${ifaceMatch[1]}`,
          members,
        });
        continue;
      }

      // type Foo = ...
      const typeMatch = line.match(/^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*=\s*(.+)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          filePath: file.path,
          line: idx + 1,
          detail: `type ${typeMatch[1]} = ${typeMatch[2].replace(/;$/, '')}`,
        });
        continue;
      }

      // enum Foo
      const enumMatch = line.match(/^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/);
      if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          kind: 'enum',
          filePath: file.path,
          line: idx + 1,
          detail: `enum ${enumMatch[1]}`,
        });
        continue;
      }

      // class Foo
      const classMatch = line.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath: file.path,
          line: idx + 1,
          detail: `class ${classMatch[1]}`,
        });
        continue;
      }

      // function foo(...)
      const fnMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(\([^)]*\)(?:\s*:\s*[^{\n]+)?)/);
      if (fnMatch) {
        symbols.push({
          name: fnMatch[1],
          kind: 'function',
          filePath: file.path,
          line: idx + 1,
          detail: `function ${fnMatch[1]}${fnMatch[2].trim()}`,
        });
        continue;
      }

      // const/let/var foo (: Type)? = ...
      const varMatch = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*([^=]+))?\s*=/);
      if (varMatch) {
        const isArrow = line.includes('=>');
        symbols.push({
          name: varMatch[1],
          kind: isArrow ? 'function' : 'variable',
          filePath: file.path,
          line: idx + 1,
          detail: varMatch[2] ? `${varMatch[1]}: ${varMatch[2].trim()}` : varMatch[1],
        });
      }
    }
  }

  return symbols;
}
