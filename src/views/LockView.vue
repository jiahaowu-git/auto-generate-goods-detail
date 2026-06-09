<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 p-4">
    <div class="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
      <h1 class="text-2xl font-bold text-gray-800 mb-2 text-center">
        系统已锁定
      </h1>
      <p class="text-sm text-gray-500 mb-6 text-center">
        请输入解锁密码以进入系统
      </p>

      <form @submit.prevent="handleUnlock" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            解锁密码
          </label>
          <input
            v-model="password"
            type="password"
            :class="[
              'w-full px-4 py-2 border rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400',
              errorMessage
                ? 'border-red-400 focus:ring-red-400'
                : 'border-gray-300',
            ]"
            placeholder="请输入解锁密码"
            autocomplete="current-password"
          />
        </div>

        <div v-if="errorMessage" class="text-sm text-red-500 text-center">
          {{ errorMessage }}
        </div>

        <button
          type="submit"
          class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          解锁
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useLockStore } from "../stores/lock.js";

const router = useRouter();
const lockStore = useLockStore();

const password = ref("");
const errorMessage = ref("");

function handleUnlock() {
  if (!password.value.trim()) {
    errorMessage.value = "请输入解锁密码";
    return;
  }

  const success = lockStore.unlock(password.value);
  if (success) {
    errorMessage.value = "";
    router.push("/");
  } else {
    errorMessage.value = "密码不正确，请重试";
    password.value = "";
  }
}
</script>
