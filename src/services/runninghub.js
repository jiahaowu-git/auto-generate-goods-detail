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
    throw new Error(result.message || "查询队列状态失败");
  }

  return result.data;
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

export async function queryTaskStatus(taskId, apiKey) {
  const response = await fetch(`${BASE_URL}/task/openapi/status`, {
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
    throw new Error("查询任务状态失败");
  }

  const result = await response.json();
  if (result.code !== 0) {
    const error = new Error(result.msg || "查询任务状态失败");
    error.code = result.code;
    error.apiCode = true;
    throw error;
  }

  return result.data;
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
