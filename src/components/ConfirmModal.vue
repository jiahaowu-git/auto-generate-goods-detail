<script setup>
import BaseModal from './ui/BaseModal.vue'
import BaseButton from './ui/BaseButton.vue'

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '提示'
  },
  message: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '确定'
  },
  cancelText: {
    type: String,
    default: '取消'
  }
})

defineEmits(['confirm', 'cancel'])
</script>

<template>
  <BaseModal :open="show" :title="title" @close="$emit('cancel')">
    <div class="space-y-6">
      <p class="text-gray-700 whitespace-pre-line">{{ message }}</p>
      
      <div class="flex justify-end gap-3">
        <BaseButton
          v-if="cancelText"
          variant="secondary"
          @click="$emit('cancel')"
        >
          {{ cancelText }}
        </BaseButton>
        <BaseButton
          variant="primary"
          @click="$emit('confirm')"
        >
          {{ confirmText }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
