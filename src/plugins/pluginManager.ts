import {
  ObsidianCompatBridge,
  Plugin as ObsidianPluginBase,
  exposeObsidianGlobals,
} from './obsidianCompat'

export type PluginDescriptor = {
  id: string
  name: string
  version: string
  author: string
  description: string
  entry: string
  style?: string
}

type PluginModule = {
  default?: new (bridge: ObsidianCompatBridge) => ObsidianPluginBase
}

async function importPluginModule(entry: string): Promise<PluginModule> {
  const source = entry.startsWith('plugin://') && window.desktopAPI
    ? await window.desktopAPI.readPluginMain(entry.replace('plugin://', ''))
    : await fetch(entry).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.text()
      })

  const blob = new Blob([source], { type: 'text/javascript' })
  const objectUrl = URL.createObjectURL(blob)
  try {
    return (await import(/* @vite-ignore */ objectUrl)) as PluginModule
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function getPluginsFromWebManifest(): Promise<PluginDescriptor[]> {
  type PluginManifest = {
    plugins: Array<{
      id: string
      entry: string
    }>
  }

  const manifest = await fetch('/plugins/manifest.json')
    .then(async (response) => {
      if (!response.ok) {
        return null
      }

      return (await response.json()) as PluginManifest
    })
    .catch(() => null)

  if (!manifest?.plugins?.length) {
    return []
  }

  return manifest.plugins.map((plugin) => ({
    id: plugin.id,
    name: plugin.id,
    version: '0.0.0',
    author: 'unknown',
    description: '',
    entry: plugin.entry,
  }))
}

export async function listPlugins(): Promise<PluginDescriptor[]> {
  if (window.desktopAPI) {
    return window.desktopAPI.listPlugins()
  }

  return getPluginsFromWebManifest()
}

async function ensurePluginStyle(stylePath?: string): Promise<void> {
  if (!stylePath) {
    return
  }
  const styleId = `plugin-style-${stylePath.replace(/[^\w-]/g, '_')}`
  if (document.getElementById(styleId)) {
    return
  }

  if (stylePath.startsWith('plugin://') && window.desktopAPI) {
    const pluginId = stylePath.replace('plugin://', '')
    const source = await window.desktopAPI.readPluginStyle(pluginId)
    if (!source) {
      return
    }
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = source
    document.head.appendChild(style)
    return
  }

  const link = document.createElement('link')
  link.id = styleId
  link.rel = 'stylesheet'
  link.href = stylePath
  document.head.appendChild(link)
}

export async function loadPlugins(
  bridge: ObsidianCompatBridge,
  disabledPluginIds: Set<string>,
): Promise<string[]> {
  exposeObsidianGlobals(bridge)

  const plugins = await listPlugins()

  const loaded: string[] = []
  for (const plugin of plugins) {
    if (disabledPluginIds.has(plugin.id)) {
      continue
    }

    try {
      await ensurePluginStyle(plugin.style)
      const module = await importPluginModule(plugin.entry)
      if (!module.default) {
        continue
      }

      const instance = new module.default(bridge)
      instance.onload()
      loaded.push(plugin.id)
    } catch (error) {
      console.error(`Failed to load plugin "${plugin.id}":`, error)
    }
  }

  return loaded
}
