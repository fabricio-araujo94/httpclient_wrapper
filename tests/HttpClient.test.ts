import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, TelemetryMetrics } from "../src/core/HttpClient";
import { HttpError } from "../src/errors/HttpError";

describe("HttpClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("HTTP Methods & Serialization", () => {
    it("should perform a successful GET request and return parsed JSON", async () => {
      const mockData = { id: 1, title: "Test Post" };
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = new HttpClient({ baseURL: "https://api.example.com" });
      const result = await client.get<{ id: number; title: string }>("/posts/1");

      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/posts/1",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should correctly append query parameters to URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = new HttpClient({ baseURL: "https://api.example.com" });
      await client.get("/search", {
        params: { q: "typescript", page: 2, tags: ["web", "api"], ignore: null, skip: undefined },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/search?q=typescript&page=2&tags=web&tags=api",
        expect.any(Object)
      );
    });

    it("should perform POST and PUT with stringified JSON body", async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const client = new HttpClient();
      const payload = { name: "John Doe", email: "john@example.com" };

      await client.post("https://api.example.com/users", payload);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      await client.put("https://api.example.com/users/1", payload);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(payload),
        })
      );
    });

    it("should perform DELETE request", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = new HttpClient();
      const result = await client.delete<{ deleted: boolean }>("https://api.example.com/users/1");

      expect(result).toEqual({ deleted: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("should return raw text when response is not application/json", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("plain text response", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        })
      );

      const client = new HttpClient();
      const result = await client.get<string>("https://api.example.com/text");
      expect(result).toBe("plain text response");
    });
  });

  describe("Interceptors", () => {
    it("should run request interceptors to mutate configuration", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = new HttpClient();
      client.addRequestInterceptor((config) => ({
        ...config,
        headers: {
          ...config.headers,
          Authorization: "Bearer mock-token-123",
        },
      }));

      await client.get("https://api.example.com/protected");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/protected",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mock-token-123",
          }),
        })
      );
    });

    it("should run response interceptors to inspect or mutate response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "original" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = new HttpClient();
      const interceptorSpy = vi.fn((response: Response) => response);
      client.addResponseInterceptor(interceptorSpy);

      await client.get("https://api.example.com/data");
      expect(interceptorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle JSON error response and throw HttpError with parsed data", async () => {
      const errorBody = { message: "Validation Failed", errors: ["Invalid email"] };
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(errorBody), {
            status: 422,
            statusText: "Unprocessable Entity",
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const client = new HttpClient();
      await expect(client.get("https://api.example.com/validate")).rejects.toThrow(HttpError);

      try {
        await client.get("https://api.example.com/validate");
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.status).toBe(422);
        expect(err.statusText).toBe("Unprocessable Entity");
        expect(err.data).toEqual(errorBody);
      }
    });

    it("should handle non-JSON HTML/text error response without throwing body used TypeError", async () => {
      const htmlBody = "<html><body>502 Bad Gateway</body></html>";
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(htmlBody, {
            status: 502,
            statusText: "Bad Gateway",
            headers: { "Content-Type": "text/html" },
          })
        )
      );

      const client = new HttpClient({ retries: 0 });

      try {
        await client.get("https://api.example.com/gateway");
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.status).toBe(502);
        expect(err.statusText).toBe("Bad Gateway");
        expect(err.data).toBe(htmlBody);
      }
    });
  });

  describe("Retry Mechanism", () => {
    it("should NOT retry 400 Bad Request", async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "bad request" }), {
            status: 400,
            statusText: "Bad Request",
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ retries: 3, retryDelay: 10 });
      await expect(client.get("https://api.example.com/bad")).rejects.toThrow(HttpError);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should retry transient 503 Service Unavailable up to retries count", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" })
          )
        )
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify({ recovered: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          )
        );
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ retries: 2, retryDelay: 10 });
      const result = await client.get<{ recovered: boolean }>("https://api.example.com/recover");

      expect(result).toEqual({ recovered: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("LRU Caching & Eviction", () => {
    it("should cache GET requests and serve from cache", async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ key: "value" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = fetchMock;

      const client = new HttpClient();
      const first = await client.get("https://api.example.com/cached", { useCache: true });
      const second = await client.get("https://api.example.com/cached", { useCache: true });

      expect(first).toEqual({ key: "value" });
      expect(second).toEqual({ key: "value" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should evict oldest item when maxCacheSize is exceeded (LRU)", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          new Response(JSON.stringify({ url }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ maxCacheSize: 2 });

      await client.get("https://api.example.com/item1", { useCache: true });
      await client.get("https://api.example.com/item2", { useCache: true });
      // item1 and item2 in cache

      // Access item1 to make item2 the least recently used
      await client.get("https://api.example.com/item1", { useCache: true });

      // Add item3 -> should evict item2
      await client.get("https://api.example.com/item3", { useCache: true });

      expect(fetchMock).toHaveBeenCalledTimes(3);

      // item1 should still be cached (no new fetch)
      await client.get("https://api.example.com/item1", { useCache: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // item2 was evicted -> will trigger a new fetch
      await client.get("https://api.example.com/item2", { useCache: true });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("should clear cache when clearCache() is called", async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = fetchMock;

      const client = new HttpClient();
      await client.get("https://api.example.com/data", { useCache: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      client.clearCache();
      await client.get("https://api.example.com/data", { useCache: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("Constructor Config Fallbacks ([I1] Fix)", () => {
    it("should use global onTelemetry provided in constructor", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const telemetryLogs: TelemetryMetrics[] = [];
      const client = new HttpClient({
        baseURL: "https://api.example.com",
        onTelemetry: (metrics) => telemetryLogs.push(metrics),
      });

      await client.get("/telemetry-test");

      expect(telemetryLogs).toHaveLength(1);
      expect(telemetryLogs[0]).toMatchObject({
        url: "https://api.example.com/telemetry-test",
        method: "GET",
        status: 200,
        isCacheHit: false,
      });
    });

    it("should use global transformResponse provided in constructor", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ first_name: "Alice", last_name: "Smith" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = new HttpClient({
        transformResponse: (data) => ({
          firstName: data.first_name,
          lastName: data.last_name,
        }),
      });

      const user = await client.get<any>("https://api.example.com/user");
      expect(user).toEqual({ firstName: "Alice", lastName: "Smith" });
    });
  });
});
