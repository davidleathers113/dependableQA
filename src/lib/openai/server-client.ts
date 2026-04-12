import OpenAI from "openai";

function asString(value: string | undefined) {
  return value?.trim() ?? "";
}

export interface OpenAiServerConfig {
  apiKey: string;
  webhookSecret: string | null;
  transcriptionModel: string;
  analysisModel: string;
  analysisFallbackModel: string;
  analysisPromptVersion: string;
  analysisSchemaVersion: string;
}

let cachedClient: OpenAI | null = null;

export function getOpenAiServerConfig(): OpenAiServerConfig {
  const env = typeof process !== "undefined" ? process.env : {};
  const apiKey = asString(env.OPENAI_API_KEY);

  if (!apiKey) {
    throw new Error("Missing OpenAI server configuration. Set OPENAI_API_KEY.");
  }

  return {
    apiKey,
    webhookSecret: asString(env.OPENAI_WEBHOOK_SECRET) || null,
    transcriptionModel: asString(env.OPENAI_TRANSCRIPTION_MODEL) || "gpt-4o-transcribe-diarize",
    analysisModel: asString(env.OPENAI_ANALYSIS_MODEL) || "gpt-4.1-mini",
    analysisFallbackModel: asString(env.OPENAI_ANALYSIS_FALLBACK_MODEL) || "gpt-4.1",
    analysisPromptVersion: asString(env.OPENAI_ANALYSIS_PROMPT_VERSION) || "v1",
    analysisSchemaVersion: asString(env.OPENAI_ANALYSIS_SCHEMA_VERSION) || "v1",
  };
}

export function getOpenAiClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getOpenAiServerConfig();
  cachedClient = new OpenAI({
    apiKey: config.apiKey,
    webhookSecret: config.webhookSecret ?? undefined,
  });

  return cachedClient;
}
