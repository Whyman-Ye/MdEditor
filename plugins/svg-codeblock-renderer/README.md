# SVG Codeblock Renderer

A lightweight Obsidian plugin that renders ` ```svg ` code blocks directly in Markdown preview, with one-click fullscreen viewing, zoom, and pan.

## Purpose

This plugin mainly addresses these pain points:

- You write SVG in notes, but by default you only see source code, not a visual preview.
- Complex diagrams are hard to inspect in the normal note area.
- You want editable SVG source and interactive preview in the same document.

Typical use cases include architecture diagrams, flowcharts, relationship maps, technical illustrations, and experiment visualization notes.

## Key Features

- **Code block rendering**: Automatically detects and renders `svg` code blocks.
- **Responsive display**: Removes fixed width/height and uses `viewBox` for more stable in-note rendering.
- **One-click fullscreen view**: Click the preview area to open fullscreen mode.
- **Interactive navigation**:
  - Mouse wheel zoom (centered at cursor position)
  - Left-click drag to pan
  - Double-click to reset view
  - Toolbar buttons: **Reset / Close**
  - Press `Esc` to close fullscreen
- **Basic security sanitization**:
  - Removes `<script>` nodes
  - Removes inline event attributes (for example, `onclick`)
  - Removes `javascript:` URLs in `href` / `xlink:href`
- **Failure fallback**: If SVG parsing fails, the plugin shows a notice and falls back to raw code for troubleshooting.

## Usage

### 1) Write an SVG code block in your note

````markdown
```svg
<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="300" height="120" rx="12" fill="#2f80ed"/>
  <text x="160" y="80" text-anchor="middle" fill="#fff" font-size="24">
    Hello SVG
  </text>
</svg>
```
````

### 2) Switch to reading/preview mode

The plugin renders the block as an image card with a "click to view fullscreen" hint in the lower-right corner.

### 3) Open fullscreen and interact

- Click the image card to open fullscreen.
- Use mouse wheel to zoom.
- Hold left mouse button and drag to pan.
- Double-click or click **Reset** to restore initial view.
- Click **Close**, click outside the stage, or press `Esc` to exit.

## Installation (Manual)

This plugin follows the standard Obsidian community plugin structure (`manifest.json` + `main.js` + `styles.css`).

1. Put the plugin folder into your vault: `.obsidian/plugins/svg-codeblock-renderer/`
2. Make sure these files exist:
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. In Obsidian:
   - Go to **Settings -> Community plugins**
   - Turn off Safe mode (if still enabled)
   - Enable **SVG Codeblock Renderer**

## Behavior Details and Compatibility

- `minAppVersion` is `0.15.0`.
- `isDesktopOnly: false`, so mobile can also load it, though interaction depends on device input behavior.
- If no `viewBox` is provided and `width/height` are valid, the plugin auto-generates a `viewBox`.
- If both `viewBox` and geometric bounds are unavailable, a fallback viewport size is used.

## FAQ

### Q1: I see "SVG render failed". What should I check?

Check these first:

- The code block starts with `<svg ...>`
- XML / SVG tags are properly closed
- Attribute values do not contain invalid characters

When rendering fails, the plugin keeps raw source visible so you can fix it directly in your note.

### Q2: Why doesn't my interactive script run?

By design, the plugin removes `<script>` and event attributes to reduce the risk of executing unsafe code in note preview.

## Version

- Current version: `0.0.1`
- Author: `whyman`

# SVG Codeblock Renderer

一个用于 Obsidian 的轻量插件：把 Markdown 中的 ` ```svg ` 代码块直接渲染成可视化图形，并支持一键全屏查看、缩放与拖拽浏览。

## 插件用途

这个插件主要解决以下问题：

- 你在笔记里写了 SVG 代码，但默认只能看到源码，预览不直观。
- 图太复杂时，在正文区域看不清细节，阅读和讲解都不方便。
- 需要在同一份文档里同时保留“可编辑源码”和“可交互预览”。

适用场景包括：架构图、流程图、关系图、技术示意图、实验可视化结果记录等。

## 核心功能

- **代码块渲染**：自动识别并渲染 `svg` 语言代码块。
- **响应式展示**：自动移除固定宽高，使用 `viewBox` 与自适应布局，在笔记区域内更稳定显示。
- **一键全屏查看**：单击预览区即可进入全屏查看模式。
- **交互浏览**：
  - 鼠标滚轮缩放（以鼠标当前位置为缩放中心）
  - 鼠标左键拖拽平移
  - 双击重置视图
  - 工具栏支持“重置 / 关闭”
  - `Esc` 快捷关闭全屏
- **基本安全清理**：
  - 删除 `<script>` 节点
  - 删除内联事件属性（如 `onclick`）
  - 清理 `href` / `xlink:href` 中的 `javascript:` 链接
- **失败回退**：SVG 解析失败时弹出提示，并回退显示原始代码，便于排查问题。

## 使用方法

### 1) 在笔记中编写 SVG 代码块

````markdown
```svg
<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="300" height="120" rx="12" fill="#2f80ed"/>
  <text x="160" y="80" text-anchor="middle" fill="#fff" font-size="24">
    Hello SVG
  </text>
</svg>
```
````

### 2) 切换到阅读/预览视图

插件会把该代码块渲染为图像卡片，右下角会显示“单击全屏查看”提示。

### 3) 进入全屏并交互查看

- 单击图像卡片进入全屏。
- 滚轮缩放细节。
- 按住左键拖拽平移。
- 双击或点击“重置”恢复初始视图。
- 点击“关闭”、遮罩空白处，或按 `Esc` 退出。

## 安装方式（手动）

当前目录结构是 Obsidian 社区插件标准结构（`manifest.json` + `main.js` + `styles.css`）。

1. 将插件目录放入你的库路径：`.obsidian/plugins/svg-codeblock-renderer/`
2. 确认目录中存在：
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. 打开 Obsidian：
   - 设置 -> 第三方插件（Community Plugins）
   - 关闭安全模式（如尚未关闭）
   - 启用 `SVG Codeblock Renderer`

## 行为细节与兼容性

- 插件 `minAppVersion` 为 `0.15.0`。
- `isDesktopOnly: false`，移动端也可加载，但交互体验受设备输入方式影响。
- 当 SVG 未提供 `viewBox` 且 `width/height` 可解析时，会自动补齐 `viewBox`。
- 若 `viewBox` 与几何边界都无法可靠获取，会使用保底视窗大小进行显示。

## 常见问题

### Q1：提示 “SVG 渲染失败” 怎么办？

优先检查：

- 代码块是否以 `<svg ...>` 开头
- XML / SVG 标签是否闭合
- 属性值是否有非法字符

渲染失败时插件会保留原始源码显示，方便你直接在笔记中修正。

### Q2：为什么我的交互脚本没有执行？

这是插件的安全设计：会移除 `<script>` 与事件属性，防止在笔记预览中执行潜在危险脚本。

## 版本信息

- 当前版本：`0.0.1`
- 作者：`whyman`

