<script setup>
import { useRoute } from "vue-router";

/**
 * 应用顶部导航栏公共组件（始终吸顶）。
 *
 * 详细使用文档见 docs/APP_NAV.md。
 *
 * Props:
 * - historyMatch: 历史记录链接的匹配模式
 *   - 'exact'（默认）：精确匹配 /history
 *   - 'includes'：包含 /history，用于 /history/:taskId 等子路由
 */
const props = defineProps({
  historyMatch: {
    type: String,
    default: "exact",
    validator: (value) => ["exact", "includes"].includes(value),
  },
});

const route = useRoute();

const links = [
  { to: "/", label: "生成详情页" },
  { to: "/generate-without-text", label: "生成详情页-无字" },
  { to: "/single-image-generate", label: "单图生成" },
  { to: "/edit-image", label: "单图编辑" },
  { to: "/history", label: "历史记录" },
  { to: "/settings", label: "设置" },
];

function isActive(to) {
  if (to === "/history" && props.historyMatch === "includes") {
    return route.path.includes("/history");
  }
  return route.path === to;
}
</script>

<template>
  <header class="bg-white border-b border-gray-200 shadow-md sticky top-0 z-10">
    <nav
      class="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center gap-3 flex-wrap"
    >
      <h1 class="text-2xl font-bold text-indigo-600">自动生成产品详情页</h1>
      <div class="flex gap-2 bg-gray-100 p-1 rounded-full flex-wrap">
        <router-link
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200"
          :class="{
            'bg-indigo-600 text-white shadow-md': isActive(link.to),
            'text-gray-600 hover:bg-white hover:shadow-sm': !isActive(link.to),
          }"
        >
          {{ link.label }}
        </router-link>
      </div>
    </nav>
  </header>
</template>
