<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useSettingsStore, useHistoryStore } from "../stores/settings";
import { uploadFile, submitTask } from "../services/runninghub";
import { checkQueueAvailability } from "../services/queue";
import { useAlertModal } from "../composables/useAlertModal";
import LoadingOverlay from "../components/LoadingOverlay.vue";
import ConfirmModal from "../components/ConfirmModal.vue";
import AppNav from "../components/AppNav.vue";

const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();
const router = useRouter();

const formData = ref({
  prompt: "",
  imageRatio: "3:4",
});

const imageFiles = ref([]);
const imageUrls = ref([]);
const isUploading = ref(false);
const isRunning = ref(false);
const statusMessage = ref("");
const taskId = ref("");
const isGlobalLoading = ref(false);
const loadingMessage = ref("");
const showQueueWarningModal = ref(false);
const queueWarningMessage = ref("");

const hasApiKey = computed(() => !!settingsStore.apiKey);
const hasWorkflowId = computed(
  () => !!settingsStore.singleImageGenerateWorkflowId,
);

const imageRatioOptions = [
  { label: "1:1 (方形)", value: "1:1" },
  { label: "3:4", value: "3:4" },
  { label: "4:3", value: "4:3" },
  { label: "9:16 (竖版)", value: "9:16" },
  { label: "16:9 (横版)", value: "16:9" },
  { label: "2:3", value: "2:3" },
  { label: "3:2", value: "3:2" },
];

// 图片上传节点ID映射，依次为：5、6、11、12、13、14
const imageNodeIds = ["5", "6", "11", "12", "13", "14"];
const maxImageCount = 6;

const canStartGeneration = computed(() => {
  return (
    hasApiKey.value &&
    hasWorkflowId.value &&
    imageFiles.value.length >= 1 &&
    formData.value.prompt.trim()
  );
});

async function handleFileSelect(event) {
  if (!hasApiKey.value) {
    showAlert("无法上传", "请先在设置页面配置 API Key。");
    event.target.value = "";
    return;
  }

  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  if (imageFiles.value.length + files.length > maxImageCount) {
    showAlert("超出限制", `最多只能上传 ${maxImageCount} 张图片。`);
    event.target.value = "";
    return;
  }

  isGlobalLoading.value = true;

  try {
    for (let i = 0; i < files.length; i++) {
      const currentIndex = imageFiles.value.length + i + 1;
      loadingMessage.value = `正在上传第 ${currentIndex}/${maxImageCount} 张图片...`;
      const cloudUrl = await uploadFile(files[i], settingsStore.apiKey);
      imageFiles.value.push(files[i]);
      imageUrls.value.push(cloudUrl);
    }
    loadingMessage.value = "图片上传完成！";
  } catch (error) {
    showAlert("上传失败", `上传失败：${error.message}`);
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

function buildSingleImageNodeInfoList() {
  const nodeInfoList = [];

  // 比例选择器 - nodeId: "2"
  nodeInfoList.push({
    nodeId: "2",
    fieldName: "value",
    fieldValue: formData.value.imageRatio,
  });

  // 用户提示词 - nodeId: "3"
  nodeInfoList.push({
    nodeId: "3",
    fieldName: "value",
    fieldValue: formData.value.prompt,
  });

  // 图片上传 - nodeIds: 5, 6, 11, 12, 13, 14
  // 按实际上传数量生成节点：上传 N 张图 → nodeInfoList 仅有 N 个图片节点
  // 未上传的 nodeId 不放入 nodeInfoList，由后端使用工作流模板中的默认值
  imageUrls.value.forEach((url, index) => {
    if (index < imageNodeIds.length) {
      nodeInfoList.push({
        nodeId: imageNodeIds[index],
        fieldName: "url",
        fieldValue: url,
      });
    }
  });

  return nodeInfoList;
}

async function startGeneration() {
  if (!hasApiKey.value) {
    showAlert("无法提交", "请先在设置页面配置 API Key。");
    return;
  }

  if (!hasWorkflowId.value) {
    showAlert("无法提交", "请先在设置页面配置单图生成 Workflow ID。");
    return;
  }

  if (imageFiles.value.length === 0) {
    showAlert("无法提交", "请至少上传一张图片。");
    return;
  }

  if (!formData.value.prompt.trim()) {
    showAlert("无法提交", "请输入用户提示词。");
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

    statusMessage.value = "正在构建工作流...";
    const nodeInfoList = buildSingleImageNodeInfoList();

    statusMessage.value = "正在提交任务...";
    taskId.value = await submitTask(
      nodeInfoList,
      settingsStore.singleImageGenerateWorkflowId,
      settingsStore.apiKey,
    );

    // 必须 await：addHistory 是异步写入 IndexedDB，
    // 若不等待就跳转，HistoryDetailView 的 ensureLoaded() 会读到不含新任务的列表
    await historyStore.addHistory(
      taskId.value,
      {
        prompt: formData.value.prompt,
        image_ratio: formData.value.imageRatio,
        image_count: imageUrls.value.length,
      },
      imageUrls.value,
      "single-image-generate",
    );

    router.push(`/history/${taskId.value}`);
  } catch (error) {
    statusMessage.value = `错误: ${error.message}`;
    isRunning.value = false;
  }
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
          <span v-if="!hasWorkflowId">配置单图生成 Workflow ID</span>
        </p>
      </div>

      <div class="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">单图生成</h2>

        <div class="space-y-6 max-w-3xl">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              参考图片（1-{{ maxImageCount }} 张）
              <span class="text-red-500">*</span>
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
                id="single-image-upload"
                :disabled="imageFiles.length >= maxImageCount"
              />
              <label
                for="single-image-upload"
                :class="
                  imageFiles.length >= maxImageCount
                    ? 'cursor-not-allowed'
                    : 'cursor-pointer'
                "
              >
                <div class="text-gray-600">
                  <p class="text-lg mb-2">点击上传图片</p>
                  <p class="text-sm">
                    支持 JPG、PNG 格式，已上传 {{ imageFiles.length }} /
                    {{ maxImageCount }} 张
                  </p>
                </div>
              </label>
            </div>

            <div
              v-if="imageUrls.length > 0"
              class="mt-4 grid grid-cols-3 gap-4"
            >
              <div
                v-for="(url, index) in imageUrls"
                :key="index"
                class="relative"
              >
                <img
                  :src="url"
                  class="w-full h-32 object-cover rounded-lg border border-gray-200"
                />
                <span
                  class="absolute top-1 left-1 px-2 py-0.5 bg-indigo-600 text-white text-xs rounded"
                >
                  节点 {{ imageNodeIds[index] }} · 第 {{ index + 1 }} 张
                </span>
                <button
                  @click="removeImage(index)"
                  class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-sm hover:bg-red-600 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            </div>
            <p
              v-if="imageFiles.length >= maxImageCount"
              class="mt-2 text-sm text-gray-500"
            >
              ℹ️ 已达上传上限，如需替换请先删除图片
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              用户提示词
            </label>
            <textarea
              v-model="formData.prompt"
              rows="4"
              placeholder="请输入您想要生成的图片内容描述，例如：将图片转换为水彩画风格"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              图像比例
            </label>
            <select
              v-model="formData.imageRatio"
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

          <div class="pt-4 flex justify-center">
            <button
              v-if="!isRunning"
              @click="startGeneration"
              :disabled="!canStartGeneration"
              class="px-12 bg-indigo-600 text-white py-4 rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              开始生成
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
