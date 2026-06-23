export type MarkdownPostProcessor = (
  root: HTMLElement,
  context: { sourcePath: string },
) => void

export class ObsidianCompatBridge {
  private readonly postProcessors: MarkdownPostProcessor[] = []

  registerMarkdownPostProcessor(processor: MarkdownPostProcessor): void {
    this.postProcessors.push(processor)
  }

  runPostProcessors(root: HTMLElement, sourcePath = 'current.md'): void {
    for (const processor of this.postProcessors) {
      try {
        processor(root, { sourcePath })
      } catch (error) {
        console.error('Markdown post processor failed:', error)
      }
    }
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
}

export function exposeObsidianGlobals(bridge: ObsidianCompatBridge): void {
  const globals = {
    Plugin,
  }

  ;(window as Window & { obsidian?: unknown }).obsidian = globals
  ;(window as Window & { app?: unknown }).app = bridge
}
