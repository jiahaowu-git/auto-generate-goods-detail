/**
 * localStorage → IndexedDB 数据迁移服务
 *
 * 设计原则：
 * 1. 幂等：同一迁移任务多次执行结果一致
 * 2. 完整性：迁移失败时保留原 localStorage 数据，不删除
 * 3. 安全性：迁移成功后才清理 localStorage 旧数据
 * 4. 可追溯：迁移元数据写入 meta store，便于诊断
 */

import {
  bulkAddTasks,
  countTasks,
  getMeta,
  setMeta,
} from "./db.js";

const MIGRATION_KEY = "migration:v1:task_history:localStorage-to-indexeddb";
const LEGACY_KEY = "task_history";

/**
 * 校验任务记录的合法性，过滤掉无效数据。
 */
function sanitizeTask(t) {
  if (!t || typeof t !== "object") return null;
  if (!t.taskId) return null;
  return {
    id: typeof t.id === "number" ? t.id : Date.now(),
    taskId: String(t.taskId),
    taskType: t.taskType || "generate",
    goods_name: t.goods_name || "",
    brand_name: t.brand_name || "",
    target_audience: t.target_audience || "",
    theme: t.theme || "",
    visual_style: t.visual_style || "",
    goods_features: t.goods_features || "",
    image_ratio: t.image_ratio || "",
    image_num: t.image_num || "",
    prompt: t.prompt || "",
    image_count: typeof t.image_count === "number" ? t.image_count : 0,
    imageUrls: Array.isArray(t.imageUrls) ? t.imageUrls : [],
    editContent: t.editContent || "",
    createdAt: t.createdAt || new Date().toISOString(),
    status: t.status || "QUEUED",
    resultImages: Array.isArray(t.resultImages) ? t.resultImages : [],
  };
}

/**
 * 读取并解析 localStorage 中的旧数据。
 */
function readLegacyTasks() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeTask).filter(Boolean);
  } catch (err) {
    console.warn("[migration] 读取 localStorage 旧数据失败：", err);
    return [];
  }
}

/**
 * 执行迁移。
 * @returns {Promise<{migrated: boolean, count: number, error?: string}>}
 */
export async function migrateTaskHistory() {
  // 已迁移过则直接跳过
  const done = await getMeta(MIGRATION_KEY);
  if (done) {
    return { migrated: false, count: 0, skipped: true };
  }

  const legacy = readLegacyTasks();
  if (legacy.length === 0) {
    // 没有数据，标记为已迁移（无数据也算完成）
    await setMeta(MIGRATION_KEY, {
      migratedAt: new Date().toISOString(),
      count: 0,
    });
    return { migrated: false, count: 0, skipped: true };
  }

  // 检查 IndexedDB 中是否已有数据，避免重复插入
  const existing = await countTasks();
  if (existing > 0) {
    console.warn(
      `[migration] IndexedDB 已有 ${existing} 条记录，跳过迁移以避免重复。`,
    );
    await setMeta(MIGRATION_KEY, {
      migratedAt: new Date().toISOString(),
      count: existing,
      skippedDueToExistingData: true,
    });
    return { migrated: false, count: existing, skipped: true };
  }

  try {
    await bulkAddTasks(legacy);
  } catch (err) {
    console.error("[migration] 迁移失败，保留 localStorage 原始数据：", err);
    return { migrated: false, count: 0, error: err.message };
  }

  // 迁移成功后再清理 localStorage（防迁移失败导致数据丢失）
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch (err) {
    console.warn("[migration] 清理 localStorage 旧数据失败：", err);
  }

  await setMeta(MIGRATION_KEY, {
    migratedAt: new Date().toISOString(),
    count: legacy.length,
  });

  return { migrated: true, count: legacy.length };
}
