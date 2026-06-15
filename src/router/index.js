import { createRouter, createWebHistory } from "vue-router";
import SettingsView from "../views/SettingsView.vue";
import GenerateView from "../views/GenerateView.vue";
import GenerateWithoutTextView from "../views/GenerateWithoutTextView.vue";
import EditImageView from "../views/EditImageView.vue";
import HistoryListView from "../views/HistoryListView.vue";
import HistoryDetailView from "../views/HistoryDetailView.vue";
import SingleImageGenerateView from "../views/SingleImageGenerateView.vue";

const routes = [
  {
    path: "/",
    name: "generate",
    component: GenerateView,
  },
  {
    path: "/generate-without-text",
    name: "generate-without-text",
    component: GenerateWithoutTextView,
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

export default router;
