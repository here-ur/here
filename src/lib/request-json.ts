export class JsonRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Bound bytes and time, including chunked bodies without Content-Length.
export async function readSmallJson(request: Request, timeoutMs = 5000): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    throw new JsonRequestError(415, "JSON 형식이 필요해요.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new JsonRequestError(400, "요청 내용을 확인해 주세요.");
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let raw = "";
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      // Cancellation is not EOF: never accept a valid JSON prefix of a stalled body.
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) throw new JsonRequestError(413, "요청이 너무 커요.");
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } catch (error) {
    if (signal.aborted) throw new JsonRequestError(408, "요청 시간이 초과됐어요. 다시 시도해 주세요.");
    if (error instanceof JsonRequestError) throw error;
    throw new JsonRequestError(400, "요청 내용을 확인해 주세요.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
