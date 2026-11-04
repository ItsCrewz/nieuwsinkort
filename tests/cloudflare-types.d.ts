import type { DurableObjectStorage as WorkerStorage } from "@cloudflare/workers-types";

declare global {
  type DurableObjectStorage = WorkerStorage;
}
