const { app, BrowserWindow, dialog, ipcMain, shell, clipboard, Menu } = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const markdownExtensions = new Set(['.md', '.markdown', '.txt'])
const maxRecentFiles = 10

let mainWindow = null
let launchFilePath = null
let recentFiles = []
const pendingMenuCommandTimers = new Map()
const menuDebugLogPath = path.join(app.getPath('userData'), 'menu-debug.log')

function logMenuDebug(message) {
  const line = `${new Date().toISOString()} ${message}\n`
  try {
    fsSync.appendFileSync(menuDebugLogPath, line, 'utf-8')
  } catch {
    // ignore logger failures
  }
}

function observeRendererState(targetWindow, label) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return
  }
  const script = `
    (function() {
      try {
        const info = {
          href: location.href,
          readyState: document.readyState,
          hasDesktopAPI: !!window.desktopAPI,
          hasAck: !!(window.desktopAPI && typeof window.desktopAPI.ackMenuCommand === 'function'),
          hasHandler: typeof window.__mdeditorHandleMenuCommand === 'function',
          hasRoot: !!document.getElementById('root')
        };
        return JSON.stringify(info);
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    })();
  `
  targetWindow.webContents.executeJavaScript(script).then((state) => {
    logMenuDebug(`renderer-state[${label}]: ${state}`)
  }).catch((error) => {
    logMenuDebug(`renderer-state[${label}] error: ${String(error)}`)
  })
}

const recentStorePath = path.join(app.getPath('userData'), 'recent-files.json')

function isValidMarkdownFile(filePath) {
  if (!filePath) {
    return false
  }
  const extension = path.extname(filePath).toLowerCase()
  return markdownExtensions.has(extension) && fsSync.existsSync(filePath)
}

function resolveLaunchFile(argv = process.argv) {
  const candidates = argv
    .slice(1)
    .filter((entry) => entry && !entry.startsWith('-') && entry !== '.')

  for (const candidate of candidates) {
    if (candidate.toLowerCase().endsWith('.exe')) {
      continue
    }
    const absolutePath = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(process.cwd(), candidate)
    if (isValidMarkdownFile(absolutePath)) {
      return absolutePath
    }
  }

  return null
}

function getAppBaseDir() {
  if (isDev) {
    return app.getAppPath()
  }
  return path.dirname(process.execPath)
}

function getHelpFilePath() {
  return path.join(getAppBaseDir(), 'HELP.md')
}

function getPluginsDir() {
  if (isDev) {
    return path.join(app.getAppPath(), 'public', 'plugins')
  }
  return path.join(getAppBaseDir(), 'plugins')
}

async function ensurePluginsDir() {
  await fs.mkdir(getPluginsDir(), { recursive: true })
}

async function loadRecentFiles() {
  try {
    const text = await fs.readFile(recentStorePath, 'utf-8')
    const parsed = JSON.parse(text)
    recentFiles = Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : []
  } catch {
    recentFiles = []
  }
}

async function saveRecentFiles() {
  await fs.writeFile(recentStorePath, JSON.stringify(recentFiles, null, 2), 'utf-8')
}

async function addRecentFile(filePath) {
  if (!filePath) {
    return
  }
  recentFiles = [filePath, ...recentFiles.filter((item) => item !== filePath)].slice(0, maxRecentFiles)
  app.addRecentDocument(filePath)
  await saveRecentFiles()
  updateAppMenu()
}

