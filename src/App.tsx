import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useEffect, useMemo, useRef, useState } from 'react'
import TurndownService from 'turndown'
import './App.css'
import { buildOutline } from './core/outline'
import { renderMarkdownToHtml } from './core/markdown'
import { ObsidianCompatBridge } from './plugins/obsidianCompat'
import { loadPlugins } from './plugins/pluginManager'

const defaultMarkdown = `# MdEditor

> 一个参考 Obsidian 的跨平台 Markdown 编辑器 MVP

## 已实现能力
- 阅读模式
- 编辑模式（所见渲染 / 源码）
- 插件加载（安装目录 plugins）
- Markdown 导出 PDF
- 右键插入（图片、表格、代码块）
- 目录（大纲）侧栏

## 示例表格
| 功能 | 状态 |
| --- | --- |
| 目录大纲 | 已完成 |
| 插件系统 | 兼容层 MVP |

`

type MainMode = 'read' | 'edit'
type EditMode = 'wysiwyg' | 'source'
type ContextInsertAction = 'image' | 'table' | 'code'
type ContextMenuState = { x: number; y: number } | null

const insertSnippets: Record<ContextInsertAction, string> = {
  image: '\n![图片描述](./image.png)\n',
  table: '\n| 列1 | 列2 |\n| --- | --- |\n| 内容1 | 内容2 |\n',
  code: '\n```markdown\n在这里输入代码\n```\n',
}

const turndown = new TurndownService()

function fileNameFromPath(path: string | null): string {
  if (!path) {
    return 'untitled.md'
  }
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || 'untitled.md'
}

