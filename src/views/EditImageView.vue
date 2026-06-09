<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useSettingsStore, useHistoryStore } from "../stores/settings";
import {
  uploadFile,
  submitTask,
  queryTaskStatus,
  queryTaskResult,
} from "../services/runninghub";
import { checkQueueAvailability } from "../services/queue";
import LoadingOverlay from "../components/LoadingOverlay.vue";
import ConfirmModal from "../components/ConfirmModal.vue";

const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();
const router = useRouter();

const formData = ref({
  editContent: "",
});

const imageFile = ref(null);
const imageUrl = ref("");
const isUploading = ref(false);
const isRunning = ref(false);
const statusMessage = ref("");
const generatedImage = ref(null);
const taskId = ref("");
const pollingInterval = ref(null);
const showUploadDialog = ref(false);

// 遮罩编辑器状态
const showMaskModal = ref(false);
const canvasRef = ref(null);
const maskCtx = ref(null);
const maskImage = ref(null);
const isDrawing = ref(false);
const lastPoint = ref(null);
const isUploadingMask = ref(false);
const brushConfig = ref({
  shape: "circle", // circle | square
  size: 100,
  opacity: 1,
  color: "#ff0000",
});
// 缩放与平移
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const MIN_SCALE = 1;
const MAX_SCALE = 3;
// 步进：按钮步进稍大，滚轮步进更精细
const ZOOM_STEP_BUTTON = 0.15;
const ZOOM_STEP_WHEEL = 0.05;
// 画布 bitmap 尺寸（用于定位画布视觉中心）
const canvasSize = ref({ width: 0, height: 0 });
// 画笔指示器：跟随鼠标，预览画笔效果
const brushPos = ref({ x: -9999, y: -9999 });
const showBrushIndicator = ref(false);
// 撤销历史栈：每次画笔操作前保存一份画布 ImageData 快照
// 限制最大条数，避免长时间编辑导致内存占用过高
const undoStack = ref([]);
const isFlashing = ref(false);
const MAX_HISTORY = 20;
const canUndo = computed(() => undoStack.value.length > 0);

const hasApiKey = computed(() => !!settingsStore.apiKey);
const hasWorkflowId = computed(() => !!settingsStore.imageEditWorkflowId);

const canStartEdit = computed(() => {
  return (
    hasApiKey.value &&
    hasWorkflowId.value &&
    imageFile.value &&
    formData.value.editContent.trim()
  );
});

async function handleFileSelect(event) {
  if (!hasApiKey.value) {
    alert("请先在设置页面配置 API Key");
    event.target.value = "";
    return;
  }

  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  if (files.length > 1) {
    alert("单图编辑只能上传一张图片");
    event.target.value = "";
    return;
  }

  const file = files[0];
  imageFile.value = file;

  isUploading.value = true;
  showUploadDialog.value = true;

  try {
    const cloudUrl = await uploadFile(file, settingsStore.apiKey);
    imageUrl.value = cloudUrl;
    showUploadDialog.value = false;
  } catch (error) {
    showUploadDialog.value = false;
    alert(`上传失败: ${error.message}`);
    imageFile.value = null;
    event.target.value = "";
  } finally {
    event.target.value = "";
  }
}

function removeImage() {
  imageFile.value = null;
  imageUrl.value = "";
}

// ============ 遮罩编辑器 ============

async function openMaskEditor() {
  showMaskModal.value = true;
  await nextTick();
  try {
    await initCanvas();
  } catch (err) {
    // initCanvas 内部已处理 alert，但保险起见这里再打印一次
    console.error("打开遮罩编辑器失败:", err);
  }
}

function closeMaskModal() {
  showMaskModal.value = false;
}

