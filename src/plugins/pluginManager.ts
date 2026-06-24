import {
  ObsidianCompatBridge,
  Plugin as ObsidianPluginBase,
  exposeObsidianGlobals,
  getObsidianModule,
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

function importCommonJsPlugin(source: string): PluginModule {
  const module = { exports: {} as unknown }
  const localRequire = (specifier: string): unknown => {
    if (specifier === 'obsidian') {
      return getObsidianModule()
    }
    throw new Error(`Unsupported plugin import: ${specifier}`)
  }
  const runner = new Function(
    'module',
    'exports',
    'require',
    `${source}\n;return module.exports;`,
  )
  const exported = runner(module, module.exports, localRequire) ?? module.exports
  if (typeof exported === 'function') {
    return { default: exported as PluginModule['default'] }
  }
  if (exported && typeof exported === 'object' && 'default' in (exported as Record<string, unknown>)) {
    return exported as PluginModule
  }
  return {}
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
  } catch (error) {
    if (/require is not defined|module is not defined|exports is not defined/i.test(String(error))) {
      return importCommonJsPlugin(source)
    }
    throw error
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
      await Promise.resolve(instance.onload())
      loaded.push(plugin.id)
    } catch (error) {
      console.error(`Failed to load plugin "${plugin.id}":`, error)
    }
  }

  return loaded
}
