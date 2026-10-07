import { describe, expect, it } from "vitest";
import { TooLarge, boundedFormData, boundedJson, readBounded } from "@apex/forms/http";

// A streamed body has no Content-Length, like a chunked request: only counting the bytes can stop it.
const streamed = (chunks: number, size: number, headers: Record<string, string> = {}) => {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) { if (sent++ >= chunks) c.close(); else c.enqueue(new Uint8Array(size)); },
  });
  return new Request("http://x.test/", { method: "POST", body, headers, duplex: "half" } as RequestInit);
};

describe("bounded request bodies", () => {
  it("refuses a chunked body that passes the limit, without a Content-Length to warn us", async () => {
    const req = streamed(10, 1024);
    expect(req.headers.get("content-length")).toBeNull();
    await expect(readBounded(req, 5 * 1024)).rejects.toBeInstanceOf(TooLarge);
  });
  it("stops reading early instead of buffering the rest", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); } });
    const req = new Request("http://x.test/", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(readBounded(req, 4 * 1024)).rejects.toBeInstanceOf(TooLarge);
    expect(pulled).toBeLessThan(20);
  });
  it("refuses a declared size over the limit at once", async () => {
    const req = new Request("http://x.test/", { method: "POST", body: "x", headers: { "content-length": "999999" } });
    await expect(readBounded(req, 10)).rejects.toBeInstanceOf(TooLarge);
  });
  it("still reads normal JSON and multipart bodies", async () => {
    const j = new Request("http://x.test/", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(await boundedJson(j)).toEqual({ a: 1 });
    const fd = new FormData(); fd.set("payload", "{}"); fd.set("file:f1", new File(["hello"], "a.pdf"));
    const f = await boundedFormData(new Request("http://x.test/", { method: "POST", body: fd }), 1024 * 1024);
    expect(f.get("payload")).toBe("{}");
    expect((f.get("file:f1") as File).size).toBe(5);
  });
});
