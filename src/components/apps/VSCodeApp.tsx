import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  FileCode2,
  FileJson,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  HardDrive,
  Laptop,
  Maximize2,
  Monitor,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  TerminalSquare,
  Trash2,
  Upload,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import {
  Diagnostic,
  VSLang,
  detectLanguage,
  transpileTypeScript,
  validateWorkspaceFile,
} from './vscode/tsEngine';
import {
  CompletionItem,
  formatCode,
  getCompletions,
  highlightCode,
} from './vscode/intellisense';
import {
  VSCODE_STORAGE_KEY,
  VSCODE_TEMPLATES,
  VSFile,
  WebOSDriveFile,
  buildWebViewHtml,
  createFilesFromTemplate,
  listWebOSDriveCodeFiles,
  saveFileToWebOSDrive,
} from './vscode/vscodeWorkspace';

interface VSCodeAppProps {
  initialFileContent?: string;
  initialFileName?: string;
  onFileConsumed?: () => void;
  language?: 'ja' | 'en';
}

interface ConsoleEntry {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
  time: string;
}

type SidebarTab = 'explorer' | 'search' | 'snippets';
type BottomTab = 'problems' | 'console' | 'compiled';
type PreviewViewport = 'desktop' | 'tablet' | 'mobile';
type ModalMode =
  | { type: 'new-file'; folderPrefix: string }
  | { type: 'new-folder' }
  | { type: 'rename'; targetPath: string }
  | { type: 'delete'; targetPath: string }
  | { type: 'drive-import' }
  | { type: 'template-confirm'; templateId: string }
  | null;

const MONO_FONT = "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function getLanguageBadge(lang: VSLang): { label: string; color: string } {
  switch (lang) {
    case 'html':
      return { label: 'HTML', color: '#e34c26' };
    case 'css':
      return { label: 'CSS', color: '#38bdf8' };
    case 'typescript':
      return { label: 'TS', color: '#3178c6' };
    case 'json':
      return { label: 'JSON', color: '#f59e0b' };
    default:
      return { label: 'JS', color: '#facc15' };
  }
}

function getCompletionKindBadge(kind: CompletionItem['kind']): { tag: string; color: string } {
  switch (kind) {
    case 'function':
      return { tag: 'fn', color: '#c586c0' };
    case 'type':
      return { tag: 'type', color: '#4ec9b0' };
    case 'keyword':
      return { tag: 'kw', color: '#569cd6' };
    case 'property':
      return { tag: 'prop', color: '#9cdcfe' };
    case 'tag':
      return { tag: 'tag', color: '#e34c26' };
    case 'attr':
      return { tag: 'attr', color: '#9cdcfe' };
    case 'snippet':
      return { tag: 'snip', color: '#dcdcaa' };
    case 'file':
      return { tag: 'file', color: '#38bdf8' };
    case 'value':
      return { tag: 'val', color: '#ce9178' };
    default:
      return { tag: 'var', color: '#7dd3fc' };
  }
}

const QUICK_SNIPPETS: Array<{ title: string; lang: string; code: string }> = [
  {
    title: 'HTML5 セクション枠',
    lang: 'HTML',
    code: '<section class="panel">\n  <h2>見出し</h2>\n  <p>コンテンツを入力</p>\n</section>\n',
  },
  {
    title: 'Flex 中央寄せ CSS',
    lang: 'CSS',
    code: '.center-box {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n}\n',
  },
  {
    title: 'CSS Grid レスポンシブ',
    lang: 'CSS',
    code: '.grid-cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\n  gap: 16px;\n}\n',
  },
  {
    title: 'TS Interface + 関数',
    lang: 'TS',
    code: 'interface UserProfile {\n  id: number;\n  name: string;\n  active: boolean;\n}\n\nfunction greetUser(user: UserProfile): string {\n  return `Hello, ${user.name}`;\n}\n',
  },
  {
    title: 'Fetch JSON (Async/TS)',
    lang: 'TS',
    code: 'async function loadJson<T>(url: string): Promise<T> {\n  const res = await fetch(url);\n  if (!res.ok) throw new Error(`HTTP ${res.status}`);\n  return (await res.json()) as T;\n}\n',
  },
];

