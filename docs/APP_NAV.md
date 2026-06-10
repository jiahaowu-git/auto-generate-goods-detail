# AppNav 顶部导航栏组件

应用统一的顶部菜单栏公共组件，始终吸顶显示。所有页面顶部导航均应使用此组件，避免重复维护。

## 导入方式

```javascript
import AppNav from "../components/AppNav.vue";
```

## 可用属性

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `historyMatch` | `'exact'` \| `'includes'` | `'exact'` | 否 | 历史记录链接的匹配模式。`exact` 仅在 `/history` 路径时高亮；`includes` 在路径包含 `/history` 时高亮（用于 `/history/:taskId` 等子路由） |

## 使用示例

### 1. 普通页面（默认 exact 匹配）

```vue
<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <AppNav />

    <main>
      <!-- 页面主体 -->
    </main>
  </div>
</template>
```

适用页面：`/`、`/single-image-generate`、`/edit-image`、`/history`、`/settings`

### 2. 历史详情页（includes 匹配）

详情页是 `/history/:taskId`，需要历史记录链接保持高亮。

```vue
<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <AppNav history-match="includes" />

    <main>
      <!-- 详情页主体 -->
    </main>
  </div>
</template>
```

适用页面：`/history/:taskId`

## 吸顶行为

组件 header 始终应用 `sticky top-0 z-10` 样式，滚动时固定在视口顶部。如未来需要关闭，可改用条件 class + 新 prop 控制。

## 响应式设计

组件内置 `flex-wrap` 响应式布局：

- 桌面端：Logo 与导航在同一行
- 窄屏（如手机宽度）：Logo 与导航自动换行，导航按钮组继续按内容宽度换行

无需调用方额外处理。

## 扩展建议

如未来需要新增菜单项，修改 `src/components/AppNav.vue` 中的 `links` 数组即可，调用方无需改动。

如需新增匹配模式（如正则匹配、命名路由匹配），扩展 `isActive(to)` 函数并相应增加 `historyMatch` 的 validator。