async function listMarkdownFiles(folderPath, root = folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      const nested = await listMarkdownFiles(fullPath, root)
      files.push(...nested)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    const extension = path.extname(entry.name).toLowerCase()
    if (!markdownExtensions.has(extension)) {
      continue
    }
    files.push({
      path: fullPath,
      name: entry.name,
      relativePath: path.relative(root, fullPath),
    })
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

async function readFileByPath(filePath) {
  const content = await fs.readFile(filePath, 'utf-8')
  await addRecentFile(filePath)
  return {
    path: filePath,
    content,
  }
}

function focusMainWindow() {
  if (!mainWindow) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
}

async function openPathInRenderer(filePath) {
  if (!mainWindow || !isValidMarkdownFile(filePath)) {
    return
  }
  try {
    const payload = await readFileByPath(filePath)
    mainWindow.webContents.send('file:openFromSystem', payload)
  } catch (error) {
    console.error('Failed to open file from system association:', error)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-start-loading', () => {
    logMenuDebug('did-start-loading')
  })

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    logMenuDebug(`did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
  })

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    logMenuDebug(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    logMenuDebug(`did-finish-load url=${mainWindow.webContents.getURL()}`)
    observeRendererState(mainWindow, 'did-finish-load')
    if (!launchFilePath) {
      return
    }
    openPathInRenderer(launchFilePath)
  })
}

async function openMarkdownFile() {
  const result = await dialog.showOpenDialog({
    title: '打开 Markdown 文件',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  return readFileByPath(filePath)
}

async function openFolderAsWorkspace() {
  const result = await dialog.showOpenDialog({
    title: '打开文件夹',
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const folderPath = result.filePaths[0]
  const files = await listMarkdownFiles(folderPath)
  return {
    folderPath,
    files,
  }
}

async function saveMarkdownFile(payload) {
  let filePath = payload.path

  if (!filePath || payload.saveAs) {
    const result = await dialog.showSaveDialog({
      title: '保存 Markdown 文件',
      defaultPath: filePath || app.getPath('documents'),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    filePath = result.filePath
  }

  await fs.writeFile(filePath, payload.content, 'utf-8')
  await addRecentFile(filePath)
  return { path: filePath }
}

function buildPdfDocument(payload) {
  const html = typeof payload?.html === 'string' ? payload.html : ''
  const cssText = typeof payload?.cssText === 'string' ? payload.cssText : ''
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light;
    }
    body {
      margin: 0;
      background: #ffffff;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.7;
      overflow: visible;
    }
    .pdf-root {
      padding: 0;
      margin: 0;
      width: 100%;
      box-sizing: border-box;
      color: #111827;
      background: #ffffff;
    }
    ${cssText}
  </style>
</head>
<body>
  <div class="pdf-root markdown-body">${html}</div>
</body>
</html>`
}

async function exportPdfDocument(payload) {
  const defaultName = payload?.outputName || `MdEditor-${Date.now()}.pdf`
  const outputPath = path.join(app.getPath('documents'), defaultName)
  const saveResult = await dialog.showSaveDialog({
    title: '导出 PDF',
    defaultPath: outputPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (saveResult.canceled || !saveResult.filePath) {
    return null
  }

  const marginPx = Number.isFinite(payload?.margin) ? Math.max(0, payload.margin) : 16
  const marginInch = marginPx / 96
  const pageSize = payload?.pageSize === 'letter' ? 'Letter' : 'A4'
  const documentHtml = buildPdfDocument(payload)

  const exportWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  try {
    await exportWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(documentHtml)}`)
    const pdfBuffer = await exportWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize,
      margins: {
        top: marginInch,
        bottom: marginInch,
        left: marginInch,
        right: marginInch,
      },
    })
    await fs.writeFile(saveResult.filePath, pdfBuffer)
  } finally {
    exportWindow.destroy()
  }

  if (payload?.openAfterExport) {
    shell.showItemInFolder(saveResult.filePath)
  }

  return { path: saveResult.filePath }
}

async function scanPlugins() {
  await ensurePluginsDir()
  const pluginDir = getPluginsDir()
  const entries = await fs.readdir(pluginDir, { withFileTypes: true })
  const plugins = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const pluginPath = path.join(pluginDir, entry.name)
    const manifestPath = path.join(pluginPath, 'manifest.json')
    const mainPath = path.join(pluginPath, 'main.js')
    const stylePath = path.join(pluginPath, 'styles.css')
    if (!fsSync.existsSync(manifestPath) || !fsSync.existsSync(mainPath)) {
      continue
    }

    let manifest = {}
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
    } catch {
      manifest = {}
    }

    const id = manifest.id || entry.name
    plugins.push({
      id,
      name: manifest.name || id,
      version: manifest.version || '0.0.0',
      author: manifest.author || 'unknown',
      description: manifest.description || '',
      entry: `plugin://${id}`,
      style: fsSync.existsSync(stylePath) ? `plugin://${id}` : undefined,
      mainPath,
      stylePath: fsSync.existsSync(stylePath) ? stylePath : null,
    })
  }

  return plugins
}

