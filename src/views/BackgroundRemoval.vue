<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useSettingsStore, useHistoryStore } from "../stores/settings";
import { uploadFile, submitTask } from "../services/runninghub";
import { checkQueueAvailability } from "../services/queue";
import { useAlertModal } from "../composables/useAlertModal";
import AppNav from "../components/AppNav.vue";
import LoadingOverlay from "../components/LoadingOverlay.vue";
import ConfirmModal from "../components/ConfirmModal.vue";

const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();
const router = useRouter();

const formData = ref({
  text: "",
});

const imageFile = ref(null);
const imageUrl = ref("");
const isUploading = ref(false);
const isRunning = ref(false);
const statusMessage = ref("");
const taskId = ref("");
const isGlobalLoading = ref(false);
const loadingMessage = ref("");
const showQueueWarningModal = ref(false);
const queueWarningMessage = ref("");

const { showAlertModal, alertTitle, alertMessage, showAlert, closeAlert } =
  useAlertModal();

const hasApiKey = computed(() => !!settingsStore.apiKey);
const hasWorkflowId = computed(
  () => !!settingsStore.backgroundRemovalWorkflowId,
);

const canStartGeneration = computed(() => {
  return (
    hasApiKey.value &&
    hasWorkflowId.value &&
    !!imageFile.value &&
    formData.value.text.trim().length > 0
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

  // 一次只允许 1 张
  if (files.length > 1) {
    showAlert("超出限制", "背景移除每次只支持上传 1 张图片。");
    event.target.value = "";
    return;
  }

  isGlobalLoading.value = true;
  loadingMessage.value = "正在上传图片，请稍候...";

  try {
    loadingMessage.value = "正在上传图片...";
    const cloudUrl = await uploadFile(files[0], settingsStore.apiKey);
    imageFile.value = files[0];
    imageUrl.value = cloudUrl;
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

function removeImage() {
  imageFile.value = null;
  imageUrl.value = "";
}

function buildNodeInfoList() {
  return [
    {
      nodeId: "3",
      fieldName: "url",
      fieldValue: imageUrl.value,
    },
    {
      nodeId: "10",
      fieldName: "value",
      fieldValue: formData.value.text,
    },
  ];
}

async function startGeneration() {
  if (!hasApiKey.value) {
    showAlert("无法提交", "请先在设置页面配置 API Key。");
    return;
  }

  if (!hasWorkflowId.value) {
    showAlert("无法提交", "请先在设置页面配置移除背景 Workflow ID。");
    return;
  }

  if (!imageFile.value) {
    showAlert("无法提交", "请上传一张需要移除背景的图片。");
    return;
  }

  if (!formData.value.text.trim()) {
    showAlert("无法提交", "请输入提示词。");
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
    const nodeInfoList = buildNodeInfoList();

    statusMessage.value = "正在提交任务...";
    taskId.value = await submitTask(
      nodeInfoList,
      settingsStore.backgroundRemovalWorkflowId,
      settingsStore.apiKey,
    );

    // 必须 await：addHistory 是异步写入 IndexedDB，
    // 若不等待就跳转，HistoryDetailView 的 ensureLoaded() 会读到不含新任务的列表
    await historyStore.addHistory(
      taskId.value,
      {
        prompt: formData.value.text,
        editContent: "",
        image_count: imageUrl.value ? 1 : 0,
      },
      imageUrl.value ? [imageUrl.value] : [],
      "background-removal",
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
          <span v-if="!hasWorkflowId">配置移除背景 Workflow ID</span>
        </p>
      </div>

      <div class="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">移除背景</h2>

        <div class="space-y-6 max-w-3xl">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              图片（仅 1 张）<span class="text-red-500">*</span>
            </label>
            <div
              v-if="!imageFile"
              class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors"
            >
              <input
                type="file"
                accept="image/*"
                @change="handleFileSelect"
                class="hidden"
                id="bg-removal-upload"
              />
              <label for="bg-removal-upload" class="cursor-pointer">
                <div class="text-gray-600">
                  <p class="text-lg mb-2">点击上传图片</p>
                  <p class="text-sm">支持 JPG、PNG 格式，仅可上传 1 张</p>
                </div>
              </label>
            </div>

            <div v-if="imageUrl" class="mt-2">
              <div class="relative inline-block">
                <img
                  :src="imageUrl"
                  class="max-w-md max-h-64 object-contain rounded-lg border border-gray-200"
                />
                <button
                  @click="removeImage"
                  class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-sm hover:bg-red-600 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              主体/产品 (请输入英文) <span class="text-red-500">*</span>
            </label>
            <textarea
              v-model="formData.text"
              rows="4"
              placeholder="示例：human"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            ></textarea>
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
