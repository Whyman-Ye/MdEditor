const { Plugin } = window.obsidian

export default class DemoCalloutPlugin extends Plugin {
  onload() {
    this.registerMarkdownPostProcessor((root) => {
      root.querySelectorAll('blockquote').forEach((element) => {
        element.classList.add('obs-callout')
      })
    })
  }
}
