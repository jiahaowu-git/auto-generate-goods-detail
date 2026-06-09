<script setup>
defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  type: {
    type: String,
    default: 'text'
  },
  placeholder: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  error: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="block text-sm font-medium text-gray-700 mb-2">
      {{ label }}
    </label>
    <input
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.target.value)"
      :class="[
        'w-full px-4 py-2.5 rounded-lg border transition-all duration-200 outline-none',
        {
          'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200': !error,
          'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200': error,
          'bg-gray-50 cursor-not-allowed opacity-50': disabled
        }
      ]"
    />
    <p v-if="error" class="mt-1 text-sm text-red-600">{{ error }}</p>
    <slot name="helper" />
  </div>
</template>