async function readPluginMain(pluginId) {
  const plugins = await scanPlugins()
  const plugin = plugins.find((item) => item.id === pluginId)
  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginId}`)
  }
  return fs.readFile(plugin.mainPath, 'utf-8')
}

async function readPluginStyle(pluginId) {
  const plugins = await scanPlugins()
  const plugin = plugins.find((item) => item.id === pluginId)
  if (!plugin || !plugin.stylePath) {
    return null
  }
  return fs.readFile(plugin.stylePath, 'utf-8')
}

async function readHelpContent() {
  const helpPath = getHelpFilePath()
  if (fsSync.existsSync(helpPath)) {
    return fs.readFile(helpPath, 'utf-8')
  }
  return `# 帮助\n\n未找到 HELP.md，请在安装目录添加该文件。`
}

function sendMenuCommand(command, payload = undefined) {
  const targetWindow = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow
    : BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (!targetWindow) {
    logMenuDebug(`sendMenuCommand skipped(no-window): ${command}`)
    return
  }

  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const message = { id, command, payload }
  logMenuDebug(`sendMenuCommand start: ${command} id=${id}`)
  observeRendererState(targetWindow, `before-send:${command}`)
  targetWindow.webContents.send('menu:command', message)
  const script = `
    (function() {
      const message = ${JSON.stringify(message)};
      if (typeof window.__mdeditorHandleMenuCommand === 'function') {
        try { window.__mdeditorHandleMenuCommand(message); } catch (_) {}
      }
      window.dispatchEvent(
        new CustomEvent('__mdeditor_menu_command__', { detail: message })
      );
    })();
  `
  targetWindow.webContents.executeJavaScript(script).catch((error) => {
    logMenuDebug(`executeJavaScript error: ${String(error)}`)
  })

  const timer = setTimeout(() => {
    if (!pendingMenuCommandTimers.has(id)) {
      return
    }
    pendingMenuCommandTimers.delete(id)
    logMenuDebug(`menu ack timeout -> fallback: ${command} id=${id}`)
    runMenuCommandFallback(targetWindow, message)
  }, 160)
  pendingMenuCommandTimers.set(id, timer)
}

function runMenuCommandFallback(targetWindow, message) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return
  }

  const command = message?.command
  if (!command) {
    return
  }

  // Only keep truly native-safe editor fallbacks to avoid accelerator recursion.
  if (command === 'edit:undo') {
    targetWindow.webContents.undo()
  } else if (command === 'edit:redo') {
    targetWindow.webContents.redo()
  } else if (command === 'edit:cut') {
    targetWindow.webContents.cut()
  } else if (command === 'edit:copy') {
    targetWindow.webContents.copy()
  } else if (command === 'edit:paste') {
    targetWindow.webContents.paste()
  } else if (command === 'edit:selectAll') {
    targetWindow.webContents.selectAll()
  }

  const retryScript = `
    (function() {
      const message = ${JSON.stringify(message)};
      if (typeof window.__mdeditorHandleMenuCommand === 'function') {
        try { window.__mdeditorHandleMenuCommand(message); } catch (_) {}
      }
      try {
        window.dispatchEvent(new CustomEvent('__mdeditor_menu_command__', { detail: message }));
      } catch (_) {}
    })();
  `
  targetWindow.webContents.executeJavaScript(retryScript).catch((error) => {
    logMenuDebug(`fallback executeJavaScript error: ${String(error)}`)
  })
  logMenuDebug(`fallback executed: ${command}`)
}

