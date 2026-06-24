export type MarkdownPostProcessor = (
  root: HTMLElement,
  context: { sourcePath: string },
) => void

type ObsidianElement = HTMLElement & {
  empty: () => void
  setText: (text: string) => void
  addClass: (...classNames: string[]) => void
  createDiv: (options?: { cls?: string; text?: string }) => ObsidianElement
  createEl: (tag: string, options?: { cls?: string; text?: string }) => ObsidianElement
}

type MarkdownCodeBlockProcessor = (
  source: string,
  el: ObsidianElement,
  context: { sourcePath: string },
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
      for (const processor of processors) {
        try {
          processor(source, compatHost, { sourcePath })
        } catch (error) {
          console.error(`Markdown code block processor(${lang}) failed:`, error)
        }
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

  constructor(bridge: ObsidianCompatBridge) {
    this.bridge = bridge
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
}

export function getObsidianModule() {
  return {
    Plugin,
    Notice,
  }
}

export function exposeObsidianGlobals(bridge: ObsidianCompatBridge): void {
  const globals = getObsidianModule()

  ;(window as Window & { obsidian?: unknown }).obsidian = globals
  ;(window as Window & { app?: unknown }).app = bridge
}
