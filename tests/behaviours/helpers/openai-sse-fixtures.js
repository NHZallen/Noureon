// V3 Phase 5 test-only SSE fixture helper.
// Production stream parsing still lives in the legacy runtime closure; this
// helper does not represent production streamApiCall parser coverage.
export const createSseStream = (chunks) => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(encoder.encode(chunk));
      });
      controller.close();
    }
  });
};
