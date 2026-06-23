import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useEffect, useMemo, useRef, useState } from 'react'
import TurndownService from 'turndown'
import './App.css'
import { renderMarkdownToHtml } from './core/markdown'
import type { OutlineItem } from './core/outline'
import { buildOutline } from './core/outline'
import { ObsidianCompatBridge } from './plugins/obsidianCompat'
import { listPlugins, loadPlugins, type PluginDescriptor } from './plugins/pluginManager'

const defaultMarkdown = `# MdEditor

欢迎使用 MdEditor。

- Ctrl+N 新建文件
- Ctrl+O 打开文件
- Ctrl+Shift+O 打开文件夹
- Ctrl+S 保存
- Ctrl+Shift+S 另存为
- Ctrl+E 切换阅读/编辑
- F1 查看帮助
`

const fallbackHelp = `# HELP

## 快捷键
- Ctrl+N：新建
- Ctrl+O：打开
- Ctrl+S：保存
- Ctrl+E：阅读/编辑切换
- Ctrl+Shift+T：切换大纲
`

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
  defaultEditMode: EditMode
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

function fileNameFromPath(path: string | null): string {
  if (!path) {
    return '未命名.md'
  }
  return path.replace(/\\/g, '/').split('/').pop() || '未命名.md'
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

function App() {
  const [mainMode, setMainMode] = useState<MainMode>('edit')
  const [editMode, setEditMode] = useState<EditMode>('source')
  const [leftTab, setLeftTab] = useState<LeftTab>('files')
  const [showLeftPanel, setShowLeftPanel] = useState(true)

  const [markdown, setMarkdown] = useState(defaultMarkdown)
  const [wysiwygHtml, setWysiwygHtml] = useState(() => renderMarkdownToHtml(defaultMarkdown))
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
  const [helpMarkdown, setHelpMarkdown] = useState(fallbackHelp)
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
  const [appOptions, setAppOptions] = useState<AppOptions>({
    theme: 'dark',
    defaultEditMode: 'source',
    autoSaveSeconds: 0,
    showToolbar: true,
    showStatusbar: true,
  })

  const sourceEditorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const browserFileInputRef = useRef<HTMLInputElement>(null)
  const bridgeRef = useRef(new ObsidianCompatBridge())
  const menuCommandHandlerRef = useRef<(payload: MenuCommandPayload) => void>(() => undefined)

  const isDesktopClient = Boolean(window.desktopAPI)
  const currentFileName = useMemo(() => fileNameFromPath(currentFilePath), [currentFilePath])
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

    applyFindHighlights(previewRef.current, findText, safeActiveFindIndex)
    const activeMark = previewRef.current.querySelector('mark.find-highlight.active')
    activeMark?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    bridgeRef.current.runPostProcessors(previewRef.current, currentFileName)
  }, [renderedHtml, currentFileName, outline, findText, safeActiveFindIndex])

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
    updateMarkdown('# 未命名\n')
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
    setHelpMarkdown(help || fallbackHelp)
  }

  function handleMenuCommand(payload: MenuCommandPayload): void {
    console.debug('[menu-command]', payload)
    if (payload.id && window.desktopAPI) {
      window.desktopAPI.ackMenuCommand(payload.id)
    }

    const command = payload.command
    const data = payload.payload as { mode?: EditMode } | undefined

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
      setHelpMarkdown(`${fallbackHelp}\n\n## 当前菜单快捷键\n- Ctrl+F：查找\n- Ctrl+H：替换\n- Ctrl+Shift+O：打开文件夹`)
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
    } else if (command === 'view:setEditMode' && data?.mode) {
      setEditMode(data.mode)
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
      window.alert('MdEditor\n版本 0.0.0')
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
    { label: '插入图片', action: 'insert-image' },
    { label: '插入表格', action: 'insert-table' },
    { label: '插入链接', action: 'insert-link' },
    { label: '无序列表', action: 'insert-ul' },
    { label: '有序列表', action: 'insert-ol' },
    { label: '任务列表', action: 'insert-task' },
    { label: '代码块', action: 'insert-code' },
    { label: '引用块', action: 'insert-quote' },
    { label: '分割线', action: 'insert-hr' },
    { label: '当前日期时间', action: 'insert-date' },
    { label: '加粗', action: 'fmt-bold' },
    { label: '斜体', action: 'fmt-italic' },
    { label: '删除线', action: 'fmt-strike' },
    { label: '行内代码', action: 'fmt-inline-code' },
    { label: '复制', action: 'edit-copy' },
    { label: '粘贴', action: 'edit-paste' },
    { label: '全选', action: 'edit-select-all' },
    { label: '撤销', action: 'edit-undo' },
    { label: '重做', action: 'edit-redo' },
    { label: '在文件夹中显示', action: 'file-show-folder' },
    { label: '复制文件路径', action: 'file-copy-path' },
  ]

  const readContextActions: Array<{ label: string; action: EditorContextAction }> = [
    { label: '复制', action: 'read-copy' },
    { label: '全选', action: 'read-select-all' },
    { label: '打印', action: 'read-print' },
    { label: '查看源代码', action: 'read-view-source' },
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
            <button type="button" className="icon-button" title="新建" aria-label="新建" onClick={handleNewFile}>
              <span aria-hidden="true">✚</span>
            </button>
            <button type="button" className="icon-button" title="打开" aria-label="打开" onClick={() => handleOpenFile().catch(() => undefined)}>
              <span aria-hidden="true">📄</span>
            </button>
            <button type="button" className="icon-button" title="打开文件夹" aria-label="打开文件夹" onClick={() => handleOpenFolder().catch(() => undefined)}>
              <span aria-hidden="true">📁</span>
            </button>
            <button type="button" className="icon-button" title="保存" aria-label="保存" onClick={() => handleSaveFile(false).catch(() => undefined)}>
              <span aria-hidden="true">💾</span>
            </button>
            <button type="button" className="icon-button" title="另存为" aria-label="另存为" onClick={() => handleSaveFile(true).catch(() => undefined)}>
              <span aria-hidden="true">⤓</span>
            </button>
            <button type="button" className="icon-button" title="查找/替换" aria-label="查找或替换" onClick={() => setShowFindReplace(true)}>
              <span aria-hidden="true">⌕</span>
            </button>
            <button type="button" className="icon-button" title="导出 PDF" aria-label="导出PDF" onClick={() => setShowPdfDialog(true)}>
              <span aria-hidden="true">⎘</span>
            </button>
            <button type="button" className="icon-button" title="帮助" aria-label="帮助" onClick={() => handleOpenHelp().catch(() => undefined)}>
              <span aria-hidden="true">?</span>
            </button>
          </div>
        ) : null}

      </header>

      <div className="top-controls">
        <div className="segmented">
          <button type="button" className={mainMode === 'edit' ? 'active' : ''} onClick={() => setMainMode('edit')}>编辑模式</button>
          <button type="button" className={mainMode === 'read' ? 'active' : ''} onClick={() => setMainMode('read')}>阅读模式</button>
        </div>
        <div className="segmented">
          <button type="button" className={editMode === 'source' ? 'active' : ''} onClick={() => setEditMode('source')} disabled={mainMode === 'read'}>源码</button>
          <button type="button" className={editMode === 'wysiwyg' ? 'active' : ''} onClick={() => setEditMode('wysiwyg')} disabled={mainMode === 'read'}>所见渲染</button>
        </div>
        <label className="autosave-label">
          自动保存(秒)
          <input
            type="number"
            min={0}
            value={appOptions.autoSaveSeconds}
            onChange={(event) => {
              const seconds = Number(event.target.value) || 0
              setAppOptions((previous) => ({ ...previous, autoSaveSeconds: seconds }))
            }}
          />
        </label>
      </div>

      <main className={`workspace ${showLeftPanel ? '' : 'workspace-no-left'}`}>
        {showLeftPanel ? (
          <aside className="left-panel">
            <div className="left-tabs">
              <button type="button" className={leftTab === 'files' ? 'active' : ''} onClick={() => setLeftTab('files')}>文件</button>
              <button type="button" className={leftTab === 'outline' ? 'active' : ''} onClick={() => setLeftTab('outline')}>大纲</button>
              <button type="button" className={leftTab === 'plugins' ? 'active' : ''} onClick={() => setLeftTab('plugins')}>插件</button>
            </div>

            {leftTab === 'files' ? (
              <div className="panel-scroll">
                <h3>工作区</h3>
                <div className="path">{workspaceFolder ?? '未打开文件夹'}</div>
                <ul className="plain-list">
                  {workspaceFiles.map((file) => (
                    <li key={file.path}>
                      <button type="button" className="file-link" onClick={() => openFileByPath(file.path).catch(() => undefined)}>
                        {file.relativePath}
                      </button>
                    </li>
                  ))}
                </ul>
                <h3>最近文件</h3>
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
                <h3>目录大纲</h3>
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
                <h3>插件管理</h3>
                <button type="button" onClick={() => window.desktopAPI?.openPluginFolder().catch(() => undefined)}>
                  打开插件文件夹
                </button>
                <button type="button" onClick={() => refreshPlugins().catch(() => undefined)}>
                  刷新插件列表
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
                      <p>{plugin.author} · {plugin.description || '无描述'}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}

        <section
          className="editor-panel"
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
            <strong>查找与替换</strong>
            <button type="button" onClick={() => setShowFindReplace(false)}>关闭</button>
          </div>
          <input
            value={findText}
            onChange={(event) => {
              setFindText(event.target.value)
              setActiveFindIndex(0)
            }}
            placeholder="查找内容"
          />
          <div className="find-summary">
            结果：{findIndexes.length === 0 ? '0' : `${safeActiveFindIndex + 1}/${findIndexes.length}`}
          </div>
          <input
            value={replaceText}
            onChange={(event) => setReplaceText(event.target.value)}
            placeholder="替换为"
            disabled={mainMode === 'read' || showHelp}
          />
          <div className="floating-actions">
            <button type="button" onClick={findPrev}>上一个</button>
            <button type="button" onClick={findNext}>查找下一个</button>
            <button type="button" onClick={replaceCurrent} disabled={mainMode === 'read' || showHelp}>替换当前</button>
            <button type="button" onClick={replaceAll} disabled={mainMode === 'read' || showHelp}>全部替换</button>
          </div>
        </div>
      ) : null}

      {showPdfDialog ? (
        <div className="modal-backdrop" onClick={() => setShowPdfDialog(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>导出 PDF 参数</h3>
            <label>
              页面大小
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
              页边距(px)
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
              缩放
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
              导出后在文件夹中显示
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowPdfDialog(false)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  exportPdf().catch(() => undefined)
                  setShowPdfDialog(false)
                }}
              >
                开始导出
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPageSetupDialog ? (
        <div className="modal-backdrop" onClick={() => setShowPageSetupDialog(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>页面设置</h3>
            <label>
              默认页面
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
              默认边距(px)
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
              <button type="button" onClick={() => setShowPageSetupDialog(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {showOptionsDialog ? (
        <div className="modal-backdrop" onClick={() => setShowOptionsDialog(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>选项</h3>
            <label>
              主题
              <select
                value={appOptions.theme}
                onChange={(event) =>
                  setAppOptions((previous) => ({
                    ...previous,
                    theme: event.target.value as AppOptions['theme'],
                  }))
                }
              >
                <option value="dark">深色</option>
                <option value="light">浅色</option>
              </select>
            </label>
            <label>
              默认编辑子模式
              <select
                value={appOptions.defaultEditMode}
                onChange={(event) => {
                  const mode = event.target.value as EditMode
                  setAppOptions((previous) => ({ ...previous, defaultEditMode: mode }))
                  setEditMode(mode)
                }}
              >
                <option value="source">源码模式</option>
                <option value="wysiwyg">所见渲染</option>
              </select>
            </label>
            <label>
              自动保存间隔(秒)
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
              显示工具栏
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
              显示状态栏
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowOptionsDialog(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {appOptions.showStatusbar ? (
        <footer className="statusbar">
          <span>文件：{currentFileName}</span>
          <span>模式：{showHelp ? '帮助阅读' : `${mainMode}/${editMode}`}</span>
          <span>行 {cursor.line}，列 {cursor.column}</span>
          <span>行数 {linesCount} · 词数 {wordsCount}</span>
          <span>插件：{loadedPlugins.length}/{pluginCatalog.length}</span>
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
