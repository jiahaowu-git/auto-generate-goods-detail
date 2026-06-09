<script setup>
defineProps({
  padding: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg', 'none'].includes(value)
  },
  hoverable: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <div
    :class="[
      'bg-white rounded-xl shadow-sm border border-gray-100',
      {
        'p-4': padding === 'sm',
        'p-6': padding === 'md',
        'p-8': padding === 'lg',
        'hover:shadow-md hover:border-indigo-200 transition-all duration-200 cursor-pointer': hoverable
      }
    ]"
  >
    <slot />
  </div>
</template>
