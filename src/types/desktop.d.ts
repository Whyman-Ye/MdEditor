type DesktopFilePayload = {
  path: string | null
  content: string
  saveAs?: boolean
}

type OpenFileResult = {
  path: string
  content: string
} | null

type SaveFileResult = {
  path: string
} | null

type DesktopAPI = {
  openFile: () => Promise<OpenFileResult>
  saveFile: (payload: DesktopFilePayload) => Promise<SaveFileResult>
  openLaunchFile: () => Promise<OpenFileResult>
  onSystemFileOpen: (
    handler: (payload: Exclude<OpenFileResult, null>) => void,
  ) => () => void
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI
  }
}

export {}
