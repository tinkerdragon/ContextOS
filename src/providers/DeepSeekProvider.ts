import { ChatRequest, CompleteRequest, VisionCompleteRequest } from "./LLMProvider";
import { BaseOpenAICompatibleProvider, BaseProviderOptions, HttpClient, defaultHttpClient } from "./BaseOpenAICompatibleProvider";

const DEFAULT_DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

export class DeepSeekProvider extends BaseOpenAICompatibleProvider {
  readonly providerType = "deepseek";
  get defaultApiUrl(): string { return DEFAULT_DEEPSEEK_API_URL; }

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
}
