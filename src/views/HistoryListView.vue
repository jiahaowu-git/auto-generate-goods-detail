<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useHistoryStore } from "../stores/settings";
import ConfirmModal from "../components/ConfirmModal.vue";
import AppNav from "../components/AppNav.vue";

const historyStore = useHistoryStore();
const router = useRouter();

// 弹窗状态：确认清空 / 确认删除 / 错误提示
const showClearModal = ref(false);
const showDeleteModal = ref(false);
const pendingDeleteId = ref(null);
const showErrorModal = ref(false);
const errorModalMessage = ref("");

// 挂载时从 IndexedDB 异步加载历史记录
onMounted(async () => {
  await historyStore.ensureLoaded();
});

function goToDetail(taskId) {
  router.push(`/history/${taskId}`);
}

function clearAll() {
  showClearModal.value = true;
}

async function handleConfirmClear() {
  showClearModal.value = false;
  try {
    await historyStore.clearHistory();
  } catch (err) {
    errorModalMessage.value = `清空失败：${err.message || err}`;
    showErrorModal.value = true;
  }
}

function deleteItem(id, event) {
  event.stopPropagation();
  pendingDeleteId.value = id;
  showDeleteModal.value = true;
}

async function handleConfirmDelete() {
  showDeleteModal.value = false;
  const id = pendingDeleteId.value;
  pendingDeleteId.value = null;
  if (id == null) return;
  try {
    await historyStore.deleteHistory(id);
  } catch (err) {
    errorModalMessage.value = `删除失败：${err.message || err}`;
    showErrorModal.value = true;
  }
}

function cancelDelete() {
  showDeleteModal.value = false;
  pendingDeleteId.value = null;
}

