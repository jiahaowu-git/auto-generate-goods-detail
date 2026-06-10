import { ref } from "vue";

/**
 * 通用提示弹窗 composable。
 *
 * 用于统一替代浏览器原生 alert()。
 * 调用方在模板中渲染 <ConfirmModal> 并绑定本 composable 暴露的状态：
 *
 *   const { showAlertModal, alertTitle, alertMessage, showAlert, closeAlert }
 *     = useAlertModal();
 *
 *   showAlert("标题", "消息内容");
 *
 * 模板：
 *   <ConfirmModal
 *     :show="showAlertModal"
 *     :title="alertTitle"
 *     :message="alertMessage"
 *     confirm-text="我知道了"
 *     cancel-text=""
 *     @confirm="closeAlert"
 *     @cancel="closeAlert"
 *   />
 */
export function useAlertModal() {
  const showAlertModal = ref(false);
  const alertTitle = ref("提示");
  const alertMessage = ref("");

  function showAlert(title, message) {
    alertTitle.value = title || "提示";
    alertMessage.value = message || "";
    showAlertModal.value = true;
  }

  function closeAlert() {
    showAlertModal.value = false;
  }

  return {
    showAlertModal,
    alertTitle,
    alertMessage,
    showAlert,
    closeAlert,
  };
}
