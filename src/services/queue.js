/**
 * 队列相关服务（提交前容量检查）。
 *
 * 接口文档：https://www.runninghub.cn/runninghub-api-doc-cn/api-432926239
 * 接口：GET /openapi/v2/queue/status
 * 响应 data 字段：
 *   - apiKeyType：KEY 类型（EXCLUSIVE / SHARED / NORMAL）
 *   - concurrentLimit：该 Key 对应的最大并发数
 *   - runningCount：正在运行的任务数（字符串）
 *   - queuedCount：排队的任务数（字符串）
 *   - totalCurrentTasks：总任务数（字符串）
 */

const BASE_URL = "https://www.runninghub.cn";

/**
 * 查询队列状态原始数据。
 * @returns {Promise<{apiKeyType: string, concurrentLimit: number, runningCount: string, queuedCount: string, totalCurrentTasks: string}>}
 */
export async function queryQueueStatus(apiKey) {
  const response = await fetch(`${BASE_URL}/openapi/v2/queue/status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error("查询队列状态失败");
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.msg || "查询队列状态失败");
  }

  return result.data;
}

/**
 * 检查队列容量，判断是否可以提交新任务。
 *
 * 判断规则：totalCurrentTasks < concurrentLimit 时可提交
 *   - 提交后任务进入 running / queued 状态，totalCurrentTasks +1
 *   - 严格小于可保证加入后不超过并发上限
 *
 * @param {string} apiKey
 * @returns {Promise<{canSubmit: boolean, totalCurrentTasks: number, concurrentLimit: number, message: string}>}
 */
export async function checkQueueAvailability(apiKey) {
  const data = await queryQueueStatus(apiKey);
  const totalCurrentTasks = Number(data.totalCurrentTasks) || 0;
  const concurrentLimit = Number(data.concurrentLimit) || 0;

  const canSubmit = totalCurrentTasks < concurrentLimit;
  const message = canSubmit
    ? ""
    : `当前队列已满：${totalCurrentTasks} / ${concurrentLimit} 个任务正在运行或排队，请等待队列空闲后再提交。`;

  return { canSubmit, totalCurrentTasks, concurrentLimit, message };
}
