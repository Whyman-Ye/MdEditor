export type OutlineItem = {
  id: string
  level: number
  text: string
}

export function buildOutline(markdown: string): OutlineItem[] {
  return markdown
    .split('\n')
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line.trim())
      if (!match) {
        return null
      }

      const level = match[1].length
      const text = match[2].trim()
      const slug = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5- ]+/g, '')
        .trim()
        .replace(/\s+/g, '-')

      return {
        id: `${slug || 'heading'}-${index}`,
        level,
        text,
      } satisfies OutlineItem
    })
    .filter((item): item is OutlineItem => item !== null)
}
