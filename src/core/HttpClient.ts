import { HttpError } from "../errors/HttpError";

interface CacheEntry {
  data: any;
  expiresAt: number;
}

export interface TelemetryMetrics {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  timestamp: string;
  isCacheHit: boolean;
}

interface HttpClientConfig extends RequestInit {
  baseURL?: string;
  timeout?: number;
  params?: Record<string, any>;
  retries?: number;
  retryDelay?: number;
  useCache?: boolean;
  cacheTTL?: number;
  maxCacheSize?: number;
  onTelemetry?: (metrics: TelemetryMetrics) => void;
  
  transformResponse?: (data: any) => any;
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
  private defaultMaxCacheSize: number;
  private onTelemetry?: ((metrics: TelemetryMetrics) => void) | undefined;
  private transformResponse?: ((data: any) => any) | undefined;
  private cacheStorage: Map<string, CacheEntry> = new Map();

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(config: HttpClientConfig = {}) {
    this.baseUrl = config.baseURL || "";
    this.defaultTimeout = config.timeout || 10000; // 10 secs
    this.defaultRetries = config.retries ?? 0;
    this.defaultRetryDelay = config.retryDelay || 1000;
    this.defaultCacheTTL = config.cacheTTL || 60000;
    this.defaultMaxCacheSize = config.maxCacheSize || 100;
    this.defaultHeaders = config.headers || {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    this.onTelemetry = config.onTelemetry;
    this.transformResponse = config.transformResponse;
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

  private getCacheEntry(url: string): CacheEntry | undefined {
    const cached = this.cacheStorage.get(url);
    if (!cached) return undefined;

    if (cached.expiresAt <= Date.now()) {
      this.cacheStorage.delete(url);
      return undefined;
    }

    // Refresh LRU order (re-insert)
    this.cacheStorage.delete(url);
    this.cacheStorage.set(url, cached);
    return cached;
  }

  private setCacheEntry(url: string, data: any, ttl: number): void {
    if (this.cacheStorage.has(url)) {
      this.cacheStorage.delete(url);
    } else if (this.cacheStorage.size >= this.defaultMaxCacheSize) {
      // Purge expired entries first
      const now = Date.now();
      for (const [key, entry] of this.cacheStorage.entries()) {
        if (entry.expiresAt <= now) {
          this.cacheStorage.delete(key);
        }
      }

      // Evict least recently used (oldest inserted) if still at or above capacity
      while (this.cacheStorage.size >= this.defaultMaxCacheSize) {
        const oldestKey = this.cacheStorage.keys().next().value;
        if (oldestKey !== undefined) {
          this.cacheStorage.delete(oldestKey);
        } else {
          break;
        }
      }
    }

    this.cacheStorage.set(url, {
      data,
      expiresAt: Date.now() + ttl,
    });
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

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
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
          [408, 429, 500, 502, 503, 504].includes(error.status);

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

  private async executeFetch<T>(endpoint: string, options: HttpClientConfig): Promise<T> {
    const queryString = this.buildQueryString(options.params);
    const url = `${this.baseUrl}${endpoint}${queryString}`;
    const method = (options.method || 'GET').toUpperCase();
    const onTelemetry = options.onTelemetry || this.onTelemetry;
    const transformResponse = options.transformResponse || this.transformResponse;
    
    const startTime = performance.now();

    const isGetRequest = method === 'GET';
    const shouldCache = options.useCache === true && isGetRequest;

    if (shouldCache) {
      const cached = this.getCacheEntry(url);
      if (cached) {
        if (onTelemetry) {
          onTelemetry({
             url,
             method,
             status: 200, 
             durationMs: performance.now() - startTime,
             timestamp: new Date().toISOString(),
             isCacheHit: true
          });
        }
        
        return cached.data as T;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.defaultTimeout);

    let config: RequestInit = {
      ...options,
      signal: controller.signal,
      headers: { ...this.defaultHeaders, ...options.headers },
    };

    try {
      for (const interceptor of this.requestInterceptors) { config = await interceptor(config); }
      let response = await fetch(url, config);
      for (const interceptor of this.responseInterceptors) { response = await interceptor(response); }

      if (onTelemetry) {
        onTelemetry({
          url,
          method,
          status: response.status,
          durationMs: performance.now() - startTime,
          timestamp: new Date().toISOString(),
          isCacheHit: false
        });
      }

      if (!response.ok) {
        let errorData: any = null;
        const rawText = await response.text();
        try {
          errorData = JSON.parse(rawText);
        } catch {
          errorData = rawText;
        }
        throw new HttpError(response.status, response.statusText, errorData);
      }

      let responseData: any;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
        
        if (transformResponse) {
          responseData = transformResponse(responseData);
        }
        
      } else {
        responseData = await response.text();
      }

      if (shouldCache) {
        this.setCacheEntry(
          url,
          responseData,
          options.cacheTTL || this.defaultCacheTTL,
        );
      }

      return responseData as T;

    } catch (error: any) {
      
      if (onTelemetry) {
        onTelemetry({
           url,
           method,
           status: error instanceof HttpError ? error.status : 0, 
           durationMs: performance.now() - startTime,
           timestamp: new Date().toISOString(),
           isCacheHit: false
        });
      }

      if (error.name === 'AbortError') throw new Error(`Request timed out`);
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