async function initCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  // 策略 1：尝试 fetch + blob URL（同源，canvas 不会被 CORS 污染，保存能成功）
  // 策略 2：fetch 失败时降级为直接 img.src，图片能显示但保存可能失败
  let useBlob = false;
  let blobUrl = "";
  try {
    const response = await fetch(imageUrl.value);
    if (response.ok) {
      const blob = await response.blob();
      blobUrl = URL.createObjectURL(blob);
      useBlob = true;
    }
  } catch (err) {
    console.warn(
      "fetch 图片失败（可能是 CORS 限制），降级到直接 img.src：",
      err,
    );
  }

  const img = new Image();
  img.onload = () => {
    try {
      maskImage.value = img;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvasSize.value = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      };

      // 显式计算 fit-contain 尺寸，确保长边紧贴画板对应边
      // 不依赖 CSS max-width/max-height 的隐式行为
      refitCanvasToContainer();

      scale.value = 1;
      offsetX.value = 0;
      offsetY.value = 0;
      const c = canvas.getContext("2d");
      c.drawImage(img, 0, 0);
      maskCtx.value = c;
      // 新图像加载后清空历史栈，仅在用户实际绘画时才保存历史
      // 确保未绘画前撤销按钮处于禁用状态
      undoStack.value = [];
    } catch (err) {
      console.error("绘制图片到 canvas 失败：", err);
      alert("加载图片失败：无法绘制到画布（可能 CORS 限制）");
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  };
  img.onerror = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    alert("加载图片失败：图像解码异常");
  };
  img.src = useBlob ? blobUrl : imageUrl.value;
}

/**
 * 计算 fit-contain 尺寸并应用到 canvas 的 CSS width/height，
 * 让长边紧贴画板对应边（不溢出、不留白）。
 */
function refitCanvasToContainer() {
  const canvas = canvasRef.value;
  if (!canvas || canvasSize.value.width === 0) return;
  const container = canvas.parentElement;
  if (!container) return;
  // 容器有 p-4 = 16px padding 留给画布四周
  const padding = 32;
  const containerW = Math.max(0, container.clientWidth - padding);
  const containerH = Math.max(0, container.clientHeight - padding);
  const fitScale = Math.min(
    containerW / canvasSize.value.width,
    containerH / canvasSize.value.height,
  );
  canvas.style.width = canvasSize.value.width * fitScale + "px";
  canvas.style.height = canvasSize.value.height * fitScale + "px";
}

function getCanvasPoint(e) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

/**
 * 将 hex 颜色（#ff0000）与透明度（0.1~1.0）合并为 rgba 字符串
 * 确保画笔指示器与 canvas 绘制使用完全相同的颜色与透明度表达，视觉一致
 */
function toRGBA(hexColor, opacity) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function drawAt(point) {
  const c = maskCtx.value;
  if (!c) return;
  c.save();
  c.fillStyle = toRGBA(brushConfig.value.color, brushConfig.value.opacity);
  const size = brushConfig.value.size;
  if (brushConfig.value.shape === "circle") {
    c.beginPath();
    c.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    c.fill();
  } else {
    c.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  }
  c.restore();
}

function drawLine(from, to) {
  const c = maskCtx.value;
  if (!c) return;
  c.save();
  c.strokeStyle = toRGBA(brushConfig.value.color, brushConfig.value.opacity);
  c.lineWidth = brushConfig.value.size;
  if (brushConfig.value.shape === "circle") {
    c.lineCap = "round";
    c.lineJoin = "round";
  } else {
    c.lineCap = "square";
    c.lineJoin = "miter";
  }
  c.beginPath();
  c.moveTo(from.x, from.y);
  c.lineTo(to.x, to.y);
  c.stroke();
  c.restore();
}

const startPoint = ref(null);

function startDraw(e) {
  if (!maskCtx.value) return;
  e.preventDefault();
  isDrawing.value = true;
  // 在涂抹前保存当前画布状态，用于撤销
  pushHistory();
  const point = getCanvasPoint(e);
  lastPoint.value = point;
  startPoint.value = point;
}

function moveDraw(e) {
  if (!isDrawing.value) return;
  e.preventDefault();
  const point = getCanvasPoint(e);
  drawLine(lastPoint.value, point);
  lastPoint.value = point;
}

