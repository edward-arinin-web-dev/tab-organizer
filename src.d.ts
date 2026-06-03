declare module '*.css';

// ---------------------------------------------------------------------------
// Chrome built-in AI — ambient declarations.
// These are Web Platform APIs (not chrome.*), not covered by chrome-types.
// Trimmed to the surface we actually call. See:
// https://developer.chrome.com/docs/ai/prompt-api
// https://developer.chrome.com/docs/ai/summarizer-api
// ---------------------------------------------------------------------------

type AiAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface AiExpectedIo {
  type: 'text';
  languages?: string[];
}

interface LanguageModelMonitor extends EventTarget {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: { loaded: number }) => void,
  ): void;
}

interface LanguageModelCreateOptions {
  initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
  monitor?: (m: LanguageModelMonitor) => void;
  expectedInputs?: AiExpectedIo[];
  expectedOutputs?: AiExpectedIo[];
}

interface LanguageModelPromptOptions {
  responseConstraint?: object;
  signal?: AbortSignal;
}

interface LanguageModelSession {
  prompt(input: string, opts?: LanguageModelPromptOptions): Promise<string>;
  promptStreaming(input: string, opts?: LanguageModelPromptOptions): AsyncIterable<string>;
  clone(opts?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
  readonly inputUsage: number;
  readonly inputQuota: number;
}

interface LanguageModelParams {
  defaultTemperature: number;
  defaultTopK: number;
  maxTopK: number;
}

interface LanguageModelGlobal {
  availability(opts?: {
    expectedInputs?: AiExpectedIo[];
    expectedOutputs?: AiExpectedIo[];
  }): Promise<AiAvailability>;
  create(opts?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  params(): Promise<LanguageModelParams>;
}

interface SummarizerCreateOptions {
  type?: 'tldr' | 'key-points' | 'teaser' | 'headline';
  format?: 'markdown' | 'plain-text';
  length?: 'short' | 'medium' | 'long';
  sharedContext?: string;
  expectedInputLanguages?: string[];
  outputLanguage?: string;
  monitor?: (m: LanguageModelMonitor) => void;
  signal?: AbortSignal;
}

interface SummarizerSession {
  summarize(input: string, opts?: { context?: string; signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface SummarizerGlobal {
  availability(opts?: SummarizerCreateOptions): Promise<AiAvailability>;
  create(opts?: SummarizerCreateOptions): Promise<SummarizerSession>;
}

declare const LanguageModel: LanguageModelGlobal | undefined;
declare const Summarizer: SummarizerGlobal | undefined;
