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

  mainWindow.webContents.on('did-finish-load', () => {
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
  if (!mainWindow) {
    return
  }
  mainWindow.webContents.send('menu:command', { command, payload })
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
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找...', accelerator: 'CmdOrCtrl+F', click: () => sendMenuCommand('edit:find') },
        {
          label: '查找并替换...',
          accelerator: 'CmdOrCtrl+H',
          click: () => sendMenuCommand('edit:replace'),
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
        { type: 'separator' },
        { label: '无序列表', click: () => sendMenuCommand('insert:ul') },
        { label: '有序列表', click: () => sendMenuCommand('insert:ol') },
        { label: '任务列表', click: () => sendMenuCommand('insert:task') },
        { label: '代码块', click: () => sendMenuCommand('insert:code') },
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