function endDraw() {
  // 若用户只是点击未拖动，在点击位置画一个圆点（与线条粗细/透明度一致）
  if (isDrawing.value && lastPoint.value && startPoint.value) {
    const dx = lastPoint.value.x - startPoint.value.x;
    const dy = lastPoint.value.y - startPoint.value.y;
    if (dx * dx + dy * dy < 1) {
      drawAt(lastPoint.value);
    }
  }
  isDrawing.value = false;
  lastPoint.value = null;
  startPoint.value = null;
}

/**
 * 计算画笔指示器在父容器中的左上角位置和样式
 * 关键：视觉尺寸 = brushConfig.size * (rect.width / canvas.width)
 *   canvas.width 是画布内部像素数（如 1000）
 *   rect.width 是 CSS 渲染后的屏幕宽度（如 fit-contain 400 再 * scale）
 *   所以一个 brushConfig.size 画布像素在屏幕上显示为：size * (rect.width / canvas.width)
 * 这保证指示器视觉大小与实际绘制痕迹大小完全一致。
 * 位置跟随鼠标，鼠标移出画布时隐藏
 */
const brushIndicatorStyle = computed(() => {
  const canvas = canvasRef.value;
  if (!canvas) return { display: "none" };
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { display: "none" };
  // 画布内部像素 → CSS 渲染像素 的比例
  const pixelRatio = rect.width / canvas.width;
  const visualSize = brushConfig.value.size * pixelRatio;
  if (visualSize <= 0) return { display: "none" };
  const parent = canvas.parentElement;
  if (!parent) return { display: "none" };
  const parentRect = parent.getBoundingClientRect();
  // 鼠标在画布视觉内的位置（CSS 像素）
  const localX = brushPos.value.x - rect.left;
  const localY = brushPos.value.y - rect.top;
  // 检查鼠标是否在画布视觉范围内
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
    return { display: "none" };
  }
  // 画布视觉位置在父容器中的偏移
  const offsetXInParent = rect.left - parentRect.left;
  const offsetYInParent = rect.top - parentRect.top;
  const cx = offsetXInParent + localX;
  const cy = offsetYInParent + localY;
  const rgbaColor = toRGBA(brushConfig.value.color, brushConfig.value.opacity);
  return {
    display: "block",
    width: visualSize + "px",
    height: visualSize + "px",
    backgroundColor: rgbaColor,
    borderRadius: brushConfig.value.shape === "circle" ? "50%" : "0",
    transform: `translate(${cx - visualSize / 2}px, ${cy - visualSize / 2}px)`,
    transition: "none",
    pointerEvents: "none",
    position: "absolute",
    left: "0",
    top: "0",
  };
});

/**
 * canvas 的 mousemove 事件：更新画笔指示器位置 + 继续执行绘制逻辑
 */
function onCanvasMouseMove(e) {
  brushPos.value = { x: e.clientX, y: e.clientY };
  showBrushIndicator.value = true;
  moveDraw(e);
}

/**
 * canvas 的 mouseleave 事件：隐藏指示器 + 结束绘制
 */
function onCanvasMouseLeave() {
  showBrushIndicator.value = false;
  endDraw();
}

function clearMask() {
  if (!maskCtx.value || !maskImage.value) return;
  // 清除前保存当前状态，使"清除"操作也可被撤销
  pushHistory();
  const canvas = canvasRef.value;
  maskCtx.value.clearRect(0, 0, canvas.width, canvas.height);
  maskCtx.value.drawImage(maskImage.value, 0, 0);
}

/**
 * 保存当前画布状态到撤销栈
 * 使用 getImageData 获取完整像素快照
 * CORS 污染的画布无法读取像素，此时静默失败（撤销功能将不可用）
 */
function pushHistory() {
  const canvas = canvasRef.value;
  const ctx = maskCtx.value;
  if (!canvas || !ctx) return;
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.value.push(data);
    if (undoStack.value.length > MAX_HISTORY) {
      undoStack.value.shift();
    }
  } catch (err) {
    console.warn("无法保存画布历史（可能是 CORS 污染）：", err);
  }
}

