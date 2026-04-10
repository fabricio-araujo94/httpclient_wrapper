import { HttpClient, TelemetryMetrics } from "./core/HttpClient";
import { HttpError } from "./errors/HttpError";

const api = new HttpClient({
  baseURL: 'https://httpbin.org',
});

interface HttpBinResponse {
  args: Record<string, string | string[]>;
  url: string;
}

interface AppUser {
  userId: number;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

api.addRequestInterceptor((config) => {
  console.log("[Interceptor] Outgoing Request...");

  // simulating token retrieval from local storage or memory
  const token = "my-secret-jwt-token";

  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

api.addResponseInterceptor((response) => {
  console.log(`[Interceptor] Incoming Response: Status ${response.status}`);
  return response;
});

interface Post {
  userId: number;
  id: number;
  title: string;
  body: string;
}

async function runDemo() {
  try {
    console.log("Fetching a successful request...");

    const post = await api.get<Post>("/posts/1");
    console.log("Success! Post title:", post.title);

    console.log("Simulating a POST request...");
    const newPost = await api.post<Post>("/posts", {
      title: "Study Project",
      body: "Building a custom HTTP Client",
      userId: 1,
    });
    console.log("Created!", newPost);

    console.log("Simulating an error...");
    await api.get("/invalid-endpoint-123");
  } catch (error) {
    if (error instanceof HttpError) {
      console.error(
        `Caught custom API error: ${error.status} - ${error.statusText}`,
      );
      console.error("Error details:", error.data);
    } else {
      console.error("Unknown error:", error);
    }
  }
}

async function runTimeoutDemo() {
  console.log("Starting timeout demo...");

  try {
    console.log(
      "Requesting an endpoint that takes 3 seconds to respond, with a 1 second timeout...",
    );

    // simulating a scenario where the server is slow
    await api.get("/delay/3", { timeout: 1000 });

    console.log("Success!"); // this should not happen
  } catch (error: any) {
    if (error instanceof HttpError) {
      console.error(`API Error: ${error.status}`);
    } else {
      console.error(`Client Error: ${error.message}`);
    }
  }

  try {
    console.log(
      "Requesting an endpoint that takes 1 second to respond, with a 5 second timeout...",
    );

    const response = await api.get("/delay/1");
    console.log("Success!.");
  } catch (error: any) {
    console.error("Failure:", error.message);
  }
}

async function runQueryStringDemo() {
  console.log("Starting query string demo...");

  try {
    const response = await api.get<HttpBinResponse>("/get", {
      params: {
        search: "clean architecture",
        page: 2,
        isActive: true,
        tags: ["typescript", "node"],
        emptyField: null,
      },
    });

    console.log("Generated url by the client...");
    console.log(response.url);

    console.log("Parsed arguments received by the server...");
    console.log(response.args);
  } catch (error: any) {
    console.error("Request failed:", error.message);
  }
}

async function runRetryDemo() {
  console.log("Starting retry & exponential backoff demo...");

  try {
    console.log("Simulating a failing server...");

    await api.get("/status/503");
  } catch (error: any) {
    console.log("Final result:");
    if (error instanceof HttpError) {
      console.error(
        `Operation failed permanently after all retries. Final status: ${error.status}`,
      );
    } else {
      console.error("Operation failed:", error.message);
    }
  }
}

async function measureTime(name: string, fn: () => Promise<any>) {
  const start = performance.now();
  await fn();
  const end = performance.now();
  console.log(`${name} took ${(end - start).toFixed(2)}ms`);
}

async function runCacheDemo() {
  console.log("Starting cache demo...");

  try {
    await measureTime("First request...", async () => {
      const data = await api.get("/posts/1", {
        useCache: true,
        cacheTTL: 5000,
      });
      console.log("Data fetched from server.");
    });

    await measureTime("Second request...", async () => {
      const data = await api.get("/posts/1", { useCache: true });
      console.log("Data retrieved.");
    });

    console.log("Waiting 6 seconds for cache to expire...");
    await new Promise((resolve) => setTimeout(resolve, 6000));

    await measureTime("Third request...", async () => {
      const data = await api.get("/posts/1", { useCache: true });
      console.log("Data fetched from server again.");
    });
  } catch (error: any) {
    console.error("Request failed:", error.message);
  }
}

function sendToDatadog(metrics: TelemetryMetrics) {
  // in a real project, this would be an independent background request
  const source = metrics.isCacheHit ? '[CACHE]' : '[NETWORK]';
  const time = metrics.durationMs.toFixed(2);
  
  console.log(`
    [TELEMETRY] ${source} ${metrics.method} ${metrics.url} | Status: ${metrics.status} | Time: ${time}ms
    `);

  console.table([metrics]);
}

async function runTelemetryDemo() {
  console.log("Starting telemetry demo...");

  try {
    // to measure time, don't put console.logs here
    await api.get("/delay/1");
    await api.get("/delay/1");
    await api.get("/status/404");
  } catch (error) {
    // error is handled, but telemetry already logged the failure
  }
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

function snakeToCamelMapper(data: any): any {
  if (Array.isArray(data)) {
    return data.map(item => snakeToCamelMapper(item));
  } else if (data !== null && typeof data === 'object') {
    const newData: any = {};
    for (const key of Object.keys(data)) {
      const camelKey = toCamelCase(key);
      newData[camelKey] = snakeToCamelMapper(data[key]);
    }
    return newData;
  }
  return data; 
}

async function runMapperDemo() {
  console.log('--- Starting Data Transformer Demo ---');

  try {
    // We will simulate a server returning snake_case data.
    const mockServerResponse = {
      user_id: 101,
      first_name: 'John',
      last_name: 'Doe',
      is_active: true
    };

    console.log('1. Simulating an API call to a Python server...');
    console.log('Raw data expected from server:', mockServerResponse);

    const response = await api.post<{ json: AppUser }>('/post', mockServerResponse, {
      // it will intercept the data before it reaches the 'response' variable.
      transformResponse: (data) => {
        if (data && data.json) {
          data.json = snakeToCamelMapper(data.json);
        }
        return data;
      }
    });

    console.log('\n2. Data received by our application code:');
    console.log('First Name:', response.json.firstName);
    console.log('Last Name:', response.json.lastName);
    console.log('Fully Transformed Object:', response.json);

  } catch (error: any) {
    console.error('Request failed:', error.message);
  }
}


// runDemo();
// runTimeoutDemo();
// runQueryStringDemo();
// runRetryDemo();
// runCacheDemo();
// runTelemetryDemo();
runMapperDemo();
