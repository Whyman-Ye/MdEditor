export type MarkdownPostProcessor = (
  root: HTMLElement,
  context: { sourcePath: string },
) => void

type ObsidianElement = HTMLElement & {
  empty: () => void
  setText: (text: string) => void
  addClass: (...classNames: string[]) => void
  createDiv: (options?: { cls?: string; text?: string }) => ObsidianElement
  createSpan: (options?: { cls?: string; text?: string }) => ObsidianElement
  createEl: (tag: string, options?: { cls?: string; text?: string }) => ObsidianElement
}

type MarkdownCodeBlockProcessor = (
  source: string,
  el: ObsidianElement,
  context: {
    sourcePath: string
    addChild: (child: { onload?: () => void | Promise<void>; onunload?: () => void }) => void
  },
) => void

function toObsidianElement(el: HTMLElement): ObsidianElement {
  const target = el as ObsidianElement
  if (typeof target.empty !== 'function') {
    target.empty = () => {
      target.innerHTML = ''
    }
  }
  if (typeof target.setText !== 'function') {
    target.setText = (text: string) => {
      target.textContent = text
    }
  }
  if (typeof target.addClass !== 'function') {
    target.addClass = (...classNames: string[]) => {
      if (classNames.length > 0) {
        target.classList.add(...classNames)
      }
    }
  }
  if (typeof target.createDiv !== 'function') {
    target.createDiv = (options?: { cls?: string; text?: string }) => {
      const child = document.createElement('div')
      if (options?.cls) {
        child.className = options.cls
      }
      if (options?.text) {
        child.textContent = options.text
      }
      target.appendChild(child)
      return toObsidianElement(child)
    }
  }
  if (typeof target.createSpan !== 'function') {
    target.createSpan = (options?: { cls?: string; text?: string }) => {
      const child = document.createElement('span')
      if (options?.cls) {
        child.className = options.cls
      }
      if (options?.text) {
        child.textContent = options.text
      }
      target.appendChild(child)
      return toObsidianElement(child)
    }
  }
  if (typeof target.createEl !== 'function') {
    target.createEl = (tag: string, options?: { cls?: string; text?: string }) => {
      const child = document.createElement(tag)
      if (options?.cls) {
        child.className = options.cls
      }
      if (options?.text) {
        child.textContent = options.text
      }
      target.appendChild(child)
      return toObsidianElement(child)
    }
  }
  return target
}

export class ObsidianCompatBridge {
  private readonly postProcessors: MarkdownPostProcessor[] = []
  private readonly codeBlockProcessors = new Map<string, MarkdownCodeBlockProcessor[]>()
  private readonly markdownChildren = new Map<HTMLElement, Array<{ onunload?: () => void }>>()

  registerMarkdownPostProcessor(processor: MarkdownPostProcessor): void {
    this.postProcessors.push(processor)
  }

  registerMarkdownCodeBlockProcessor(
    language: string,
    processor: MarkdownCodeBlockProcessor,
  ): void {
    const lang = language.trim().toLowerCase()
    if (!lang) {
      return
    }
    const list = this.codeBlockProcessors.get(lang) ?? []
    list.push(processor)
    this.codeBlockProcessors.set(lang, list)
  }

  runPostProcessors(root: HTMLElement, sourcePath = 'current.md'): void {
    const previousHosts = Array.from(this.markdownChildren.keys())
    for (const host of previousHosts) {
      const children = this.markdownChildren.get(host) ?? []
      for (const child of children) {
        try {
          child.onunload?.()
        } catch (error) {
          console.error('Markdown render child unload failed:', error)
        }
      }
      this.markdownChildren.delete(host)
    }

    for (const processor of this.postProcessors) {
      try {
        processor(root, { sourcePath })
      } catch (error) {
        console.error('Markdown post processor failed:', error)
      }
    }

    const codeNodes = Array.from(root.querySelectorAll('pre > code'))
    for (const code of codeNodes) {
      const className = code.className || ''
      const match = className.match(/language-([a-zA-Z0-9_-]+)/)
      const lang = match?.[1]?.toLowerCase()
      if (!lang) {
        continue
      }
      const processors = this.codeBlockProcessors.get(lang)
      if (!processors || processors.length === 0) {
        continue
      }
      const pre = code.parentElement
      if (!pre || !pre.parentElement) {
        continue
      }
      const host = document.createElement('div')
      pre.replaceWith(host)
      const compatHost = toObsidianElement(host)
      const source = code.textContent ?? ''
      const renderChildren: Array<{ onunload?: () => void }> = []
      const context = {
        sourcePath,
        addChild: (child: { onload?: () => void | Promise<void>; onunload?: () => void }) => {
          renderChildren.push(child)
          try {
            const result = child.onload?.()
            if (result && typeof (result as Promise<unknown>).then === 'function') {
              void (result as Promise<unknown>).catch((error) => {
                console.error('Markdown render child load failed:', error)
              })
            }
          } catch (error) {
            console.error('Markdown render child load failed:', error)
          }
        },
      }
      for (const processor of processors) {
        try {
          processor(source, compatHost, context)
        } catch (error) {
          console.error(`Markdown code block processor(${lang}) failed:`, error)
        }
      }
      if (renderChildren.length > 0) {
        this.markdownChildren.set(host, renderChildren)
      }
    }
  }
}

