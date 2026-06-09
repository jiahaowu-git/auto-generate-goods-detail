const BASE_URL = "https://www.runninghub.cn";

export async function uploadFile(file, apiKey) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BASE_URL}/openapi/v2/media/upload/binary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error("文件上传失败");
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.message || "文件上传失败");
  }

  return result.data.download_url;
}

export async function submitTask(nodeInfoList, workflowId, apiKey) {
  const response = await fetch(`${BASE_URL}/task/openapi/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      apiKey: apiKey,
      workflowId: workflowId,
      nodeInfoList: nodeInfoList,
    }),
  });

  if (!response.ok) {
    throw new Error("任务提交失败");
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.msg || "任务提交失败");
  }

  return result.data.taskId;
}

/**
 * 查询任务状态。
 *
 * 使用 RunningHub OpenAPI V2 接口 `/openapi/v2/query`（旧 `/task/openapi/status` 已废弃）。
 * 返回完整响应对象，包含 taskId、status、errorCode、errorMessage、results 等字段。
 *
 * 业务错误（任务 FAILED）会以 apiCode: true 抛出，调用方可据此区分网络异常与业务异常。
 */
export async function queryTaskStatus(taskId, apiKey) {
  const response = await fetch(`${BASE_URL}/openapi/v2/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ taskId }),
  });

  if (!response.ok) {
    throw new Error("查询任务状态失败");
  }

  const result = await response.json();

  // 业务错误：任务状态为 FAILED
  if (result.status === "FAILED") {
    const error = new Error(result.errorMessage || "任务执行失败");
    error.code = result.errorCode;
    error.apiCode = true;
    throw error;
  }

  return result;
}

export async function cancelTask(taskId, apiKey) {
  const response = await fetch(`${BASE_URL}/task/openapi/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      apiKey: apiKey,
      taskId: taskId,
    }),
  });

  if (!response.ok) {
    throw new Error("取消任务失败");
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.msg || "取消任务失败");
  }

  return result;
}

export async function queryTaskResult(taskId, apiKey) {
  const response = await fetch(`${BASE_URL}/openapi/v2/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ taskId }),
  });

  if (!response.ok) {
    throw new Error("查询任务结果失败");
  }

  return await response.json();
}
