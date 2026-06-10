<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSettingsStore, useHistoryStore } from "../stores/settings";
import { queryTaskStatus, queryTaskResult } from "../services/runninghub";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const route = useRoute();
const router = useRouter();
const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();

const taskId = route.params.taskId;
const history = ref(null);
const currentStatus = ref("");
const statusMessage = ref("");
const generatedImages = ref([]);
const errorMessage = ref("");
const pollingInterval = ref(null);

const statusText = computed(() => {
  const statusMap = {
    QUEUED: "排队中",
    RUNNING: "运行中",
    SUCCESS: "已完成",
    FAILED: "失败",
  };
  return statusMap[currentStatus.value] || currentStatus.value || "未知";
});

const statusColor = computed(() => {
  const colorMap = {
    QUEUED: "bg-yellow-100 text-yellow-800",
    RUNNING: "bg-blue-100 text-blue-800",
    SUCCESS: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return colorMap[currentStatus.value] || "bg-gray-100 text-gray-800";
});

const isImageEditTask = computed(() => {
  return history.value?.taskType === "image-edit";
});

const isSingleImageGenerateTask = computed(() => {
  return history.value?.taskType === "single-image-generate";
});

const taskTypeText = computed(() => {
  if (isImageEditTask.value) return "单图编辑";
  if (isSingleImageGenerateTask.value) return "单图生成";
  return "生成详情页";
});

const taskTypeColor = computed(() => {
  if (isImageEditTask.value) return "bg-purple-100 text-purple-800";
  if (isSingleImageGenerateTask.value) return "bg-emerald-100 text-emerald-800";
  return "bg-indigo-100 text-indigo-800";
});

const taskTitle = computed(() => {
  if (isImageEditTask.value) return "单图编辑";
  if (isSingleImageGenerateTask.value) {
    return history.value?.prompt || "未命名任务";
  }
  return history.value?.goods_name || "未命名任务";
});

const taskTitleTruncated = computed(() => {
  const title = taskTitle.value;
  if (title.length <= 30) return title;
  return title.slice(0, 30) + "...";
});

// 详情卡片展开/收起状态（按字段 key 控制）
const expandedFields = ref({});
// 字段内容是否溢出（用于决定是否显示"显示更多"按钮）
const overflowFields = ref({});
// 卡片默认最大行数（用于 line-clamp 和溢出判断）
const MAX_FIELD_LINES = 5;

function toggleExpand(key) {
  expandedFields.value[key] = !expandedFields.value[key];
}

function isExpanded(key) {
  return !!expandedFields.value[key];
}

function shouldShowToggle(key) {
  return !!overflowFields.value[key];
}

/**
 * 检测指定字段的 DOM 元素是否溢出。
 * 关键点：
 * 1. line-clamp 会让 scrollHeight == clientHeight，要临时移除测量真实高度
 * 2. flex-1 会让元素高度被父容器 flex 撑大到剩余空间，掩盖真实内容高度
 *    所以也要临时移除 flex-1，让元素回到内容自然高度
 */
function detectFieldOverflow(el) {
  if (!el) return false;
  const hadClamp = el.classList.contains("line-clamp-5");
  const hadFlex1 = el.classList.contains("flex-1");
  // 临时移除截断和 flex-1
  el.classList.remove("line-clamp-5");
  el.classList.remove("flex-1");
  // 强制同步布局
  void el.offsetHeight;
  const realHeight = el.scrollHeight;
  // 恢复
  if (hadClamp) el.classList.add("line-clamp-5");
  if (hadFlex1) el.classList.add("flex-1");
  // 计算 N 行最大高度
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
  const maxClampedHeight = lineHeight * MAX_FIELD_LINES;
  return realHeight > maxClampedHeight + 1;
}

function recheckAllOverflows() {
  const next = {};
  document.querySelectorAll("[data-field-key]").forEach((el) => {
    const key = el.getAttribute("data-field-key");
    next[key] = detectFieldOverflow(el);
  });
  overflowFields.value = next;
}

onMounted(async () => {
  // 先确保历史记录已从 IndexedDB 加载完成
  await historyStore.ensureLoaded();
  history.value = historyStore.getHistoryByTaskIdSync(taskId);

  if (!history.value) {
    errorMessage.value = "未找到该任务记录";
    return;
  }

  currentStatus.value = history.value.status || "";
  generatedImages.value = history.value.resultImages || [];

  if (currentStatus.value === "SUCCESS") {
    statusMessage.value = "任务已完成";
    await fetchResults();
  } else if (currentStatus.value === "FAILED") {
    errorMessage.value = history.value.errorMessage || "任务执行失败";
    statusMessage.value = "任务失败";
  } else {
    statusMessage.value = "正在查询任务状态...";
    await startPolling();
  }

  // DOM 渲染完成后检测所有字段是否溢出
  await nextTick();
  recheckAllOverflows();
  // 字体加载等异步资源可能引起二次布局，再补一次
  setTimeout(recheckAllOverflows, 200);
});

onUnmounted(() => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value);
    pollingInterval.value = null;
  }
});