function updateAppMenu() {
  const recentSubmenu = recentFiles.length
    ? recentFiles.map((filePath) => ({
        label: filePath,
        click: () => {
          openPathInRenderer(filePath).catch(() => undefined)
        },
      }))
    : [{ label: '无最近文件', enabled: false }]

  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('file:new') },
        { label: '打开...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('file:open') },
        {
          label: '打开文件夹...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuCommand('file:openFolder'),
        },
        { label: '最近的文件', submenu: recentSubmenu },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('file:save') },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuCommand('file:saveAs'),
        },
        { label: '导出为 PDF...', click: () => sendMenuCommand('file:exportPdf') },
        { label: '页面设置...', click: () => sendMenuCommand('file:pageSetup') },
        { type: 'separator' },
        { role: 'print', label: '打印' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => sendMenuCommand('edit:undo') },
        {
          label: '重做',
          accelerator: process.platform === 'darwin' ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y',
          click: () => sendMenuCommand('edit:redo'),
        },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', click: () => sendMenuCommand('edit:cut') },
        { label: '复制', accelerator: 'CmdOrCtrl+C', click: () => sendMenuCommand('edit:copy') },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', click: () => sendMenuCommand('edit:paste') },
        { label: '全选', accelerator: 'CmdOrCtrl+A', click: () => sendMenuCommand('edit:selectAll') },
        { type: 'separator' },
        { label: '查找...', accelerator: 'CmdOrCtrl+F', click: () => sendMenuCommand('edit:find') },
        {
          label: '查找并替换...',
          accelerator: 'CmdOrCtrl+H',
          click: () => sendMenuCommand('edit:replace'),
        },
        {
          label: '插入',
          submenu: [
            { label: '图片...', click: () => sendMenuCommand('insert:image') },
            { label: '表格...', click: () => sendMenuCommand('insert:table') },
            { label: '链接...', click: () => sendMenuCommand('insert:link') },
            { label: '无序列表', click: () => sendMenuCommand('insert:ul') },
            { label: '有序列表', click: () => sendMenuCommand('insert:ol') },
            { label: '任务列表', click: () => sendMenuCommand('insert:task') },
            { label: '代码块', click: () => sendMenuCommand('insert:code') },
            { label: '引用块', click: () => sendMenuCommand('insert:quote') },
            { label: '分割线', click: () => sendMenuCommand('insert:hr') },
            { label: '当前日期时间', click: () => sendMenuCommand('insert:date') },
          ],
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '阅读模式', accelerator: 'CmdOrCtrl+E', click: () => sendMenuCommand('view:toggleRead') },
        {
          label: '所见即所得',
          click: () => sendMenuCommand('view:setEditMode', { mode: 'wysiwyg' }),
        },
        { label: '源代码模式', click: () => sendMenuCommand('view:setEditMode', { mode: 'source' }) },
        { type: 'separator' },
        { label: '切换侧边栏', accelerator: 'CmdOrCtrl+Shift+T', click: () => sendMenuCommand('view:toggleSidebar') },
        { label: '显示/隐藏工具栏', click: () => sendMenuCommand('view:toggleToolbar') },
        { label: '显示/隐藏状态栏', click: () => sendMenuCommand('view:toggleStatusbar') },
        { label: '切换文件/大纲面板', click: () => sendMenuCommand('view:switchFileOutline') },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '格式',
      submenu: [
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: () => sendMenuCommand('format:bold') },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: () => sendMenuCommand('format:italic') },
        { label: '删除线', click: () => sendMenuCommand('format:strike') },
        { label: '行内代码', click: () => sendMenuCommand('format:inlineCode') },
        { label: '高亮', click: () => sendMenuCommand('format:highlight') },
        { type: 'separator' },
        { label: 'H1', click: () => sendMenuCommand('format:h1') },
        { label: 'H2', click: () => sendMenuCommand('format:h2') },
        { label: 'H3', click: () => sendMenuCommand('format:h3') },
        { type: 'separator' },
        { label: '无序列表', click: () => sendMenuCommand('insert:ul') },
        { label: '有序列表', click: () => sendMenuCommand('insert:ol') },
        { label: '任务列表', click: () => sendMenuCommand('insert:task') },
        { label: '代码块', click: () => sendMenuCommand('insert:code') },
        { label: '引用块', click: () => sendMenuCommand('insert:quote') },
        { label: '分割线', click: () => sendMenuCommand('insert:hr') },
      ],
    },
    {
      label: '工具',
      submenu: [
        { label: '插件管理', click: () => sendMenuCommand('tools:plugins') },
        { label: '打开插件文件夹', click: () => sendMenuCommand('tools:openPluginFolder') },
        { label: '选项...', click: () => sendMenuCommand('tools:options') },
        { type: 'separator' },
        { label: '开发者工具', click: () => mainWindow?.webContents.openDevTools({ mode: 'detach' }) },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '查看帮助', accelerator: 'F1', click: () => sendMenuCommand('help:open') },
        { label: '快捷键参考', click: () => sendMenuCommand('help:shortcuts') },
        { label: '关于', click: () => sendMenuCommand('help:about') },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', (_, commandLine) => {
  const filePath = resolveLaunchFile(commandLine)
  focusMainWindow()
  if (filePath) {
    launchFilePath = filePath
    openPathInRenderer(filePath)
  }
})

