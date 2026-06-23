# MdEditor（参考 Obsidian 的 Markdown 阅读/编辑器）

这个仓库是一个跨平台统一内核的 MVP，目标是满足：

1. Windows / iOS / Linux 图形界面  
2. 阅读模式 + 编辑模式（所见渲染 / 源码编辑）  
3. 插件安装在应用目录，打开任意 Markdown 文件都自动加载  
4. 与 Obsidian 插件对接（当前为兼容层 MVP）  
5. 右键菜单（插入图片、表格、代码块）  
6. Markdown 转 PDF  
7. 目录（大纲）列表  
8. 不包含数据库、关系图谱

## 当前已实现（Web Core + 桌面客户端）

- 阅读模式、编辑模式、所见渲染、源码编辑
- Electron 桌面客户端（可直接打开本地文件）
- 打开文件 / 保存 / 另存为（本地文件对话框）
- 目录（大纲）侧栏
- 右键插入图片/表格/代码块
- 导出 PDF（当前将预览区渲染后导出）
- `public/plugins` 插件目录自动加载
- Obsidian 兼容 API 最小子集：
  - `Plugin`
  - `registerMarkdownPostProcessor(...)`

## 运行（浏览器模式）

```bash
npm install
npm run dev
```

## 运行（桌面客户端）

```bash
npm install
npm run dev:desktop
```

说明：

- `dev:desktop` 会同时启动 Vite 与 Electron。
- 进入桌面窗口后，可直接点击顶部按钮打开本地 Markdown 文件进行阅读/编辑，再保存回本地。

## Windows 打包与安装（EXE + 安装程序）

先安装依赖，然后执行：

```bash
npm install
npm run dist:win
```

产物目录：`release/`

- 安装包：`MdEditor Setup <version>.exe`（NSIS）
- 可执行程序：安装后为 `MdEditor.exe`

### 文件关联

安装包已配置关联扩展名：

- `.md`
- `.markdown`

安装后可在 Windows 中双击上述文件类型，直接用 MdEditor 打开。若 MdEditor 已在运行，会将文件发送到当前窗口打开。

## 插件目录与兼容方式

插件入口清单：`public/plugins/manifest.json`

示例插件：`public/plugins/demo-callout/main.js`

当前使用方式：

1. 将插件放入 `public/plugins/<plugin-id>/`
2. 在 `manifest.json` 增加该插件 `entry`
3. 应用启动后自动加载

> 说明：Obsidian 生态插件非常多，且很多依赖 Electron/Node API。  
> 当前版本提供的是可扩展兼容层，而不是 100% 原生 Obsidian 运行时。

## 下一步（全平台）

为了满足 Windows/iOS/Linux 统一，推荐：

- 前端内核继续保持当前 React Web Core
- 宿主层接入 Tauri 2（桌面 + iOS）
- 文件系统、插件安装目录、系统菜单、导出路径由宿主层能力提供

这样可以做到一次开发，多平台部署，同时逐步增强 Obsidian API 兼容范围。
