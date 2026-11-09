export interface LlmRequest {
  system: string;
  prompt: string;
  /** Ask the provider to return a JSON object. */
  json?: boolean;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  provider: string;
  model: string;
}

export interface LlmProvider {
  name: string;
  model: string;
  generate(req: LlmRequest): Promise<LlmResponse>;
}

export type FetchLike = typeof fetch;

export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
