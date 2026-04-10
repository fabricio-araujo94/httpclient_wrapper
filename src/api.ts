import { HttpClient } from "./core/HttpClient";

export const mainApi = new HttpClient({
    baseURL: 'http://localhost:8000/api/v1',
    timeout: 10000,
    retries: 2,
    retryDelay: 1000,
});

mainApi.addRequestInterceptor((config) => {
    const token = 'simulated-jwt-token-from-storage';

    if (token) {
        config.headers = {
            ...config.headers,
            Authorization: `Bearer ${token}`
        };
    }
    return config;
});

mainApi.addResponseInterceptor((response) => {
    console.log(`[Logger] Method called, status: ${response.status}`);
    return response;
});

export const viaCepApi = new HttpClient({
    baseURL: 'https://viacep.com.br/ws',
    timeout: 5000,
    useCache: true,
    cacheTTL: 86400000,
});

export const visionModelApi = new HttpClient({
    baseURL: 'http://localhost:8001/vision/process',
    timeout: 300000,
    retries: 0,
});