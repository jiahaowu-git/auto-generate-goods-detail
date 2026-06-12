<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useSettingsStore } from "../stores/settings";
import { uploadFile, submitTask } from "../services/runninghub";
import { checkQueueAvailability } from "../services/queue";
import { useAlertModal } from "../composables/useAlertModal";
import LoadingOverlay from "../components/LoadingOverlay.vue";
import ConfirmModal from "../components/ConfirmModal.vue";
import AppNav from "../components/AppNav.vue";
import { useHistoryStore } from "../stores/settings";

// 图片节点：129-134，按上传数量依次填入
const IMAGE_NODE_IDS = ["129", "130", "131", "132", "133", "134"];
const MAX_IMAGE_NODES = IMAGE_NODE_IDS.length;

/**
 * 构建工作流节点信息列表。
 *
 * 规则：
 * 1. 节点 57-64 为必填节点（产品信息），始终包含。
 * 2. 节点 129-134 为图片节点，按上传数量填入。
 *    例：1 张图 → 仅 129；2 张图 → 129、130；…；6 张图 → 129-134 全部。
 */
function buildNodeInfoList(imageUrls, userInputs) {
  const {
    goods_name,
    brand_name,
    target_audience,
    theme,
    visual_style,
    goods_features,
    image_ratio,
    image_num,
  } = userInputs;

  const nodeInfoList = [];

  // 图片节点：按实际数量填入
  const imageCount = Math.min(imageUrls.length, MAX_IMAGE_NODES);
  for (let i = 0; i < imageCount; i++) {
    nodeInfoList.push({
      nodeId: IMAGE_NODE_IDS[i],
      fieldName: "url",
      fieldValue: imageUrls[i],
    });
  }

  // 必填节点：57-64
  nodeInfoList.push({
    nodeId: "57",
    fieldName: "value",
    fieldValue: goods_name,
  });
  nodeInfoList.push({
    nodeId: "58",
    fieldName: "value",
    fieldValue: brand_name,
  });
  nodeInfoList.push({
    nodeId: "59",
    fieldName: "value",
    fieldValue: target_audience,
  });
  nodeInfoList.push({
    nodeId: "60",
    fieldName: "value",
    fieldValue: theme,
  });
  nodeInfoList.push({
    nodeId: "61",
    fieldName: "value",
    fieldValue: visual_style,
  });
  nodeInfoList.push({
    nodeId: "62",
    fieldName: "value",
    fieldValue: goods_features,
  });
  nodeInfoList.push({
    nodeId: "63",
    fieldName: "value",
    fieldValue: image_ratio,
  });
  nodeInfoList.push({
    nodeId: "64",
    fieldName: "value",
    fieldValue: image_num,
  });

  return nodeInfoList;
}

const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();
const router = useRouter();

const formData = ref({
  goods_name: "",
  brand_name: "",
  target_audience: "",
  theme: "",
  visual_style: "",
  goods_features: "",
  image_ratio: "9:16",
  image_num: "10",
});

const imageFiles = ref([]);
const imageUrls = ref([]);
const isUploading = ref(false);
const isRunning = ref(false);
const statusMessage = ref("");
const generatedImages = ref([]);
const taskId = ref("");
const isGlobalLoading = ref(false);
const loadingMessage = ref("");
const showQueueWarningModal = ref(false);

const { showAlertModal, alertTitle, alertMessage, showAlert, closeAlert } =
  useAlertModal();
const queueWarningMessage = ref("");

const hasApiKey = computed(() => !!settingsStore.apiKey);
const hasGoodsDetailWorkflowId = computed(
  () => !!settingsStore.goodsDetailWorkflowId,
);

const imageRatioOptions = [
  { label: "9:16 (竖版)", value: "9:16" },
  { label: "1:1 (方形)", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "2:3", value: "2:3" },
];

