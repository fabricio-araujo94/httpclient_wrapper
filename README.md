# HttpClient Wrapper

Um cliente HTTP modular, tipado e resiliente construído em **TypeScript** sobre a API nativa `fetch`. O projeto implementa recursos essenciais para comunicação HTTP em aplicações Node.js sem depender de bibliotecas externas como Axios.

---

## Funcionalidades

- **Tipagem Estrita com TypeScript**: Suporte a generics (`<T>`) em todos os métodos HTTP (`get`, `post`, `put`, `delete`).
- **Instâncias Customizáveis**: Permite instanciar múltiplos clientes com configurações de base (`baseURL`, `headers`, `timeout`, etc.) independentes.
- **Interceptors**: Suporte a interceptores assíncronos de requisição (`RequestInterceptor`) e de resposta (`ResponseInterceptor`).
- **Retentativas com Backoff Exponencial**: Retry automático configurável para falhas de rede, timeouts e status HTTP retryable (`400`, `429`, `500`, `502`, `503`, `504`).
- **Controle de Timeout**: Cancelamento de requisições lentas via `AbortController`.
- **Cache em Memória**: Sistema de cache em memória para requisições `GET` com suporte a TTL (*Time-To-Live*) configurável.
- **Construtor de Query String**: Serialização automática de parâmetros de consulta (`params`), com suporte a múltiplos valores (arrays) e descarte de valores `null`/`undefined`.
- **Telemetria e Métricas**: Callback `onTelemetry` para monitoramento de métricas como duração (`durationMs`), status, URL, método e *cache hit*.
- **Transformação de Resposta**: Função `transformResponse` para manipular e formatar dados recebidos antes da entrega final.
- **Tratamento de Erros Personalizado**: Classe `HttpError` contendo `status`, `statusText` e o corpo da resposta (`data`).

---

## Estrutura do Projeto

```text
httpclient_wrapper/
├── src/
│   ├── core/
│   │   └── HttpClient.ts      # Núcleo da biblioteca com a classe HttpClient e interfaces
│   ├── errors/
│   │   └── HttpError.ts       # Classe de erro customizada para respostas HTTP não-2xx
│   ├── services/
│   │   └── UserService.ts     # Exemplo de serviço estruturado consumindo a API
│   ├── api.ts                 # Configuração e exportação de instâncias do HttpClient
│   └── index.ts               # Demonstrações práticas de todos os recursos
├── package.json
├── tsconfig.json
└── README.md
```

---

## Instalação e Pré-requisitos

### Pré-requisitos
- **Node.js** v18+ (que inclui a Fetch API nativa).
- **npm** ou gerenciador de pacotes equivalente.

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/fabricio-araujo94/httpclient_wrapper.git
cd httpclient_wrapper
```

2. Instale as dependências de desenvolvimento:
```bash
npm install
```

---

## Executando as Demonstrações

O arquivo [src/index.ts](file:///C:/Dev/Archive/httpclient_wrapper/src/index.ts) contém cenários práticos que demonstram cada funcionalidade.

Para executar o arquivo principal:
```bash
npx ts-node src/index.ts
```

No final do arquivo [src/index.ts](file:///C:/Dev/Archive/httpclient_wrapper/src/index.ts#L287-L294), você pode descomentar as funções de teste para ver cada recurso em ação:

- `runDemo()`: Demonstra requisições GET, POST e captura de erro customizado com `HttpError`.
- `runTimeoutDemo()`: Demonstra cancelamento automático por timeout.
- `runQueryStringDemo()`: Demonstra serialização de parâmetros e arrays na URL.
- `runRetryDemo()`: Demonstra retentativas com backoff exponencial diante de falhas HTTP (ex: 503).
- `runCacheDemo()`: Demonstra cache em memória e expiração por TTL.
- `runTelemetryDemo()`: Demonstra extração de métricas de telemetria.
- `runMapperDemo()`: Demonstra o uso de `transformResponse` para converter respostas em `snake_case` para `camelCase`.
- `bootstrap()`: Demonstra chamadas a serviços e instâncias externas (ex: ViaCEP).

---

## Como Usar

### 1. Criando uma Instância

```typescript
import { HttpClient } from "./core/HttpClient";

