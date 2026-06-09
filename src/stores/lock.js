import { defineStore } from "pinia";
import { ref } from "vue";

const UNLOCK_PASSWORD = "jssk123456";

export const useLockStore = defineStore("lock", () => {
  const isUnlocked = ref(false);

  function unlock(password) {
    if (password === UNLOCK_PASSWORD) {
      isUnlocked.value = true;
      return true;
    }
    return false;
  }

  function lock() {
    isUnlocked.value = false;
  }

  return {
    isUnlocked,
    unlock,
    lock,
  };
});
