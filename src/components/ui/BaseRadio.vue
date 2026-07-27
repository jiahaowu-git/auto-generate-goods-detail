<script setup>
/**
 * BaseRadio
 * 通用单选组件（基于原生 <input type="radio">，v-model 友好）。
 *
 * 视觉：
 *   - 选中：mdi:radiobox-marked（indigo）
 *   - 未选中：mdi:radiobox-blank（gray）
 *   - 整体布局与 BaseInput 对齐：label 在上，控件在中，helper slot / prop 在下。
 *
 * Props:
 * - modelValue: 当前选中的 value（v-model 双向绑定）。
 * - options: 选项列表，项形如 { value, label, disabled? }。
 * - name: 表单分组名（同一组 name 内互斥）。
 * - label: 控件顶部说明。
 *
 * 插槽：
 * - #helper：控件底部的灰色提示文本。
 *
 * 用法：
 * <BaseRadio
 *   v-model="rhId"
 *   :options="[{value:'cn',label:'国内站'},{value:'ai',label:'国际站'}]"
 *   name="rh-site"
 *   label="站点选择"
 * >
 *   <template #helper>切换站点后会立即生效。</template>
 * </BaseRadio>
 */
import { computed } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps({
  modelValue: {
    type: [String, Number, Boolean],
    default: "",
  },
  options: {
    type: Array,
    required: true,
    validator: (list) =>
      Array.isArray(list) && list.every((o) => "value" in o && "label" in o),
  },
  name: {
    type: String,
    default: "base-radio",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue", "change"]);

const currentValue = computed(() => props.modelValue);

function selectValue(value) {
  if (props.disabled) return;
  if (currentValue.value === value) return;
  emit("update:modelValue", value);
  emit("change", value);
}
</script>

<template>
  <div class="w-full space-y-2">
    <!-- label 与 options 同行：label 在左固定宽度收缩，options 在右自适应 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label
        v-if="label"
        class="block text-sm font-medium text-gray-700 shrink-0 self-center mt-0"
      >
        {{ label }}
      </label>
      <div class="flex flex-wrap gap-3">
        <label
          v-for="option in options"
          :key="option.value"
          :class="[
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all duration-150 select-none',
            currentValue === option.value
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
              : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-400',
            option.disabled || disabled ? 'opacity-50 cursor-not-allowed' : '',
          ]"
          @click.prevent="selectValue(option.value)"
        >
          <input
            type="radio"
            class="sr-only"
            :name="name"
            :value="option.value"
            :checked="currentValue === option.value"
            :disabled="option.disabled || disabled"
            @change="selectValue(option.value)"
          />
          <Icon
            :icon="
              currentValue === option.value
                ? 'mdi:radiobox-marked'
                : 'mdi:radiobox-blank'
            "
            :class="[
              'w-5 h-5 shrink-0 transition-colors',
              currentValue === option.value
                ? 'text-indigo-600'
                : 'text-gray-400',
            ]"
          />
          <span class="text-sm font-medium">{{ option.label }}</span>
        </label>
      </div>
    </div>
    <slot name="helper" />
  </div>
</template>
