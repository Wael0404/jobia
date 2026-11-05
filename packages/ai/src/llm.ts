import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";

export type Effort = "low" | "medium" | "high";

export interface LlmConfig {
  apiKey?: string;
  model: string;
}

export class LlmRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Model declined the request (category: ${category ?? "unknown"})`);
  }
}

export class LlmOutputError extends Error {}

/**
 * Thin, typed wrapper around the Anthropic Messages API used by every AI
 * capability of the agent. It centralises:
 *  - structured outputs (Zod schema → validated object, no JSON parsing by hand)
 *  - server-side refusal fallback (`fallbacks: "default"`)
 *  - stop-reason handling
 *
 * Retries on 429/5xx are handled by the SDK (`maxRetries`), and by BullMQ at
 * the job level for anything longer.
 */
export class Llm {
  private readonly client: Anthropic;

  constructor(private readonly config: LlmConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, maxRetries: 3, timeout: 120_000 });
  }

  async structured<S extends z.ZodType>(args: {
    system: string;
    content: BetaContentBlockParam[];
    schema: S;
    effort: Effort;
    maxTokens?: number;
  }): Promise<z.infer<S>> {
    const response = await this.client.beta.messages.parse({
      model: this.config.model,
      max_tokens: args.maxTokens ?? 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: args.content }],
      output_config: { effort: args.effort, format: betaZodOutputFormat(args.schema) },
    });

    if (response.stop_reason === "refusal") {
      throw new LlmRefusalError(response.stop_details?.category ?? null);
    }
    if (response.stop_reason === "max_tokens") {
      throw new LlmOutputError("Model output was truncated (max_tokens)");
    }
    if (response.parsed_output == null) {
      throw new LlmOutputError("Model output did not match the expected schema");
    }
    return response.parsed_output as z.infer<S>;
  }
}

/**
 * Wraps untrusted third-party text (job descriptions, recruiter emails)
 * so the model treats it as data, never as instructions.
 */
export function untrusted(tag: string, text: string): string {
  const safe = text.replaceAll(`</${tag}>`, `</ ${tag}>`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}