export class Notice {
  constructor(message: string, timeout = 2200) {
    const containerId = 'mdeditor-notice-container'
    let container = document.getElementById(containerId)
    if (!container) {
      container = document.createElement('div')
      container.id = containerId
      Object.assign(container.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: '10000',
        display: 'grid',
        gap: '8px',
      })
      document.body.appendChild(container)
    }
    const item = document.createElement('div')
    item.textContent = message
    Object.assign(item.style, {
      maxWidth: '320px',
      padding: '8px 12px',
      borderRadius: '8px',
      border: '1px solid rgba(148, 163, 184, 0.45)',
      background: 'rgba(15, 23, 42, 0.95)',
      color: '#e5e7eb',
      fontSize: '12px',
      lineHeight: '1.5',
    })
    container.appendChild(item)
    window.setTimeout(() => {
      item.remove()
      if (container && container.childElementCount === 0) {
        container.remove()
      }
    }, Math.max(800, timeout))
  }
}

export class Plugin {
  private readonly bridge: ObsidianCompatBridge
  protected readonly app: ObsidianCompatBridge
  private readonly dataStoreKey: string

  constructor(bridge: ObsidianCompatBridge) {
    this.bridge = bridge
    this.app = bridge
    this.dataStoreKey = `mdeditor-plugin-data:${this.constructor.name}`
  }

  onload(): void {}

  onunload(): void {}

  registerMarkdownPostProcessor(processor: MarkdownPostProcessor): void {
    this.bridge.registerMarkdownPostProcessor(processor)
  }

  registerMarkdownCodeBlockProcessor(
    language: string,
    processor: MarkdownCodeBlockProcessor,
  ): void {
    this.bridge.registerMarkdownCodeBlockProcessor(language, processor)
  }

  addSettingTab(_tab: PluginSettingTab): void {}

  async loadData(): Promise<unknown> {
    try {
      const raw = localStorage.getItem(this.dataStoreKey)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  async saveData(data: unknown): Promise<void> {
    try {
      localStorage.setItem(this.dataStoreKey, JSON.stringify(data ?? {}))
    } catch {
      // ignore storage failures
    }
  }
}

export class MarkdownRenderChild {
  protected readonly containerEl: ObsidianElement

  constructor(containerEl: HTMLElement) {
    this.containerEl = toObsidianElement(containerEl)
  }

  onload(): void | Promise<void> {}

  onunload(): void {}
}

export class PluginSettingTab {
  protected readonly app: ObsidianCompatBridge
  protected readonly plugin: Plugin
  readonly containerEl: ObsidianElement

  constructor(app: ObsidianCompatBridge, plugin: Plugin) {
    this.app = app
    this.plugin = plugin
    this.containerEl = toObsidianElement(document.createElement('div'))
  }

  display(): void {}
}

type TextComponent = {
  setPlaceholder: (value: string) => TextComponent
  setValue: (value: string) => TextComponent
  onChange: (callback: (value: string) => void | Promise<void>) => TextComponent
}

type ToggleComponent = {
  setValue: (value: boolean) => ToggleComponent
  onChange: (callback: (value: boolean) => void | Promise<void>) => ToggleComponent
}

type SliderComponent = {
  setLimits: (min: number, max: number, step: number) => SliderComponent
  setValue: (value: number) => SliderComponent
  setDynamicTooltip: () => SliderComponent
  onChange: (callback: (value: number) => void | Promise<void>) => SliderComponent
}

export class Setting {
  private readonly root: ObsidianElement

  constructor(containerEl: HTMLElement) {
    this.root = toObsidianElement(document.createElement('div'))
    this.root.className = 'obsidian-setting'
    toObsidianElement(containerEl).appendChild(this.root)
  }

  setName(name: string): this {
    this.root.setAttribute('data-name', name)
    return this
  }

  setDesc(description: string): this {
    this.root.setAttribute('data-desc', description)
    return this
  }

  addText(builder: (component: TextComponent) => unknown): this {
    const input = document.createElement('input')
    input.type = 'text'
    this.root.appendChild(input)
    const component: TextComponent = {
      setPlaceholder: (value) => {
        input.placeholder = value
        return component
      },
      setValue: (value) => {
        input.value = value
        return component
      },
      onChange: (callback) => {
        input.addEventListener('input', () => {
          void callback(input.value)
        })
        return component
      },
    }
    builder(component)
    return this
  }

  addToggle(builder: (component: ToggleComponent) => unknown): this {
    const input = document.createElement('input')
    input.type = 'checkbox'
    this.root.appendChild(input)
    const component: ToggleComponent = {
      setValue: (value) => {
        input.checked = value
        return component
      },
      onChange: (callback) => {
        input.addEventListener('change', () => {
          void callback(input.checked)
        })
        return component
      },
    }
    builder(component)
    return this
  }

  addSlider(builder: (component: SliderComponent) => unknown): this {
    const input = document.createElement('input')
    input.type = 'range'
    this.root.appendChild(input)
    const component: SliderComponent = {
      setLimits: (min, max, step) => {
        input.min = String(min)
        input.max = String(max)
        input.step = String(step)
        return component
      },
      setValue: (value) => {
        input.value = String(value)
        return component
      },
      setDynamicTooltip: () => component,
      onChange: (callback) => {
        input.addEventListener('input', () => {
          void callback(Number(input.value))
        })
        return component
      },
    }
    builder(component)
    return this
  }
}

export function getObsidianModule() {
  return {
    Plugin,
    PluginSettingTab,
    Setting,
    MarkdownRenderChild,
    Notice,
  }
}

export function exposeObsidianGlobals(bridge: ObsidianCompatBridge): void {
  const globals = getObsidianModule()

  ;(window as Window & { obsidian?: unknown }).obsidian = globals
  ;(window as Window & { app?: unknown }).app = bridge
}