async function startPolling() {
  pollingInterval.value = setInterval(async () => {
    try {
      const statusResult = await queryTaskStatus(taskId, settingsStore.apiKey);

      currentStatus.value = statusResult.status || "";
      historyStore
        .updateHistoryStatus(taskId, currentStatus.value)
        .catch((err) => {
          console.error("[history] 更新状态失败：", err);
        });

      if (history.value) {
        history.value.status = currentStatus.value;
      }

      if (currentStatus.value === "SUCCESS") {
        statusMessage.value = "任务完成！正在获取结果...";
        clearInterval(pollingInterval.value);
        pollingInterval.value = null;
        await fetchResults();
      } else if (currentStatus.value === "FAILED") {
        // 先停轮询，防止恢复过程中再次触发
        clearInterval(pollingInterval.value);
        pollingInterval.value = null;

        // 尝试从子任务恢复部分结果
        const recovered = await tryRecoverPartialResults(statusResult);
        if (recovered) {
          return;
        }

        errorMessage.value = "任务执行失败";
        statusMessage.value = "任务执行失败";
        historyStore.updateHistoryStatus(taskId, "FAILED", []).catch((err) => {
          console.error("[history] 更新状态失败：", err);
        });
      } else if (currentStatus.value === "RUNNING") {
        statusMessage.value = "任务运行中，请稍候...";
      } else if (currentStatus.value === "QUEUED") {
        statusMessage.value = "排队中，请稍候...";
      } else {
        statusMessage.value = `状态: ${currentStatus.value}`;
      }
    } catch (error) {
      // RunningHub API 业务错误（带 code 字段）
      if (error && error.apiCode) {
        // 停止轮询
        clearInterval(pollingInterval.value);
        pollingInterval.value = null;
        // 标记任务为 FAILED
        currentStatus.value = "FAILED";
        historyStore.updateHistoryStatus(taskId, "FAILED", []).catch((err) => {
          console.error("[history] 更新状态失败：", err);
        });
        if (history.value) {
          history.value.status = "FAILED";
        }
        // 显示明确的工作流错误提示
        const codeText = error.code ? `（code ${error.code}）` : "";
        const msg = error.message || "工作流错误";
        errorMessage.value = `工作流错误 ${codeText}：${msg}`;
        statusMessage.value = "任务执行失败";
        return;
      }
      // 网络/其他异常，继续轮询
      statusMessage.value = `查询错误: ${error.message || "未知错误"}`;
    }
  }, 5000);
}

async function fetchResults() {
  try {
    const result = await queryTaskResult(taskId, settingsStore.apiKey);

    currentStatus.value = result.status || "";
    historyStore
      .updateHistoryStatus(taskId, currentStatus.value)
      .catch((err) => {
        console.error("[history] 更新状态失败：", err);
      });

    if (history.value) {
      history.value.status = currentStatus.value;
    }

    if (result.status === "SUCCESS") {
      if (result.results && result.results.length > 0) {
        generatedImages.value = result.results.map((item) => item.url);
        historyStore
          .updateHistoryStatus(taskId, "SUCCESS", generatedImages.value)
          .catch((err) => {
            console.error("[history] 更新结果图片失败：", err);
          });
        if (history.value) {
          history.value.resultImages = generatedImages.value;
        }
        statusMessage.value = `成功获取 ${generatedImages.value.length} 张图片！`;
      } else {
        statusMessage.value = "未找到生成的图片";
      }
    } else if (result.status === "FAILED") {
      // 尝试从子任务恢复部分结果
      const recovered = await tryRecoverPartialResults(result);
      if (recovered) {
        return;
      }

      errorMessage.value = result.errorMessage || "未知错误";
      statusMessage.value = "任务执行失败";
      historyStore.updateHistoryStatus(taskId, "FAILED", []).catch((err) => {
        console.error("[history] 更新状态失败：", err);
      });
    } else if (result.status === "RUNNING") {
      statusMessage.value = "任务仍在运行中，请稍候...";
      if (!pollingInterval.value) {
        await startPolling();
      }
    }
  } catch (error) {
    statusMessage.value = `获取结果错误: ${error.message}`;
  }
}

