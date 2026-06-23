const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

function createWindow() {
  const mainWindow = new BrowserWindow({
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
}

function resolveLaunchFile() {
  const args = process.argv.slice(1)
  const candidate = args.find((entry) => entry && !entry.startsWith('-'))
  if (!candidate) {
    return null
  }

  const absolutePath = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(process.cwd(), candidate)

  return absolutePath
}

async function readFileByPath(filePath) {
  const content = await fs.readFile(filePath, 'utf-8')
  return {
    path: filePath,
    content,
  }
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

app.whenReady().then(() => {
  const launchFilePath = resolveLaunchFile()
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
