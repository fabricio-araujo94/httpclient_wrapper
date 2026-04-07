import { HttpError } from "../errors/HttpError";

interface HttpClientConfig extends RequestInit {
  baseUrl?: string;
  timeout?: number;
}

type RequestInterceptor = (
  config: RequestInit,
) => RequestInit | Promise<RequestInit>;
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;
  private defaultTimeout: number;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(config: HttpClientConfig = {}) {
    this.baseUrl = config.baseUrl || "";
    this.defaultTimeout = config.timeout || 10000; // 10 secs
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

  private async request<T>(
    endpoint: string,
    options: HttpClientConfig = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

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

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      return (await response.text()) as unknown as T;
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
