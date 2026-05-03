// Factory for model-provider workers. Server.ts calls createWorker() with a
// provider name; the factory dispatches to the right concrete class. Adding a
// new provider = add a class implementing Worker + a case here.
//
// Phase 1 (this file): only "claude" is wired. OpenRouter and Codex slot in
// behind feature flags as their workers land.

import { AgentWorker, type AgentWorkerInit, type Worker } from "./agent-worker.ts";
import { OpenRouterWorker } from "./openrouter-worker.ts";

export type Provider = "claude" | "codex" | "openrouter";

export function createWorker(provider: Provider, init: AgentWorkerInit): Worker {
  switch (provider) {
    case "claude":
      return new AgentWorker(init);
    case "openrouter":
      return new OpenRouterWorker(init);
    case "codex":
      throw new Error("codex provider not yet implemented (M-MultiModel phase 3)");
    default: {
      // Exhaustive-check guard: TS will error here if a new Provider value is added without a case.
      const _exhaustive: never = provider;
      throw new Error(`unknown provider: ${String(_exhaustive)}`);
    }
  }
}
