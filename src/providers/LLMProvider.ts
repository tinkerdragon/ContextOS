export interface CompleteRequest {
  apiKey: string;
  apiUrl?: string;
  model: string;
  prompt: string;
  maxTokens?: number;
}

export interface VisionCompleteRequest {
  apiKey: string;
  apiUrl?: string;
  model: string;
  prompt: string;
  imageDataUrl: string;
  maxTokens?: number;
}

export interface ConnectionTestRequest {
  apiKey: string;
  apiUrl?: string;
  model: string;
  maxTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  apiKey: string;
  apiUrl?: string;
  model: string;
  messages: ChatMessage[];
  onToken?: (token: string) => void;
  maxTokens?: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  status?: number;
  finishReason?: string;
  hasContent?: boolean;
  contentPreview?: string;
  error?: string;
  errorKind?: string;
}

export interface LLMProvider {
  readonly providerType: string;
  complete(request: CompleteRequest): Promise<string>;
  completeVision(request: VisionCompleteRequest): Promise<string>;
  chat(request: ChatRequest): Promise<string>;
  testConnection(request: ConnectionTestRequest): Promise<ConnectionTestResult>;
}
