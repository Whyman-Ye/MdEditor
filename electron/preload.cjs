const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  openLaunchFile: () => ipcRenderer.invoke('file:openLaunch'),
  onSystemFileOpen: (handler) => {
    const listener = (_, payload) => handler(payload)
    ipcRenderer.on('file:openFromSystem', listener)
    return () => ipcRenderer.removeListener('file:openFromSystem', listener)
  },
})