function truncateText(text, maxLength = 20) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function getTaskName(item) {
  if (item.taskType === "single-image-generate") {
    return truncateText(item.prompt, 20) || "未命名";
  }
  return item.goods_name || "未命名";
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusText(status) {
  const statusMap = {
    QUEUED: "排队中",
    RUNNING: "运行中",
    SUCCESS: "已完成",
    FAILED: "失败",
  };
  return statusMap[status] || status;
}

function getStatusColor(status) {
  const colorMap = {
    QUEUED: "bg-yellow-100 text-yellow-800",
    RUNNING: "bg-blue-100 text-blue-800",
    SUCCESS: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return colorMap[status] || "bg-gray-100 text-gray-800";
}

function getTaskTypeText(taskType) {
  if (taskType === "image-edit") return "单图编辑";
  if (taskType === "single-image-generate") return "单图生成";
  return "生成详情页";
}

function getTaskTypeColor(taskType) {
  if (taskType === "image-edit") return "bg-purple-100 text-purple-800";
  if (taskType === "single-image-generate")
    return "bg-emerald-100 text-emerald-800";
  return "bg-indigo-100 text-indigo-800";
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <AppNav />

    <main class="max-w-6xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">历史生图记录</h2>
        <button
          v-if="historyStore.isReady && historyStore.historyList.length > 0"
          @click="clearAll"
          class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          清空全部
        </button>
      </div>

      <div
        v-if="!historyStore.isReady"
        class="bg-white rounded-xl shadow-lg p-12 text-center"
      >
        <div class="text-gray-400 text-6xl mb-4">⏳</div>
        <h3 class="text-xl font-semibold text-gray-700 mb-2">加载中...</h3>
        <p class="text-gray-500">正在从本地数据库读取历史记录</p>
      </div>

      <div
        v-else-if="historyStore.historyList.length === 0"
        class="bg-white rounded-xl shadow-lg p-12 text-center"
      >
        <div class="text-gray-400 text-6xl mb-4">📋</div>
        <h3 class="text-xl font-semibold text-gray-700 mb-2">暂无历史记录</h3>
        <p class="text-gray-500 mb-6">开始生图后，记录会显示在这里</p>
        <router-link
          to="/"
          class="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          去生成
        </router-link>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="item in historyStore.historyList"
          :key="item.id"
          @click="goToDetail(item.taskId)"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow cursor-pointer overflow-hidden"
        >
          <div class="p-6">
            <div class="flex justify-between items-start mb-4 gap-2">
              <div class="flex gap-2 flex-wrap">
                <span
                  :class="[
                    'px-3 py-1 rounded-full text-xs font-semibold',
                    getTaskTypeColor(item.taskType),
                  ]"
                >
                  {{ getTaskTypeText(item.taskType) }}
                </span>
                <span
                  :class="[
                    'px-3 py-1 rounded-full text-xs font-semibold',
                    getStatusColor(item.status),
                  ]"
                >
                  {{ getStatusText(item.status) }}
                </span>
              </div>
              <button
                @click="deleteItem(item.id, $event)"
                class="text-gray-400 hover:text-red-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <template v-if="item.taskType === 'image-edit'">
              <h3 class="text-lg font-bold text-gray-800 mb-2">单图编辑</h3>
              <div class="space-y-2 text-sm text-gray-600">
                <div v-if="item.editContent" class="line-clamp-2">
                  <span class="font-medium">修改内容：</span
                  >{{ item.editContent }}
                </div>
              </div>
            </template>
            <template v-else-if="item.taskType === 'single-image-generate'">
              <h3
                class="text-lg font-bold text-gray-800 mb-2 truncate"
                :title="item.prompt"
              >
                {{ truncateText(item.prompt, 20) || "未命名" }}
              </h3>

              <div class="space-y-2 text-sm text-gray-600">
                <div v-if="item.prompt" class="line-clamp-2">
                  <span class="font-medium">用户提示：</span>{{ item.prompt }}
                </div>
              </div>
            </template>
            <template v-else>
              <h3 class="text-lg font-bold text-gray-800 mb-2 truncate">
                {{ item.goods_name || "未命名" }}
              </h3>

              <div class="space-y-2 text-sm text-gray-600">
                <div v-if="item.brand_name">
                  <span class="font-medium">品牌：</span>{{ item.brand_name }}
                </div>
                <div v-if="item.target_audience">
                  <span class="font-medium">人群：</span
                  >{{ item.target_audience }}
                </div>
                <div v-if="item.theme">
                  <span class="font-medium">主题：</span>{{ item.theme }}
                </div>
              </div>
            </template>

            <div class="mt-4 pt-4 border-t border-gray-200">
              <div
                class="flex justify-between items-center text-xs text-gray-500"
              >
                <span class="truncate">ID: {{ item.taskId }}</span>
                <span>{{ formatDate(item.createdAt) }}</span>
              </div>
            </div>

            <div
              v-if="item.imageUrls && item.imageUrls.length > 0"
              class="mt-4"
            >
              <div class="flex gap-2 overflow-hidden">
                <img
                  v-for="(url, index) in item.imageUrls.slice(0, 4)"
                  :key="index"
                  :src="url"
                  class="w-12 h-12 object-cover rounded-lg"
                />
                <div
                  v-if="item.imageUrls.length > 4"
                  class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500"
                >
                  +{{ item.imageUrls.length - 4 }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <ConfirmModal
      :show="showClearModal"
      title="清空确认"
      message="确定要清空所有历史记录吗？此操作不可恢复。"
      confirm-text="清空"
      cancel-text="取消"
      @confirm="handleConfirmClear"
      @cancel="showClearModal = false"
    />

    <ConfirmModal
      :show="showDeleteModal"
      title="删除确认"
      message="确定要删除这条历史记录吗？"
      confirm-text="删除"
      cancel-text="取消"
      @confirm="handleConfirmDelete"
      @cancel="cancelDelete"
    />

    <ConfirmModal
      :show="showErrorModal"
      title="操作失败"
      :message="errorModalMessage"
      confirm-text="知道了"
      cancel-text=""
      @confirm="showErrorModal = false"
      @cancel="showErrorModal = false"
    />
  </div>
</template>