async function downloadAllImages() {
  if (generatedImages.value.length === 0) {
    alert("没有可下载的图片");
    return;
  }

  statusMessage.value = "正在准备下载文件...";

  try {
    const zip = new JSZip();
    const folder = zip.folder("generated_images");

    for (let i = 0; i < generatedImages.value.length; i++) {
      const url = generatedImages.value[i];
      const imageName = `image_${i + 1}.${url.split(".").pop() || "jpg"}`;

      const response = await fetch(url);
      const blob = await response.blob();
      folder.file(imageName, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const timestamp = new Date().toISOString().slice(0, 10);
    const goodsName = history.value?.goods_name || "generated_images";
    saveAs(content, `${goodsName}-${timestamp}.zip`);

    statusMessage.value = `成功下载 ${generatedImages.value.length} 张图片！`;
  } catch (error) {
    statusMessage.value = `下载失败: ${error.message}`;
  }
}

function goBack() {
  router.push("/history");
}

/**
 * 手动刷新任务状态。
 * 复用 fetchResults：对 SUCCESS/FAILED 直接拉取结果并尝试恢复部分子任务，
 * 对 RUNNING/QUEUED 自动重启轮询。
 */
async function refreshTask() {
  statusMessage.value = "正在刷新任务状态...";
  await fetchResults();
}

/**
 * 再次生成：根据任务类型跳转到对应的生成页面，
 * 让用户使用相同参数重新提交（参数回填不在本次范围内）。
 */
function regenerate() {
  const taskType = history.value?.taskType;
  if (taskType === "image-edit") {
    router.push("/edit-image");
  } else if (taskType === "single-image-generate") {
    router.push("/single-image-generate");
  } else {
    router.push("/");
  }
}

/**
 * 从 taskUsageList 中逐个查询 SUCCESS 子任务的结果。
 *
 * 用途：主任务 FAILED 时，子任务可能仍有成功结果；
 * 此时遍历 taskUsageList 拉取每个 SUCCESS 子任务的图片并汇总。
 *
 * 单个子任务失败不影响其他子任务的收集。
 *
 * @param {Array} taskUsageList 接口返回的子任务列表
 * @returns {Promise<string[]>} 收集到的图片 URL 数组（按子任务顺序拼接）
 */
async function tryFetchPartialResults(taskUsageList) {
  if (!Array.isArray(taskUsageList) || taskUsageList.length === 0) {
    return [];
  }

  const successEntries = taskUsageList.filter(
    (item) => item && item.taskStatus === "SUCCESS" && item.taskId,
  );

  if (successEntries.length === 0) return [];

  const allImages = [];
  for (const entry of successEntries) {
    try {
      const subResult = await queryTaskResult(
        entry.taskId,
        settingsStore.apiKey,
      );
      if (Array.isArray(subResult.results) && subResult.results.length > 0) {
        const urls = subResult.results
          .map((item) => item && item.url)
          .filter(Boolean);
        allImages.push(...urls);
      }
    } catch (err) {
      console.error(`[history] 获取子任务 ${entry.taskId} 结果失败：`, err);
    }
  }

  return allImages;
}

/**
 * 尝试从失败的父任务中恢复部分子任务结果。
 *
 * 当查询结果 status === "FAILED" 且 parentTaskId === null（说明这是顶层任务），
 * 且 taskUsageList 中存在 SUCCESS 子任务时：
 * 1. 收集所有 SUCCESS 子任务的图片
 * 2. 将图片存入 generatedImages 与历史记录
 * 3. 更新 errorMessage / statusMessage 提示"部分成功"
 *
 * @returns {Promise<boolean>} true 表示成功恢复了部分结果
 */
async function tryRecoverPartialResults(taskResult) {
  if (!taskResult) return false;
  if (taskResult.parentTaskId !== null) return false;
  if (!Array.isArray(taskResult.taskUsageList)) return false;

  const partialImages = await tryFetchPartialResults(taskResult.taskUsageList);
  if (partialImages.length === 0) return false;

  generatedImages.value = partialImages;

  historyStore
    .updateHistoryStatus(taskId, "FAILED", partialImages)
    .catch((err) => {
      console.error("[history] 更新部分结果失败：", err);
    });

  if (history.value) {
    history.value.resultImages = partialImages;
  }

  const reason =
    taskResult.errorMessage ||
    `errorCode ${taskResult.errorCode}` ||
    "未知错误";
  errorMessage.value = `主任务执行失败（${reason}），但已从 ${partialImages.length} 张子任务结果中恢复部分图片。`;
  statusMessage.value = `部分成功：已恢复 ${partialImages.length} 张图片`;
  return true;
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <header class="bg-white shadow-sm">
      <nav
        class="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center"
      >
        <h1 class="text-2xl font-bold text-indigo-600">自动生成产品详情页</h1>
        <div class="flex gap-2 bg-gray-100 p-1 rounded-full">
          <router-link
            to="/"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200"
            :class="{
              'bg-indigo-600 text-white shadow-md': $route.path === '/',
              'text-gray-600 hover:bg-white hover:shadow-sm':
                $route.path !== '/',
            }"
          >
            生成详情页
          </router-link>
          <router-link
            to="/single-image-generate"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200"
            :class="{
              'bg-indigo-600 text-white shadow-md':
                $route.path === '/single-image-generate',
              'text-gray-600 hover:bg-white hover:shadow-sm':
                $route.path !== '/single-image-generate',
            }"
          >
            单图生成
          </router-link>
          <router-link
            to="/edit-image"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200"
            :class="{
              'bg-indigo-600 text-white shadow-md':
                $route.path === '/edit-image',
              'text-gray-600 hover:bg-white hover:shadow-sm':
                $route.path !== '/edit-image',
            }"
          >
            单图编辑
          </router-link>
          <router-link
            to="/history"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200"
            :class="{
              'bg-indigo-600 text-white shadow-md':
                $route.path.includes('/history'),
              'text-gray-600 hover:bg-white hover:shadow-sm':
                !$route.path.includes('/history'),
            }"
          >
            历史记录
          </router-link>
          <router-link
            to="/settings"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200"
            :class="{
              'bg-indigo-600 text-white shadow-md': $route.path === '/settings',
              'text-gray-600 hover:bg-white hover:shadow-sm':
                $route.path !== '/settings',
            }"
          >
            设置
          </router-link>
        </div>
      </nav>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-8">
      <div class="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <!-- 左侧按钮组：返回历史记录 -->
        <div class="flex gap-3">
          <button
            @click="goBack"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors font-medium"
          >
            ← 返回历史记录
          </button>
        </div>

        <!-- 右侧按钮组：刷新 / 再次生成 -->
        <div class="flex gap-3">
          <button
            @click="refreshTask"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors font-medium"
          >
            🔄 刷新
          </button>
          <button
            @click="regenerate"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors font-medium"
          >
            ✨ 再次生成
          </button>
        </div>
      </div>

      <div
        v-if="!history"
        class="bg-white rounded-xl shadow-lg p-12 text-center"
      >
        <div class="text-gray-400 text-6xl mb-4">❌</div>
        <h3 class="text-xl font-semibold text-gray-700 mb-2">
          未找到该任务记录
        </h3>
        <p class="text-gray-500 mb-6">该任务可能已被删除或不存在</p>
        <button
          @click="goBack"
          class="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          返回历史记录
        </button>
      </div>

      <template v-else>
        <div
          class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-2xl p-8 mb-6 text-white"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <span
                  :class="[
                    'px-4 py-1.5 rounded-full text-sm font-semibold',
                    taskTypeColor,
                  ]"
                >
                  {{ taskTypeText }}
                </span>
              </div>
              <h2 class="text-3xl font-bold mb-2 truncate" :title="taskTitle">
                {{ taskTitleTruncated }}
              </h2>
              <p class="text-white/80 text-sm">Task ID: {{ history.taskId }}</p>
            </div>
            <span
              :class="['px-6 py-3 rounded-full text-lg font-bold', statusColor]"
            >
              {{ statusText }}
            </span>
          </div>

          <div class="mt-6 bg-white/10 backdrop-blur rounded-lg p-4">
            <div class="flex items-center gap-3">
              <div
                v-if="currentStatus === 'QUEUED' || currentStatus === 'RUNNING'"
                class="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full"
              ></div>
              <div v-else-if="currentStatus === 'SUCCESS'" class="text-2xl">
                ✅
              </div>
              <div v-else-if="currentStatus === 'FAILED'" class="text-2xl">
                ❌
              </div>
              <div v-else class="text-2xl">⏳</div>
              <p class="text-lg">{{ statusMessage }}</p>
            </div>
          </div>
        </div>

        <div
          v-if="errorMessage && currentStatus === 'FAILED'"
          class="bg-red-50 border-2 border-red-300 rounded-xl p-6 mb-6"
        >
          <div class="flex items-center gap-3">
            <div class="text-red-500 text-3xl">❌</div>
            <div>
              <h3 class="font-bold text-red-800 text-lg">任务执行失败</h3>
              <p class="text-red-600 mt-1">{{ errorMessage }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h3
            class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"
          >
            <span>📋</span> 任务详情
          </h3>

          <template v-if="isImageEditTask">
            <div
              v-if="history.editContent"
              class="bg-gray-50 rounded-lg p-6 mb-6"
            >
              <label class="block text-sm font-medium text-gray-500 mb-3"
                >修改内容</label
              >
              <p class="text-gray-800 leading-relaxed">
                {{ history.editContent }}
              </p>
            </div>

            <div v-if="history.imageUrls && history.imageUrls.length > 0">
              <label class="block text-sm font-medium text-gray-500 mb-3"
                >原图</label
              >
              <div class="flex gap-3 flex-wrap">
                <img
                  v-for="(url, index) in history.imageUrls"
                  :key="index"
                  :src="url"
                  class="max-w-md max-h-64 object-contain rounded-lg border-2 border-gray-200"
                />
              </div>
            </div>
          </template>
          <template v-else-if="isSingleImageGenerateTask">
            <div class="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
              <div
                class="bg-gray-50 rounded-lg p-4 flex flex-col"
                style="min-height: 150px"
              >
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >用户提示词</label
                >
                <p
                  :data-field-key="'sig-prompt'"
                  :class="[
                    'text-gray-800 font-medium leading-relaxed flex-1',
                    { 'line-clamp-5': !isExpanded('sig-prompt') },
                  ]"
                >
                  {{ history.prompt || "-" }}
                </p>
                <button
                  v-if="shouldShowToggle('sig-prompt')"
                  @click="toggleExpand('sig-prompt')"
                  class="text-indigo-600 hover:text-indigo-700 text-sm font-medium mt-2 self-center"
                >
                  {{ isExpanded("sig-prompt") ? "收起 ▲" : "显示更多 ▼" }}
                </button>
              </div>
              <div
                class="bg-gray-50 rounded-lg p-4 flex flex-col"
                style="min-height: 150px"
              >
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >图像比例</label
                >
                <p
                  :data-field-key="'sig-ratio'"
                  :class="[
                    'text-gray-800 font-medium flex-1',
                    { 'line-clamp-5': !isExpanded('sig-ratio') },
                  ]"
                >
                  {{ history.image_ratio || "-" }}
                </p>
                <button
                  v-if="shouldShowToggle('sig-ratio')"
                  @click="toggleExpand('sig-ratio')"
                  class="text-indigo-600 hover:text-indigo-700 text-sm font-medium mt-2 self-center"
                >
                  {{ isExpanded("sig-ratio") ? "收起 ▲" : "显示更多 ▼" }}
                </button>
              </div>
              <div
                class="bg-gray-50 rounded-lg p-4 flex flex-col"
                style="min-height: 150px"
              >
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >上传图片数量</label
                >
                <p
                  :data-field-key="'sig-count'"
                  :class="[
                    'text-gray-800 font-medium flex-1',
                    { 'line-clamp-5': !isExpanded('sig-count') },
                  ]"
                >
                  {{
                    history.image_count ||
                    (history.imageUrls && history.imageUrls.length) ||
                    0
                  }}
                  张
                </p>
                <button
                  v-if="shouldShowToggle('sig-count')"
                  @click="toggleExpand('sig-count')"
                  class="text-indigo-600 hover:text-indigo-700 text-sm font-medium mt-2 self-center"
                >
                  {{ isExpanded("sig-count") ? "收起 ▲" : "显示更多 ▼" }}
                </button>
              </div>
            </div>

            <div v-if="history.imageUrls && history.imageUrls.length > 0">
              <label class="block text-sm font-medium text-gray-500 mb-3"
                >参考图片</label
              >
              <div class="flex gap-3 flex-wrap">
                <img
                  v-for="(url, index) in history.imageUrls"
                  :key="index"
                  :src="url"
                  class="w-24 h-24 object-cover rounded-lg border-2 border-gray-200 hover:border-indigo-400 transition-colors"
                />
              </div>
            </div>
          </template>
          <template v-else>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
              <div class="bg-gray-50 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >品牌名称</label
                >
                <p class="text-gray-800 font-medium">
                  {{ history.brand_name || "-" }}
                </p>
              </div>
              <div class="bg-gray-50 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >目标人群</label
                >
                <p class="text-gray-800 font-medium">
                  {{ history.target_audience || "-" }}
                </p>
              </div>
              <div class="bg-gray-50 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >详情页主题</label
                >
                <p class="text-gray-800 font-medium">
                  {{ history.theme || "-" }}
                </p>
              </div>
              <div class="bg-gray-50 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >视觉风格</label
                >
                <p class="text-gray-800 font-medium">
                  {{ history.visual_style || "-" }}
                </p>
              </div>
              <div class="bg-gray-50 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >图片比例</label
                >
                <p class="text-gray-800 font-medium">
                  {{ history.image_ratio || "-" }}
                </p>
              </div>
              <div class="bg-gray-50 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-500 mb-2"
                  >图片数量</label
                >
                <p class="text-gray-800 font-medium">
                  {{ history.image_num || "-" }}
                </p>
              </div>
            </div>

            <div
              v-if="history.goods_features"
              class="bg-gray-50 rounded-lg p-6 mb-6"
            >
              <label class="block text-sm font-medium text-gray-500 mb-3"
                >产品卖点</label
              >
              <p class="text-gray-800 leading-relaxed">
                {{ history.goods_features }}
              </p>
            </div>

            <div v-if="history.imageUrls && history.imageUrls.length > 0">
              <label class="block text-sm font-medium text-gray-500 mb-3"
                >上传的产品图片</label
              >
              <div class="flex gap-3 flex-wrap">
                <img
                  v-for="(url, index) in history.imageUrls"
                  :key="index"
                  :src="url"
                  class="w-24 h-24 object-cover rounded-lg border-2 border-gray-200 hover:border-indigo-400 transition-colors"
                />
              </div>
            </div>
          </template>
        </div>

        <div
          v-if="generatedImages.length > 0"
          class="bg-white rounded-xl shadow-lg p-8"
        >
          <div class="flex items-center justify-between mb-6">
            <h3
              class="text-2xl font-bold text-gray-800 flex items-center gap-2"
            >
              <span>🎨</span>
              {{
                isImageEditTask
                  ? "编辑结果"
                  : isSingleImageGenerateTask
                    ? "生成的图片"
                    : "生成的详情页图片"
              }}
            </h3>
            <button
              @click="downloadAllImages"
              class="px-6 py-3 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-2 font-medium"
            >
              <span>📥</span>
              一键下载
            </button>
          </div>
          <div
            :class="
              isImageEditTask || isSingleImageGenerateTask
                ? 'flex justify-center'
                : 'grid grid-cols-2 gap-6'
            "
          >
            <div
              v-for="(img, index) in generatedImages"
              :key="index"
              class="space-y-3"
            >
              <img
                :src="img"
                class="w-full rounded-lg shadow-md hover:shadow-xl transition-shadow"
                :class="
                  isImageEditTask || isSingleImageGenerateTask
                    ? 'max-w-lg mx-auto'
                    : ''
                "
              />
              <p
                v-if="!isImageEditTask && !isSingleImageGenerateTask"
                class="text-center text-gray-600 text-sm font-medium"
              >
                第 {{ index + 1 }} 张
              </p>
            </div>
          </div>
        </div>

        <div
          v-else-if="currentStatus !== 'SUCCESS' && currentStatus !== 'FAILED'"
          class="bg-white rounded-xl shadow-lg p-12 text-center"
        >
          <div class="text-gray-300 text-6xl mb-4">⏳</div>
          <p class="text-gray-500">正在等待任务完成...</p>
          <p class="text-gray-400 text-sm mt-2">
            任务完成后将自动显示生成的图片
          </p>
        </div>

        <div
          v-else-if="
            currentStatus === 'SUCCESS' && generatedImages.length === 0
          "
          class="bg-white rounded-xl shadow-lg p-12 text-center"
        >
          <div class="text-gray-400 text-6xl mb-4">🖼️</div>
          <p class="text-gray-500">未找到生成的图片</p>
        </div>
      </template>
    </main>
  </div>
</template>
