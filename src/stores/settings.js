import { defineStore } from "pinia";
import { ref, watch } from "vue";
import {
  addTask as dbAddTask,
  clearAllTasks as dbClearAllTasks,
  deleteTask as dbDeleteTask,
  getAllTasks,
  getTaskByTaskId,
  updateTaskByTaskId,
} from "../services/db.js";

/**
 * 安全读取 localStorage，失败时返回 fallback。
 */
function safeGetItem(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch (err) {
    console.warn(`[settings] 读取 localStorage["${key}"] 失败：`, err);
    return fallback;
  }
}

/**
 * 安全写入 localStorage，失败时打印警告但不抛错。
 */
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[settings] 写入 localStorage["${key}"] 失败：`, err);
  }
}

/**
 * 安全删除 localStorage。
 */
function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[settings] 删除 localStorage["${key}"] 失败：`, err);
  }
}

// ====================== Settings Store ======================
// 简单 KV 配置仍保留在 localStorage（体积小、读取频繁、跨标签页同步）

export const useSettingsStore = defineStore("settings", () => {
  // api_key 不再硬编码默认值，首次启动时为空，强制用户在设置页填写
  const apiKey = ref(safeGetItem("api_key", ""));
  const goodsDetailWorkflowId = ref(
    safeGetItem("goods_detail_workflow_id", "2064943518187085825"),
  );
  const goodsDetailWithoutTextWorkflowId = ref(
    safeGetItem("goods_detail_without_text_workflow_id", "2065355371576913922"),
  );
  const imageEditWorkflowId = ref(
    safeGetItem("image_edit_workflow_id", "2064943629881405441"),
  );
  const singleImageGenerateWorkflowId = ref(
    safeGetItem("single_image_generate_workflow_id", "2064943676937297921"),
  );

  watch(apiKey, (newValue) => {
    if (newValue) safeSetItem("api_key", newValue);
    else safeRemoveItem("api_key");
  });

  watch(goodsDetailWorkflowId, (newValue) => {
    if (newValue) safeSetItem("goods_detail_workflow_id", newValue);
    else safeRemoveItem("goods_detail_workflow_id");
  });

  watch(goodsDetailWithoutTextWorkflowId, (newValue) => {
    if (newValue) {
      safeSetItem("goods_detail_without_text_workflow_id", newValue);
    } else {
      safeRemoveItem("goods_detail_without_text_workflow_id");
    }
  });

  watch(imageEditWorkflowId, (newValue) => {
    if (newValue) safeSetItem("image_edit_workflow_id", newValue);
    else safeRemoveItem("image_edit_workflow_id");
  });

  watch(singleImageGenerateWorkflowId, (newValue) => {
    if (newValue) safeSetItem("single_image_generate_workflow_id", newValue);
    else safeRemoveItem("single_image_generate_workflow_id");
  });

  function setApiKey(key) {
    apiKey.value = key;
  }

  function clearApiKey() {
    apiKey.value = "";
  }

  function setGoodsDetailWorkflowId(id) {
    goodsDetailWorkflowId.value = id;
  }

  function clearGoodsDetailWorkflowId() {
    goodsDetailWorkflowId.value = "";
  }

  function setGoodsDetailWithoutTextWorkflowId(id) {
    goodsDetailWithoutTextWorkflowId.value = id;
  }

  function clearGoodsDetailWithoutTextWorkflowId() {
    goodsDetailWithoutTextWorkflowId.value = "";
  }

  function setImageEditWorkflowId(id) {
    imageEditWorkflowId.value = id;
  }

  function clearImageEditWorkflowId() {
    imageEditWorkflowId.value = "";
  }

  function setSingleImageGenerateWorkflowId(id) {
    singleImageGenerateWorkflowId.value = id;
  }

  function clearSingleImageGenerateWorkflowId() {
    singleImageGenerateWorkflowId.value = "";
  }

  return {
    apiKey,
    goodsDetailWorkflowId,
    goodsDetailWithoutTextWorkflowId,
    imageEditWorkflowId,
    singleImageGenerateWorkflowId,
    setApiKey,
    clearApiKey,
    setGoodsDetailWorkflowId,
    clearGoodsDetailWorkflowId,
    setGoodsDetailWithoutTextWorkflowId,
    clearGoodsDetailWithoutTextWorkflowId,
    setImageEditWorkflowId,
    clearImageEditWorkflowId,
    setSingleImageGenerateWorkflowId,
    clearSingleImageGenerateWorkflowId,
  };
});