app.whenReady().then(async () => {
  launchFilePath = resolveLaunchFile(process.argv)
  await loadRecentFiles().catch(() => undefined)

  ipcMain.handle('file:open', openMarkdownFile)
  ipcMain.handle('file:openFolder', openFolderAsWorkspace)
  ipcMain.handle('file:save', (_, payload) => saveMarkdownFile(payload))
  ipcMain.handle('pdf:export', (_, payload) => exportPdfDocument(payload))
  ipcMain.handle('file:readPath', (_, filePath) => readFileByPath(filePath))
  ipcMain.handle('file:getRecent', async () => recentFiles)
  ipcMain.handle('shell:showInFolder', (_, filePath) => {
    if (filePath) {
      shell.showItemInFolder(filePath)
    }
    return true
  })
  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url))
  ipcMain.handle('system:copyText', (_, text) => {
    clipboard.writeText(text ?? '')
    return true
  })
  ipcMain.handle('help:getContent', readHelpContent)
  ipcMain.handle('plugins:list', async () => {
    const plugins = await scanPlugins()
    return plugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      author: plugin.author,
      description: plugin.description,
      entry: plugin.entry,
      style: plugin.style,
    }))
  })
  ipcMain.handle('plugins:readMain', (_, pluginId) => readPluginMain(pluginId))
  ipcMain.handle('plugins:readStyle', (_, pluginId) => readPluginStyle(pluginId))
  ipcMain.handle('plugins:openFolder', async () => {
    await ensurePluginsDir()
    await shell.openPath(getPluginsDir())
    return getPluginsDir()
  })
  ipcMain.on('menu:ack', (_, id) => {
    const timer = pendingMenuCommandTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      pendingMenuCommandTimers.delete(id)
      logMenuDebug(`menu ack received: id=${id}`)
    } else {
      logMenuDebug(`menu ack received(unmatched): id=${id}`)
    }
  })
  ipcMain.handle('file:openLaunch', async () => {
    if (!launchFilePath) {
      return null
    }

    try {
      return await readFileByPath(launchFilePath)
    } catch {
      return null
    }
  })

  createWindow()
  updateAppMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
