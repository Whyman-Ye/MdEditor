import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useEffect, useMemo, useRef, useState } from 'react'
import TurndownService from 'turndown'
import Chart from 'chart.js/auto'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import './App.css'
import { renderMarkdownToHtml } from './core/markdown'
import type { OutlineItem } from './core/outline'
import { buildOutline } from './core/outline'
import { ObsidianCompatBridge } from './plugins/obsidianCompat'
import { listPlugins, loadPlugins, type PluginDescriptor } from './plugins/pluginManager'

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0'
type AppLanguage = 'zh-CN' | 'en-US'

const chartGlobals = window as Window & {
  Chart?: typeof Chart
  'chartjs-plugin-datalabels'?: unknown
}
if (!chartGlobals.Chart) {
  Chart.register(ChartDataLabels)
  chartGlobals.Chart = Chart
  chartGlobals['chartjs-plugin-datalabels'] = ChartDataLabels
}

function defaultLanguage(): AppLanguage {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

const i18n = {
  'zh-CN': {
    untitledFile: '未命名.md',
    readMode: '阅读模式',
    editMode: '编辑模式',
    new: '新建',
    open: '打开',
    openFolder: '打开文件夹',
    save: '保存',
    saveAs: '另存为',
    findReplace: '查找/替换',
    exportPdf: '导出 PDF',
    help: '帮助',
    files: '文件',
    outline: '大纲',
    plugins: '插件',
    workspace: '工作区',
    folderNotOpen: '未打开文件夹',
    recentFiles: '最近文件',
    outlineTitle: '目录大纲',
    pluginManager: '插件管理',
    openPluginFolder: '打开插件文件夹',
    refreshPlugins: '刷新插件列表',
    noDescription: '无描述',
    aboutTitle: '版本',
    options: '选项',
    theme: '主题',
    language: '界面语言',
    autoSave: '自动保存间隔（秒）',
    autoSaveHint: '提示：仅对已保存到本地路径的文件生效，设置为 0 表示关闭自动保存。',
    showToolbar: '显示工具栏',
    showStatusbar: '显示状态栏',
    close: '关闭',
    dark: '深色',
    light: '浅色',
    zh: '中文',
    en: 'English',
    findAndReplace: '查找与替换',
    findPlaceholder: '查找内容',
    replacePlaceholder: '替换为',
    result: '结果',
    prev: '上一个',
    next: '查找下一个',
    replaceCurrent: '替换当前',
    replaceAll: '全部替换',
    pdfSettings: '导出 PDF 参数',
    pageSize: '页面大小',
    marginPx: '页边距(px)',
    scale: '缩放',
    revealAfterExport: '导出后在文件夹中显示',
    cancel: '取消',
    startExport: '开始导出',
    pageSetup: '页面设置',
    defaultPage: '默认页面',
    defaultMarginPx: '默认边距(px)',
    file: '文件',
    mode: '模式',
    helpRead: '帮助阅读',
    lineCol: '行',
    col: '列',
    lineCount: '行数',
    wordCount: '词数',
    pluginCount: '插件',
    mermaidHint: '滚轮缩放 | 拖动平移 | 双击重置 | 点击空白关闭',
    mermaidReset: '重置',
    clickFullscreen: '单击全屏查看',
    insertImage: '插入图片',
    insertTable: '插入表格',
    insertLink: '插入链接',
    unorderedList: '无序列表',
    orderedList: '有序列表',
    taskList: '任务列表',
    codeBlock: '代码块',
    quoteBlock: '引用块',
    divider: '分割线',
    currentDateTime: '当前日期时间',
    bold: '加粗',
    italic: '斜体',
    strike: '删除线',
    inlineCode: '行内代码',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    undo: '撤销',
    redo: '重做',
    showInFolder: '在文件夹中显示',
    copyFilePath: '复制文件路径',
    print: '打印',
    viewSource: '查看源代码',
    findNext: '查找下一个',
    replaceWith: '替换为',
    pluginAuthorDivider: ' · ',
  },
  'en-US': {
    untitledFile: 'Untitled.md',
    readMode: 'Read Mode',
    editMode: 'Edit Mode',
    new: 'New',
    open: 'Open',
    openFolder: 'Open Folder',
    save: 'Save',
    saveAs: 'Save As',
    findReplace: 'Find/Replace',
    exportPdf: 'Export PDF',
    help: 'Help',
    files: 'Files',
    outline: 'Outline',
    plugins: 'Plugins',
    workspace: 'Workspace',
    folderNotOpen: 'No folder opened',
    recentFiles: 'Recent Files',
    outlineTitle: 'Outline',
    pluginManager: 'Plugin Manager',
    openPluginFolder: 'Open Plugin Folder',
    refreshPlugins: 'Refresh Plugin List',
    noDescription: 'No description',
    aboutTitle: 'Version',
    options: 'Options',
    theme: 'Theme',
    language: 'Language',
    autoSave: 'Auto-save interval (seconds)',
    autoSaveHint: 'Hint: works only for files saved to local path. Set 0 to disable auto-save.',
    showToolbar: 'Show Toolbar',
    showStatusbar: 'Show Status Bar',
    close: 'Close',
    dark: 'Dark',
    light: 'Light',
    zh: '中文',
    en: 'English',
    findAndReplace: 'Find and Replace',
    findPlaceholder: 'Find text',
    replacePlaceholder: 'Replace with',
    result: 'Result',
    prev: 'Previous',
    next: 'Find Next',
    replaceCurrent: 'Replace Current',
    replaceAll: 'Replace All',
    pdfSettings: 'Export PDF Settings',
    pageSize: 'Page Size',
    marginPx: 'Margin (px)',
    scale: 'Scale',
    revealAfterExport: 'Reveal in folder after export',
    cancel: 'Cancel',
    startExport: 'Export',
    pageSetup: 'Page Setup',
    defaultPage: 'Default Page',
    defaultMarginPx: 'Default Margin (px)',
    file: 'File',
    mode: 'Mode',
    helpRead: 'Help Reading',
    lineCol: 'Line',
    col: 'Col',
    lineCount: 'Lines',
    wordCount: 'Words',
    pluginCount: 'Plugins',
    mermaidHint: 'Wheel: Zoom | Drag: Pan | Double-click: Reset | Click empty area: Close',
    mermaidReset: 'Reset',
    clickFullscreen: 'Click for fullscreen',
    insertImage: 'Insert Image',
    insertTable: 'Insert Table',
    insertLink: 'Insert Link',
    unorderedList: 'Unordered List',
    orderedList: 'Ordered List',
    taskList: 'Task List',
    codeBlock: 'Code Block',
    quoteBlock: 'Quote Block',
    divider: 'Horizontal Rule',
    currentDateTime: 'Current Date/Time',
    bold: 'Bold',
    italic: 'Italic',
    strike: 'Strikethrough',
    inlineCode: 'Inline Code',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    undo: 'Undo',
    redo: 'Redo',
    showInFolder: 'Show in Folder',
    copyFilePath: 'Copy File Path',
    print: 'Print',
    viewSource: 'View Source',
    findNext: 'Find Next',
    replaceWith: 'Replace with',
    pluginAuthorDivider: ' · ',
  },
} as const

function buildDefaultMarkdown(language: AppLanguage): string {
  if (language === 'zh-CN') {
    return `# MdEditor

欢迎使用 MdEditor。

- Ctrl+N 新建文件
- Ctrl+O 打开文件
- Ctrl+Shift+O 打开文件夹
- Ctrl+S 保存
- Ctrl+Shift+S 另存为
- Ctrl+E 切换阅读/编辑
- F1 查看帮助
`
  }

  return `# MdEditor

Welcome to MdEditor.

- Ctrl+N New file
- Ctrl+O Open file
- Ctrl+Shift+O Open folder
- Ctrl+S Save
- Ctrl+Shift+S Save as
- Ctrl+E Toggle read/edit mode
- F1 Open help
`
}

function buildFallbackHelp(language: AppLanguage): string {
  if (language === 'zh-CN') {
    return `# HELP

## 快捷键
- Ctrl+N：新建
- Ctrl+O：打开
- Ctrl+S：保存
- Ctrl+E：阅读/编辑切换
- Ctrl+Shift+T：切换大纲
`
  }

  return `# HELP

## Shortcuts
- Ctrl+N: New file
- Ctrl+O: Open file
- Ctrl+S: Save
- Ctrl+E: Toggle read/edit mode
- Ctrl+Shift+T: Toggle sidebar
`
}

type MainMode = 'read' | 'edit'
type EditMode = 'wysiwyg' | 'source'
type LeftTab = 'files' | 'outline' | 'plugins'
type ContextMenuState = { x: number; y: number } | null

type WorkspaceFile = {
  path: string
  name: string
  relativePath: string
}

type MenuCommandPayload = {
  id?: string
  command: string
  payload?: unknown
}

type PdfOptions = {
  pageSize: 'a4' | 'letter'
  margin: number
  fontScale: number
  openAfterExport: boolean
}

type AppOptions = {
  theme: 'dark' | 'light'
  language: AppLanguage
  autoSaveSeconds: number
  showToolbar: boolean
  showStatusbar: boolean
}

type EditorContextAction =
  | 'insert-image'
  | 'insert-table'
  | 'insert-link'
  | 'insert-ul'
  | 'insert-ol'
  | 'insert-task'
  | 'insert-code'
  | 'insert-quote'
  | 'insert-hr'
  | 'insert-date'
  | 'fmt-bold'
  | 'fmt-italic'
  | 'fmt-strike'
  | 'fmt-inline-code'
  | 'edit-cut'
  | 'edit-copy'
  | 'edit-paste'
  | 'edit-select-all'
  | 'edit-undo'
  | 'edit-redo'
  | 'file-show-folder'
  | 'file-copy-path'
  | 'read-copy'
  | 'read-select-all'
  | 'read-print'
  | 'read-view-source'

const turndown = new TurndownService()

function fileNameFromPath(path: string | null, fallbackName = i18n[defaultLanguage()].untitledFile): string {
  if (!path) {
    return fallbackName
  }
  return path.replace(/\\/g, '/').split('/').pop() || fallbackName
}

function directoryFromFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const slashIndex = normalized.lastIndexOf('/')
  if (slashIndex <= 0) {
    return normalized
  }
  return normalized.slice(0, slashIndex)
}

