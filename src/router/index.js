import { createRouter, createWebHistory } from "vue-router";
import { useLockStore } from "../stores/lock.js";
import SettingsView from "../views/SettingsView.vue";
import GenerateView from "../views/GenerateView.vue";
import EditImageView from "../views/EditImageView.vue";
import HistoryListView from "../views/HistoryListView.vue";
import HistoryDetailView from "../views/HistoryDetailView.vue";
import SingleImageGenerateView from "../views/SingleImageGenerateView.vue";
import LockView from "../views/LockView.vue";

const routes = [
  {
    path: "/",
    name: "generate",
    component: GenerateView,
  },
  {
    path: "/lock",
    name: "lock",
    component: LockView,
  },
  {
    path: "/single-image-generate",
    name: "single-image-generate",
    component: SingleImageGenerateView,
  },
  {
    path: "/edit-image",
    name: "edit-image",
    component: EditImageView,
  },
  {
    path: "/settings",
    name: "settings",
    component: SettingsView,
  },
  {
    path: "/history",
    name: "history",
    component: HistoryListView,
  },
  {
    path: "/history/:taskId",
    name: "history-detail",
    component: HistoryDetailView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const lockStore = useLockStore();
  if (to.name !== "lock" && !lockStore.isUnlocked) {
    return { name: "lock" };
  }
});

export default router;
