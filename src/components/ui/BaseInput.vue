<script setup>
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: "",
  },
  type: {
    type: String,
    default: "text",
  },
  placeholder: {
    type: String,
    default: "",
  },
  label: {
    type: String,
    default: "",
  },
  error: {
    type: String,
    default: "",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["update:modelValue"]);

// 密码可见性：仅 type === "password" 时使用
const isPasswordVisible = ref(false);

// 实际渲染的 input type：password 模式下在 password/text 之间切换，其他 type 原样
const actualType = computed(() => {
  if (props.type !== "password") return props.type;
  return isPasswordVisible.value ? "text" : "password";
});

const supportsPasswordToggle = computed(() => props.type === "password");

function togglePasswordVisibility() {
  isPasswordVisible.value = !isPasswordVisible.value;
}
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="block text-sm font-medium text-gray-700 mb-2">
      {{ label }}
    </label>
    <div class="relative">
      <input
        :type="actualType"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
        :class="[
          'w-full px-4 py-2.5 rounded-lg border transition-all duration-200 outline-none',
          {
            'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200':
              !error,
            'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200':
              error,
            'bg-gray-50 cursor-not-allowed opacity-50': disabled,
          },
          supportsPasswordToggle ? 'pr-10' : '',
        ]"
      />
      <button
        v-if="supportsPasswordToggle"
        type="button"
        @click="togglePasswordVisibility"
        tabindex="-1"
        :aria-label="isPasswordVisible ? '隐藏密码' : '显示密码'"
        class="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-0 p-0 cursor-pointer text-gray-400 hover:text-gray-600 leading-none"
      >
        <Icon
          :icon="isPasswordVisible ? 'mdi:eye-off' : 'mdi:eye'"
          class="w-5 h-5"
        />
      </button>
    </div>
    <p v-if="error" class="mt-1 text-sm text-red-600">{{ error }}</p>
    <slot name="helper" />
  </div>
</template>