/**
 * 撤销：弹出最近一次保存的状态并恢复到画布
 * 响应时间：putImageData 是 O(canvas pixels) 操作，
 * 对于常规图片（<4K）耗时 < 50ms，满足 100ms 要求
 */
function undo() {
  if (!canUndo.value) return;
  const canvas = canvasRef.value;
  const ctx = maskCtx.value;
  if (!canvas || !ctx) return;
  const data = undoStack.value.pop();
  ctx.putImageData(data, 0, 0);
  triggerFlash();
}

/**
 * 视觉反馈：触发 canvas 短暂闪烁
 * 使用 rAF + setTimeout 实现重复触发动画重置
 */
function triggerFlash() {
  isFlashing.value = false;
  requestAnimationFrame(() => {
    isFlashing.value = true;
    setTimeout(() => {
      isFlashing.value = false;
    }, 300);
  });
}

/**
 * 全局键盘监听：仅在遮罩弹窗打开时响应 Ctrl+Z
 * 排除 INPUT/TEXTAREA，避免与页面表单的撤销冲突
 */
function handleKeyDown(e) {
  if (!showMaskModal.value) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === "z" || e.key === "Z") &&
    !e.shiftKey
  ) {
    e.preventDefault();
    undo();
  }
}

async function saveMask() {
  if (!canvasRef.value) return;
  isUploadingMask.value = true;
  try {
    const dataUrl = canvasRef.value.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "masked.png", { type: "image/png" });
    const cloudUrl = await uploadFile(file, settingsStore.apiKey);
    // 替换原图
    imageFile.value = file;
    imageUrl.value = cloudUrl;
    showMaskModal.value = false;
  } catch (error) {
    alert(`保存失败: ${error.message || error}`);
  } finally {
    isUploadingMask.value = false;
  }
}

/**
 * 以画布上某点为中心进行缩放
 * 画布像素在屏幕上的实际位置 = offset + focus * fitScale * scale
 *   fitScale: 图片长边贴合容器的缩放比（canvas CSS 宽 / canvas 内部像素数）
 *   scale: 用户交互缩放比（1.0 ~ 3.0）
 * 缩放后保持该屏幕位置不变：
 * newOffset = offset + focus * fitScale * (scale - newScale)
 */
function zoom(deltaScale, focusX, focusY) {
  const canvas = canvasRef.value;
  if (!canvas || canvasSize.value.width === 0) return;
  // fitScale = canvas 显示宽度（CSS 像素，不含 transform 缩放） / canvas 内部像素数
  const fitScale = parseFloat(canvas.style.width) / canvas.width;
  const newScale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, +(scale.value + deltaScale).toFixed(3)),
  );
  if (newScale === scale.value) return;
  const f = fitScale * (scale.value - newScale);
  offsetX.value += focusX * f;
  offsetY.value += focusY * f;
  scale.value = newScale;
}

/**
 * 按钮缩放：以画布视觉中心为缩放中心，图像始终在画板中央
 * canvas 在父容器中通过 flex 居中，scale=1 时中心位于画板中央
 * 缩放后调整 offset 使画布中心位置保持不变 → 仍在画板中央
 */
function zoomByCenter(deltaScale) {
  if (canvasSize.value.width === 0) return;
  const focusX = canvasSize.value.width / 2;
  const focusY = canvasSize.value.height / 2;
  zoom(deltaScale, focusX, focusY);
}

/**
 * 滚轮缩放：以鼠标当前在画布上的点为缩放中心
 */
function zoomByPointer(e) {
  if (canvasSize.value.width === 0) return;
  const point = getCanvasPoint(e);
  const delta = e.deltaY > 0 ? -ZOOM_STEP_WHEEL : ZOOM_STEP_WHEEL;
  zoom(delta, point.x, point.y);
}

