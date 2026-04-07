import { HttpClient } from "./core/HttpClient";
import { HttpError } from "./errors/HttpError";

const api = new HttpClient({
  baseUrl: "https://httpbin.org",
  timeout: 5000,
});

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

// runDemo();
runTimeoutDemo();
