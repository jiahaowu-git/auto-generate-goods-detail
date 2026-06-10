<script setup>
import { ref } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useAlertModal } from "../composables/useAlertModal";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseInput from "../components/ui/BaseInput.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import ConfirmModal from "../components/ConfirmModal.vue";
import AppNav from "../components/AppNav.vue";
import packageJson from "../../package.json";

const settingsStore = useSettingsStore();
const { showAlertModal, alertTitle, alertMessage, showAlert, closeAlert } =
  useAlertModal();

const apiKey = ref(settingsStore.apiKey);
const workflowId = ref(settingsStore.workflowId);
const imageEditWorkflowId = ref(settingsStore.imageEditWorkflowId);
const singleImageGenerateWorkflowId = ref(
  settingsStore.singleImageGenerateWorkflowId,
);
const appVersion = packageJson.version;
const appAuthor = packageJson.author;

function saveSettings() {
  settingsStore.setApiKey(apiKey.value);
  settingsStore.setWorkflowId(workflowId.value);
  settingsStore.setImageEditWorkflowId(imageEditWorkflowId.value);
  settingsStore.setSingleImageGenerateWorkflowId(
    singleImageGenerateWorkflowId.value,
  );
  showAlert("保存成功", "配置已保存。");
}

function clearSettings() {
  apiKey.value = "";
  workflowId.value = "";
  imageEditWorkflowId.value = "";
  singleImageGenerateWorkflowId.value = "";
  settingsStore.clearApiKey();
  settingsStore.clearWorkflowId();
  settingsStore.clearImageEditWorkflowId();
  settingsStore.clearSingleImageGenerateWorkflowId();
  showAlert("清除成功", "配置已清除。");
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <AppNav sticky />

    <main class="max-w-3xl mx-auto px-4 py-12">
      <BaseCard class="w-full" padding="lg">
        <h2 class="text-2xl font-bold text-gray-900 mb-8">API 配置</h2>

        <div class="space-y-8">
          <BaseInput
            v-model="apiKey"
            type="password"
            label="RunningHub API Key"
            placeholder="请输入您的 API Key"
          >
            <template #helper>
              <span class="text-sm text-gray-500">
                在
                <a
                  href="https://www.runninghub.cn"
                  target="_blank"
                  class="text-indigo-600 hover:underline"
                  >RunningHub</a
                >
                获取您的 API Key
              </span>
            </template>
          </BaseInput>

          <BaseInput
            v-model="workflowId"
            label="生成详情页 Workflow ID"
            placeholder="请输入工作流 ID"
          >
            <template #helper>
              <span class="text-sm text-gray-500">
                在 RunningHub 平台的工作流模板中获取，用于生成详情页
              </span>
            </template>
          </BaseInput>

          <BaseInput
            v-model="imageEditWorkflowId"
            label="单图编辑 Workflow ID"
            placeholder="请输入工作流 ID"
          >
            <template #helper>
              <span class="text-sm text-gray-500">
                在 RunningHub 平台的工作流模板中获取，用于单图编辑
              </span>
            </template>
          </BaseInput>

          <BaseInput
            v-model="singleImageGenerateWorkflowId"
            label="单图生成 Workflow ID"
            placeholder="请输入工作流 ID"
          >
            <template #helper>
              <span class="text-sm text-gray-500">
                在 RunningHub 平台的工作流模板中获取，用于单图生成
              </span>
            </template>
          </BaseInput>

          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <BaseButton
              variant="primary"
              size="lg"
              class="flex-1"
              @click="saveSettings"
            >
              保存配置
            </BaseButton>
            <BaseButton variant="secondary" size="lg" @click="clearSettings">
              清除
            </BaseButton>
          </div>
        </div>
      </BaseCard>

      <BaseCard class="w-full mt-8" padding="md">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">关于</h3>
        <div class="space-y-2 text-sm text-gray-600">
          <p>版本：v{{ appVersion }}</p>
          <p>作者：{{ appAuthor }}</p>
          <p>
            GitHub：
            <a
              href="https://github.com/jiahaowu-git"
              target="_blank"
              class="text-indigo-600 hover:underline"
            >
              https://github.com/jiahaowu-git
            </a>
          </p>
        </div>
      </BaseCard>
    </main>

    <ConfirmModal
      :show="showAlertModal"
      :title="alertTitle"
      :message="alertMessage"
      confirm-text="我知道了"
      cancel-text=""
      @confirm="closeAlert"
      @cancel="closeAlert"
    />
  </div>
</template>