async function handleFileSelect(event) {
  if (!hasApiKey.value) {
    showAlert("无法上传", "请先在设置页面配置 API Key。");
    event.target.value = "";
    return;
  }

  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  if (imageFiles.value.length + files.length > 6) {
    showAlert("超出限制", "最多只能上传 6 张图片。");
    event.target.value = "";
    return;
  }

  isGlobalLoading.value = true;
  loadingMessage.value = "正在上传图片，请稍候...";

  try {
    for (let i = 0; i < files.length; i++) {
      loadingMessage.value = `正在上传第 ${i + 1}/6 张图片...`;
      const cloudUrl = await uploadFile(files[i], settingsStore.apiKey);
      imageFiles.value.push(files[i]);
      imageUrls.value.push(cloudUrl);
    }
    loadingMessage.value = "图片上传完成！";
  } catch (error) {
    showAlert("上传失败", `上传失败：${error.message}`);
    event.target.value = "";
  } finally {
    setTimeout(() => {
      isGlobalLoading.value = false;
      loadingMessage.value = "";
    }, 500);
    event.target.value = "";
  }
}

function removeImage(index) {
  imageFiles.value.splice(index, 1);
  imageUrls.value.splice(index, 1);
}

async function uploadImages() {
  if (imageUrls.value.length === 0) {
    throw new Error("请先选择图片");
  }

  isUploading.value = true;
  statusMessage.value = "正在准备图片...";
  return imageUrls.value;
}

async function startGeneration() {
  if (!hasApiKey.value) {
    showAlert("无法提交", "请先在设置页面配置 API Key。");
    return;
  }

  if (!hasGoodsDetailWorkflowId.value) {
    showAlert("无法提交", "请先在设置页面配置 Workflow ID。");
    return;
  }

  if (imageFiles.value.length === 0) {
    showAlert("无法提交", "请至少上传一张产品图片。");
    return;
  }

  if (!formData.value.goods_name) {
    showAlert("无法提交", "请输入产品名称。");
    return;
  }

  isRunning.value = true;
  generatedImages.value = [];
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

    statusMessage.value = "队列检查通过，正在准备图片...";

    imageUrls.value = await uploadImages();

    statusMessage.value = "正在构建工作流...";
    const nodeInfoList = buildNodeInfoList(imageUrls.value, formData.value);

    statusMessage.value = "正在提交任务...";
    taskId.value = await submitTask(
      nodeInfoList,
      settingsStore.goodsDetailWorkflowId,
      settingsStore.apiKey,
    );

    // 必须 await：addHistory 是异步写入 IndexedDB，
    // 若不等待就跳转，HistoryDetailView 的 ensureLoaded() 会读到不含新任务的列表
    await historyStore.addHistory(
      taskId.value,
      formData.value,
      imageUrls.value,
    );

    router.push(`/history/${taskId.value}`);
  } catch (error) {
    statusMessage.value = `错误: ${error.message}`;
    isRunning.value = false;
  }
}

function cancelTask() {
  // 本视图提交后立即跳转到详情页，轮询/拉取结果由 HistoryDetailView 负责。
  // 此处仅做 UI 状态重置。
  statusMessage.value = "任务已取消";
  isRunning.value = false;
}

