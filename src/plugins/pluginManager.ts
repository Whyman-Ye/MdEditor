import {
  ObsidianCompatBridge,
  Plugin as ObsidianPluginBase,
  exposeObsidianGlobals,
} from './obsidianCompat'

type PluginManifest = {
  plugins: Array<{
    id: string
    entry: string
  }>
}

type PluginModule = {
  default?: new (bridge: ObsidianCompatBridge) => ObsidianPluginBase
}

async function importPluginModule(entry: string): Promise<PluginModule> {
  const source = await fetch(entry).then(async (response) => {
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

export async function loadPlugins(bridge: ObsidianCompatBridge): Promise<string[]> {
  exposeObsidianGlobals(bridge)

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

  const loaded: string[] = []
  for (const plugin of manifest.plugins) {
    try {
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