function fileDirectoryToUrl(directory: string): string | null {
  if (!directory) {
    return null
  }
  const normalized = directory.replace(/\\/g, '/')
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`
  const withTrailingSlash = prefixed.endsWith('/') ? prefixed : `${prefixed}/`
  return encodeURI(`file://${withTrailingSlash}`)
}

function resolvePreviewImageSrc(rawSrc: string, currentFilePath: string | null, isDesktopClient: boolean): string {
  const trimmed = rawSrc.trim()
  if (!trimmed) {
    return rawSrc
  }

  if (
    trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
    || trimmed.startsWith('data:')
    || trimmed.startsWith('blob:')
    || trimmed.startsWith('file:')
    || trimmed.startsWith('plugin://')
    || trimmed.startsWith('mailto:')
    || trimmed.startsWith('#')
  ) {
    return rawSrc
  }

  if (!isDesktopClient || !currentFilePath) {
    return rawSrc
  }

  const baseDirectory = directoryFromFilePath(currentFilePath)
  const baseUrl = fileDirectoryToUrl(baseDirectory)
  if (!baseUrl) {
    return rawSrc
  }

  try {
    return new URL(trimmed, baseUrl).toString()
  } catch {
    return rawSrc
  }
}

function getWordsCount(content: string): number {
  return content.trim().length === 0 ? 0 : content.trim().split(/\s+/).length
}

function getLineColumn(content: string, cursorIndex: number): { line: number; column: number } {
  const segment = content.slice(0, cursorIndex)
  const lines = segment.split('\n')
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  }
}

