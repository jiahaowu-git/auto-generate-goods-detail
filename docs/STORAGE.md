# 客户端存储方案

本项目使用两种浏览器端持久化方案：保留 `localStorage` 存储轻量配置，迁移 `IndexedDB` 存储任务历史。

## 方案对比

| 维度 | localStorage | IndexedDB |
|---|---|---|
| 容量 | ~5MB | 通常为磁盘空间的 50% 以上（GB 级） |
| API 类型 | 同步 | 异步（基于事件） |
| 数据结构 | 字符串 KV | 多对象存储、支持索引、事务 |
| 适用场景 | 简单配置、KV | 结构化数据、大容量、需索引 |
| 跨标签页同步 | `storage` 事件 | 受同源策略限制 |
| 隐私模式 | 多数浏览器抛错 | 多数浏览器降级到内存 |

## 数据分布

### 保留在 localStorage

简单的键值对配置。体积小、读取频繁、变更后跨标签页立即可见。

| 键 | 用途 |
|---|---|
| `api_key` | RunningHub API Key |
| `workflow_id` | 详情页生成工作流 ID |
| `image_edit_workflow_id` | 单图编辑工作流 ID |
| `single_image_generate_workflow_id` | 单图生成工作流 ID |

所有访问都经过 `safeGetItem / safeSetItem / safeRemoveItem` 包装，失败时打印警告而不抛错，避免隐私模式或配额超限导致应用崩溃。

### 迁移到 IndexedDB

任务历史数据：单条记录含图片 URL 数组与生成结果 URL 数组，单条可达数十 KB；用户长时间使用累积后可能超过 5MB。移至 IndexedDB 以：

1. 突破 5MB 容量限制
2. 通过索引加速按 `taskId`、`createdAt`、`taskType`、`status` 查询
3. 避免 deep watch + 整数组 `JSON.stringify` 带来的写入性能问题

**数据库**：`auto-generate-goods-detail`，版本 `1`

**对象存储 `tasks`**：
- `keyPath: id`（自增主键）
- 字段：`id`, `taskId`, `taskType`, `goods_name`, `brand_name`, `target_audience`, `theme`, `visual_style`, `goods_features`, `image_ratio`, `image_num`, `prompt`, `image_count`, `imageUrls`, `editContent`, `createdAt`, `status`, `resultImages`
- 索引：
  - `taskId` (unique) — 外部任务 ID 精确查询
  - `createdAt` — 时间排序
  - `taskType` — 按类型过滤
  - `status` — 按状态过滤

**对象存储 `meta`**：
- `keyPath: key`
- 用途：记录迁移状态、版本号等元数据，避免重复迁移

## 数据迁移

迁移由 `src/services/migration.js` 在应用启动时执行（[main.js](../src/main.js)）。

### 迁移流程

1. 读取 meta 中 `migration:v1:task_history:localStorage-to-indexeddb` 标志位
2. 若已完成 → 跳过
3. 读取 localStorage `task_history` 数组，逐条调用 `sanitizeTask` 校验（剔除无效记录，补齐缺失字段）
4. 检查 IndexedDB 中是否已有数据，避免重复插入
5. 在单个事务中批量写入（`bulkAddTasks`）
6. 迁移成功后才删除 localStorage 中的 `task_history`（防止迁移失败导致数据丢失）
7. 写入 meta 标志位与迁移时间戳

### 安全性保证

- **幂等性**：多次执行结果一致，meta 标志位防止重复迁移
- **完整性**：迁移失败时 localStorage 数据保留，可手动重试
- **原子性**：使用单个事务批量插入
- **可回滚**：通过 meta 标志位 `deleteMeta` + 重新执行可强制重迁

## 使用示例

### 在组件中加载历史

```js
import { onMounted } from "vue";
import { useHistoryStore } from "../stores/settings";

const historyStore = useHistoryStore();

onMounted(async () => {
  await historyStore.ensureLoaded();
  // 此后 historyStore.historyList 已就绪
});
```

### 添加任务

```js
try {
  const newId = await historyStore.addHistory(
    taskId,
    userInputs,
    imageUrls,
    "generate",
  );
} catch (err) {
  console.error("保存历史失败：", err);
}
```

### 查询任务

```js
// 同步（仅在 ensureLoaded 之后可用）
const item = historyStore.getHistoryByTaskIdSync(taskId);

// 异步（自动回退到 IndexedDB）
const item = await historyStore.getHistoryByTaskId(taskId);
```

### 更新状态

```js
await historyStore.updateHistoryStatus(taskId, "SUCCESS", resultImages);
```

## 兼容性

- Chrome / Edge 24+
- Firefox 16+
- Safari 10+
- 隐私 / 隐身模式：在 IndexedDB 不可用时，store 会将 `loadError` 暴露给 UI，组件可提示用户

## 错误处理

| 场景 | 行为 |
|---|---|
| 浏览器不支持 IndexedDB | 启动时打印错误；store 初始化为 `loadError` 状态，列表为空 |
| 数据库版本不匹配 | 自动 `onupgradeneeded` 重建对象存储与索引 |
| 配额超限 | 写入时 IndexedDB 抛错；store 透传给调用方 |
| 迁移中失败 | 保留 localStorage 原始数据，UI 可继续访问已迁移部分 |
| 删除 localStorage 失败 | 打印警告；IndexedDB 数据已存在，不影响功能 |

## 后续扩展

- 任务图片改为存入 IndexedDB 的 Blob 字段（当前仅存 URL 引用）
- 引入 LRU 策略 + 配额预警，自动清理最旧的 N 条记录
- 增加 `meta` 字段记录加密的 API Key（替代当前 localStorage 裸存）
- 监听 `BroadcastChannel` 跨标签页同步 history（IndexedDB 不会自动跨标签页同步）
