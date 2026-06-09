/**
 * IndexedDB 封装服务
 *
 * 数据库：auto-generate-goods-detail
 * 对象存储：
 *   - tasks：任务历史记录（keyPath: id，自增主键）
 *     索引：taskId(unique)、createdAt、taskType、status
 *   - meta：元数据（如迁移状态标志位，keyPath: key）
 *
 * 所有方法返回 Promise，统一错误处理。
 * 浏览器兼容性：Chrome/Edge/Firefox/Safari 现代版本。
 */

const DB_NAME = "auto-generate-goods-detail";
const DB_VERSION = 1;
const STORE_TASKS = "tasks";
const STORE_META = "meta";

// 单例：避免重复打开数据库
let dbPromise = null;

/**
 * 打开数据库。重复调用复用同一个连接。
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    // 隐私模式或不支持 IndexedDB 时 fallback
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持 IndexedDB"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        const taskStore = db.createObjectStore(STORE_TASKS, {
          keyPath: "id",
          autoIncrement: true,
        });
        taskStore.createIndex("taskId", "taskId", { unique: true });
        taskStore.createIndex("createdAt", "createdAt", { unique: false });
        taskStore.createIndex("taskType", "taskType", { unique: false });
        taskStore.createIndex("status", "status", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("IndexedDB 打开被阻塞，请关闭其他标签页后重试"));
  });

  // 错误时重置 promise，允许下次重试
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

/**
 * 通用请求包装：将 IDBRequest 转为 Promise。
 */
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 将任意输入转换为 IndexedDB 可序列化的纯对象。
 *
 * 背景：Vue 3 的 ref/reactive 内部用 Proxy 包装数组与对象，
 * IndexedDB 的 structured clone 算法无法克隆 Proxy，会抛 DataCloneError。
 * 用 JSON 深克隆可彻底剥离响应式包装与不可序列化的内部 slot。
 *
 * 限制：仅适用于 JSON 安全的数据（string、number、boolean、null、array、plain object）。
 * 本项目 task 数据（id、taskId、字符串字段、字符串 URL 数组、ISO 时间字符串）全部满足。
 */
function toPlain(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * 通用事务包装：自动开始事务、提交、错误处理。
 */
async function withStore(storeName, mode, work) {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await work(store);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

// ====================== Tasks 对象存储 CRUD ======================

/**
 * 添加任务记录。
 * @param {object} task 任务对象（不包含 id，将由 IndexedDB 自动生成）
 * @returns {Promise<number>} 新插入记录的 id
 */
export async function addTask(task) {
  // 保留原 store 的 id 语义：以 Date.now() 作为 id，方便外部组件 :key 绑定
  // 但在 IndexedDB 中我们用 autoIncrement，所以这里传入的 id 仅作为字段保留
  const taskWithId = { ...task };
  if (taskWithId.id == null) {
    taskWithId.id = Date.now();
  }
  return withStore(STORE_TASKS, "readwrite", (store) =>
    reqToPromise(store.add(toPlain(taskWithId))),
  );
}

/**
 * 通过内部主键 id 获取任务。
 */
export async function getTask(id) {
  return withStore(STORE_TASKS, "readonly", (store) =>
    reqToPromise(store.get(id)),
  );
}

/**
 * 通过 taskId（外部任务 ID）获取任务。
 * @returns {Promise<object|undefined>}
 */
export async function getTaskByTaskId(taskId) {
  return withStore(STORE_TASKS, "readonly", async (store) => {
    const index = store.index("taskId");
    return reqToPromise(index.get(taskId));
  });
}

/**
 * 通过 taskId 更新任务字段（部分更新）。
 * @returns {Promise<object|undefined>} 更新后的完整任务对象；不存在返回 undefined
 */
export async function updateTaskByTaskId(taskId, patch) {
  return withStore(STORE_TASKS, "readwrite", async (store) => {
    const index = store.index("taskId");
    const existing = await reqToPromise(index.get(taskId));
    if (!existing) return undefined;
    // patch 可能来自 Vue 的响应式对象（含 Proxy），必须深克隆剥离，
    // 否则 store.put 会抛 DataCloneError
    const updated = toPlain({ ...existing, ...patch });
    await reqToPromise(store.put(updated));
    return updated;
  });
}

/**
 * 通过内部主键 id 删除任务。
 */
export async function deleteTask(id) {
  return withStore(STORE_TASKS, "readwrite", (store) =>
    reqToPromise(store.delete(id)),
  );
}

/**
 * 清空所有任务。
 */
export async function clearAllTasks() {
  return withStore(STORE_TASKS, "readwrite", (store) =>
    reqToPromise(store.clear()),
  );
}

/**
 * 获取所有任务，按 createdAt 降序排列（最新在前）。
 * @returns {Promise<Array>}
 */
export async function getAllTasks() {
  return withStore(STORE_TASKS, "readonly", async (store) => {
    const index = store.index("createdAt");
    return reqToPromise(index.getAll());
  }).then((list) =>
    list.sort((a, b) => {
      // createdAt 为 ISO 字符串，倒序
      if (a.createdAt < b.createdAt) return 1;
      if (a.createdAt > b.createdAt) return -1;
      return 0;
    }),
  );
}

/**
 * 批量插入任务（用于迁移）。
 * 使用单个事务保证原子性。
 * @param {Array<object>} tasks
 */
export async function bulkAddTasks(tasks) {
  if (!tasks || tasks.length === 0) return;
  return withStore(STORE_TASKS, "readwrite", async (store) => {
    for (const task of tasks) {
      await reqToPromise(store.add(toPlain(task)));
    }
  });
}

// ====================== Meta 对象存储 ======================

/**
 * 写入元数据。
 */
export async function setMeta(key, value) {
  return withStore(STORE_META, "readwrite", (store) =>
    reqToPromise(store.put({ key, value: toPlain(value) })),
  );
}

/**
 * 读取元数据。
 */
export async function getMeta(key) {
  return withStore(STORE_META, "readonly", async (store) => {
    const row = await reqToPromise(store.get(key));
    return row ? row.value : undefined;
  });
}

/**
 * 删除元数据。
 */
export async function deleteMeta(key) {
  return withStore(STORE_META, "readwrite", (store) =>
    reqToPromise(store.delete(key)),
  );
}

// ====================== 诊断 / 维护 ======================

/**
 * 获取任务数量。
 */
export async function countTasks() {
  return withStore(STORE_TASKS, "readonly", (store) =>
    reqToPromise(store.count()),
  );
}
