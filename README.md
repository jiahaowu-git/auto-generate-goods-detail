# 自动生成产品详情页

> 基于 RunningHub AI 工作流的产品详情页批量生成工具。支持详情页生成、单图生成、单图编辑（带遮罩）三种模式，并提供完整的历史记录与设置管理。

## 项目简介

本工具对接 [RunningHub](https://www.runninghub.cn) 的 AI 工作流能力，帮助运营/设计人员：

- **生成详情页**：上传 1-6 张白底产品图 + 填写产品信息，AI 自动生成详情页图片
- **单图生成**：基于 1-6 张参考图与提示词生成单张 AI 图片
- **单图编辑**：上传单张图片 + 文字描述，支持画笔遮罩局部重绘

所有任务自动持久化到本地，任务状态实时轮询，结果图片可一键打包下载。

## 功能特性

- 🎨 **三种生成模式**：详情页生成 / 单图生成 / 单图编辑（带遮罩编辑器）
- 🖌️ **遮罩编辑器**：圆形/方形画笔、透明度/颜色/大小可调、支持撤销（Ctrl+Z）
- 📦 **批量管理**：最多 6 张图片、详情页字段齐全（品牌、人群、主题、风格等）
- 📥 **一键下载**：将生成结果打包为 ZIP 下载
- 📋 **历史记录**：所有任务自动保存，可查看状态、重新进入详情、删除/清空
- 💾 **本地存储**：配置存 localStorage、历史存 IndexedDB（GB 级容量）

## 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 路由 | Vue Router 4 |
| 状态管理 | Pinia 2 |
| 构建工具 | Vite 5 |
| 样式 | UnoCSS + 原生 CSS |
| 持久化 | localStorage + IndexedDB |
| HTTP | Fetch API |
| 工具库 | file-saver（下载）、JSZip（打包） |

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm ≥ 9（或 yarn / pnpm）

### 安装

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

默认启动 `http://localhost:5173`。

### 生产构建

```bash
npm run build
```

产物输出至 `dist/` 目录。

### 本地预览构建产物

```bash
npm run preview
```

## 项目结构

```
auto-generate-goods-detail/
├── docs/
│   └── STORAGE.md              # 客户端存储方案详细文档
├── public/                     # 静态资源（favicon、logo）
├── src/
│   ├── components/             # 通用组件
│   │   ├── ui/                 # 基础 UI 组件（BaseButton、BaseInput 等）
│   │   ├── ConfirmModal.vue    # 确认弹窗
│   │   └── LoadingOverlay.vue  # 全局加载遮罩
│   ├── router/
│   │   └── index.js            # 路由表
│   ├── services/
│   │   ├── db.js               # IndexedDB 封装（Promise API）
│   │   ├── migration.js        # localStorage → IndexedDB 迁移
│   │   ├── queue.js            # 队列容量检查
│   │   └── runninghub.js       # RunningHub API 客户端
│   ├── stores/
│   │   └── settings.js         # 配置（localStorage）+ 历史（IndexedDB）
│   ├── styles/
│   │   └── common.css          # 全局样式
│   ├── views/                  # 页面组件
│   │   ├── GenerateView.vue            # 详情页生成
│   │   ├── SingleImageGenerateView.vue # 单图生成
│   │   ├── EditImageView.vue           # 单图编辑（含遮罩）
│   │   ├── HistoryListView.vue         # 历史列表
│   │   ├── HistoryDetailView.vue       # 历史详情（含轮询）
│   │   └── SettingsView.vue            # 配置
│   ├── App.vue
│   └── main.js                 # 入口：openDB → migrate → mount
├── index.html
├── package.json
├── vite.config.js
└── uno.config.ts
```

## 路由表

| 路径 | 组件 | 说明 |
|---|---|---|
| `/` | GenerateView | 详情页生成页 |
| `/single-image-generate` | SingleImageGenerateView | 单图生成 |
| `/edit-image` | EditImageView | 单图编辑（含遮罩） |
| `/history` | HistoryListView | 历史记录列表 |
| `/history/:taskId` | HistoryDetailView | 历史详情（实时轮询） |
| `/settings` | SettingsView | API 配置 |

## 首次使用配置

1. 打开应用
2. 进入 **设置** 页面，填写：
   - **RunningHub API Key**（必填）
   - **生成详情页 Workflow ID**
   - **单图编辑 Workflow ID**
   - **单图生成 Workflow ID**
3. 点击 **保存配置**（写入 localStorage）
4. 返回首页即可开始生成

> 配置项未提供默认值，必须由用户在设置页手动填写。API Key 与 Workflow ID 在 [RunningHub](https://www.runninghub.cn) 平台获取。

## 工作流节点说明

### 详情页生成（[GenerateView.vue](src/views/GenerateView.vue) `buildNodeInfoList`）

- **必填节点 57-64**：产品信息（产品名、品牌、人群、主题、风格、卖点、比例、数量）
- **图片节点 129-134**：按上传数量填入
  - 1 张图 → 仅 129
  - 2 张图 → 129、130
  - ……
  - 6 张图 → 129、130、131、132、133、134 全部

### 单图生成（[SingleImageGenerateView.vue](src/views/SingleImageGenerateView.vue) `buildSingleImageNodeInfoList`）

- 节点 2：图像比例
- 节点 3：用户提示词
- 节点 5、6、11、12、13、14：图片 URL（按上传数量填入）

### 单图编辑（[EditImageView.vue](src/views/EditImageView.vue) `startEdit`）

- 节点 2：原图 URL
- 节点 5：修改内容文本

## 客户端存储

| 数据 | 存储 | 大小限制 | 跨标签页 |
|---|---|---|---|
| API Key / Workflow ID | `localStorage` | ~5MB | ✓ |
| 任务历史 | `IndexedDB` | GB 级 | ✗ |

历史数据从 localStorage 自动迁移到 IndexedDB 的逻辑详见 [docs/STORAGE.md](docs/STORAGE.md)。

## 开发约定

- **组件**：单文件 SFC + `<script setup>`，避免 Options API
- **状态管理**：跨页面共享状态用 Pinia store，组件本地状态用 `ref`/`reactive`
- **异步**：所有 IndexedDB 操作是 Promise；store 暴露 `isReady` / `loadError` 状态供 UI 渲染加载/错误态
- **IndexedDB 写入**：db.js 层用 `toPlain()` 防御性深克隆，剥离 Vue 响应式 Proxy，避免 `DataCloneError`
- **跳转前 await**：所有"提交任务后跳转详情页"流程必须 `await store.addHistory()`，否则会因 IDB 写入未完成导致详情页查询失败

## 常见问题

**Q: 跳转后提示"未找到该任务记录"？**
A: 该 bug 已在 `addHistory` 处修复，确保跳转前 await。如再现，检查 `EditImageView / GenerateView / SingleImageGenerateView` 的 `startEdit / startGeneration` 是否正确 await。

**Q: 任务状态更新报 `DataCloneError`？**
A: Vue 响应式 Proxy 无法被 IndexedDB 克隆。db.js 已在所有 put/add 路径应用 `toPlain` 深克隆修复。如再现，确认写入路径是否走 db.js 封装。

**Q: 修改 API Key 后不生效？**
A: Pinia store 监听 ref 变化自动写入 localStorage。修改后刷新页面即可。

**Q: 如何清空历史记录？**
A: 历史列表页右上角"清空全部"按钮，或在浏览器 DevTools → Application → IndexedDB → `auto-generate-goods-detail` → `tasks` 中手动清空。

## 作者与许可

- 作者：jiahaowu-git（[GitHub](https://github.com/jiahaowu-git)）
- 版本：见 [package.json](package.json) `version` 字段
