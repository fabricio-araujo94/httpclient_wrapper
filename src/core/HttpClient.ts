import { HttpError } from "../errors/HttpError";

interface CacheEntry {
  data: any;
  expiresAt: number;
}

interface HttpClientConfig extends RequestInit {
  baseUrl?: string;
  timeout?: number;
  params?: Record<string, any>;
  retries?: number;
  retryDelay?: number;
  useCache?: boolean;
  cacheTTL?: number;
}

type RequestInterceptor = (
  config: RequestInit,
) => RequestInit | Promise<RequestInit>;
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;
  private defaultTimeout: number;
  private defaultRetries: number;
  private defaultRetryDelay: number;
  private defaultCacheTTL: number;
  private cacheStorage: Map<string, CacheEntry> = new Map();

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(config: HttpClientConfig = {}) {
    this.baseUrl = config.baseUrl || "";
    this.defaultTimeout = config.timeout || 10000; // 10 secs
    this.defaultRetries = config.retries ?? 0;
    this.defaultRetryDelay = config.retryDelay || 1000;
    this.defaultCacheTTL = config.cacheTTL || 60000;
    this.defaultHeaders = config.headers || {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  public addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  public addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  public clearCache(): void {
    this.cacheStorage.clear();
  }

  private buildQueryString(params?: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) {
      return "";
    }

    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((val) => searchParams.append(key, String(val)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    return `?${searchParams.toString()}`;
  }

  private async request<T>(
    endpoint: string,
    options: HttpClientConfig = {},
  ): Promise<T> {
    const maxRetries = options.retries ?? this.defaultRetries;
    const baseDelay = options.retryDelay ?? this.defaultRetryDelay;

    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        return await this.executeFetch<T>(endpoint, options);
      } catch (error: any) {
        const isNetworkError =
          error.name === "TypeError" || error.name === "FetchError";
        const isTimeout = error.message.includes("timed out");
        const isRetryableHttpError =
          error instanceof HttpError &&
          [400, 429, 500, 502, 503, 504].includes(error.status);

        const shouldRetry = isNetworkError || isTimeout || isRetryableHttpError;

        if (!shouldRetry || attempt >= maxRetries) {
          throw error;
        }

        attempt++;
        const backoffDelay = baseDelay * Math.pow(2, attempt - 1);

        console.warn(
          `[Retry] Attempt ${attempt} failed. Retrying in ${backoffDelay}ms... (${endpoint})`,
        );

        await delay(backoffDelay);
      }
    }

    throw new Error("Unreachable code");
  }

  private async executeFetch<T>(
    endpoint: string,
    options: HttpClientConfig,
  ): Promise<T> {
    const queryString = this.buildQueryString(options.params);
    const url = `${this.baseUrl}${endpoint}${queryString}`;

    const isGetRequest =
      !options.method || options.method.toUpperCase() === "GET";
    const shouldCache = options.useCache === true && isGetRequest;

    if (shouldCache) {
      const cached = this.cacheStorage.get(url);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[Cache Hit] Returning stored data for: ${url}`);
        return cached.data as T;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout || this.defaultTimeout,
    );

    let config: RequestInit = {
      ...options,
      signal: controller.signal, // attach the abort signal to the fetch call
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    try {
      for (const interceptor of this.requestInterceptors) {
        config = await interceptor(config);
      }

      let response = await fetch(url, config);

      for (const interceptor of this.responseInterceptors) {
        response = await interceptor(response);
      }

      if (!response.ok) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = await response.text();
        }
        throw new HttpError(response.status, response.statusText, errorData);
      }

      let responseData: any;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (shouldCache) {
        this.cacheStorage.set(url, {
          data: responseData,
          expiresAt: Date.now() + (options.cacheTTL || this.defaultCacheTTL),
        });
      }

      return responseData as T;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error(
          `Request timed out after ${options.timeout || this.defaultTimeout}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public get<T>(endpoint: string, options?: HttpClientConfig): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  public post<T>(
    endpoint: string,
    body: any,
    options?: HttpClientConfig,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  public put<T>(
    endpoint: string,
    body: any,
    options?: HttpClientConfig,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  public delete<T>(endpoint: string, options?: HttpClientConfig): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}
