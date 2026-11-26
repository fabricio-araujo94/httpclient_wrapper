# HttpClient Wrapper

A modular, typed, and resilient HTTP client built with **TypeScript** on top of the native `fetch` API. This project implements essential features for HTTP communication in Node.js applications without relying on external libraries like Axios.

---

## Features

- **Strict TypeScript Typing**: Full generic (`<T>`) support across all HTTP methods (`get`, `post`, `put`, `delete`).
- **Customizable Instances**: Create multiple client instances with independent base configurations (`baseURL`, `headers`, `timeout`, etc.).
- **Interceptors**: Asynchronous request (`RequestInterceptor`) and response (`ResponseInterceptor`) interceptors support.
- **Retries with Exponential Backoff**: Configurable automatic retries for network failures, timeouts, and retryable HTTP statuses (`400`, `429`, `500`, `502`, `503`, `504`).
- **Timeout Management**: Automatic cancellation of slow requests using `AbortController`.
- **In-Memory Cache**: Built-in in-memory caching system for `GET` requests with configurable TTL (*Time-To-Live*).
- **Query String Builder**: Automatic serialization of query parameters (`params`), supporting multi-value arrays and discarding `null`/`undefined` values.
- **Telemetry & Metrics**: `onTelemetry` callback to track metrics such as duration (`durationMs`), status, URL, method, and cache hit.
- **Response Transformation**: `transformResponse` function to manipulate and format received data before final resolution.
- **Custom Error Handling**: `HttpError` class carrying `status`, `statusText`, and response payload (`data`).

---

## Project Structure

```text
httpclient_wrapper/
├── src/
│   ├── core/
│   │   └── HttpClient.ts      # Core library with HttpClient class and interfaces
│   ├── errors/
│   │   └── HttpError.ts       # Custom error class for non-2xx HTTP responses
│   ├── services/
│   │   └── UserService.ts     # Example structured service consuming the API
│   ├── api.ts                 # Configuration and export of HttpClient instances
│   └── index.ts               # Practical demonstrations of all features
├── package.json
├── tsconfig.json
└── README.md
```

---

## Installation and Prerequisites

### Prerequisites
- **Node.js** v18+ (which includes the native Fetch API).
- **npm** or an equivalent package manager.

### Installation

1. Clone the repository:
```bash
git clone https://github.com/fabricio-araujo94/httpclient_wrapper.git
cd httpclient_wrapper
```

2. Install development dependencies:
```bash
npm install
```

---

## Running Demonstrations

The [src/index.ts](./src/index.ts) file contains practical scenarios demonstrating each feature.

To run the main demo script:
```bash
npx ts-node src/index.ts
```

