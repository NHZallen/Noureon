const unavailable = task => async () => {
  throw new Error(`Memory ${task} is unavailable because the configured memory model runner is not ready.`);
};

/**
 * All memory work must use the separately selected memory model. In particular,
 * do not resurrect the legacy Gemini clients as a hidden fallback: a failed or
 * unavailable chosen model should remain visible as a failed background task.
 */
export function createMemoryTaskClients({ memoryModelClient } = {}) {
  if (memoryModelClient) {
    return {
      captureClient: memoryModelClient,
      mediaClient: memoryModelClient,
      topicClient: memoryModelClient,
      queryResolver: memoryModelClient
    };
  }
  return {
    captureClient: { capture: unavailable('capture') },
    mediaClient: { describe: unavailable('attachment description') },
    topicClient: { summarize: unavailable('topic summary') },
    queryResolver: { resolve: unavailable('history-query resolution') }
  };
}
