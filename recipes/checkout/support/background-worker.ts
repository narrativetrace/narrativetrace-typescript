// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/background-worker.ts
import { EventEmitter, once } from "node:events";

/**
 * A long-lived worker started before any request, which runs the jobs it is handed in the
 * asynchronous scope it was started in — the shape of a queue consumer, a connection pool's callback
 * or an event-driven worker.
 *
 * INTENT: the "no handover" half of documentation/recipes/follow-a-flow-across-threads.md. A job
 * handed to this worker travels as a closure and nothing else: it runs in the worker's own scope,
 * not the scope of the request that submitted it, so the request's trace does not come with it.
 *
 * @llmNote The worker waits on an event emitter it created at start-up. A promise continues in the
 * scope that awaited it, so the job resumes in the worker's scope whoever emits — which is exactly
 * what makes this a faithful stand-in for a worker thread, a timer owned by a pool or a consumer
 * loop, and why a plain `await` of the job's result inside the request does not change that.
 */
export class BackgroundWorker {
  private readonly inbox = new EventEmitter();
  private readonly stopped = new AbortController();
  private readonly serving: Promise<void>;

  constructor() {
    this.serving = this.serve();
  }

  /** Hands `job` to the worker and resolves with its result once the worker has run it. */
  run<T>(job: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.inbox.emit("job", () => Promise.resolve().then(job).then(resolve, reject));
    });
  }

  async stop(): Promise<void> {
    this.stopped.abort();
    await this.serving;
  }

  private async serve(): Promise<void> {
    try {
      for (;;) {
        const [job] = (await once(this.inbox, "job", { signal: this.stopped.signal })) as [
          () => Promise<void>,
        ];
        await job();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") throw error;
    }
  }
}