export const VSCodeApp: React.FC<VSCodeAppProps> = ({
  initialFileContent,
  initialFileName,
  onFileConsumed,
  language = 'ja',
}) => {
  const isJa = language === 'ja';

  // Load workspace from localStorage or default TypeScript template
  const [files, setFiles] = useState<Record<string, VSFile>>(() => {
    try {
      const saved = localStorage.getItem(VSCODE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.files && Object.keys(parsed.files).length > 0) {
          return parsed.files;
        }
      }
    } catch {}
    return createFilesFromTemplate(VSCODE_TEMPLATES[0]);
  });

  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(VSCODE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.openTabs) && parsed.openTabs.length > 0) {
          return parsed.openTabs.filter((p: string) => parsed.files?.[p]);
        }
      }
    } catch {}
    return VSCODE_TEMPLATES[0].openTabs;
  });

  const [activeFile, setActiveFile] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(VSCODE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.activeFile && parsed.files?.[parsed.activeFile]) {
          return parsed.activeFile;
        }
      }
    } catch {}
    return VSCODE_TEMPLATES[0].activeFile;
  });

  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(['src', 'styles']));
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('explorer');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isWebViewOpen, setIsWebViewOpen] = useState(true);
  const [isWebViewFullscreen, setIsWebViewFullscreen] = useState(false);
  const [isBottomOpen, setIsBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>('console');
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('desktop');
  const [autoReload, setAutoReload] = useState(true);
  const [previewRevision, setPreviewRevision] = useState(1);
  const [renderedSrcDoc, setRenderedSrcDoc] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [consoleInput, setConsoleInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Split pane width ratio (% for editor inside main content area)
  const [splitPercent, setSplitPercent] = useState(55);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isResizingSplitRef = useRef(false);

  // Modal state (in-app dialog, never window.prompt/alert)
  const [modal, setModal] = useState<ModalMode>(null);
  const [modalInput, setModalInput] = useState('');
  const [modalError, setModalError] = useState('');
  const [driveFiles, setDriveFiles] = useState<WebOSDriveFile[]>([]);

  // Editor refs & state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, offset: 0 });
  const [completions, setCompletions] = useState<CompletionItem[]>([]);
  const [selectedCompletion, setSelectedCompletion] = useState(0);
  const [completionCoords, setCompletionCoords] = useState<{ top: number; left: number } | null>(null);

  const currentFile = files[activeFile] || Object.values(files)[0];
  const currentCode = currentFile?.content ?? '';
  const currentLang = currentFile?.language ?? 'javascript';

  // Flash transient status message cleanly without permanent telemetry
  const flashStatus = useCallback((msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  // Persist workspace to localStorage
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          VSCODE_STORAGE_KEY,
          JSON.stringify({ files, openTabs, activeFile })
        );
      } catch {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [files, openTabs, activeFile]);

  // Handle opening an external file from WebOS File Explorer
  useEffect(() => {
    if (initialFileName && initialFileContent !== undefined) {
      const cleanPath = initialFileName.replace(/^\/+/, '');
      const lang = detectLanguage(cleanPath);
      setFiles((prev) => ({
        ...prev,
        [cleanPath]: {
          path: cleanPath,
          content: initialFileContent,
          language: lang,
          updatedAt: Date.now(),
        },
      }));
      setOpenTabs((prev) => (prev.includes(cleanPath) ? prev : [...prev, cleanPath]));
      setActiveFile(cleanPath);
      if (cleanPath.includes('/')) {
        const folder = cleanPath.slice(0, cleanPath.lastIndexOf('/'));
        setExpandedFolders((prev) => new Set([...prev, folder]));
      }
      flashStatus(`${cleanPath} を開きました`);
      onFileConsumed?.();
    }
  }, [initialFileContent, initialFileName, onFileConsumed, flashStatus]);

  // Build WebView srcDoc when files change (debounced when autoReload enabled)
  const runWebView = useCallback(
    (sourceFiles: Record<string, VSFile>) => {
      const html = buildWebViewHtml(sourceFiles, 'index.html', { includeBridge: true });
      setRenderedSrcDoc(html);
      setPreviewRevision((r) => r + 1);
    },
    []
  );

  useEffect(() => {
    if (!autoReload) return;
    const timer = window.setTimeout(() => {
      runWebView(files);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [files, autoReload, runWebView]);

  // Initial render of WebView
  useEffect(() => {
    runWebView(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to WebView iframe postMessage console/errors
  useEffect(() => {
    const handleMsg = (ev: MessageEvent) => {
      if (ev.data?.source !== 'vscode-webview') return;
      if (ev.data.type === 'console') {
        const level = (ev.data.level || 'log') as ConsoleEntry['level'];
        const time = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setConsoleLogs((prev) => [
          ...prev.slice(-149),
          {
            id: Date.now() + Math.random(),
            level,
            text: String(ev.data.text ?? ''),
            time,
          },
        ]);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  // Split pane resize handler
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isResizingSplitRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(25, Math.min(75, Math.round(pct))));
    };
    const handleUp = () => {
      isResizingSplitRef.current = false;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  // Live syntax & TypeScript diagnostics across workspace
  const diagnostics: Diagnostic[] = useMemo(() => {
    const list: Diagnostic[] = [];
    for (const file of Object.values(files) as VSFile[]) {
      list.push(...validateWorkspaceFile(file.path, file.content));
    }
    return list;
  }, [files]);

  const activeFileDiagnostics = useMemo(
    () => diagnostics.filter((d) => d.filePath === currentFile?.path),
    [diagnostics, currentFile?.path]
  );

  // Live compiled JS output for TypeScript tab inspection
  const compiledJsOutput = useMemo(() => {
    if (!currentFile) return '';
    if (currentFile.language === 'typescript') {
      return transpileTypeScript(currentFile.content, currentFile.path).js;
    }
    if (currentFile.language === 'javascript') return currentFile.content;
    return `// ${currentFile.path} (${currentFile.language}) はコンパイル不要なファイルです`;
  }, [currentFile]);

  // Highlighted code lines
  const highlightedLines = useMemo(
    () => highlightCode(currentCode, currentLang),
    [currentCode, currentLang]
  );

  const lineCount = useMemo(() => Math.max(1, currentCode.split('\n').length), [currentCode]);

  // Search results across files
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const hits: Array<{ path: string; line: number; text: string }> = [];
    for (const f of Object.values(files) as VSFile[]) {
      const lines = f.content.split('\n');
      lines.forEach((ln, idx) => {
        if (ln.toLowerCase().includes(q)) {
          hits.push({ path: f.path, line: idx + 1, text: ln.trim() });
        }
      });
    }
    return hits.slice(0, 80);
  }, [files, searchQuery]);

  // Compute caret coordinates in editor for IntelliSense popup
  const computeCompletionPopupPosition = useCallback((text: string, offset: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = text.slice(0, offset);
    const linesBefore = before.split('\n');
    const lineIdx = linesBefore.length - 1;
    const colLen = linesBefore[linesBefore.length - 1].length;
    const lineHeight = 20;
    const charWidth = 7.82;
    const top = Math.max(24, (lineIdx + 1) * lineHeight + 12 - ta.scrollTop);
    const left = Math.max(12, Math.min(ta.clientWidth - 320, colLen * charWidth + 16 - ta.scrollLeft));
    setCompletionCoords({ top, left });
  }, []);

  const updateCursorAndCompletions = useCallback(
    (codeVal: string, selStart: number, force = false) => {
      const before = codeVal.slice(0, selStart);
      const linesBefore = before.split('\n');
      const line = linesBefore.length;
      const col = linesBefore[linesBefore.length - 1].length + 1;
      setCursorPos({ line, col, offset: selStart });

      if (isComposingRef.current || !currentFile) return;

      const allFileList = (Object.values(files) as VSFile[]).map((f) => ({ path: f.path, content: f.content }));
      const nextList = getCompletions(currentFile.path, codeVal, selStart, allFileList, force);
      if (nextList.length > 0 && (force || shouldShowPopupAuto(before, currentLang))) {
        setCompletions(nextList);
        setSelectedCompletion(0);
        computeCompletionPopupPosition(codeVal, selStart);
      } else {
        setCompletions([]);
      }
    },
    [currentFile, files, currentLang, computeCompletionPopupPosition]
  );

  function shouldShowPopupAuto(beforeCursor: string, lang: VSLang): boolean {
    const linePrefix = beforeCursor.slice(beforeCursor.lastIndexOf('\n') + 1);
    if (lang === 'html') {
      return /<[a-zA-Z0-9-]*$/.test(linePrefix) || /<[a-zA-Z0-9-]+\s+[a-zA-Z-]*$/.test(linePrefix) || /(?:src|href)=["'][^"']*$/.test(linePrefix);
    }
    if (lang === 'css') {
      return /var\(--[a-zA-Z0-9_-]*$/.test(linePrefix) || /:\s*[a-zA-Z0-9_-]+$/.test(linePrefix) || /^\s*[a-zA-Z@-]{2,}$/.test(linePrefix);
    }
    // JS/TS: `.` dot trigger or 2+ identifier chars
    return /\.[a-zA-Z0-9_$]*$/.test(linePrefix) || /[a-zA-Z_$][\w$]{1,}$/.test(linePrefix);
  }

  const updateActiveFileContent = useCallback(
    (newContent: string) => {
      if (!currentFile) return;
      const p = currentFile.path;
      setFiles((prev) => ({
        ...prev,
        [p]: {
          ...prev[p],
          content: newContent,
          updatedAt: Date.now(),
        },
      }));
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        next.add(p);
        return next;
      });
    },
    [currentFile]
  );

  const acceptCompletion = useCallback(
    (item: CompletionItem) => {
      const ta = textareaRef.current;
      if (!ta || !currentFile) return;
      const offset = ta.selectionStart;
      const startReplace = Math.max(0, offset - item.replaceLength);
      const nextCode =
        currentCode.slice(0, startReplace) +
        item.insertText +
        currentCode.slice(ta.selectionEnd);

      updateActiveFileContent(nextCode);
      setCompletions([]);

      const targetCaret =
        startReplace + item.insertText.length - (item.cursorBackOffset || 0);
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(targetCaret, targetCaret);
        const before = nextCode.slice(0, targetCaret);
        const split = before.split('\n');
        setCursorPos({ line: split.length, col: split[split.length - 1].length + 1, offset: targetCaret });
      });
    },
    [currentCode, currentFile, updateActiveFileContent]
  );

  const handleSaveCurrentFile = useCallback(() => {
    if (!currentFile) return;
    try {
      localStorage.setItem(VSCODE_STORAGE_KEY, JSON.stringify({ files, openTabs, activeFile }));
      saveFileToWebOSDrive(currentFile.path, currentFile.content);
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        next.delete(currentFile.path);
        return next;
      });
      flashStatus(
        isJa
          ? `保存しました: ${currentFile.path} (C:\\Documents にも同期)`
          : `Saved ${currentFile.path} & synced to Drive`
      );
    } catch {
      flashStatus(isJa ? '保存に失敗しました' : 'Save failed');
    }
  }, [currentFile, files, openTabs, activeFile, flashStatus, isJa]);

  const handleFormatDocument = useCallback(() => {
    if (!currentFile) return;
    const formatted = formatCode(currentFile.content, currentFile.language);
    updateActiveFileContent(formatted);
    setCompletions([]);
    flashStatus(isJa ? 'コードを整形しました' : 'Document formatted');
  }, [currentFile, updateActiveFileContent, flashStatus, isJa]);

  // Editor keyboard handling (IntelliSense navigation, Tab/Emmet, auto-pairs, Ctrl+S, Ctrl+/)
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;

    // 1. Autocomplete popup active
    if (completions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCompletion((i) => (i + 1) % completions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCompletion((i) => (i - 1 + completions.length) % completions.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        acceptCompletion(completions[selectedCompletion] || completions[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCompletions([]);
        return;
      }
    }

    // 2. Global editor shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleSaveCurrentFile();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runWebView(files);
      flashStatus(isJa ? 'Webビューを更新しました' : 'WebView refreshed');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
      e.preventDefault();
      updateCursorAndCompletions(currentCode, selStart, true);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      handleFormatDocument();
      return;
    }

    // Ctrl+/ Toggle line comment
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const lineStart = currentCode.lastIndexOf('\n', selStart - 1) + 1;
      const lineEndIdx = currentCode.indexOf('\n', selEnd);
      const lineEnd = lineEndIdx === -1 ? currentCode.length : lineEndIdx;
      const block = currentCode.slice(lineStart, lineEnd);
      const lines = block.split('\n');
      const useHtmlComment = currentLang === 'html';
      const useCssComment = currentLang === 'css';

      const toggled = lines
        .map((ln) => {
          if (useHtmlComment) {
            return /^\s*<!--.*-->\s*$/.test(ln)
              ? ln.replace(/<!--\s?/, '').replace(/\s?-->/, '')
              : `<!-- ${ln} -->`;
          }
          if (useCssComment) {
            return /^\s*\/\*.*\*\/\s*$/.test(ln)
              ? ln.replace(/\/\*\s?/, '').replace(/\s?\*\//, '')
              : `/* ${ln} */`;
          }
          return /^\s*\/\//.test(ln) ? ln.replace(/^(\s*)\/\/\s?/, '$1') : ln.replace(/^(\s*)/, '$1// ');
        })
        .join('\n');

      const nextCode = currentCode.slice(0, lineStart) + toggled + currentCode.slice(lineEnd);
      updateActiveFileContent(nextCode);
      requestAnimationFrame(() => {
        ta.setSelectionRange(lineStart, lineStart + toggled.length);
      });
      return;
    }

    // 3. Tab -> Emmet expand (HTML) or 2-space indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      if (currentLang === 'html' && selStart === selEnd) {
        const lineStart = currentCode.lastIndexOf('\n', selStart - 1) + 1;
        const lineBefore = currentCode.slice(lineStart, selStart);
        const allFileList = (Object.values(files) as VSFile[]).map((f) => ({ path: f.path, content: f.content }));
        const emmetCandidates = getCompletions(currentFile.path, currentCode, selStart, allFileList, false).filter(
          (c) => c.kind === 'snippet'
        );
        if (emmetCandidates.length > 0 && /(!|[a-zA-Z][a-zA-Z0-9]*[.#][a-zA-Z0-9_.-]+)$/.test(lineBefore)) {
          acceptCompletion(emmetCandidates[0]);
          return;
        }
      }

      if (selStart !== selEnd) {
        // Multi-line indent / outdent
        const blockStart = currentCode.lastIndexOf('\n', selStart - 1) + 1;
        const block = currentCode.slice(blockStart, selEnd);
        const updated = block
          .split('\n')
          .map((ln) => (e.shiftKey ? ln.replace(/^ {1,2}/, '') : '  ' + ln))
          .join('\n');
        const nextCode = currentCode.slice(0, blockStart) + updated + currentCode.slice(selEnd);
        updateActiveFileContent(nextCode);
        requestAnimationFrame(() => ta.setSelectionRange(blockStart, blockStart + updated.length));
        return;
      }

      const nextCode = currentCode.slice(0, selStart) + '  ' + currentCode.slice(selEnd);
      updateActiveFileContent(nextCode);
      requestAnimationFrame(() => ta.setSelectionRange(selStart + 2, selStart + 2));
      return;
    }

    // 4. Enter -> Smart auto-indentation
    if (e.key === 'Enter' && !isComposingRef.current) {
      e.preventDefault();
      const lineStart = currentCode.lastIndexOf('\n', selStart - 1) + 1;
      const lineBefore = currentCode.slice(lineStart, selStart);
      const currentIndent = (lineBefore.match(/^(\s*)/)?.[1]) || '';
      const charBefore = currentCode[selStart - 1];
      const charAfter = currentCode[selEnd];

      if ((charBefore === '{' && charAfter === '}') || (charBefore === '[' && charAfter === ']')) {
        const insert = `\n${currentIndent}  \n${currentIndent}`;
        const nextCode = currentCode.slice(0, selStart) + insert + currentCode.slice(selEnd);
        updateActiveFileContent(nextCode);
        const caret = selStart + 1 + currentIndent.length + 2;
        requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
        return;
      }

      const extraIndent =
        /[{[(]$/.test(lineBefore.trim()) ||
        (currentLang === 'html' && /<([a-zA-Z0-9-]+)[^>]*>$/.test(lineBefore.trim()) && !/\/>$/.test(lineBefore.trim()) && !/<\/[^>]+>$/.test(lineBefore.trim()))
          ? '  '
          : '';
      const insert = `\n${currentIndent}${extraIndent}`;
      const nextCode = currentCode.slice(0, selStart) + insert + currentCode.slice(selEnd);
      updateActiveFileContent(nextCode);
      const caret = selStart + insert.length;
      requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
      return;
    }

    // 5. Auto-close pairs
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key] && selStart === selEnd && !isComposingRef.current) {
      const nextChar = currentCode[selStart];
      if (!nextChar || /[\s)\]},;>]/.test(nextChar)) {
        e.preventDefault();
        const insert = e.key + pairs[e.key];
        const nextCode = currentCode.slice(0, selStart) + insert + currentCode.slice(selEnd);
        updateActiveFileContent(nextCode);
        requestAnimationFrame(() => ta.setSelectionRange(selStart + 1, selStart + 1));
        return;
      }
    }

    // HTML auto-close `>` tag
    if (e.key === '>' && currentLang === 'html' && selStart === selEnd) {
      const before = currentCode.slice(Math.max(0, selStart - 80), selStart);
      const openM = before.match(/<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?$/);
      const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
      if (openM && !before.endsWith('/') && !voidTags.has(openM[1].toLowerCase())) {
        e.preventDefault();
        const closing = `></${openM[1]}>`;
        const nextCode = currentCode.slice(0, selStart) + closing + currentCode.slice(selEnd);
        updateActiveFileContent(nextCode);
        requestAnimationFrame(() => ta.setSelectionRange(selStart + 1, selStart + 1));
      }
    }
  };

  // Sync scroll between textarea, highlighted pre, and line number gutter
  const handleEditorScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  };

  // Jump to file & line (used by Problems & Search)
  const openFileAtLine = (filePath: string, line: number) => {
    if (!files[filePath]) return;
    setOpenTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
    setActiveFile(filePath);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const lines = files[filePath].content.split('\n');
      let offset = 0;
      for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
        offset += lines[i].length + 1;
      }
      ta.focus();
      ta.setSelectionRange(offset, offset);
      ta.scrollTop = Math.max(0, (line - 4) * 20);
      handleEditorScroll();
    });
  };

  // ─── File / Folder Actions ───

  const openModalFor = (mode: ModalMode) => {
    setModalError('');
    if (mode?.type === 'new-file') {
      setModalInput(mode.folderPrefix ? `${mode.folderPrefix}/newFile.ts` : 'newFile.ts');
    } else if (mode?.type === 'new-folder') {
      setModalInput('components');
    } else if (mode?.type === 'rename') {
      setModalInput(mode.targetPath);
    } else if (mode?.type === 'drive-import') {
      setDriveFiles(listWebOSDriveCodeFiles());
    }
    setModal(mode);
  };

  const confirmModal = () => {
    if (!modal) return;
    if (modal.type === 'new-file') {
      const clean = modalInput.trim().replace(/^\/+/, '');
      if (!clean) {
        setModalError(isJa ? 'ファイル名を入力してください' : 'Enter a file name');
        return;
      }
      if (files[clean]) {
        setModalError(isJa ? '同名のファイルが既に存在します' : 'File already exists');
        return;
      }
      const lang = detectLanguage(clean);
      const starter =
        lang === 'html'
          ? '<!DOCTYPE html>\n<html lang="ja">\n<head>\n  <meta charset="UTF-8" />\n  <title>Page</title>\n</head>\n<body>\n  \n</body>\n</html>\n'
          : lang === 'css'
            ? '/* Stylesheet */\n'
            : lang === 'typescript'
              ? '// TypeScript module\nexport function init(): void {\n  console.log("Ready");\n}\n'
              : lang === 'json'
                ? '{\n  \n}\n'
                : '// JavaScript module\n';
      setFiles((prev) => ({
        ...prev,
        [clean]: { path: clean, content: starter, language: lang, updatedAt: Date.now() },
      }));
      setOpenTabs((prev) => [...prev, clean]);
      setActiveFile(clean);
      if (clean.includes('/')) {
        setExpandedFolders((prev) => new Set([...prev, clean.slice(0, clean.lastIndexOf('/'))]));
      }
      setModal(null);
      return;
    }

    if (modal.type === 'new-folder') {
      const folder = modalInput.trim().replace(/^\/+|\/+$/g, '');
      if (!folder) {
        setModalError(isJa ? 'フォルダ名を入力してください' : 'Enter a folder name');
        return;
      }
      const defaultPath = `${folder}/index.ts`;
      if (!files[defaultPath]) {
        setFiles((prev) => ({
          ...prev,
          [defaultPath]: {
            path: defaultPath,
            content: `// ${folder} module\nexport const moduleName = ${JSON.stringify(folder)};\n`,
            language: 'typescript',
            updatedAt: Date.now(),
          },
        }));
      }
      setExpandedFolders((prev) => new Set([...prev, folder]));
      setOpenTabs((prev) => (prev.includes(defaultPath) ? prev : [...prev, defaultPath]));
      setActiveFile(defaultPath);
      setModal(null);
      return;
    }

    if (modal.type === 'rename') {
      const nextPath = modalInput.trim().replace(/^\/+/, '');
      const oldPath = modal.targetPath;
      if (!nextPath) {
        setModalError(isJa ? '新しいパスを入力してください' : 'Enter a new path');
        return;
      }
      if (nextPath !== oldPath && files[nextPath]) {
        setModalError(isJa ? '同名のファイルが既に存在します' : 'File already exists');
        return;
      }
      const target = files[oldPath];
      if (!target) {
        setModal(null);
        return;
      }
      setFiles((prev) => {
        const copy = { ...prev };
        delete copy[oldPath];
        copy[nextPath] = {
          ...target,
          path: nextPath,
          language: detectLanguage(nextPath),
          updatedAt: Date.now(),
        };
        return copy;
      });
      setOpenTabs((prev) => prev.map((p) => (p === oldPath ? nextPath : p)));
      if (activeFile === oldPath) setActiveFile(nextPath);
      setModal(null);
      return;
    }

    if (modal.type === 'delete') {
      const delPath = modal.targetPath;
      if (Object.keys(files).length <= 1) {
        setModalError(isJa ? '最後の1ファイルは削除できません' : 'Cannot delete the last file');
        return;
      }
      setFiles((prev) => {
        const copy = { ...prev };
        delete copy[delPath];
        return copy;
      });
      const remainingTabs = openTabs.filter((p) => p !== delPath);
      setOpenTabs(remainingTabs);
      if (activeFile === delPath) {
        setActiveFile(remainingTabs[0] || Object.keys(files).find((k) => k !== delPath) || '');
      }
      setModal(null);
      return;
    }

    if (modal.type === 'template-confirm') {
      const tpl = VSCODE_TEMPLATES.find((t) => t.id === modal.templateId);
      if (tpl) {
        const nextFiles = createFilesFromTemplate(tpl);
        setFiles(nextFiles);
        setOpenTabs(tpl.openTabs);
        setActiveFile(tpl.activeFile);
        setDirtyPaths(new Set());
        setConsoleLogs([]);
        runWebView(nextFiles);
        flashStatus(`${isJa ? tpl.nameJa : tpl.nameEn} を読み込みました`);
      }
      setModal(null);
    }
  };

  const handleUploadLocalFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const loaded: Record<string, VSFile> = {};
    let firstLoaded = '';
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const text = await f.text();
      loaded[f.name] = {
        path: f.name,
        content: text,
        language: detectLanguage(f.name),
        updatedAt: Date.now(),
      };
      if (!firstLoaded) firstLoaded = f.name;
    }
    setFiles((prev) => ({ ...prev, ...loaded }));
    setOpenTabs((prev) => [...new Set([...prev, ...Object.keys(loaded)])]);
    if (firstLoaded) setActiveFile(firstLoaded);
    e.target.value = '';
    flashStatus(isJa ? `${Object.keys(loaded).length}件のファイルを読み込みました` : 'Imported local files');
  };

  const handleExportSingleHtml = () => {
    const bundle = buildWebViewHtml(files, 'index.html', { includeBridge: false });
    const blob = new Blob([bundle], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dist-bundle.html';
    a.click();
    URL.revokeObjectURL(url);
    flashStatus(isJa ? '単一HTMLバンドルを出力しました' : 'Exported dist-bundle.html');
  };

  const handleConsoleEval = (e: React.FormEvent) => {
    e.preventDefault();
    const expr = consoleInput.trim();
    if (!expr) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setConsoleLogs((prev) => [...prev, { id: Date.now(), level: 'info', text: `> ${expr}`, time }]);
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'vscode-host', type: 'eval', code: expr },
        '*'
      );
    } catch {}
    setConsoleInput('');
  };

  // Group files cleanly by top-level directory for Explorer tree
  const explorerTree = useMemo(() => {
    const folders = new Map<string, VSFile[]>();
    const rootFiles: VSFile[] = [];

    const sorted = (Object.values(files) as VSFile[]).sort((a, b) => a.path.localeCompare(b.path));
    for (const f of sorted) {
      if (f.path.includes('/')) {
        const idx = f.path.indexOf('/');
        const folder = f.path.slice(0, idx);
        const list = folders.get(folder) || [];
        list.push(f);
        folders.set(folder, list);
      } else {
        rootFiles.push(f);
      }
    }
    return {
      folders: Array.from(folders.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      rootFiles,
    };
  }, [files]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const renderFileIcon = (lang: VSLang) => {
    if (lang === 'html') return <Globe className="w-3.5 h-3.5 text-[#e34c26] shrink-0" />;
    if (lang === 'css') return <Sparkles className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />;
    if (lang === 'typescript') return <FileCode2 className="w-3.5 h-3.5 text-[#3178c6] shrink-0" />;
    if (lang === 'json') return <FileJson className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-[#facc15] shrink-0" />;
  };

  return (
    <div
      className="flex flex-col w-full h-full bg-[#1e1e1e] text-[#cccccc] select-none overflow-hidden"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
    >
      {/* Hidden local file input */}
      <input
        ref={fileUploadRef}
        type="file"
        multiple
        accept=".html,.htm,.css,.scss,.js,.jsx,.mjs,.ts,.tsx,.json,.txt"
        onChange={handleUploadLocalFiles}
        className="hidden"
      />

      {/* Top Workbench Toolbar */}
      <div className="h-9 shrink-0 bg-[#181818] border-b border-[#2d2d2d] px-2.5 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <Code2 className="w-4 h-4 text-[#007acc]" />
          <span className="text-[12px] font-semibold text-[#e5e7eb] whitespace-nowrap">
            VS Code
          </span>
          <span className="text-[#454545] mx-1">|</span>
          <select
            aria-label="Template Selector"
            value=""
            onChange={(e) => {
              if (e.target.value) openModalFor({ type: 'template-confirm', templateId: e.target.value });
            }}
            className="h-6 bg-[#252526] hover:bg-[#2a2d2e] border border-[#3c3c3c] rounded px-2 text-[11px] text-[#cccccc] outline-none cursor-pointer whitespace-nowrap"
          >
            <option value="">{isJa ? 'テンプレート切替...' : 'Templates...'}</option>
            {VSCODE_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {isJa ? tpl.nameJa : tpl.nameEn}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => openModalFor({ type: 'new-file', folderPrefix: '' })}
            className="h-6 px-2 rounded bg-[#252526] hover:bg-[#2a2d2e] border border-[#3c3c3c] text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0"
            title={isJa ? '新規ファイル作成' : 'New File'}
          >
            <FilePlus className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span>{isJa ? '新規' : 'New'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveCurrentFile}
            className="h-6 px-2 rounded bg-[#252526] hover:bg-[#2a2d2e] border border-[#3c3c3c] text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Ctrl+S"
          >
            <Save className="w-3.5 h-3.5 text-[#4ade80]" />
            <span>{isJa ? '保存' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={() => openModalFor({ type: 'drive-import' })}
            className="h-6 px-2 rounded bg-[#252526] hover:bg-[#2a2d2e] border border-[#3c3c3c] text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0"
            title={isJa ? 'C:ドライブから開く' : 'Open from C: Drive'}
          >
            <HardDrive className="w-3.5 h-3.5 text-[#9cdcfe]" />
            <span>{isJa ? 'C:読込' : 'Drive'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileUploadRef.current?.click()}
            className="h-6 px-2 rounded bg-[#252526] hover:bg-[#2a2d2e] border border-[#3c3c3c] text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0"
            title={isJa ? 'PCからファイルをインポート' : 'Upload from PC'}
          >
            <Upload className="w-3.5 h-3.5 text-[#cccccc]" />
          </button>

          <button
            type="button"
            onClick={handleFormatDocument}
            className="h-6 px-2 rounded bg-[#252526] hover:bg-[#2a2d2e] border border-[#3c3c3c] text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0"
            title={isJa ? 'コード整形 (Ctrl+Shift+F)' : 'Format Document'}
          >
            <Wand2 className="w-3.5 h-3.5 text-[#dcdcaa]" />
            <span>{isJa ? '整形' : 'Format'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {statusNotice && (
            <span className="text-[11px] text-[#38bdf8] whitespace-nowrap mr-1">
              {statusNotice}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              runWebView(files);
              if (!isWebViewOpen) setIsWebViewOpen(true);
            }}
            className="h-6 px-2.5 rounded bg-[#007acc] hover:bg-[#1a8ad4] text-white text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Ctrl+Enter"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isJa ? '実行 / Webビュー' : 'Run WebView'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportSingleHtml}
            className="h-6 px-2 rounded bg-[#252526] hover:bg-[#2a2d2e] border border-[#3c3c3c] text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0"
            title={isJa ? '単一HTMLとしてエクスポート' : 'Export HTML Bundle'}
          >
            <Download className="w-3.5 h-3.5" />
            <span>HTML</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsWebViewOpen((v) => !v);
              setIsWebViewFullscreen(false);
            }}
            className={`h-6 px-2 rounded border text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0 ${
              isWebViewOpen
                ? 'bg-[#094771] border-[#007acc] text-white'
                : 'bg-[#252526] border-[#3c3c3c] text-[#cccccc]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isJa ? 'Webビュー' : 'Preview'}</span>
          </button>
        </div>
      </div>

      {/* Main Workbench Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Far-Left Activity Bar */}
        <div className="w-11 shrink-0 bg-[#181818] border-r border-[#2d2d2d] flex flex-col items-center py-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (sidebarTab === 'explorer' && isSidebarOpen) setIsSidebarOpen(false);
              else {
                setSidebarTab('explorer');
                setIsSidebarOpen(true);
              }
            }}
            className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
              isSidebarOpen && sidebarTab === 'explorer'
                ? 'text-white bg-[#2a2d2e] border-l-2 border-[#007acc]'
                : 'text-[#858585] hover:text-white'
            }`}
            title={isJa ? 'エクスプローラー' : 'Explorer'}
          >
            <Folder className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (sidebarTab === 'search' && isSidebarOpen) setIsSidebarOpen(false);
              else {
                setSidebarTab('search');
                setIsSidebarOpen(true);
              }
            }}
            className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
              isSidebarOpen && sidebarTab === 'search'
                ? 'text-white bg-[#2a2d2e] border-l-2 border-[#007acc]'
                : 'text-[#858585] hover:text-white'
            }`}
            title={isJa ? '横断検索' : 'Search'}
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (sidebarTab === 'snippets' && isSidebarOpen) setIsSidebarOpen(false);
              else {
                setSidebarTab('snippets');
                setIsSidebarOpen(true);
              }
            }}
            className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
              isSidebarOpen && sidebarTab === 'snippets'
                ? 'text-white bg-[#2a2d2e] border-l-2 border-[#007acc]'
                : 'text-[#858585] hover:text-white'
            }`}
            title={isJa ? 'スニペット挿入' : 'Snippets'}
          >
            <Sparkles className="w-4.5 h-4.5" />
          </button>

          <div className="mt-auto flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setIsBottomOpen((v) => !v)}
              className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
                isBottomOpen ? 'text-white bg-[#2a2d2e]' : 'text-[#858585] hover:text-white'
              }`}
              title={isJa ? '問題 / コンソール切替' : 'Toggle Panel'}
            >
              <TerminalSquare className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Sidebar */}
        {isSidebarOpen && !isWebViewFullscreen && (
          <div className="w-56 shrink-0 bg-[#252526] border-r border-[#2d2d2d] flex flex-col min-h-0">
            {sidebarTab === 'explorer' && (
              <>
                <div className="h-8 px-3 flex items-center justify-between border-b border-[#2d2d2d] text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
                  <span>{isJa ? 'エクスプローラー' : 'EXPLORER'}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openModalFor({ type: 'new-file', folderPrefix: '' })}
                      className="p-1 rounded hover:bg-[#37373d] text-[#cccccc]"
                      title={isJa ? '新しいファイル' : 'New File'}
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openModalFor({ type: 'new-folder' })}
                      className="p-1 rounded hover:bg-[#37373d] text-[#cccccc]"
                      title={isJa ? '新しいフォルダ' : 'New Folder'}
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-1 text-[12px]">
                  {/* Folders */}
                  {explorerTree.folders.map(([folderName, folderFiles]) => {
                    const isOpen = expandedFolders.has(folderName);
                    return (
                      <div key={folderName}>
                        <div className="group flex items-center justify-between px-2 py-1 hover:bg-[#2a2d2e] cursor-pointer">
                          <div
                            className="flex items-center gap-1.5 flex-1 min-w-0"
                            onClick={() =>
                              setExpandedFolders((prev) => {
                                const next = new Set(prev);
                                if (next.has(folderName)) next.delete(folderName);
                                else next.add(folderName);
                                return next;
                              })
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-[#858585] shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-[#858585] shrink-0" />
                            )}
                            {isOpen ? (
                              <FolderOpen className="w-3.5 h-3.5 text-[#dcb67a] shrink-0" />
                            ) : (
                              <Folder className="w-3.5 h-3.5 text-[#dcb67a] shrink-0" />
                            )}
                            <span className="truncate font-medium text-[#cccccc]">{folderName}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openModalFor({ type: 'new-file', folderPrefix: folderName })}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#3c3c3c] rounded"
                            title={isJa ? 'フォルダ内に新規ファイル' : 'New file in folder'}
                          >
                            <FilePlus className="w-3 h-3" />
                          </button>
                        </div>

                        {isOpen &&
                          folderFiles.map((f) => {
                            const fileName = f.path.slice(folderName.length + 1);
                            const isSelected = currentFile?.path === f.path;
                            const hasErr = diagnostics.some(
                              (d) => d.filePath === f.path && d.severity === 'error'
                            );
                            return (
                              <div
                                key={f.path}
                                onClick={() => {
                                  setOpenTabs((prev) =>
                                    prev.includes(f.path) ? prev : [...prev, f.path]
                                  );
                                  setActiveFile(f.path);
                                }}
                                className={`group flex items-center justify-between pl-6 pr-2 py-1 cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#37373d] text-white'
                                    : 'hover:bg-[#2a2d2e] text-[#cccccc]'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  {renderFileIcon(f.language)}
                                  <span
                                    className={`truncate ${hasErr ? 'text-[#f87171]' : ''}`}
                                  >
                                    {fileName}
                                  </span>
                                </div>
                                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openModalFor({ type: 'rename', targetPath: f.path });
                                    }}
                                    className="p-0.5 hover:bg-[#454545] rounded"
                                    title={isJa ? '名前変更' : 'Rename'}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openModalFor({ type: 'delete', targetPath: f.path });
                                    }}
                                    className="p-0.5 hover:bg-[#454545] rounded text-[#f87171]"
                                    title={isJa ? '削除' : 'Delete'}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}

                  {/* Root files */}
                  {explorerTree.rootFiles.map((f) => {
                    const isSelected = currentFile?.path === f.path;
                    const hasErr = diagnostics.some(
                      (d) => d.filePath === f.path && d.severity === 'error'
                    );
                    return (
                      <div
                        key={f.path}
                        onClick={() => {
                          setOpenTabs((prev) =>
                            prev.includes(f.path) ? prev : [...prev, f.path]
                          );
                          setActiveFile(f.path);
                        }}
                        className={`group flex items-center justify-between pl-4 pr-2 py-1 cursor-pointer ${
                          isSelected
                            ? 'bg-[#37373d] text-white'
                            : 'hover:bg-[#2a2d2e] text-[#cccccc]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {renderFileIcon(f.language)}
                          <span className={`truncate ${hasErr ? 'text-[#f87171]' : ''}`}>
                            {f.path}
                          </span>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModalFor({ type: 'rename', targetPath: f.path });
                            }}
                            className="p-0.5 hover:bg-[#454545] rounded"
                            title={isJa ? '名前変更' : 'Rename'}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModalFor({ type: 'delete', targetPath: f.path });
                            }}
                            className="p-0.5 hover:bg-[#454545] rounded text-[#f87171]"
                            title={isJa ? '削除' : 'Delete'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {sidebarTab === 'search' && (
              <div className="flex flex-col h-full">
                <div className="h-8 px-3 flex items-center border-b border-[#2d2d2d] text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
                  {isJa ? 'ファイル横断検索' : 'SEARCH'}
                </div>
                <div className="p-2 border-b border-[#2d2d2d]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isJa ? 'キーワードを入力...' : 'Search across files...'}
                    className="w-full h-7 px-2 bg-[#3c3c3c] border border-[#4b4b4b] focus:border-[#007acc] rounded text-[12px] text-white outline-none"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-1 text-[11px]">
                  {searchQuery.trim() && searchResults.length === 0 && (
                    <div className="p-3 text-[#858585]">
                      {isJa ? '一致する行はありません' : 'No matches found'}
                    </div>
                  )}
                  {searchResults.map((hit, idx) => (
                    <button
                      key={`${hit.path}-${hit.line}-${idx}`}
                      type="button"
                      onClick={() => openFileAtLine(hit.path, hit.line)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[#2a2d2e] block"
                    >
                      <div className="flex items-center justify-between text-[#9cdcfe]">
                        <span className="truncate">{hit.path}</span>
                        <span className="tabular-nums text-[#858585]">:{hit.line}</span>
                      </div>
                      <div className="truncate text-[#cccccc] font-mono text-[11px] mt-0.5">
                        {hit.text}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sidebarTab === 'snippets' && (
              <div className="flex flex-col h-full">
                <div className="h-8 px-3 flex items-center border-b border-[#2d2d2d] text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
                  {isJa ? 'コードスニペット' : 'SNIPPETS'}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {QUICK_SNIPPETS.map((sn) => (
                    <button
                      key={sn.title}
                      type="button"
                      onClick={() => {
                        const ta = textareaRef.current;
                        const offset = ta ? ta.selectionStart : currentCode.length;
                        const next =
                          currentCode.slice(0, offset) + sn.code + currentCode.slice(offset);
                        updateActiveFileContent(next);
                        flashStatus(`${sn.title} を挿入しました`);
                      }}
                      className="w-full text-left p-2 rounded bg-[#1e1e1e] hover:bg-[#2a2d2e] border border-[#333333] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-[#e5e7eb]">{sn.title}</span>
                        <span className="text-[10px] font-mono text-[#38bdf8]">{sn.lang}</span>
                      </div>
                      <pre className="mt-1 text-[10px] text-[#858585] font-mono truncate">
                        {sn.code.split('\n')[0]}
                      </pre>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Center/Right Column: Editor + WebView Split + Bottom Drawer */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div ref={splitContainerRef} className="flex-1 flex min-h-0 overflow-hidden relative">
            {/* Code Editor Pane */}
            {!isWebViewFullscreen && (
              <div
                className="flex flex-col min-w-0 min-h-0 bg-[#1e1e1e]"
                style={{ width: isWebViewOpen ? `${splitPercent}%` : '100%' }}
              >
                {/* Open Tabs Bar */}
                <div className="h-9 shrink-0 bg-[#252526] border-b border-[#2d2d2d] flex items-center overflow-x-auto">
                  {openTabs.map((tabPath) => {
                    const file = files[tabPath];
                    if (!file) return null;
                    const isActive = currentFile?.path === tabPath;
                    const isDirty = dirtyPaths.has(tabPath);
                    return (
                      <div
                        key={tabPath}
                        onClick={() => setActiveFile(tabPath)}
                        className={`h-full px-3 flex items-center gap-1.5 border-r border-[#2d2d2d] cursor-pointer text-[12px] shrink-0 ${
                          isActive
                            ? 'bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]'
                            : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#2a2d2e]'
                        }`}
                      >
                        {renderFileIcon(file.language)}
                        <span className="whitespace-nowrap">{tabPath.split('/').pop()}</span>
                        {isDirty && <span className="text-[#38bdf8] text-[10px]">●</span>}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextTabs = openTabs.filter((t) => t !== tabPath);
                            setOpenTabs(nextTabs);
                            if (activeFile === tabPath && nextTabs.length > 0) {
                              setActiveFile(nextTabs[nextTabs.length - 1]);
                            }
                          }}
                          className="ml-1 p-0.5 rounded hover:bg-[#3c3c3c] text-[#858585] hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Breadcrumb & Active Diagnostics Banner */}
                {currentFile && (
                  <div className="h-7 shrink-0 px-3 bg-[#1e1e1e] border-b border-[#2d2d2d] flex items-center justify-between text-[11px] text-[#969696]">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span>{currentFile.path.replace(/\//g, '  >  ')}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 tabular-nums">
                      {activeFileDiagnostics.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsBottomOpen(true);
                            setBottomTab('problems');
                          }}
                          className="text-[#f87171] hover:underline whitespace-nowrap"
                        >
                          {activeFileDiagnostics[0].message} (L{activeFileDiagnostics[0].line})
                        </button>
                      )}
                      <span
                        className="font-mono font-semibold"
                        style={{ color: getLanguageBadge(currentLang).color }}
                      >
                        {getLanguageBadge(currentLang).label}
                      </span>
                    </div>
                  </div>
                )}

                {/* Code Editor Surface */}
                {currentFile ? (
                  <div className="flex-1 flex min-h-0 relative overflow-hidden bg-[#1e1e1e]">
                    {/* Line Numbers Gutter */}
                    <div
                      ref={gutterRef}
                      className="w-12 shrink-0 bg-[#1e1e1e] border-r border-[#2d2d2d] py-3 pr-2.5 text-right select-none overflow-hidden tabular-nums"
                      style={{ fontFamily: MONO_FONT, fontSize: '13px', lineHeight: '20px' }}
                    >
                      {Array.from({ length: lineCount }, (_, idx) => {
                        const ln = idx + 1;
                        const diag = activeFileDiagnostics.find((d) => d.line === ln);
                        const isCursorLine = cursorPos.line === ln;
                        return (
                          <div
                            key={ln}
                            title={diag?.message}
                            className={`h-[20px] ${
                              diag
                                ? 'text-[#f87171] font-bold'
                                : isCursorLine
                                  ? 'text-[#cccccc]'
                                  : 'text-[#6e7681]'
                            }`}
                          >
                            {ln}
                          </div>
                        );
                      })}
                    </div>

                    {/* Synchronized Highlight Layer + Textarea */}
                    <div className="flex-1 relative min-w-0 min-h-0 overflow-hidden">
                      {/* Active line subtle highlight */}
                      <div
                        className="pointer-events-none absolute left-0 right-0 bg-[#2a2d2e]/45"
                        style={{
                          top: `${12 + (cursorPos.line - 1) * 20 - (textareaRef.current?.scrollTop || 0)}px`,
                          height: '20px',
                        }}
                      />

                      {/* Syntax Highlighted <pre> */}
                      <pre
                        ref={preRef}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 m-0 px-4 py-3 overflow-hidden whitespace-pre select-none"
                        style={{
                          fontFamily: MONO_FONT,
                          fontSize: '13px',
                          lineHeight: '20px',
                          tabSize: 2,
                        }}
                      >
                        {highlightedLines.map((htmlLine, idx) => (
                          <div
                            key={idx}
                            className="h-[20px]"
                            dangerouslySetInnerHTML={{ __html: htmlLine }}
                          />
                        ))}
                      </pre>

                      {/* Transparent Native <textarea> for rock-solid IME, copy/paste & selection */}
                      <textarea
                        ref={textareaRef}
                        value={currentCode}
                        wrap="off"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                        autoCorrect="off"
                        onCompositionStart={() => {
                          isComposingRef.current = true;
                        }}
                        onCompositionEnd={(e) => {
                          isComposingRef.current = false;
                          updateCursorAndCompletions(
                            e.currentTarget.value,
                            e.currentTarget.selectionStart
                          );
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          const sel = e.target.selectionStart;
                          updateActiveFileContent(val);
                          updateCursorAndCompletions(val, sel);
                        }}
                        onClick={(e) => {
                          setCompletions([]);
                          updateCursorAndCompletions(
                            e.currentTarget.value,
                            e.currentTarget.selectionStart,
                            false
                          );
                        }}
                        onKeyUp={(e) => {
                          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                            const sel = e.currentTarget.selectionStart;
                            const linesBefore = e.currentTarget.value.slice(0, sel).split('\n');
                            setCursorPos({
                              line: linesBefore.length,
                              col: linesBefore[linesBefore.length - 1].length + 1,
                              offset: sel,
                            });
                          }
                        }}
                        onKeyDown={handleEditorKeyDown}
                        onScroll={handleEditorScroll}
                        className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-white px-4 py-3 outline-none overflow-auto whitespace-pre selection:bg-[#264f78]/70"
                        style={{
                          fontFamily: MONO_FONT,
                          fontSize: '13px',
                          lineHeight: '20px',
                          tabSize: 2,
                        }}
                      />

                      {/* IntelliSense Autocomplete Popup */}
                      {completions.length > 0 && completionCoords && (
                        <div
                          className="absolute z-40 w-80 max-h-60 overflow-y-auto bg-[#252526] border border-[#454545] rounded shadow-2xl py-1"
                          style={{
                            top: `${completionCoords.top}px`,
                            left: `${completionCoords.left}px`,
                          }}
                        >
                          {completions.map((item, idx) => {
                            const badge = getCompletionKindBadge(item.kind);
                            const isSel = idx === selectedCompletion;
                            return (
                              <button
                                key={`${item.label}-${idx}`}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  acceptCompletion(item);
                                }}
                                className={`w-full px-2.5 py-1 text-left flex items-center justify-between gap-2 text-[12px] ${
                                  isSel ? 'bg-[#04395e] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-7 text-[10px] font-mono font-bold uppercase shrink-0"
                                    style={{ color: badge.color }}
                                  >
                                    {badge.tag}
                                  </span>
                                  <span className="font-mono truncate">{item.label}</span>
                                </div>
                                {item.detail && (
                                  <span className="text-[10px] text-[#969696] truncate max-w-[120px]">
                                    {item.detail}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {completions[selectedCompletion]?.documentation && (
                            <div className="border-t border-[#3c3c3c] px-2.5 py-1.5 text-[11px] text-[#9cdcfe] bg-[#1e1e1e]">
                              {completions[selectedCompletion].documentation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[#858585] text-[13px]">
                    {isJa ? 'ファイルを選択してください' : 'Select a file to edit'}
                  </div>
                )}
              </div>
            )}

            {/* Draggable Split Handle */}
            {isWebViewOpen && !isWebViewFullscreen && (
              <div
                onMouseDown={() => {
                  isResizingSplitRef.current = true;
                }}
                className="w-1.5 shrink-0 bg-[#2d2d2d] hover:bg-[#007acc] cursor-col-resize transition-colors"
                title={isJa ? 'ドラッグして幅を調整' : 'Drag to resize'}
              />
            )}

            {/* Live WebView Preview Pane */}
            {isWebViewOpen && (
              <div
                className="flex flex-col min-w-0 min-h-0 bg-[#181818]"
                style={{ width: isWebViewFullscreen ? '100%' : `${100 - splitPercent}%` }}
              >
                {/* WebView Browser Chrome Bar */}
                <div className="h-9 shrink-0 px-2.5 bg-[#252526] border-b border-[#2d2d2d] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => runWebView(files)}
                      className="p-1 rounded hover:bg-[#37373d] text-[#cccccc]"
                      title={isJa ? '再読み込み' : 'Reload Preview'}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-6 px-2.5 rounded bg-[#1e1e1e] border border-[#3c3c3c] flex items-center gap-1.5 text-[11px] text-[#cccccc] min-w-0">
                      <Globe className="w-3 h-3 text-[#38bdf8] shrink-0" />
                      <span className="truncate font-mono">preview://index.html</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewViewport('desktop')}
                      className={`p-1 rounded ${
                        previewViewport === 'desktop'
                          ? 'bg-[#094771] text-white'
                          : 'text-[#969696] hover:bg-[#37373d]'
                      }`}
                      title="Desktop (100%)"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport('tablet')}
                      className={`p-1 rounded ${
                        previewViewport === 'tablet'
                          ? 'bg-[#094771] text-white'
                          : 'text-[#969696] hover:bg-[#37373d]'
                      }`}
                      title="Tablet (768px)"
                    >
                      <Tablet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport('mobile')}
                      className={`p-1 rounded ${
                        previewViewport === 'mobile'
                          ? 'bg-[#094771] text-white'
                          : 'text-[#969696] hover:bg-[#37373d]'
                      }`}
                      title="Mobile (375px)"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>

                    <label className="ml-1 flex items-center gap-1 text-[11px] text-[#cccccc] cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={autoReload}
                        onChange={(e) => setAutoReload(e.target.checked)}
                        className="accent-[#007acc]"
                      />
                      <span>{isJa ? '自動' : 'Auto'}</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setIsWebViewFullscreen((v) => !v)}
                      className="p-1 rounded hover:bg-[#37373d] text-[#cccccc]"
                      title={isJa ? 'Webビュー最大化切替' : 'Toggle Fullscreen Preview'}
                    >
                      {isWebViewFullscreen ? (
                        <Laptop className="w-3.5 h-3.5 text-[#38bdf8]" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Responsive Sandboxed WebView Surface */}
                <div className="flex-1 min-h-0 overflow-auto bg-[#111318] flex items-center justify-center p-2">
                  <div
                    className={`h-full bg-white overflow-hidden transition-all ${
                      previewViewport === 'desktop'
                        ? 'w-full rounded-sm'
                        : previewViewport === 'tablet'
                          ? 'w-[768px] max-w-full rounded-lg border-4 border-[#2d2d2d] shadow-2xl'
                          : 'w-[375px] max-w-full rounded-xl border-4 border-[#2d2d2d] shadow-2xl'
                    }`}
                  >
                    <iframe
                      key={previewRevision}
                      ref={iframeRef}
                      title="VS Code WebView Preview"
                      sandbox="allow-scripts allow-modals"
                      srcDoc={renderedSrcDoc}
                      className="w-full h-full border-none bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Drawer: Problems / Console / Compiled JS */}
          {isBottomOpen && (
            <div className="h-44 shrink-0 bg-[#1e1e1e] border-t border-[#2d2d2d] flex flex-col">
              <div className="h-8 shrink-0 px-3 bg-[#252526] border-b border-[#2d2d2d] flex items-center justify-between">
                <div className="flex items-center gap-4 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setBottomTab('problems')}
                    className={`h-8 flex items-center gap-1.5 border-b-2 transition-colors tabular-nums ${
                      bottomTab === 'problems'
                        ? 'border-[#007acc] text-white'
                        : 'border-transparent text-[#858585] hover:text-[#cccccc]'
                    }`}
                  >
                    <span>{isJa ? '問題' : 'PROBLEMS'}</span>
                    <span className="text-[#969696]">({diagnostics.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBottomTab('console')}
                    className={`h-8 flex items-center gap-1.5 border-b-2 transition-colors tabular-nums ${
                      bottomTab === 'console'
                        ? 'border-[#007acc] text-white'
                        : 'border-transparent text-[#858585] hover:text-[#cccccc]'
                    }`}
                  >
                    <span>{isJa ? 'コンソール' : 'CONSOLE'}</span>
                    <span className="text-[#969696]">({consoleLogs.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBottomTab('compiled')}
                    className={`h-8 flex items-center gap-1.5 border-b-2 transition-colors ${
                      bottomTab === 'compiled'
                        ? 'border-[#007acc] text-white'
                        : 'border-transparent text-[#858585] hover:text-[#cccccc]'
                    }`}
                  >
                    <span>{isJa ? 'TS→JS出力' : 'COMPILED JS'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {bottomTab === 'console' && (
                    <button
                      type="button"
                      onClick={() => setConsoleLogs([])}
                      className="text-[11px] text-[#969696] hover:text-white"
                    >
                      {isJa ? 'クリア' : 'Clear'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsBottomOpen(false)}
                    className="p-0.5 text-[#969696] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto font-mono text-[12px]">
                {bottomTab === 'problems' && (
                  <div className="p-2 space-y-1">
                    {diagnostics.length === 0 ? (
                      <div className="text-[#4ade80] px-2 py-1">
                        {isJa
                          ? 'ワークスペース内の問題は見つかりませんでした。'
                          : 'No problems detected in workspace.'}
                      </div>
                    ) : (
                      diagnostics.map((d, idx) => (
                        <button
                          key={`${d.filePath}-${d.line}-${idx}`}
                          type="button"
                          onClick={() => openFileAtLine(d.filePath, d.line)}
                          className="w-full text-left px-2 py-1 rounded hover:bg-[#2a2d2e] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {d.severity === 'error' ? (
                              <XCircle className="w-3.5 h-3.5 text-[#f87171] shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />
                            )}
                            <span className="truncate text-[#e5e7eb]">{d.message}</span>
                          </div>
                          <span className="text-[#858585] shrink-0 tabular-nums">
                            {d.filePath} [{d.line}:{d.col}]
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {bottomTab === 'console' && (
                  <div className="flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                      {consoleLogs.length === 0 && (
                        <div className="text-[#6e7681] px-1">
                          {isJa
                            ? 'Webビューからの console.log やエラーがここに表示されます'
                            : 'WebView console output appears here'}
                        </div>
                      )}
                      {consoleLogs.map((entry) => (
                        <div
                          key={entry.id}
                          className={`px-1.5 py-0.5 rounded flex items-start gap-2 ${
                            entry.level === 'error'
                              ? 'bg-[#5a1d1d]/40 text-[#fca5a5]'
                              : entry.level === 'warn'
                                ? 'bg-[#5a431d]/35 text-[#fde68a]'
                                : 'text-[#d4d4d4]'
                          }`}
                        >
                          <span className="text-[#6e7681] text-[10px] shrink-0 tabular-nums mt-0.5">
                            {entry.time}
                          </span>
                          <span className="whitespace-pre-wrap break-all">{entry.text}</span>
                        </div>
                      ))}
                    </div>
                    <form
                      onSubmit={handleConsoleEval}
                      className="h-7 shrink-0 border-t border-[#2d2d2d] px-2 flex items-center gap-1.5 bg-[#181818]"
                    >
                      <span className="text-[#38bdf8]">&gt;</span>
                      <input
                        type="text"
                        value={consoleInput}
                        onChange={(e) => setConsoleInput(e.target.value)}
                        placeholder={
                          isJa
                            ? 'Webビュー内でJS式を評価 (例: document.title)'
                            : 'Evaluate JS expression in WebView...'
                        }
                        className="flex-1 bg-transparent outline-none text-[12px] text-white"
                      />
                    </form>
                  </div>
                )}

                {bottomTab === 'compiled' && (
                  <pre className="p-3 text-[12px] text-[#9cdcfe] whitespace-pre-wrap">
                    {compiledJsOutput}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom VS Code Status Bar */}
      <div className="h-6 shrink-0 bg-[#007acc] text-white px-3 flex items-center justify-between text-[11px] tabular-nums">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsBottomOpen(true);
              setBottomTab('problems');
            }}
            className="flex items-center gap-2 hover:bg-white/15 px-1.5 py-0.5 rounded"
          >
            <span className="flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              {errorCount}
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {warningCount}
            </span>
          </button>
          <span className="hidden sm:inline opacity-90">
            {isJa ? 'Ctrl+Space: 補完  |  Ctrl+S: 保存  |  Tab: インデント / Emmet' : 'Ctrl+Space: IntelliSense | Ctrl+S: Save'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span>UTF-8</span>
          <span>{getLanguageBadge(currentLang).label}</span>
        </div>
      </div>

      {/* In-App Dialog Modals */}
      {modal && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#181818] border-b border-[#2d2d2d] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white">
                {modal.type === 'new-file' && (isJa ? '新規ファイル作成' : 'New File')}
                {modal.type === 'new-folder' && (isJa ? '新規フォルダ作成' : 'New Folder')}
                {modal.type === 'rename' && (isJa ? 'ファイル名・パス変更' : 'Rename File')}
                {modal.type === 'delete' && (isJa ? 'ファイル削除の確認' : 'Delete File')}
                {modal.type === 'drive-import' && (isJa ? 'WebOS ドライブから読み込み' : 'Import from C: Drive')}
                {modal.type === 'template-confirm' && (isJa ? 'テンプレートを適用' : 'Switch Project Template')}
              </span>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="p-1 rounded hover:bg-[#37373d] text-[#cccccc]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-[12px]">
              {(modal.type === 'new-file' || modal.type === 'new-folder' || modal.type === 'rename') && (
                <>
                  <p className="text-[#bbbbbb]">
                    {modal.type === 'new-file'
                      ? isJa
                        ? '作成するファイルパスを入力 (.html / .css / .js / .ts / .json)'
                        : 'Enter file path (.html, .css, .js, .ts, .json)'
                      : modal.type === 'new-folder'
                        ? isJa
                          ? '新しいフォルダ名を入力してください'
                          : 'Enter folder name'
                        : isJa
                          ? '新しいファイルパスを入力してください'
                          : 'Enter new file path'}
                  </p>
                  <input
                    autoFocus
                    type="text"
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmModal();
                    }}
                    className="w-full h-8 px-2.5 bg-[#1e1e1e] border border-[#007acc] rounded text-white font-mono outline-none"
                  />
                </>
              )}

              {modal.type === 'delete' && (
                <p className="text-[#e5e7eb]">
                  {isJa
                    ? `「${modal.targetPath}」を削除しますか？`
                    : `Delete "${modal.targetPath}"?`}
                </p>
              )}

              {modal.type === 'template-confirm' && (
                <p className="text-[#e5e7eb]">
                  {isJa
                    ? '選択したテンプレートで現在のワークスペースを置き換えますか？'
                    : 'Replace current workspace with the selected template?'}
                </p>
              )}

              {modal.type === 'drive-import' && (
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {driveFiles.length === 0 ? (
                    <div className="text-[#858585] py-4 text-center">
                      {isJa
                        ? 'C:ドライブに読み込み可能なWeb/コードファイルがありません'
                        : 'No HTML/CSS/JS/TS files found on C: Drive'}
                    </div>
                  ) : (
                    driveFiles.map((df) => (
                      <button
                        key={df.id}
                        type="button"
                        onClick={() => {
                          const lang = detectLanguage(df.name);
                          setFiles((prev) => ({
                            ...prev,
                            [df.name]: {
                              path: df.name,
                              content: df.content,
                              language: lang,
                              updatedAt: Date.now(),
                            },
                          }));
                          setOpenTabs((prev) => (prev.includes(df.name) ? prev : [...prev, df.name]));
                          setActiveFile(df.name);
                          setModal(null);
                          flashStatus(`${df.name} を読み込みました`);
                        }}
                        className="w-full px-3 py-2 rounded bg-[#1e1e1e] hover:bg-[#2a2d2e] border border-[#333333] flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {renderFileIcon(detectLanguage(df.name))}
                          <span className="truncate text-white font-mono">{df.name}</span>
                        </div>
                        <span className="text-[10px] text-[#858585] uppercase">
                          {detectLanguage(df.name)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {modalError && <div className="text-[#f87171]">{modalError}</div>}

              {modal.type !== 'drive-import' && (
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="px-3 py-1.5 rounded bg-[#3c3c3c] hover:bg-[#4b4b4b] text-white"
                  >
                    {isJa ? 'キャンセル' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={confirmModal}
                    className={`px-3 py-1.5 rounded text-white font-medium ${
                      modal.type === 'delete'
                        ? 'bg-[#b91c1c] hover:bg-[#dc2626]'
                        : 'bg-[#007acc] hover:bg-[#1a8ad4]'
                    }`}
                  >
                    {modal.type === 'delete' ? (isJa ? '削除' : 'Delete') : isJa ? '確定' : 'Confirm'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