function handleCloseQueueWarning() {
  showQueueWarningModal.value = false;
  queueWarningMessage.value = "";
  statusMessage.value = "";
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <AppNav />

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div
        v-if="!hasApiKey || !hasGoodsDetailWorkflowId"
        class="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8"
      >
        <p class="text-yellow-800">
          ⚠️ 请先在
          <router-link to="/settings" class="font-semibold underline"
            >设置页面</router-link
          >
          <span v-if="!hasApiKey">配置您的 API Key</span>
          <span v-if="!hasApiKey && !hasGoodsDetailWorkflowId"> 和 </span>
          <span v-if="!hasGoodsDetailWorkflowId">配置 Workflow ID</span>
        </p>
      </div>

      <div class="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">产品信息</h2>

        <div class="space-y-6 max-w-3xl">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              产品图片（1-6张白底产品图）
            </label>
            <div
              class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors"
            >
              <input
                type="file"
                accept="image/*"
                multiple
                @change="handleFileSelect"
                class="hidden"
                id="image-upload"
              />
              <label for="image-upload" class="cursor-pointer">
                <div class="text-gray-600">
                  <p class="text-lg mb-2">点击上传图片</p>
                  <p class="text-sm">支持 JPG、PNG 格式，最多 6 张</p>
                </div>
              </label>
            </div>

            <div
              v-if="imageUrls.length > 0"
              class="mt-4 grid grid-cols-5 gap-5"
            >
              <div
                v-for="(url, index) in imageUrls"
                :key="index"
                class="relative"
              >
                <img
                  :src="url"
                  class="w-full h-24 object-cover rounded-lg border border-gray-200"
                />
                <button
                  @click="removeImage(index)"
                  class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-sm hover:bg-red-600 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-10">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                产品名称
              </label>
              <input
                v-model="formData.goods_name"
                type="text"
                placeholder="例如：户外多功能露营车"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                品牌名称
              </label>
              <input
                v-model="formData.brand_name"
                type="text"
                placeholder="例如：物空户外"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              目标人群
            </label>
            <input
              v-model="formData.target_audience"
              type="text"
              placeholder="例如：家庭亲子、宝妈，白领等"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              详情页主题
            </label>
            <input
              v-model="formData.theme"
              type="text"
              placeholder="例如：亲子摆摊，搬运神器"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              视觉风格
            </label>
            <textarea
              v-model="formData.visual_style"
              rows="3"
              placeholder="例如：明亮通透，低饱和度，低对比度，中性偏暖的色调。以黄色系为主，营造清新自然的氛围"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              产品卖点
            </label>
            <textarea
              v-model="formData.goods_features"
              rows="3"
              placeholder="例如：强承重，易收纳，静音轮，亲子安全，多场景适用"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-10">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                图片比例
              </label>
              <select
                v-model="formData.image_ratio"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option
                  v-for="option in imageRatioOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                图片数量
              </label>
              <input
                v-model="formData.image_num"
                type="number"
                min="1"
                max="20"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div class="pt-4 flex justify-center">
            <button
              v-if="!isRunning"
              @click="startGeneration"
              :disabled="
                !hasApiKey ||
                !hasGoodsDetailWorkflowId ||
                imageFiles.length === 0 ||
                !formData.goods_name
              "
              class="px-12 bg-indigo-600 text-white py-4 rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              开始生成
            </button>
            <button
              v-else
              @click="cancelTask"
              class="px-12 bg-red-500 text-white py-4 rounded-lg hover:bg-red-600 transition-colors font-semibold text-lg"
            >
              取消任务
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

      <div
        v-if="generatedImages.length > 0"
        class="bg-white rounded-xl shadow-lg p-8"
      >
        <h2 class="text-2xl font-bold text-gray-800 mb-6">生成的详情页图片</h2>
        <div class="grid grid-cols-2 gap-10">
          <div
            v-for="(img, index) in generatedImages"
            :key="index"
            class="space-y-3"
          >
            <img :src="img.url || img" class="w-full rounded-lg shadow-md" />
            <p class="text-center text-gray-600 text-sm">
              第 {{ index + 1 }} 张
            </p>
          </div>
        </div>
      </div>
    </main>

    <LoadingOverlay :show="isGlobalLoading" :message="loadingMessage" />
    <ConfirmModal
      :show="showQueueWarningModal"
      title="队列拥挤提示"
      :message="queueWarningMessage"
      confirmText="我知道了"
      :showCancel="false"
      @confirm="handleCloseQueueWarning"
    />

    <ConfirmModal
      :show="showAlertModal"
      :title="alertTitle"
      :message="alertMessage"
      confirmText="我知道了"
      :showCancel="false"
      @confirm="closeAlert"
      @cancel="closeAlert"
    />
  </div>
</template>