function zoomIn() {
  zoomByCenter(ZOOM_STEP_BUTTON);
}

function zoomOut() {
  zoomByCenter(-ZOOM_STEP_BUTTON);
}

function resetZoom() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

/**
 * 还原图片大小：与首次打开遮罩编辑界面时的显示完全一致
 * - 画布 CSS 尺寸：按容器 fit-contain 计算（长边紧贴画板）
 * - scale：1（无额外缩放）
 * - offset：0（居中）
 */
function resetImageSize() {
  if (canvasSize.value.width === 0) return;
  refitCanvasToContainer();
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

function onWheel(e) {
  e.preventDefault();
  zoomByPointer(e);
}

onMounted(() => {
  // 注册全局键盘监听，仅在弹窗打开时生效
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  // 清理遮罩编辑器状态
  showMaskModal.value = false;
  maskCtx.value = null;
  maskImage.value = null;
  isDrawing.value = false;
  lastPoint.value = null;
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  // 清理撤销历史（包含 ImageData 引用）和键盘监听
  undoStack.value = [];
  window.removeEventListener("keydown", handleKeyDown);
});

async function startEdit() {
  if (!hasApiKey.value) {
    alert("请先在设置页面配置 API Key");
    return;
  }

  if (!hasWorkflowId.value) {
    alert("请先在设置页面配置单图编辑 Workflow ID");
    return;
  }

  if (!imageFile.value) {
    alert("请上传一张图片");
    return;
  }

  if (!formData.value.editContent.trim()) {
    alert("请输入修改内容");
    return;
  }

  isRunning.value = true;
  statusMessage.value = "准备开始...";

  try {
    statusMessage.value = "正在检查队列状态...";
    const queue = await checkQueueAvailability(settingsStore.apiKey);

    if (!queue.canSubmit) {
      queueWarningMessage.value = queue.message;
      showQueueWarningModal.value = true;
      isRunning.value = false;
      return;
    }

    statusMessage.value = "正在提交任务...";
    const nodeInfoList = [
      {
        nodeId: "2",
        fieldName: "url",
        fieldValue: imageUrl.value,
      },
      {
        nodeId: "5",
        fieldName: "text",
        fieldValue: formData.value.editContent,
      },
    ];

    taskId.value = await submitTask(
      nodeInfoList,
      settingsStore.imageEditWorkflowId,
      settingsStore.apiKey,
    );

    // 必须 await：addHistory 是异步写入 IndexedDB，
    // 若不等待就跳转，HistoryDetailView 的 ensureLoaded() 会读到不含新任务的列表
    await historyStore.addHistory(
      taskId.value,
      { editContent: formData.value.editContent },
      [imageUrl.value],
      "image-edit",
    );

    router.push(`/history/${taskId.value}`);
  } catch (error) {
    statusMessage.value = `错误: ${error.message}`;
    isRunning.value = false;
  }
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
              'bg-indigo-600 text-white shadow-md': $route.path === '/history',
              'text-gray-600 hover:bg-white hover:shadow-sm':
                $route.path !== '/history',
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

    <main class="max-w-3xl mx-auto px-4 py-8">
      <div
        v-if="!hasApiKey || !hasWorkflowId"
        class="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8"
      >
        <p class="text-yellow-800">
          ⚠️ 请先在
          <router-link to="/settings" class="font-semibold underline"
            >设置页面</router-link
          >
          <span v-if="!hasApiKey">配置您的 API Key</span>
          <span v-if="!hasApiKey && !hasWorkflowId"> 和 </span>
          <span v-if="!hasWorkflowId">配置单图编辑 Workflow ID</span>
        </p>
      </div>

      <div class="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">单图编辑</h2>

        <div class="space-y-6 max-w-2xl">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              上传图片（仅支持一张）
            </label>
            <div
              v-if="!imageUrl"
              class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors"
            >
              <input
                type="file"
                accept="image/*"
                @change="handleFileSelect"
                class="hidden"
                id="image-upload"
              />
              <label for="image-upload" class="cursor-pointer">
                <div class="text-gray-600">
                  <p class="text-lg mb-2">点击上传图片</p>
                  <p class="text-sm">支持 JPG、PNG 格式</p>
                </div>
              </label>
            </div>

            <div v-else class="relative inline-block group">
              <img
                :src="imageUrl"
                class="max-w-md max-h-64 object-contain rounded-lg border border-gray-200"
              />
              <button
                @click="removeImage"
                class="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full text-sm hover:bg-red-600 flex items-center justify-center"
              >
                ×
              </button>
              <button
                @click="openMaskEditor"
                class="absolute bottom-2 right-2 px-3 py-1.5 bg-indigo-600/90 hover:bg-indigo-700 text-white text-xs rounded-md flex items-center gap-1 shadow-md opacity-90 hover:opacity-100"
              >
                <span>✏️</span>
                编辑遮罩
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              修改内容
            </label>
            <textarea
              v-model="formData.editContent"
              rows="4"
              placeholder="请输入您对图片的修改要求，例如：把背景改成蓝色，增加一些光效"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            ></textarea>
          </div>

          <div class="pt-4 flex justify-center">
            <button
              v-if="!isRunning"
              @click="startEdit"
              :disabled="!canStartEdit"
              class="px-12 bg-indigo-600 text-white py-4 rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              开始编辑
            </button>
            <button
              v-else
              disabled
              class="px-12 bg-indigo-400 text-white py-4 rounded-lg cursor-not-allowed font-semibold text-lg"
            >
              处理中...
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="isRunning || statusMessage"
        class="bg-white rounded-xl shadow-lg p-8 mb-8"
      >
        <h2 class="text-xl font-bold text-gray-800 mb-4">任务状态</h2>
        <div class="flex items-center gap-3">
          <div
            v-if="isRunning"
            class="animate-spin w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full"
          ></div>
          <p
            :class="[
              'text-gray-700',
              {
                'text-red-600':
                  statusMessage.includes('错误') ||
                  statusMessage.includes('失败'),
              },
            ]"
          >
            {{ statusMessage }}
          </p>
        </div>
        <div v-if="taskId" class="mt-3 text-sm text-gray-500">
          任务 ID: {{ taskId }}
        </div>
      </div>

      <div v-if="generatedImage" class="bg-white rounded-xl shadow-lg p-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">编辑结果</h2>
        <img :src="generatedImage" class="w-full rounded-lg shadow-md" />
      </div>
    </main>

    <LoadingOverlay
      :show="showUploadDialog"
      message="正在上传图片，请稍候..."
    />

    <!-- 遮罩编辑器弹窗 -->
    <div
      v-if="showMaskModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="closeMaskModal"
    >
      <div
        class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div
          class="px-6 py-4 border-b border-gray-200 flex items-center justify-between"
        >
          <h3 class="text-xl font-bold text-gray-800">编辑遮罩</h3>
          <button
            @click="closeMaskModal"
            class="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <!-- 工具栏第一行：画笔参数设置 -->
        <div
          class="px-6 py-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-end gap-4 text-sm"
        >
          <div class="flex items-center gap-2">
            <label class="text-gray-600 font-medium">画笔形状</label>
            <select
              v-model="brushConfig.shape"
              class="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="circle">圆形</option>
              <option value="square">方形</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-gray-600 font-medium">粗细</label>
            <input
              type="range"
              v-model.number="brushConfig.size"
              min="50"
              max="400"
              class="w-28"
            />
            <span class="text-gray-500 w-10 text-right">{{
              brushConfig.size
            }}</span>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-gray-600 font-medium">透明度</label>
            <input
              type="range"
              v-model.number="brushConfig.opacity"
              min="0.1"
              max="1"
              step="0.05"
              class="w-28"
            />
            <span class="text-gray-500 w-12 text-right"
              >{{ Math.round(brushConfig.opacity * 100) }}%</span
            >
          </div>

          <div class="flex items-center gap-2">
            <label class="text-gray-600 font-medium">颜色</label>
            <input
              type="color"
              v-model="brushConfig.color"
              class="w-8 h-8 rounded border border-gray-300 cursor-pointer"
            />
          </div>
        </div>

        <!-- 工具栏第二行：操作按钮与缩放控件 -->
        <div
          class="px-6 py-2 bg-white border-b border-gray-200 flex flex-wrap items-center justify-end gap-2 text-sm"
        >
          <button
            @click="clearMask"
            class="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm"
          >
            清除遮罩
          </button>

          <div
            class="relative"
            :title="canUndo ? '撤销 (Ctrl+Z)' : '没有可撤销的操作'"
          >
            <button
              @click="undo"
              :disabled="!canUndo"
              :class="[
                'w-8 h-8 rounded text-lg flex items-center justify-center transition-colors',
                canUndo
                  ? 'bg-white border border-gray-300 hover:bg-gray-100 text-gray-700'
                  : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed',
              ]"
              aria-label="撤销"
            >
              ↶
            </button>
          </div>

          <span class="text-gray-500 text-xs"
            >缩放 {{ Math.round(scale * 100) }}%</span
          >
          <button
            @click="zoomOut"
            title="缩小"
            class="w-8 h-8 bg-white border border-gray-300 hover:bg-gray-100 rounded text-lg flex items-center justify-center"
          >
            −
          </button>
          <button
            @click="zoomIn"
            title="放大"
            class="w-8 h-8 bg-white border border-gray-300 hover:bg-gray-100 rounded text-lg flex items-center justify-center"
          >
            +
          </button>
          <button
            @click="resetImageSize"
            title="还原图片大小"
            class="px-3 h-8 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded text-xs flex items-center justify-center whitespace-nowrap"
          >
            还原图片大小
          </button>
        </div>

        <div
          class="flex-1 overflow-auto bg-gray-100 p-4 flex items-center justify-center relative"
        >
          <canvas
            ref="canvasRef"
            :class="[
              'cursor-none shadow-md bg-white',
              isFlashing ? 'canvas-flash' : '',
            ]"
            :style="{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
              transformOrigin: '0 0',
              maxWidth: '100%',
              maxHeight: '100%',
            }"
            @mousedown="startDraw"
            @mousemove="onCanvasMouseMove"
            @mouseup="endDraw"
            @mouseleave="onCanvasMouseLeave"
            @wheel="onWheel"
          ></canvas>
          <!-- 画笔指示器：跟随鼠标预览画笔形状/大小/颜色/透明度 -->
          <div :style="brushIndicatorStyle" v-show="showBrushIndicator"></div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            @click="closeMaskModal"
            :disabled="isUploadingMask"
            class="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium disabled:opacity-50"
          >
            取消
          </button>
          <button
            @click="saveMask"
            :disabled="isUploadingMask"
            class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:bg-indigo-400 flex items-center gap-2"
          >
            <span
              v-if="isUploadingMask"
              class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
            ></span>
            {{ isUploadingMask ? "上传中..." : "保存" }}
          </button>
        </div>
      </div>
    </div>

    <LoadingOverlay
      v-if="showMaskModal"
      :show="isUploadingMask"
      message="正在上传遮罩图片，请稍候..."
    />

    <ConfirmModal
      :show="showQueueWarningModal"
      title="队列已满"
      :message="queueWarningMessage"
      confirm-text="我知道了"
      cancel-text=""
      @confirm="
        showQueueWarningModal = false;
        queueWarningMessage = '';
      "
      @cancel="
        showQueueWarningModal = false;
        queueWarningMessage = '';
      "
    />
  </div>
</template>

<style scoped>
/* 撤销成功的视觉反馈：canvas 短暂出现蓝色光晕 */
@keyframes canvas-flash-anim {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.6);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}
.canvas-flash {
  animation: canvas-flash-anim 300ms ease-out;
}
</style>