// ====================== History Store ======================
// 任务历史数据迁移到 IndexedDB（异步、容量大、支持索引）

export const useHistoryStore = defineStore("history", () => {
  const historyList = ref([]);
  const isReady = ref(false);
  const loadError = ref(null);

  /**
   * 从 IndexedDB 加载所有历史记录到内存。
   * 组件挂载后可调用 ensureLoaded() 等待数据可用。
   */
  async function ensureLoaded() {
    if (isReady.value) return;
    try {
      historyList.value = await getAllTasks();
      loadError.value = null;
    } catch (err) {
      console.error("[history] 从 IndexedDB 加载失败：", err);
      loadError.value = err.message || String(err);
      historyList.value = [];
    } finally {
      isReady.value = true;
    }
  }

  /**
   * 添加任务历史记录。
   * @returns {Promise<number>} 新记录的主键 id
   */
  async function addHistory(
    taskId,
    userInputs,
    imageUrls,
    taskType = "generate",
  ) {
    const history = {
      id: Date.now(),
      taskId: taskId,
      taskType: taskType,
      goods_name: userInputs.goods_name,
      brand_name: userInputs.brand_name,
      target_audience: userInputs.target_audience,
      theme: userInputs.theme,
      visual_style: userInputs.visual_style,
      goods_features: userInputs.goods_features,
      image_ratio: userInputs.image_ratio,
      image_num: userInputs.image_num,
      prompt: userInputs.prompt || "",
      image_count: userInputs.image_count || 0,
      imageUrls: imageUrls,
      editContent: userInputs.editContent || "",
      createdAt: new Date().toISOString(),
      status: "QUEUED",
      resultImages: [],
    };
    try {
      const newId = await dbAddTask(history);
      // 内存中用新 id，并插入到列表头部
      const record = { ...history, id: newId };
      historyList.value.unshift(record);
      return newId;
    } catch (err) {
      console.error("[history] 添加历史记录失败：", err);
      throw err;
    }
  }

  /**
   * 更新任务状态与结果图片。
   * @returns {Promise<object|undefined>} 更新后的任务对象
   */
  async function updateHistoryStatus(taskId, status, resultImages = []) {
    const patch = { status };
    if (resultImages.length > 0) {
      patch.resultImages = resultImages;
    }
    try {
      const updated = await updateTaskByTaskId(taskId, patch);
      if (updated) {
        const idx = historyList.value.findIndex(
          (item) => item.taskId === taskId,
        );
        if (idx !== -1) {
          historyList.value[idx] = { ...historyList.value[idx], ...updated };
        }
      }
      return updated;
    } catch (err) {
      console.error("[history] 更新任务状态失败：", err);
      throw err;
    }
  }

  /**
   * 通过 taskId 获取历史记录。
   * 优先从内存查；若未就绪则回退到 IndexedDB。
   * @returns {Promise<object|undefined>}
   */
  async function getHistoryByTaskId(taskId) {
    if (isReady.value) {
      const inMemory = historyList.value.find((item) => item.taskId === taskId);
      if (inMemory) return inMemory;
    }
    try {
      return await getTaskByTaskId(taskId);
    } catch (err) {
      console.error("[history] 查询历史记录失败：", err);
      return undefined;
    }
  }

  /**
   * 同步版本的查询（用于组件已挂载、列表已加载的场景）。
   */
  function getHistoryByTaskIdSync(taskId) {
    return historyList.value.find((item) => item.taskId === taskId);
  }

  /**
   * 通过内部主键 id 删除任务。
   */
  async function deleteHistory(id) {
    try {
      await dbDeleteTask(id);
      const idx = historyList.value.findIndex((item) => item.id === id);
      if (idx !== -1) {
        historyList.value.splice(idx, 1);
      }
    } catch (err) {
      console.error("[history] 删除历史记录失败：", err);
      throw err;
    }
  }

  /**
   * 清空所有历史记录。
   */
  async function clearHistory() {
    try {
      await dbClearAllTasks();
      historyList.value = [];
    } catch (err) {
      console.error("[history] 清空历史记录失败：", err);
      throw err;
    }
  }

  return {
    historyList,
    isReady,
    loadError,
    ensureLoaded,
    addHistory,
    updateHistoryStatus,
    getHistoryByTaskId,
    getHistoryByTaskIdSync,
    deleteHistory,
    clearHistory,
  };
});
