import { ChatRequest, CompleteRequest, ConnectionTestRequest, ConnectionTestResult, VisionCompleteRequest } from "./LLMProvider";
import { BaseOpenAICompatibleProvider, BaseProviderOptions, HttpClient, defaultHttpClient, parseOpenAIResponse } from "./BaseOpenAICompatibleProvider";

const DEFAULT_OLLAMA_API_URL = "http://localhost:11434/v1/chat/completions";

export class OllamaProvider extends BaseOpenAICompatibleProvider {
  readonly providerType = "ollama";
  get defaultApiUrl(): string { return DEFAULT_OLLAMA_API_URL; }

  constructor(httpClient: HttpClient = defaultHttpClient, options: BaseProviderOptions = {}) {
    super(httpClient, options);
  }

  async complete(request: CompleteRequest): Promise<string> {
    return this.completeMessages(
      request.apiKey, request.apiUrl || this.defaultApiUrl, request.model,
      [
        { role: "system", content: "You are a careful ContextOS maintainer. Return strict JSON only." },
        { role: "user", content: request.prompt }
      ], true, request.maxTokens
    );
  }

  async completeVision(request: VisionCompleteRequest): Promise<string> {
    return this.completeMessages(
      request.apiKey, request.apiUrl || this.defaultApiUrl, request.model,
      [
        { role: "system", content: "You transcribe visible text from document images. Return plain text only." },
        {
          role: "user",
          content: [
            { type: "text", text: request.prompt },
            { type: "image_url", image_url: { url: request.imageDataUrl } }
          ]
        }
      ], false, request.maxTokens
    );
  }

  async chat(request: ChatRequest): Promise<string> {
    return this.completeMessages(
      request.apiKey, request.apiUrl || this.defaultApiUrl, request.model,
      request.messages, false, request.maxTokens, request.onToken
    );
  }

  async testConnection(request: ConnectionTestRequest): Promise<ConnectionTestResult> {
    try {
      const apiUrl = request.apiUrl || this.defaultApiUrl;
      const body: Record<string, unknown> = {
        model: request.model,
        messages: [{ role: "user", content: "ping" }]
      };
      const maxTokens = request.maxTokens;
      if (maxTokens && maxTokens > 0) body["max_tokens"] = maxTokens;
      const response = await this.withTimeout(this.httpClient({
        url: apiUrl,
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        }
      }));
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, status: response.status, error: `${response.status} ${response.text}`, errorKind: "connection" };
      }
      const parsed = parseOpenAIResponse(response.text);
      const choice = parsed.choices?.[0];
      const content = choice?.message?.content;
      const finishReason = choice?.finish_reason;
      const hasContent = typeof content === "string" && content.trim().length > 0;
      return {
        ok: hasContent,
        status: response.status,
        finishReason,
        hasContent,
        contentPreview: typeof content === "string" ? content.slice(0, 200) : undefined,
        error: hasContent ? undefined : `No content returned (finish_reason: ${finishReason ?? "missing"})`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message, errorKind: "connection" };
    }
  }
}
