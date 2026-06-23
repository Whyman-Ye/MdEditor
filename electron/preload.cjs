const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openFolder: () => ipcRenderer.invoke('file:openFolder'),
  readFileByPath: (filePath) => ipcRenderer.invoke('file:readPath', filePath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  getRecentFiles: () => ipcRenderer.invoke('file:getRecent'),
  openLaunchFile: () => ipcRenderer.invoke('file:openLaunch'),
  getHelpContent: () => ipcRenderer.invoke('help:getContent'),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  copyText: (text) => ipcRenderer.invoke('system:copyText', text),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  readPluginMain: (pluginId) => ipcRenderer.invoke('plugins:readMain', pluginId),
  readPluginStyle: (pluginId) => ipcRenderer.invoke('plugins:readStyle', pluginId),
  openPluginFolder: () => ipcRenderer.invoke('plugins:openFolder'),
  ackMenuCommand: (id) => ipcRenderer.send('menu:ack', id),
  onSystemFileOpen: (handler) => {
    const listener = (_, payload) => handler(payload)
    ipcRenderer.on('file:openFromSystem', listener)
    return () => ipcRenderer.removeListener('file:openFromSystem', listener)
  },
  onMenuCommand: (handler) => {
    const listener = (_, payload) => handler(payload)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
})

try {
  ipcRenderer.send('menu:ack', '__preload-ready__')
} catch {
  // ignore preload readiness logging failure
}
