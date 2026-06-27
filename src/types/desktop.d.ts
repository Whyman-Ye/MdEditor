type DesktopFilePayload = {
  path: string | null
  content: string
  saveAs?: boolean
}

type WorkspaceFile = {
  path: string
  name: string
  relativePath: string
}

type OpenFileResult = {
  path: string
  content: string
} | null

type OpenFolderResult = {
  folderPath: string
  files: WorkspaceFile[]
} | null

type SaveFileResult = {
  path: string
} | null

type PdfExportPayload = {
  html: string
  cssText: string
  outputName: string
  pageSize: 'a4' | 'letter'
  margin: number
  openAfterExport: boolean
}

type PluginDescriptor = {
  id: string
  name: string
  version: string
  author: string
  description: string
  entry: string
  style?: string
}

type MenuCommandPayload = {
  id?: string
  command: string
  payload?: unknown
}

type DesktopAPI = {
  openFile: () => Promise<OpenFileResult>
  openFolder: () => Promise<OpenFolderResult>
  readFileByPath: (filePath: string) => Promise<OpenFileResult>
  saveFile: (payload: DesktopFilePayload) => Promise<SaveFileResult>
  exportPdf: (payload: PdfExportPayload) => Promise<SaveFileResult>
  getRecentFiles: () => Promise<string[]>
  openLaunchFile: () => Promise<OpenFileResult>
  getHelpContent: () => Promise<string>
  showInFolder: (filePath: string) => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  copyText: (text: string) => Promise<boolean>
  listPlugins: () => Promise<PluginDescriptor[]>
  readPluginMain: (pluginId: string) => Promise<string>
  readPluginStyle: (pluginId: string) => Promise<string | null>
  openPluginFolder: () => Promise<string>
  ackMenuCommand: (id: string) => void
  onSystemFileOpen: (
    handler: (payload: Exclude<OpenFileResult, null>) => void,
  ) => () => void
  onMenuCommand: (handler: (payload: MenuCommandPayload) => void) => () => void
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI
    __mdeditorHandleMenuCommand?: (payload: MenuCommandPayload) => void
  }
}

export {}
