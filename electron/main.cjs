const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const markdownExtensions = new Set(['.md', '.markdown', '.txt'])

let mainWindow = null
let launchFilePath = null

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

async function readFileByPath(filePath) {
  const content = await fs.readFile(filePath, 'utf-8')
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
  return { path: filePath }
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

app.whenReady().then(() => {
  launchFilePath = resolveLaunchFile(process.argv)

  ipcMain.handle('file:open', openMarkdownFile)
  ipcMain.handle('file:save', (_, payload) => saveMarkdownFile(payload))
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