At the end of [src/index.ts](./src/index.ts#L287-L294), you can uncomment the demo functions to see each feature in action:

- `runDemo()`: Demonstrates GET and POST requests along with custom error catching using `HttpError`.
- `runTimeoutDemo()`: Demonstrates automatic request cancellation on timeout.
- `runQueryStringDemo()`: Demonstrates serialization of parameters and arrays in URL query strings.
- `runRetryDemo()`: Demonstrates retries with exponential backoff on HTTP failures (e.g., 503).
- `runCacheDemo()`: Demonstrates in-memory caching and TTL expiration.
- `runTelemetryDemo()`: Demonstrates telemetry metrics extraction.
- `runMapperDemo()`: Demonstrates `transformResponse` to map responses from `snake_case` to `camelCase`.
- `bootstrap()`: Demonstrates calls through services and external instances (e.g., ViaCEP).

---

## Usage

### 1. Creating an Instance

```typescript
import { HttpClient } from "./core/HttpClient";

const api = new HttpClient({
  baseURL: "https://api.example.com",
  timeout: 5000,        // 5-second timeout
  retries: 2,           // Up to 2 retries on failure
  retryDelay: 1000,     // Initial delay of 1 second (multiplied exponentially)
  cacheTTL: 60000,      // Default cache TTL: 60 seconds
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
});
```

### 2. Adding Interceptors

You can intercept requests to inject authentication headers and intercept responses for logging or metrics:

```typescript
// Request Interceptor (adds JWT Token)
api.addRequestInterceptor(async (config) => {
  const token = "my-jwt-token";
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

// Response Interceptor
api.addResponseInterceptor(async (response) => {
  console.log(`[HTTP] ${response.status} - ${response.url}`);
  return response;
});
```

### 3. Making Requests (GET, POST, PUT, DELETE)

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Typed GET
const user = await api.get<User>("/users/1");

// POST with body
const newUser = await api.post<User>("/users", {
  name: "John Doe",
  email: "john@example.com",
});

// PUT with body
const updatedUser = await api.put<User>("/users/1", {
  name: "John D. Doe",
});

// DELETE
await api.delete("/users/1");
```

### 4. Query Params and Arrays

Parameters passed in the `params` object are automatically converted into a query string. `null` and `undefined` values are ignored:

```typescript
const response = await api.get("/search", {
  params: {
    query: "typescript",
    page: 1,
    tags: ["node", "api"], // results in ?tags=node&tags=api
    filter: undefined,      // ignored
  },
});
```

### 5. In-Memory Cache (GET Only)

Responses are cached in memory indexed by the full URL:

```typescript
const data = await api.get("/static-data", {
  useCache: true,
  cacheTTL: 30000, // 30-second validity for this request
});

// To manually clear the cache:
api.clearCache();
```

### 6. Telemetry and Metrics

You can register a callback to collect metrics for each request (including whether the response was served from cache):

```typescript
const api = new HttpClient({
  baseURL: "https://api.example.com",
  onTelemetry: (metrics) => {
    console.log(`URL: ${metrics.url}`);
    console.log(`Method: ${metrics.method}`);
    console.log(`Status: ${metrics.status}`);
    console.log(`Duration: ${metrics.durationMs}ms`);
    console.log(`Cache Hit: ${metrics.isCacheHit}`);
    console.log(`Timestamp: ${metrics.timestamp}`);
  },
});
```

### 7. Response Transformation (`transformResponse`)

Useful for sanitization or casing conversions (e.g., `snake_case` to `camelCase`):

```typescript
const response = await api.get("/user", {
  transformResponse: (data) => {
    return {
      id: data.user_id,
      fullName: data.full_name,
    };
  },
});
```

### 8. Error Handling with `HttpError`

When a response returns a status outside the 2xx range (`!response.ok`), an `HttpError` exception is thrown containing the response payload:

```typescript
import { HttpError } from "./errors/HttpError";

try {
  await api.get("/non-existent-route");
} catch (error) {
  if (error instanceof HttpError) {
    console.error(`HTTP Status: ${error.status} ${error.statusText}`);
    console.error("API Error Data:", error.data);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

---

## Configuration Options (`HttpClientConfig`)

The configuration interface extends standard Fetch API `RequestInit` options:

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `baseURL` | `string` | `""` | Base URL prepended to request endpoints. |
| `timeout` | `number` | `10000` (10s) | Maximum time (in ms) before aborting the request. |
| `retries` | `number` | `0` | Maximum number of retry attempts on retryable errors. |
| `retryDelay` | `number` | `1000` (1s) | Base delay (in ms) for exponential backoff calculation (`baseDelay * 2^(attempt-1)`). |
| `useCache` | `boolean` | `false` | When `true`, enables in-memory caching for `GET` requests. |
| `cacheTTL` | `number` | `60000` (60s) | Cache time-to-live (in ms). |
| `params` | `Record<string, any>` | `undefined` | Query string parameters object. |
| `headers` | `HeadersInit` | Standard JSON | HTTP headers sent with requests. |
| `onTelemetry` | `(metrics: TelemetryMetrics) => void` | `undefined` | Callback invoked upon request completion with performance metrics. |
| `transformResponse` | `(data: any) => any` | `undefined` | Function applied to the parsed response JSON before returning. |