function App() {
  const [mainMode, setMainMode] = useState<MainMode>('edit')
  const [editMode, setEditMode] = useState<EditMode>('source')
  const [markdown, setMarkdown] = useState(defaultMarkdown)
  const [wysiwygHtml, setWysiwygHtml] = useState(() => renderMarkdownToHtml(defaultMarkdown))
  const [loadedPlugins, setLoadedPlugins] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)

  const sourceEditorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const browserFileInputRef = useRef<HTMLInputElement>(null)
  const bridgeRef = useRef(new ObsidianCompatBridge())

  const renderedHtml = useMemo(() => renderMarkdownToHtml(markdown), [markdown])
  const outline = useMemo(() => buildOutline(markdown), [markdown])
  const currentFileName = useMemo(
    () => fileNameFromPath(currentFilePath),
    [currentFilePath],
  )
  const isDesktopClient = Boolean(window.desktopAPI)

  function updateMarkdown(nextMarkdown: string): void {
    setMarkdown(nextMarkdown)
    setWysiwygHtml(renderMarkdownToHtml(nextMarkdown))
  }

  useEffect(() => {
    loadPlugins(bridgeRef.current).then(setLoadedPlugins).catch(() => setLoadedPlugins([]))
  }, [])

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
        updateMarkdown(result.content)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!window.desktopAPI) {
      return
    }
    const unsubscribe = window.desktopAPI.onSystemFileOpen((payload) => {
      setCurrentFilePath(payload.path)
      updateMarkdown(payload.content)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!previewRef.current) {
      return
    }

    previewRef.current.innerHTML = renderedHtml
    bridgeRef.current.runPostProcessors(previewRef.current, currentFileName)
  }, [renderedHtml, currentFileName])

  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  function insertIntoSource(action: ContextInsertAction): void {
    const editor = sourceEditorRef.current
    const snippet = insertSnippets[action]
    if (!editor) {
      setMarkdown((previous) => previous + snippet)
      return
    }

    const start = editor.selectionStart
    const end = editor.selectionEnd
    const updated = `${markdown.slice(0, start)}${snippet}${markdown.slice(end)}`
    updateMarkdown(updated)

    requestAnimationFrame(() => {
      editor.focus()
      const cursor = start + snippet.length
      editor.setSelectionRange(cursor, cursor)
    })
  }

  function handleContextAction(action: ContextInsertAction): void {
    if (editMode === 'source') {
      insertIntoSource(action)
    } else {
      setWysiwygHtml((previous) => previous + `<p>${insertSnippets[action].trim()}</p>`)
      updateMarkdown(`${markdown}${insertSnippets[action]}`)
    }
    setContextMenu(null)
  }

  function syncWysiwygToMarkdown(): void {
    const markdownText = turndown.turndown(wysiwygHtml)
    updateMarkdown(markdownText)
  }

  async function exportPdf(): Promise<void> {
    if (!previewRef.current) {
      return
    }

    const canvas = await html2canvas(previewRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
    })
    const imageData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4',
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const ratio = pageWidth / canvas.width
    const scaledHeight = canvas.height * ratio
    pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, scaledHeight)
    pdf.save(currentFileName.replace(/\.md$/i, '.pdf'))
  }

  async function handleOpenFile(): Promise<void> {
    if (window.desktopAPI) {
      const result = await window.desktopAPI.openFile()
      if (result) {
        setCurrentFilePath(result.path)
        updateMarkdown(result.content)
      }
      return
    }

    browserFileInputRef.current?.click()
  }

  async function handleSaveFile(saveAs = false): Promise<void> {
    if (window.desktopAPI) {
      const result = await window.desktopAPI.saveFile({
        path: currentFilePath,
        content: markdown,
        saveAs,
      })
      if (result) {
        setCurrentFilePath(result.path)
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="title-group">
          <h1>MdEditor</h1>
          <span className="subtitle">
            {currentFileName} {isDesktopClient ? '(桌面客户端)' : '(浏览器模式)'}
          </span>
        </div>

        <div className="toolbar">
          <button type="button" onClick={handleOpenFile}>
            打开文件
          </button>
          <button type="button" onClick={() => handleSaveFile(false)}>
            保存
          </button>
          <button type="button" onClick={() => handleSaveFile(true)}>
            另存为
          </button>

          <button
            type="button"
            className={mainMode === 'read' ? 'active' : ''}
            onClick={() => setMainMode('read')}
          >
            阅读模式
          </button>
          <button
            type="button"
            className={mainMode === 'edit' ? 'active' : ''}
            onClick={() => setMainMode('edit')}
          >
            编辑模式
          </button>

          <button
            type="button"
            className={editMode === 'wysiwyg' ? 'active' : ''}
            onClick={() => setEditMode('wysiwyg')}
            disabled={mainMode === 'read'}
          >
            所见渲染
          </button>
          <button
            type="button"
            className={editMode === 'source' ? 'active' : ''}
            onClick={() => setEditMode('source')}
            disabled={mainMode === 'read'}
          >
            源码编辑
          </button>

          <button type="button" onClick={exportPdf}>
            导出 PDF
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="outline-panel">
          <h2>目录大纲</h2>
          <ul>
            {outline.map((item) => (
              <li key={item.id} style={{ paddingLeft: `${(item.level - 1) * 12}px` }}>
                {item.text}
              </li>
            ))}
          </ul>
        </aside>

        <section
          className="editor-panel"
          onContextMenu={(event) => {
            event.preventDefault()
            setContextMenu({ x: event.clientX, y: event.clientY })
          }}
        >
          {mainMode === 'edit' && editMode === 'source' ? (
            <textarea
              ref={sourceEditorRef}
              value={markdown}
              onChange={(event) => updateMarkdown(event.target.value)}
              className="source-editor"
            />
          ) : null}

          {mainMode === 'edit' && editMode === 'wysiwyg' ? (
            <div
              className="wysiwyg-editor markdown-body"
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => {
                setWysiwygHtml(event.currentTarget.innerHTML)
              }}
              onBlur={syncWysiwygToMarkdown}
              dangerouslySetInnerHTML={{ __html: wysiwygHtml }}
            />
          ) : null}

          {mainMode === 'read' ? (
            <div ref={previewRef} className="preview markdown-body" />
          ) : (
            <div ref={previewRef} className="preview markdown-body preview-mini" />
          )}

          {contextMenu ? (
            <ul
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(event) => event.stopPropagation()}
            >
              <li>
                <button type="button" onClick={() => handleContextAction('image')}>
                  插入图片
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleContextAction('table')}>
                  插入表格
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleContextAction('code')}>
                  插入代码块
                </button>
              </li>
            </ul>
          ) : null}
        </section>
      </main>

      <footer className="statusbar">
        <span>已加载插件：{loadedPlugins.length > 0 ? loadedPlugins.join(', ') : '无'}</span>
        <span>{isDesktopClient ? '本地文件模式：已启用' : '本地文件模式：浏览器降级'}</span>
      </footer>

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

          const content = await file.text()
          setCurrentFilePath(file.name)
          updateMarkdown(content)
          event.currentTarget.value = ''
        }}
      />
    </div>
  )
}

export default App
