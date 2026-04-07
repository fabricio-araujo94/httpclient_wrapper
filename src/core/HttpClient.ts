import { HttpError } from "../errors/HttpError";

interface HttpClientConfig extends RequestInit {
  baseUrl?: string;
}

type RequestInterceptor = (
  config: RequestInit,
) => RequestInit | Promise<RequestInit>;
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(config: HttpClientConfig = {}) {
    this.baseUrl = config.baseUrl || "";
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
}
