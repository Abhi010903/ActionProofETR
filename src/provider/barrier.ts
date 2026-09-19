/**
 * ActionProof Synchronization Barrier
 *
 * WHAT it guarantees:
 * - Deterministic, non-timing-dependent hook point between verification and pre-forward recheck.
 * - Enables exact simulation of post-verification mutations without setTimeout(), sleep(), or race conditions.
 *
 * WHAT it does NOT guarantee:
 * - In production, barriers default to a no-op; it is a hook for rigorous test invariants.
 */

export type SynchronizationBarrier = (liveRequest: Record<string, unknown>) => Promise<void> | void;

export class DeterministicBarrier {
  private reachedPromise: Promise<void>;
  private resolveReached!: () => void;
  private releasePromise: Promise<void>;
  private resolveRelease!: () => void;

  constructor() {
    this.reachedPromise = new Promise((resolve) => {
      this.resolveReached = resolve;
    });
    this.releasePromise = new Promise((resolve) => {
      this.resolveRelease = resolve;
    });
  }

  /**
   * Called by the proxy/barrier hook when verification completes and pauses before pre-forward recheck.
   */
  async arrive(): Promise<void> {
    this.resolveReached();
    await this.releasePromise;
  }

  /**
   * Called by test runner to wait deterministically until verification has paused at the barrier.
   */
  async waitUntilReached(): Promise<void> {
    await this.reachedPromise;
  }

  /**
   * Called by test runner after mutating the live transaction to allow execution to proceed to pre-forward recheck.
   */
  release(): void {
    this.resolveRelease();
  }
}
