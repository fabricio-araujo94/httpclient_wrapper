export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly data: any;

  constructor(status: number, statusText: string, data: any, message?: string) {
    super(message || `HTTP Error: ${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.data = data;

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, HttpError);
    }
  }
}
