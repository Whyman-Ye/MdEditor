import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import markedKatex from 'marked-katex-extension'

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

marked.setOptions({
  gfm: true,
  breaks: true,
})

marked.use(markedKatex({
  throwOnError: false,
  output: 'html',
  nonStandard: true,
}))

marked.use(markedHighlight({
  emptyLangClass: 'hljs',
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    if ((lang || '').trim().toLowerCase() === 'mermaid') {
      // Mermaid code should stay plain text; highlighted HTML breaks parser.
      return escapeHtml(code)
    }
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
}))

marked.use({
  renderer: {
    code(token) {
      const lang = token.lang?.trim().toLowerCase()
      if (lang === 'mermaid') {
        return `<div class="mermaid">${escapeHtml(token.text)}</div>`
      }
      return false
    },
  },
})

export function renderMarkdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string
  return DOMPurify.sanitize(rawHtml)
}
