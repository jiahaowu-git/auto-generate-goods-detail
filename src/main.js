import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { openDB } from "./services/db.js";
import { migrateTaskHistory } from "./services/migration.js";
import "uno.css";
import "./styles/common.css";

/**
 * 应用启动流程：
 * 1. 打开 IndexedDB（异步）
 * 2. 执行 localStorage → IndexedDB 一次性迁移
 * 3. 挂载 Vue 应用
 *
 * 迁移失败不会阻塞应用启动，确保用户体验连续性。
 */
async function bootstrap() {
  try {
    await openDB();
    const result = await migrateTaskHistory();
    if (result.migrated) {
      console.log(
        `[migration] 成功迁移 ${result.count} 条历史记录到 IndexedDB`,
      );
    }
  } catch (err) {
    console.error("[bootstrap] 数据库初始化或迁移失败：", err);
  }

  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.mount("#app");
}

bootstrap();