function escapeMarkdownInline(text: string): string {
  return text.replace(/([`*_~[\]()\\])/g, '\\$1')
}

function findMatchIndexes(content: string, keyword: string): number[] {
  const normalized = keyword.trim()
  if (!normalized) {
    return []
  }
  const indexes: number[] = []
  let cursor = 0
  while (cursor < content.length) {
    const idx = content.indexOf(normalized, cursor)
    if (idx < 0) {
      break
    }
    indexes.push(idx)
    cursor = idx + normalized.length
  }
  return indexes
}

function applyFindHighlights(root: HTMLElement, keyword: string, activeIndex: number): void {
  if (!keyword.trim()) {
    return
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    if (current.nodeType === Node.TEXT_NODE && current.textContent?.trim()) {
      textNodes.push(current as Text)
    }
    current = walker.nextNode()
  }

  let globalIndex = 0
  for (const textNode of textNodes) {
    const value = textNode.nodeValue ?? ''
    const parts: Array<{ text: string; match: boolean; index: number }> = []
    let offset = 0
    while (offset < value.length) {
      const idx = value.indexOf(keyword, offset)
      if (idx < 0) {
        parts.push({ text: value.slice(offset), match: false, index: -1 })
        break
      }
      if (idx > offset) {
        parts.push({ text: value.slice(offset, idx), match: false, index: -1 })
      }
      parts.push({ text: value.slice(idx, idx + keyword.length), match: true, index: globalIndex })
      globalIndex += 1
      offset = idx + keyword.length
    }

    if (!parts.some((part) => part.match)) {
      continue
    }

    const fragment = document.createDocumentFragment()
    for (const part of parts) {
      if (!part.match) {
        fragment.appendChild(document.createTextNode(part.text))
      } else {
        const mark = document.createElement('mark')
        mark.className = part.index === activeIndex ? 'find-highlight active' : 'find-highlight'
        mark.textContent = part.text
        fragment.appendChild(mark)
      }
    }
    textNode.parentNode?.replaceChild(fragment, textNode)
  }
}

function openMermaidFullscreenViewer(
  sourceSvg: SVGSVGElement,
  texts: { hint: string; reset: string; close: string },
): void {
  const overlay = document.createElement('div')
  overlay.className = 'mermaid-viewer'

  const toolbar = document.createElement('div')
  toolbar.className = 'mermaid-viewer-toolbar'

  const hint = document.createElement('div')
  hint.className = 'mermaid-viewer-hint'
  hint.textContent = texts.hint

  const resetBtn = document.createElement('button')
  resetBtn.type = 'button'
  resetBtn.className = 'mermaid-viewer-btn'
  resetBtn.textContent = texts.reset

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'mermaid-viewer-btn'
  closeBtn.textContent = texts.close

  toolbar.appendChild(hint)
  toolbar.appendChild(resetBtn)
  toolbar.appendChild(closeBtn)

  const stage = document.createElement('div')
  stage.className = 'mermaid-viewer-stage'
  const canvas = document.createElement('div')
  canvas.className = 'mermaid-viewer-canvas'
  const svg = sourceSvg.cloneNode(true) as SVGSVGElement
  svg.classList.add('mermaid-viewer-svg')
  canvas.appendChild(svg)
  stage.appendChild(canvas)

  overlay.appendChild(toolbar)
  overlay.appendChild(stage)
  document.body.appendChild(overlay)
  document.body.classList.add('mermaid-viewer-open')

  const parseSvgViewBox = () => {
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number)
    if (vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0) {
      return { x: vb[0], y: vb[1], width: vb[2], height: vb[3] }
    }
    return null
  }

  const parseLength = (value: string | null): number | null => {
    if (!value) {
      return null
    }
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  const resolveSvgSize = () => {
    const vb = parseSvgViewBox()
    if (vb) {
      return { width: vb.width, height: vb.height }
    }
    const width = parseLength(svg.getAttribute('width'))
    const height = parseLength(svg.getAttribute('height'))
    if (width && height) {
      return { width, height }
    }
    try {
      const box = svg.getBBox()
      if (box.width > 0 && box.height > 0) {
        return { width: box.width, height: box.height }
      }
    } catch {
      // ignore and fallback below
    }
    return { width: 1000, height: 800 }
  }

  const intrinsic = resolveSvgSize()
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.style.width = `${intrinsic.width}px`
  svg.style.height = `${intrinsic.height}px`

  let scale = 1
  let minScale = 0.05
  let maxScale = 10
  let translateX = 0
  let translateY = 0

  let isDragging = false
  let hasDragged = false
  let dragStartX = 0
  let dragStartY = 0
  let dragStartTranslateX = 0
  let dragStartTranslateY = 0

  const applyTransform = () => {
    canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
  }

  const resetTransform = () => {
    const stageWidth = Math.max(1, stage.clientWidth)
    const stageHeight = Math.max(1, stage.clientHeight)
    const padding = 24
    const fitScale = Math.min(
      (stageWidth - padding * 2) / intrinsic.width,
      (stageHeight - padding * 2) / intrinsic.height,
    )
    const safeFitScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1
    scale = safeFitScale
    minScale = Math.max(safeFitScale * 0.25, 0.05)
    maxScale = Math.max(safeFitScale * 20, 10)
    translateX = (stageWidth - intrinsic.width * scale) / 2
    translateY = (stageHeight - intrinsic.height * scale) / 2
    applyTransform()
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = stage.getBoundingClientRect()
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    const nextScale = Math.min(maxScale, Math.max(minScale, scale * factor))
    if (Math.abs(nextScale - scale) < 0.0001) {
      return
    }
    const localX = (cursorX - translateX) / scale
    const localY = (cursorY - translateY) / scale
    scale = nextScale
    translateX = cursorX - localX * scale
    translateY = cursorY - localY * scale
    applyTransform()
  }

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) {
      return
    }
    isDragging = true
    hasDragged = false
    dragStartX = event.clientX
    dragStartY = event.clientY
    dragStartTranslateX = translateX
    dragStartTranslateY = translateY
    stage.classList.add('is-dragging')
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!isDragging) {
      return
    }
    const dx = event.clientX - dragStartX
    const dy = event.clientY - dragStartY
    if (!hasDragged && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      hasDragged = true
    }
    translateX = dragStartTranslateX + dx
    translateY = dragStartTranslateY + dy
    applyTransform()
  }

  const onMouseUp = () => {
    if (!isDragging) {
      return
    }
    isDragging = false
    stage.classList.remove('is-dragging')
  }

  const closeViewer = () => {
    stage.removeEventListener('wheel', onWheel)
    stage.removeEventListener('mousedown', onMouseDown)
    stage.removeEventListener('dblclick', resetTransform)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', resetTransform)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    resetBtn.removeEventListener('click', resetTransform)
    closeBtn.removeEventListener('click', closeViewer)
    overlay.removeEventListener('click', onOverlayClick)
    overlay.remove()
    document.body.classList.remove('mermaid-viewer-open')
    if (document.fullscreenElement === overlay) {
      void document.exitFullscreen?.().catch(() => {
        // ignore fullscreen exit failure
      })
    }
  }

  const onOverlayClick = (event: MouseEvent) => {
    if (hasDragged) {
      hasDragged = false
      return
    }
    if (event.target === overlay || event.target === stage) {
      closeViewer()
    }
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeViewer()
    }
  }

  const onFullscreenChange = () => {
    if (document.fullscreenElement === overlay) {
      resetTransform()
    }
  }

  stage.addEventListener('wheel', onWheel, { passive: false })
  stage.addEventListener('mousedown', onMouseDown)
  stage.addEventListener('dblclick', resetTransform)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', resetTransform)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  resetBtn.addEventListener('click', resetTransform)
  closeBtn.addEventListener('click', closeViewer)
  overlay.addEventListener('click', onOverlayClick)
  requestAnimationFrame(resetTransform)

  void overlay.requestFullscreen?.().catch(() => {
    // ignore fullscreen request failure and keep overlay mode
  })
}

function App() {
  const initialLanguage = defaultLanguage()
  const [appOptions, setAppOptions] = useState<AppOptions>(() => {
    const defaults: AppOptions = {
      theme: 'dark',
      language: initialLanguage,
      autoSaveSeconds: 0,
      showToolbar: true,
      showStatusbar: true,
    }
    const raw = localStorage.getItem('appOptions')
    if (!raw) {
      return defaults
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AppOptions>
      return {
        ...defaults,
        ...parsed,
      }
    } catch {
      return defaults
    }
  })
  const locale = i18n[appOptions.language]

  const [mainMode, setMainMode] = useState<MainMode>('read')
  const [editMode, setEditMode] = useState<EditMode>('source')
  const [leftTab, setLeftTab] = useState<LeftTab>('files')
  const [showLeftPanel, setShowLeftPanel] = useState(true)

  const [markdown, setMarkdown] = useState(() => buildDefaultMarkdown(appOptions.language))
  const [wysiwygHtml, setWysiwygHtml] = useState(() => renderMarkdownToHtml(buildDefaultMarkdown(appOptions.language)))
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [workspaceFolder, setWorkspaceFolder] = useState<string | null>(null)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [recentFiles, setRecentFiles] = useState<string[]>([])

  const [pluginCatalog, setPluginCatalog] = useState<PluginDescriptor[]>([])
  const [loadedPlugins, setLoadedPlugins] = useState<string[]>([])
  const [disabledPlugins, setDisabledPlugins] = useState<string[]>(() => {
    const stored = localStorage.getItem('disabledPlugins')
    if (!stored) {
      return []
    }
    try {
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  const [showHelp, setShowHelp] = useState(false)
  const [helpMarkdown, setHelpMarkdown] = useState(() => buildFallbackHelp(appOptions.language))
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [activeFindIndex, setActiveFindIndex] = useState(0)
  const [showPdfDialog, setShowPdfDialog] = useState(false)
  const [showOptionsDialog, setShowOptionsDialog] = useState(false)
  const [showPageSetupDialog, setShowPageSetupDialog] = useState(false)
  const [pdfOptions, setPdfOptions] = useState<PdfOptions>({
    pageSize: 'a4',
    margin: 16,
    fontScale: 1,
    openAfterExport: false,
  })
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const browserFileInputRef = useRef<HTMLInputElement>(null)
  const bridgeRef = useRef(new ObsidianCompatBridge())
  const menuCommandHandlerRef = useRef<(payload: MenuCommandPayload) => void>(() => undefined)

  const isDesktopClient = Boolean(window.desktopAPI)
  const currentFileName = useMemo(
    () => fileNameFromPath(currentFilePath, locale.untitledFile),
    [currentFilePath, locale.untitledFile],
  )
  const effectiveMarkdown = showHelp ? helpMarkdown : markdown
  const renderedHtml = useMemo(() => renderMarkdownToHtml(effectiveMarkdown), [effectiveMarkdown])
  const outline = useMemo(() => buildOutline(effectiveMarkdown), [effectiveMarkdown])
  const wordsCount = useMemo(() => getWordsCount(effectiveMarkdown), [effectiveMarkdown])
  const linesCount = useMemo(() => effectiveMarkdown.split('\n').length, [effectiveMarkdown])
  const findIndexes = useMemo(
    () => findMatchIndexes(effectiveMarkdown, findText),
    [effectiveMarkdown, findText],
  )
  const safeActiveFindIndex = findIndexes.length === 0
    ? 0
    : Math.min(activeFindIndex, findIndexes.length - 1)

  function updateMarkdown(nextMarkdown: string): void {
    if (showHelp) {
      return
    }
    setMarkdown(nextMarkdown)
    setWysiwygHtml(renderMarkdownToHtml(nextMarkdown))
  }

  async function refreshPlugins(): Promise<void> {
    const plugins = await listPlugins()
    setPluginCatalog(plugins)
    const loaded = await loadPlugins(bridgeRef.current, new Set(disabledPlugins))
    setLoadedPlugins(loaded)
  }

  async function refreshRecentFiles(): Promise<void> {
    if (!window.desktopAPI) {
      return
    }
    const files = await window.desktopAPI.getRecentFiles()
    setRecentFiles(files)
  }

  useEffect(() => {
    void listPlugins()
      .then(async (plugins) => {
        setPluginCatalog(plugins)
        const loaded = await loadPlugins(bridgeRef.current, new Set(disabledPlugins))
        setLoadedPlugins(loaded)
      })
      .catch(() => setLoadedPlugins([]))

    void window.desktopAPI
      ?.getRecentFiles()
      .then((files) => setRecentFiles(files))
      .catch(() => setRecentFiles([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('disabledPlugins', JSON.stringify(disabledPlugins))
    void listPlugins()
      .then(async (plugins) => {
        setPluginCatalog(plugins)
        const loaded = await loadPlugins(bridgeRef.current, new Set(disabledPlugins))
        setLoadedPlugins(loaded)
      })
      .catch(() => setLoadedPlugins([]))
  }, [disabledPlugins])

  useEffect(() => {
    document.documentElement.dataset.theme = appOptions.theme
    document.documentElement.lang = appOptions.language
    localStorage.setItem('appOptions', JSON.stringify(appOptions))
  }, [appOptions])

  useEffect(() => {
    if (!window.desktopAPI) {
      return
    }

    window.desktopAPI
      .openLaunchFile()
      .then((result) => {
        if (!result) {
          return
        }
        setCurrentFilePath(result.path)
        setShowHelp(false)
        updateMarkdown(result.content)
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!window.desktopAPI) {
      return
    }
    window.desktopAPI.ackMenuCommand('__app-ready__')
    const unsubscribe = window.desktopAPI.onMenuCommand((payload) => {
      menuCommandHandlerRef.current(payload)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const onFallbackMenuCommand = (event: Event) => {
      const custom = event as CustomEvent<MenuCommandPayload>
      if (custom.detail?.command) {
        menuCommandHandlerRef.current(custom.detail)
      }
    }
    window.addEventListener('__mdeditor_menu_command__', onFallbackMenuCommand)
    return () => window.removeEventListener('__mdeditor_menu_command__', onFallbackMenuCommand)
  }, [])

  useEffect(() => {
    ;(window as Window & { __mdeditorHandleMenuCommand?: (payload: MenuCommandPayload) => void }).__mdeditorHandleMenuCommand =
      (payload) => {
        if (payload?.command) {
          menuCommandHandlerRef.current(payload)
        }
      }
    return () => {
      delete (window as Window & { __mdeditorHandleMenuCommand?: (payload: MenuCommandPayload) => void })
        .__mdeditorHandleMenuCommand
    }
  }, [])

  useEffect(() => {
    if (!window.desktopAPI) {
      return
    }
    const unsubscribe = window.desktopAPI.onSystemFileOpen((payload) => {
      setCurrentFilePath(payload.path)
      setShowHelp(false)
      updateMarkdown(payload.content)
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!previewRef.current) {
      return
    }
    previewRef.current.innerHTML = renderedHtml

    const headings = Array.from(previewRef.current.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    headings.forEach((heading, index) => {
      if (outline[index]) {
        heading.id = outline[index].id
      }
    })

    previewRef.current.querySelectorAll('a').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        const href = anchor.getAttribute('href') ?? ''
        if (href.startsWith('http')) {
          event.preventDefault()
          if (window.desktopAPI) {
            window.desktopAPI.openExternal(href).catch(() => undefined)
          } else {
            window.open(href, '_blank')
          }
        }
      })
    })

    previewRef.current.querySelectorAll('img').forEach((image) => {
      const source = image.getAttribute('src')
      if (!source) {
        return
      }
      const resolved = resolvePreviewImageSrc(source, currentFilePath, isDesktopClient)
      if (resolved !== source) {
        image.setAttribute('src', resolved)
      }
    })

    applyFindHighlights(previewRef.current, findText, safeActiveFindIndex)
    const activeMark = previewRef.current.querySelector('mark.find-highlight.active')
    activeMark?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    bridgeRef.current.runPostProcessors(previewRef.current, currentFileName)

    const renderMermaid = async () => {
      const root = previewRef.current
      if (!root) {
        return
      }
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'))
      if (nodes.length === 0) {
        return
      }
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: appOptions.theme === 'light' ? 'default' : 'dark',
        })

        for (const node of nodes) {
          let source = node.dataset.mermaidSource ?? (node.textContent ?? '')
          // Defensive cleanup: decode entities and strip any accidental HTML wrappers.
          const htmlDecoder = document.createElement('div')
          htmlDecoder.innerHTML = source
          source = (htmlDecoder.textContent ?? source)
            .replace(/\r\n?/g, '\n')
            .trim()
          node.dataset.mermaidSource = source
          node.textContent = source
          node.removeAttribute('data-processed')
        }
        await mermaid.run({ nodes })
        for (const node of nodes) {
          const svg = node.querySelector('svg')
          if (!svg) {
            continue
          }
          const host = node as HTMLElement
          host.classList.add('mermaid-interactive')
          host.title = locale.clickFullscreen
          host.onclick = (event) => {
            event.preventDefault()
            event.stopPropagation()
            openMermaidFullscreenViewer(svg, {
              hint: locale.mermaidHint,
              reset: locale.mermaidReset,
              close: locale.close,
            })
          }
        }
      } catch (error) {
        console.error('Mermaid render failed:', error)
      }
    }
    void renderMermaid()
  }, [
    renderedHtml,
    currentFileName,
    currentFilePath,
    isDesktopClient,
    outline,
    findText,
    safeActiveFindIndex,
    appOptions.theme,
    appOptions.language,
    loadedPlugins,
    locale.clickFullscreen,
    locale.mermaidHint,
    locale.mermaidReset,
    locale.close,
  ])

  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  useEffect(() => {
    if (!isDesktopClient || appOptions.autoSaveSeconds <= 0 || !currentFilePath || showHelp) {
      return
    }
    const timer = window.setInterval(() => {
      window.desktopAPI
        ?.saveFile({
          path: currentFilePath,
          content: markdown,
          saveAs: false,
        })
        .catch(() => undefined)
    }, appOptions.autoSaveSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [appOptions.autoSaveSeconds, currentFilePath, markdown, showHelp, isDesktopClient])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const withCtrl = event.ctrlKey || event.metaKey
      if (!withCtrl && event.key !== 'F1') {
        return
      }

      if (event.key === 'F1') {
        event.preventDefault()
        handleOpenHelp().catch(() => undefined)
        return
      }

      if (!withCtrl) {
        return
      }

      if (key === 'n') {
        event.preventDefault()
        handleNewFile()
      } else if (key === 'o' && event.shiftKey) {
        event.preventDefault()
        handleOpenFolder().catch(() => undefined)
      } else if (key === 'o') {
        event.preventDefault()
        handleOpenFile().catch(() => undefined)
      } else if (key === 's' && event.shiftKey) {
        event.preventDefault()
        handleSaveFile(true).catch(() => undefined)
      } else if (key === 's') {
        event.preventDefault()
        handleSaveFile(false).catch(() => undefined)
      } else if (key === 'e') {
        event.preventDefault()
        setMainMode((previous) => (previous === 'edit' ? 'read' : 'edit'))
      } else if (key === 'b') {
        event.preventDefault()
        applySourceWrapper('**', '**')
      } else if (key === 'i') {
        event.preventDefault()
        applySourceWrapper('*', '*')
      } else if (key === 't' && event.shiftKey) {
        event.preventDefault()
        setShowLeftPanel((previous) => !previous)
        setLeftTab('outline')
      } else if (key === 'f') {
        event.preventDefault()
        setShowFindReplace(true)
      } else if (key === 'h') {
        event.preventDefault()
        setShowFindReplace(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, currentFilePath, showHelp, mainMode])

  function applySelectionTransform(
    transform: (selectedText: string) => { replacement: string; cursorOffset?: number },
  ): void {
    const editor = sourceEditorRef.current
    if (!editor || showHelp) {
      return
    }

    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selectedText = markdown.slice(start, end)
    const result = transform(selectedText)
    const updated = `${markdown.slice(0, start)}${result.replacement}${markdown.slice(end)}`
    updateMarkdown(updated)

    requestAnimationFrame(() => {
      editor.focus()
      const cursorPosition = start + (result.cursorOffset ?? result.replacement.length)
      editor.setSelectionRange(cursorPosition, cursorPosition)
      const loc = getLineColumn(updated, cursorPosition)
      setCursor(loc)
    })
  }

  function applySourceWrapper(prefix: string, suffix: string): void {
    applySelectionTransform((selected) => {
      const content = selected || '文本'
      return { replacement: `${prefix}${content}${suffix}` }
    })
  }

  function insertSnippet(snippet: string): void {
    applySelectionTransform(() => ({ replacement: snippet }))
  }

  function handleEditorContextAction(action: EditorContextAction): void {
    const now = new Date().toLocaleString()
    const snippets: Record<string, string> = {
      'insert-image': '\n![图片描述](./image.png)\n',
      'insert-table': '\n| 列1 | 列2 |\n| --- | --- |\n| 内容1 | 内容2 |\n',
      'insert-link': '\n[链接文字](https://example.com)\n',
      'insert-ul': '\n- 列表项1\n- 列表项2\n',
      'insert-ol': '\n1. 列表项1\n2. 列表项2\n',
      'insert-task': '\n- [ ] 待办事项\n',
      'insert-code': '\n```markdown\n在这里输入代码\n```\n',
      'insert-quote': '\n> 引用内容\n',
      'insert-hr': '\n---\n',
      'insert-date': `\n${now}\n`,
    }

    if (action in snippets) {
      insertSnippet(snippets[action])
      setContextMenu(null)
      return
    }

    if (action === 'fmt-bold') {
      applySourceWrapper('**', '**')
    } else if (action === 'fmt-italic') {
      applySourceWrapper('*', '*')
    } else if (action === 'fmt-strike') {
      applySourceWrapper('~~', '~~')
    } else if (action === 'fmt-inline-code') {
      applySourceWrapper('`', '`')
    } else if (action === 'edit-select-all') {
      sourceEditorRef.current?.select()
    } else if (action === 'file-copy-path') {
      if (currentFilePath && window.desktopAPI) {
        window.desktopAPI.copyText(currentFilePath).catch(() => undefined)
      }
    } else if (action === 'file-show-folder') {
      if (currentFilePath && window.desktopAPI) {
        window.desktopAPI.showInFolder(currentFilePath).catch(() => undefined)
      }
    } else if (action === 'edit-undo') {
      document.execCommand('undo')
    } else if (action === 'edit-redo') {
      document.execCommand('redo')
    } else if (action === 'edit-copy') {
      document.execCommand('copy')
    } else if (action === 'edit-cut') {
      document.execCommand('cut')
    } else if (action === 'edit-paste') {
      document.execCommand('paste')
    } else if (action === 'read-copy') {
      const text = previewRef.current?.innerText ?? ''
      if (window.desktopAPI) {
        window.desktopAPI.copyText(text).catch(() => undefined)
      } else {
        navigator.clipboard.writeText(text).catch(() => undefined)
      }
    } else if (action === 'read-select-all') {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      if (previewRef.current) {
        const range = document.createRange()
        range.selectNodeContents(previewRef.current)
        selection?.addRange(range)
      }
    } else if (action === 'read-print') {
      window.print()
    } else if (action === 'read-view-source') {
      setShowHelp(false)
      setMainMode('edit')
      setEditMode('source')
    }
    setContextMenu(null)
  }

  function syncWysiwygToMarkdown(): void {
    if (showHelp) {
      return
    }
    const markdownText = turndown.turndown(wysiwygHtml)
    updateMarkdown(markdownText)
  }

  function focusFindAt(index: number): void {
    if (findIndexes.length === 0) {
      return
    }
    const wrapped = ((index % findIndexes.length) + findIndexes.length) % findIndexes.length
    setActiveFindIndex(wrapped)
    const target = findIndexes[wrapped]
    const editor = sourceEditorRef.current
    if (!editor || mainMode === 'read' || showHelp) {
      const activeMark = previewRef.current?.querySelectorAll('mark.find-highlight')[wrapped]
      activeMark?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (target < 0) {
      return
    }
    editor.focus()
    editor.setSelectionRange(target, target + findText.length)
    setCursor(getLineColumn(effectiveMarkdown, target))
  }

  function findNext(): void {
    if (!findText || findIndexes.length === 0) {
      return
    }
    focusFindAt(safeActiveFindIndex + 1)
  }

  function findPrev(): void {
    if (!findText || findIndexes.length === 0) {
      return
    }
    focusFindAt(safeActiveFindIndex - 1)
  }

  function replaceCurrent(): void {
    if (!findText || !sourceEditorRef.current || mainMode === 'read' || showHelp) {
      return
    }
    const editor = sourceEditorRef.current
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selected = markdown.slice(start, end)
    if (selected !== findText) {
      findNext()
      return
    }
    const next = `${markdown.slice(0, start)}${replaceText}${markdown.slice(end)}`
    updateMarkdown(next)
  }

  function replaceAll(): void {
    if (!findText || showHelp) {
      return
    }
    updateMarkdown(markdown.split(findText).join(replaceText))
  }

  async function exportPdf(options = pdfOptions): Promise<void> {
    if (!previewRef.current) {
      return
    }

    const canvas = await html2canvas(previewRef.current, {
      scale: Math.max(1, options.fontScale * 2),
      backgroundColor: '#ffffff',
    })
    const imageData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: options.pageSize,
    })

    const pageWidth = pdf.internal.pageSize.getWidth() - options.margin * 2
    const ratio = pageWidth / canvas.width
    const scaledHeight = canvas.height * ratio
    pdf.addImage(imageData, 'PNG', options.margin, options.margin, pageWidth, scaledHeight)
    const output = currentFileName.replace(/\.md$/i, '.pdf')
    pdf.save(output)
    if (options.openAfterExport && window.desktopAPI && currentFilePath) {
      window.desktopAPI.showInFolder(currentFilePath).catch(() => undefined)
    }
  }

  function handleNewFile(): void {
    setCurrentFilePath(null)
    setShowHelp(false)
    updateMarkdown(appOptions.language === 'zh-CN' ? '# 未命名\n' : '# Untitled\n')
  }

  async function handleOpenFolder(): Promise<void> {
    if (!window.desktopAPI) {
      return
    }
    const result = await window.desktopAPI.openFolder()
    if (!result) {
      return
    }
    setWorkspaceFolder(result.folderPath)
    setWorkspaceFiles(result.files)
    setLeftTab('files')
    setShowLeftPanel(true)
  }

  async function handleOpenFile(): Promise<void> {
    if (window.desktopAPI) {
      const result = await window.desktopAPI.openFile()
      if (result) {
        setCurrentFilePath(result.path)
        setShowHelp(false)
        updateMarkdown(result.content)
        await refreshRecentFiles()
      }
      return
    }

    browserFileInputRef.current?.click()
  }

  async function openFileByPath(filePath: string): Promise<void> {
    if (!window.desktopAPI) {
      return
    }
    const file = await window.desktopAPI.readFileByPath(filePath)
    if (!file) {
      return
    }
    setCurrentFilePath(file.path)
    setShowHelp(false)
    updateMarkdown(file.content)
    await refreshRecentFiles()
  }

  async function handleSaveFile(saveAs = false): Promise<void> {
    if (showHelp) {
      return
    }
    if (window.desktopAPI) {
      const result = await window.desktopAPI.saveFile({
        path: currentFilePath,
        content: markdown,
        saveAs,
      })
      if (result) {
        setCurrentFilePath(result.path)
        await refreshRecentFiles()
      }
      return
    }

    const targetName = saveAs ? 'export.md' : currentFileName
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = targetName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleOpenHelp(): Promise<void> {
    setShowHelp(true)
    setMainMode('read')
    if (!window.desktopAPI) {
      return
    }
    const help = await window.desktopAPI.getHelpContent()
    setHelpMarkdown(help || buildFallbackHelp(appOptions.language))
  }

  function handleMenuCommand(payload: MenuCommandPayload): void {
    console.debug('[menu-command]', payload)
    if (payload.id && window.desktopAPI) {
      window.desktopAPI.ackMenuCommand(payload.id)
    }

    const command = payload.command

    if (command === 'file:new') {
      handleNewFile()
    } else if (command === 'file:open') {
      handleOpenFile().catch(() => undefined)
    } else if (command === 'file:openFolder') {
      handleOpenFolder().catch(() => undefined)
    } else if (command === 'file:save') {
      handleSaveFile(false).catch(() => undefined)
    } else if (command === 'file:saveAs') {
      handleSaveFile(true).catch(() => undefined)
    } else if (command === 'file:exportPdf') {
      setShowPdfDialog(true)
    } else if (command === 'file:pageSetup') {
      setShowPageSetupDialog(true)
    } else if (command === 'help:open') {
      handleOpenHelp().catch(() => undefined)
    } else if (command === 'help:shortcuts') {
      setShowFindReplace(false)
      setShowHelp(true)
      setMainMode('read')
      setHelpMarkdown(
        appOptions.language === 'zh-CN'
          ? `${buildFallbackHelp('zh-CN')}\n\n## 当前菜单快捷键\n- Ctrl+F：查找\n- Ctrl+H：替换\n- Ctrl+Shift+O：打开文件夹`
          : `${buildFallbackHelp('en-US')}\n\n## Current Menu Shortcuts\n- Ctrl+F: Find\n- Ctrl+H: Replace\n- Ctrl+Shift+O: Open Folder`,
      )
    } else if (command === 'view:toggleRead') {
      setMainMode((previous) => (previous === 'edit' ? 'read' : 'edit'))
    } else if (command === 'view:toggleSidebar') {
      setShowLeftPanel((previous) => !previous)
    } else if (command === 'view:toggleToolbar') {
      setAppOptions((previous) => ({ ...previous, showToolbar: !previous.showToolbar }))
    } else if (command === 'view:toggleStatusbar') {
      setAppOptions((previous) => ({ ...previous, showStatusbar: !previous.showStatusbar }))
    } else if (command === 'view:switchFileOutline') {
      setLeftTab((previous) => (previous === 'files' ? 'outline' : 'files'))
    } else if (command === 'view:setEditMode') {
      // WYSIWYG mode entry is removed from UI; keep source mode only.
      setEditMode('source')
    } else if (command === 'edit:find') {
      setShowFindReplace(true)
    } else if (command === 'edit:replace') {
      setShowFindReplace(true)
    } else if (command === 'edit:undo') {
      document.execCommand('undo')
    } else if (command === 'edit:redo') {
      document.execCommand('redo')
    } else if (command === 'edit:cut') {
      document.execCommand('cut')
    } else if (command === 'edit:copy') {
      document.execCommand('copy')
    } else if (command === 'edit:paste') {
      document.execCommand('paste')
    } else if (command === 'edit:selectAll') {
      sourceEditorRef.current?.select()
    } else if (command === 'format:bold') {
      applySourceWrapper('**', '**')
    } else if (command === 'format:italic') {
      applySourceWrapper('*', '*')
    } else if (command === 'format:strike') {
      applySourceWrapper('~~', '~~')
    } else if (command === 'format:inlineCode') {
      applySourceWrapper('`', '`')
    } else if (command === 'format:highlight') {
      applySourceWrapper('==', '==')
    } else if (command === 'format:h1') {
      insertSnippet('\n# 标题1\n')
    } else if (command === 'format:h2') {
      insertSnippet('\n## 标题2\n')
    } else if (command === 'format:h3') {
      insertSnippet('\n### 标题3\n')
    } else if (command === 'insert:image') {
      insertSnippet('\n![图片描述](./image.png)\n')
    } else if (command === 'insert:table') {
      insertSnippet('\n| 列1 | 列2 |\n| --- | --- |\n| 内容1 | 内容2 |\n')
    } else if (command === 'insert:link') {
      insertSnippet('\n[链接文字](https://example.com)\n')
    } else if (command === 'insert:ul') {
      insertSnippet('\n- 列表项\n')
    } else if (command === 'insert:ol') {
      insertSnippet('\n1. 列表项\n')
    } else if (command === 'insert:task') {
      insertSnippet('\n- [ ] 任务项\n')
    } else if (command === 'insert:code') {
      insertSnippet('\n```markdown\n代码\n```\n')
    } else if (command === 'insert:quote') {
      insertSnippet('\n> 引用内容\n')
    } else if (command === 'insert:hr') {
      insertSnippet('\n---\n')
    } else if (command === 'insert:date') {
      insertSnippet(`\n${new Date().toLocaleString()}\n`)
    } else if (command === 'tools:plugins') {
      setShowLeftPanel(true)
      setLeftTab('plugins')
    } else if (command === 'tools:openPluginFolder') {
      window.desktopAPI?.openPluginFolder().catch(() => undefined)
    } else if (command === 'tools:options') {
      setShowOptionsDialog(true)
    } else if (command === 'help:about') {
      window.alert(`MdEditor\n${locale.aboutTitle} ${APP_VERSION}`)
    }
  }

  menuCommandHandlerRef.current = handleMenuCommand

  function jumpToOutline(item: OutlineItem): void {
    if (mainMode === 'edit' && editMode === 'source' && sourceEditorRef.current) {
      const pattern = new RegExp(`^#{${item.level}}\\s+${escapeMarkdownInline(item.text)}\\s*$`, 'm')
      const match = pattern.exec(effectiveMarkdown)
      if (match && typeof match.index === 'number') {
        sourceEditorRef.current.focus()
        sourceEditorRef.current.setSelectionRange(match.index, match.index)
        const loc = getLineColumn(effectiveMarkdown, match.index)
        setCursor(loc)
      }
      return
    }

    const target = document.getElementById(item.id)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const contextActions: Array<{ label: string; action: EditorContextAction }> = [
    { label: locale.insertImage, action: 'insert-image' },
    { label: locale.insertTable, action: 'insert-table' },
    { label: locale.insertLink, action: 'insert-link' },
    { label: locale.unorderedList, action: 'insert-ul' },
    { label: locale.orderedList, action: 'insert-ol' },
    { label: locale.taskList, action: 'insert-task' },
    { label: locale.codeBlock, action: 'insert-code' },
    { label: locale.quoteBlock, action: 'insert-quote' },
    { label: locale.divider, action: 'insert-hr' },
    { label: locale.currentDateTime, action: 'insert-date' },
    { label: locale.bold, action: 'fmt-bold' },
    { label: locale.italic, action: 'fmt-italic' },
    { label: locale.strike, action: 'fmt-strike' },
    { label: locale.inlineCode, action: 'fmt-inline-code' },
    { label: locale.copy, action: 'edit-copy' },
    { label: locale.paste, action: 'edit-paste' },
    { label: locale.selectAll, action: 'edit-select-all' },
    { label: locale.undo, action: 'edit-undo' },
    { label: locale.redo, action: 'edit-redo' },
    { label: locale.showInFolder, action: 'file-show-folder' },
    { label: locale.copyFilePath, action: 'file-copy-path' },
  ]

  const readContextActions: Array<{ label: string; action: EditorContextAction }> = [
    { label: locale.copy, action: 'read-copy' },
    { label: locale.selectAll, action: 'read-select-all' },
    { label: locale.print, action: 'read-print' },
    { label: locale.viewSource, action: 'read-view-source' },
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="title-group">
          <h1>MdEditor</h1>
          <span className="subtitle">{currentFileName}</span>
        </div>

        {appOptions.showToolbar ? (
          <div className="toolbar icon-toolbar">
            <div className="segmented toolbar-modes">
              <button type="button" className={mainMode === 'read' ? 'active' : ''} onClick={() => setMainMode('read')}>
                {locale.readMode}
              </button>
              <button type="button" className={mainMode === 'edit' ? 'active' : ''} onClick={() => setMainMode('edit')}>
                {locale.editMode}
              </button>
            </div>
            <button type="button" className="icon-button" title={locale.new} aria-label={locale.new} onClick={handleNewFile}>
              <span aria-hidden="true">✚</span>
            </button>
            <button type="button" className="icon-button" title={locale.open} aria-label={locale.open} onClick={() => handleOpenFile().catch(() => undefined)}>
              <span aria-hidden="true">📄</span>
            </button>
            <button type="button" className="icon-button" title={locale.openFolder} aria-label={locale.openFolder} onClick={() => handleOpenFolder().catch(() => undefined)}>
              <span aria-hidden="true">📁</span>
            </button>
            <button type="button" className="icon-button" title={locale.save} aria-label={locale.save} onClick={() => handleSaveFile(false).catch(() => undefined)}>
              <span aria-hidden="true">💾</span>
            </button>
            <button type="button" className="icon-button" title={locale.saveAs} aria-label={locale.saveAs} onClick={() => handleSaveFile(true).catch(() => undefined)}>
              <span aria-hidden="true">⤓</span>
            </button>
            <button type="button" className="icon-button" title={locale.findReplace} aria-label={locale.findReplace} onClick={() => setShowFindReplace(true)}>
              <span aria-hidden="true">⌕</span>
            </button>
            <button type="button" className="icon-button" title={locale.exportPdf} aria-label={locale.exportPdf} onClick={() => setShowPdfDialog(true)}>
              <span aria-hidden="true">⎘</span>
            </button>
            <button type="button" className="icon-button" title={locale.help} aria-label={locale.help} onClick={() => handleOpenHelp().catch(() => undefined)}>
              <span aria-hidden="true">?</span>
            </button>
          </div>
        ) : null}

      </header>

      <main className={`workspace ${showLeftPanel ? '' : 'workspace-no-left'}`}>
        {showLeftPanel ? (
          <aside className="left-panel">
            <div className="left-tabs">
              <button type="button" className={leftTab === 'files' ? 'active' : ''} onClick={() => setLeftTab('files')}>{locale.files}</button>
              <button type="button" className={leftTab === 'outline' ? 'active' : ''} onClick={() => setLeftTab('outline')}>{locale.outline}</button>
              <button type="button" className={leftTab === 'plugins' ? 'active' : ''} onClick={() => setLeftTab('plugins')}>{locale.plugins}</button>
            </div>

            {leftTab === 'files' ? (
              <div className="panel-scroll">
                <h3>{locale.workspace}</h3>
                <div className="path">{workspaceFolder ?? locale.folderNotOpen}</div>
                <ul className="plain-list">
                  {workspaceFiles.map((file) => (
                    <li key={file.path}>
                      <button type="button" className="file-link" onClick={() => openFileByPath(file.path).catch(() => undefined)}>
                        {file.relativePath}
                      </button>
                    </li>
                  ))}
                </ul>
                <h3>{locale.recentFiles}</h3>
                <ul className="plain-list">
                  {recentFiles.map((filePath) => (
                    <li key={filePath}>
                      <button type="button" className="file-link" onClick={() => openFileByPath(filePath).catch(() => undefined)}>
                        {fileNameFromPath(filePath)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {leftTab === 'outline' ? (
              <div className="panel-scroll">
                <h3>{locale.outlineTitle}</h3>
                <ul className="plain-list">
                  {outline.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="file-link"
                        style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
                        onClick={() => jumpToOutline(item)}
                      >
                        {item.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {leftTab === 'plugins' ? (
              <div className="panel-scroll">
                <h3>{locale.pluginManager}</h3>
                <button type="button" onClick={() => window.desktopAPI?.openPluginFolder().catch(() => undefined)}>
                  {locale.openPluginFolder}
                </button>
                <button type="button" onClick={() => refreshPlugins().catch(() => undefined)}>
                  {locale.refreshPlugins}
                </button>
                <ul className="plain-list plugins-list">
                  {pluginCatalog.map((plugin) => (
                    <li key={plugin.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!disabledPlugins.includes(plugin.id)}
                          onChange={(event) => {
                            setDisabledPlugins((previous) =>
                              event.target.checked
                                ? previous.filter((id) => id !== plugin.id)
                                : [...previous, plugin.id],
                            )
                          }}
                        />
                        <span>{plugin.name} ({plugin.version})</span>
                      </label>
                      <p>{plugin.author}{locale.pluginAuthorDivider}{plugin.description || locale.noDescription}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}

        <section
          className={`editor-panel ${mainMode === 'read' || showHelp ? 'editor-panel-read' : ''}`}
          onContextMenu={(event) => {
            event.preventDefault()
            setContextMenu({ x: event.clientX, y: event.clientY })
          }}
        >
          {mainMode === 'edit' && editMode === 'source' && !showHelp ? (
            <textarea
              ref={sourceEditorRef}
              value={markdown}
              onChange={(event) => updateMarkdown(event.target.value)}
              className="source-editor"
              onKeyDown={(event) => {
                const editor = sourceEditorRef.current
                if (!editor) {
                  return
                }
                if (event.key === 'Tab') {
                  event.preventDefault()
                  if (event.shiftKey) {
                    applySelectionTransform((selected) => ({
                      replacement: selected.replace(/^ {1,2}/gm, ''),
                    }))
                  } else {
                    applySelectionTransform((selected) => ({
                      replacement: selected.length > 0 ? selected.replace(/^/gm, '  ') : '  ',
                    }))
                  }
                }

                const pairMap: Record<string, string> = {
                  '(': ')',
                  '[': ']',
                  '{': '}',
                  '"': '"',
                  '\'': '\'',
                }
                if (pairMap[event.key]) {
                  event.preventDefault()
                  applySelectionTransform((selected) => ({
                    replacement: `${event.key}${selected}${pairMap[event.key]}`,
                    cursorOffset: selected.length === 0 ? 1 : undefined,
                  }))
                }
              }}
              onSelect={(event) => {
                const target = event.currentTarget
                setCursor(getLineColumn(markdown, target.selectionStart))
              }}
            />
          ) : null}

          {mainMode === 'edit' && editMode === 'wysiwyg' && !showHelp ? (
            <div
              className="wysiwyg-editor markdown-body"
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => setWysiwygHtml(event.currentTarget.innerHTML)}
              onBlur={syncWysiwygToMarkdown}
              dangerouslySetInnerHTML={{ __html: wysiwygHtml }}
            />
          ) : null}

          <div ref={previewRef} className={`preview markdown-body ${mainMode === 'read' || showHelp ? '' : 'preview-mini'}`} />

          {contextMenu ? (
            <ul
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(event) => event.stopPropagation()}
            >
              {(mainMode === 'read' || showHelp ? readContextActions : contextActions).map((item) => (
                <li key={item.action}>
                  <button type="button" onClick={() => handleEditorContextAction(item.action)}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>

      {showFindReplace ? (
        <div className="floating-panel">
          <div className="floating-header">
            <strong>{locale.findAndReplace}</strong>
            <button type="button" onClick={() => setShowFindReplace(false)}>{locale.close}</button>
          </div>
          <input
            value={findText}
            onChange={(event) => {
              setFindText(event.target.value)
              setActiveFindIndex(0)
            }}
            placeholder={locale.findPlaceholder}
          />
          <div className="find-summary">
            {locale.result}: {findIndexes.length === 0 ? '0' : `${safeActiveFindIndex + 1}/${findIndexes.length}`}
          </div>
          <input
            value={replaceText}
            onChange={(event) => setReplaceText(event.target.value)}
            placeholder={locale.replaceWith}
            disabled={mainMode === 'read' || showHelp}
          />
          <div className="floating-actions">
            <button type="button" onClick={findPrev}>{locale.prev}</button>
            <button type="button" onClick={findNext}>{locale.findNext}</button>
            <button type="button" onClick={replaceCurrent} disabled={mainMode === 'read' || showHelp}>{locale.replaceCurrent}</button>
            <button type="button" onClick={replaceAll} disabled={mainMode === 'read' || showHelp}>{locale.replaceAll}</button>
          </div>
        </div>
      ) : null}

      {showPdfDialog ? (
        <div className="modal-backdrop" onClick={() => setShowPdfDialog(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{locale.pdfSettings}</h3>
            <label>
              {locale.pageSize}
              <select
                value={pdfOptions.pageSize}
                onChange={(event) =>
                  setPdfOptions((previous) => ({
                    ...previous,
                    pageSize: event.target.value as PdfOptions['pageSize'],
                  }))
                }
              >
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
            </label>
            <label>
              {locale.marginPx}
              <input
                type="number"
                min={0}
                value={pdfOptions.margin}
                onChange={(event) =>
                  setPdfOptions((previous) => ({
                    ...previous,
                    margin: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
            <label>
              {locale.scale}
              <input
                type="number"
                min={0.5}
                max={3}
                step={0.1}
                value={pdfOptions.fontScale}
                onChange={(event) =>
                  setPdfOptions((previous) => ({
                    ...previous,
                    fontScale: Number(event.target.value) || 1,
                  }))
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={pdfOptions.openAfterExport}
                onChange={(event) =>
                  setPdfOptions((previous) => ({
                    ...previous,
                    openAfterExport: event.target.checked,
                  }))
                }
              />
              {locale.revealAfterExport}
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowPdfDialog(false)}>{locale.cancel}</button>
              <button
                type="button"
                onClick={() => {
                  exportPdf().catch(() => undefined)
                  setShowPdfDialog(false)
                }}
              >
                {locale.startExport}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPageSetupDialog ? (
        <div className="modal-backdrop" onClick={() => setShowPageSetupDialog(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{locale.pageSetup}</h3>
            <label>
              {locale.defaultPage}
              <select
                value={pdfOptions.pageSize}
                onChange={(event) =>
                  setPdfOptions((previous) => ({
                    ...previous,
                    pageSize: event.target.value as PdfOptions['pageSize'],
                  }))
                }
              >
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
            </label>
            <label>
              {locale.defaultMarginPx}
              <input
                type="number"
                min={0}
                value={pdfOptions.margin}
                onChange={(event) =>
                  setPdfOptions((previous) => ({
                    ...previous,
                    margin: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowPageSetupDialog(false)}>{locale.close}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showOptionsDialog ? (
        <div className="modal-backdrop" onClick={() => setShowOptionsDialog(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{locale.options}</h3>
            <label>
              {locale.theme}
              <select
                value={appOptions.theme}
                onChange={(event) =>
                  setAppOptions((previous) => ({
                    ...previous,
                    theme: event.target.value as AppOptions['theme'],
                  }))
                }
              >
                <option value="dark">{locale.dark}</option>
                <option value="light">{locale.light}</option>
              </select>
            </label>
            <label>
              {locale.language}
              <select
                value={appOptions.language}
                onChange={(event) =>
                  setAppOptions((previous) => ({
                    ...previous,
                    language: event.target.value as AppLanguage,
                  }))
                }
              >
                <option value="zh-CN">{locale.zh}</option>
                <option value="en-US">{locale.en}</option>
              </select>
            </label>
            <label>
              {locale.autoSave}
              <input
                type="number"
                min={0}
                value={appOptions.autoSaveSeconds}
                onChange={(event) =>
                  setAppOptions((previous) => ({
                    ...previous,
                    autoSaveSeconds: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
            <p className="option-hint">
              {locale.autoSaveHint}
            </p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={appOptions.showToolbar}
                onChange={(event) =>
                  setAppOptions((previous) => ({
                    ...previous,
                    showToolbar: event.target.checked,
                  }))
                }
              />
              {locale.showToolbar}
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={appOptions.showStatusbar}
                onChange={(event) =>
                  setAppOptions((previous) => ({
                    ...previous,
                    showStatusbar: event.target.checked,
                  }))
                }
              />
              {locale.showStatusbar}
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowOptionsDialog(false)}>{locale.close}</button>
            </div>
          </div>
        </div>
      ) : null}

      {appOptions.showStatusbar ? (
        <footer className="statusbar">
          <span>{locale.file}: {currentFileName}</span>
          <span>{locale.mode}: {showHelp ? locale.helpRead : `${mainMode}/${editMode}`}</span>
          <span>{locale.lineCol} {cursor.line}, {locale.col} {cursor.column}</span>
          <span>{locale.lineCount} {linesCount} · {locale.wordCount} {wordsCount}</span>
          <span>{locale.pluginCount}: {loadedPlugins.length}/{pluginCatalog.length}</span>
        </footer>
      ) : null}

      <input
        ref={browserFileInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) {
            return
          }
          setShowHelp(false)
          updateMarkdown(await file.text())
          setCurrentFilePath(file.name)
          event.currentTarget.value = ''
        }}
      />
    </div>
  )
}

export default App