const api = new HttpClient({
  baseURL: "https://api.exemplo.com",
  timeout: 5000,        // 5 segundos de timeout
  retries: 2,           // Até 2 retentativas em caso de falha
  retryDelay: 1000,     // Delay inicial de 1 segundo (multiplicado exponencialmente)
  cacheTTL: 60000,      // TTL de cache padrão: 60 segundos
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
});
```

### 2. Adicionando Interceptors

Você pode interceptar requisições para injetar cabeçalhos de autenticação e respostas para logging ou métricas:

```typescript
// Interceptor de Requisição (adiciona Token JWT)
api.addRequestInterceptor(async (config) => {
  const token = "meu-token-jwt";
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

// Interceptor de Resposta
api.addResponseInterceptor(async (response) => {
  console.log(`[HTTP] ${response.status} - ${response.url}`);
  return response;
});
```

### 3. Realizando Requisições (GET, POST, PUT, DELETE)

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// GET com tipagem
const user = await api.get<User>("/users/1");

// POST com corpo
const newUser = await api.post<User>("/users", {
  name: "Maria Silva",
  email: "maria@email.com",
});

// PUT com corpo
const updatedUser = await api.put<User>("/users/1", {
  name: "Maria S. Silva",
});

// DELETE
await api.delete("/users/1");
```

### 4. Query Params e Arrays

Parâmetros passados no objeto `params` são convertidos automaticamente em query string. Valores `null` e `undefined` são ignorados:

```typescript
const response = await api.get("/search", {
  params: {
    query: "typescript",
    page: 1,
    tags: ["node", "api"], // resulta em ?tags=node&tags=api
    filter: undefined,      // ignorado
  },
});
```

### 5. Cache em Memória (Apenas GET)

O cache armazena a resposta em memória com base na URL completa:

```typescript
const data = await api.get("/dados-estaticos", {
  useCache: true,
  cacheTTL: 30000, // 30 segundos de validade para esta requisição
});

// Para limpar o cache manualmente:
api.clearCache();
```

### 6. Telemetria e Métricas

É possível registrar uma função para capturar métricas de cada requisição (incluindo se a resposta veio do cache):

```typescript
const api = new HttpClient({
  baseURL: "https://api.exemplo.com",
  onTelemetry: (metrics) => {
    console.log(`URL: ${metrics.url}`);
    console.log(`Método: ${metrics.method}`);
    console.log(`Status: ${metrics.status}`);
    console.log(`Duração: ${metrics.durationMs}ms`);
    console.log(`Cache Hit: ${metrics.isCacheHit}`);
    console.log(`Timestamp: ${metrics.timestamp}`);
  },
});
```

### 7. Transformação de Resposta (`transformResponse`)

Útil para sanitização ou conversão de convenções de nomenclatura (ex: `snake_case` para `camelCase`):

```typescript
const response = await api.get("/usuario", {
  transformResponse: (data) => {
    return {
      id: data.user_id,
      nomeCompleto: data.full_name,
    };
  },
});
```

### 8. Tratamento de Erros com `HttpError`

Quando a resposta retorna um status fora da faixa 2xx (`!response.ok`), uma exceção `HttpError` é lançada contendo os dados retornados pelo servidor:

```typescript
import { HttpError } from "./errors/HttpError";

try {
  await api.get("/rota-inexistente");
} catch (error) {
  if (error instanceof HttpError) {
    console.error(`Status HTTP: ${error.status} ${error.statusText}`);
    console.error("Dados do erro retornados pela API:", error.data);
  } else {
    console.error("Erro inesperado:", error);
  }
}
```

---

## Opções de Configuração (`HttpClientConfig`)

A interface de configuração estende as opções padrão do `RequestInit` do Fetch API:

| Propriedade | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `baseURL` | `string` | `""` | URL base concatenada aos endpoints das requisições. |
| `timeout` | `number` | `10000` (10s) | Tempo máximo (em ms) antes de abortar a requisição. |
| `retries` | `number` | `0` | Quantidade máxima de tentativas em caso de erro retryable. |
| `retryDelay` | `number` | `1000` (1s) | Tempo base (em ms) para o cálculo do backoff exponencial (`baseDelay * 2^(attempt-1)`). |
| `useCache` | `boolean` | `false` | Se `true`, ativa o cache em memória para a requisição `GET`. |
| `cacheTTL` | `number` | `60000` (60s) | Tempo de vida do cache (em ms). |
| `params` | `Record<string, any>` | `undefined` | Objeto com os parâmetros de consulta (Query String). |
| `headers` | `HeadersInit` | JSON padrão | Cabeçalhos enviados nas requisições. |
| `onTelemetry` | `(metrics: TelemetryMetrics) => void` | `undefined` | Callback executado ao finalizar uma requisição com métricas de desempenho. |
| `transformResponse` | `(data: any) => any` | `undefined` | Função executada sobre o JSON de resposta antes de retorná-lo. |