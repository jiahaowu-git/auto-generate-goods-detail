<script setup>
import BaseModal from './ui/BaseModal.vue'
import LoadingSpinner from './ui/LoadingSpinner.vue'

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    default: '加载中...'
  }
})
</script>

<template>
  <BaseModal :open="show" title="" size="sm" @close="">
    <div class="flex flex-col items-center py-4">
      <LoadingSpinner size="lg" />
      <p class="mt-4 text-gray-700 text-center">{{ message }}</p>
    </div>
  </BaseModal>
</template>
