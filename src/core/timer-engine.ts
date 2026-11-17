/**
 * Deterministic Timer Engine for Recipe Cooking Steps
 * Supports virtual time stepping (for instantaneous deterministic testing)
 * and real-time clock driving for browser execution.
 */

import type { ActiveTimer, TimerExpiredListener } from './types.ts';

export class TimerEngine {
  private timers: Map<string, ActiveTimer> = new Map();
  private expiredListeners: Set<TimerExpiredListener> = new Set();
  private intervalHandle: NodeJS.Timeout | number | null = null;

  constructor() {}

  /**
   * Starts a new timer or updates an existing one
   */
  startTimer(
    durationSeconds: number,
    label: string = 'Timer',
    stepIndex?: number,
    id: string = `timer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
  ): ActiveTimer {
    if (durationSeconds <= 0) {
      throw new Error(`Timer duration must be greater than zero. Received: ${durationSeconds}`);
    }

    const timer: ActiveTimer = {
      id,
      label,
      durationSeconds,
      remainingSeconds: durationSeconds,
      isPaused: false,
      stepIndex
    };

    this.timers.set(id, timer);
    return { ...timer };
  }

  /**
   * Pauses an active timer
   */
  pauseTimer(id: string): boolean {
    const timer = this.timers.get(id);
    if (!timer || timer.isPaused) return false;
    timer.isPaused = true;
    return true;
  }

  /**
   * Resumes a paused timer
   */
  resumeTimer(id: string): boolean {
    const timer = this.timers.get(id);
    if (!timer || !timer.isPaused) return false;
    timer.isPaused = false;
    return true;
  }

  /**
   * Cancels/removes a timer
   */
  cancelTimer(id: string): boolean {
    return this.timers.delete(id);
  }

  /**
   * Gets an active timer by id
   */
  getTimer(id: string): ActiveTimer | undefined {
    const timer = this.timers.get(id);
    return timer ? { ...timer } : undefined;
  }

  /**
   * Lists all active timers
   */
  getAllTimers(): ActiveTimer[] {
    return Array.from(this.timers.values()).map(t => ({ ...t }));
  }

  /**
   * Deterministic virtual clock step: Advances active timers by deltaSeconds
   * Returns list of timers that expired during this tick.
   */
  tick(deltaSeconds: number = 1): ActiveTimer[] {
    if (deltaSeconds <= 0) return [];

    const expired: ActiveTimer[] = [];

    for (const [id, timer] of this.timers.entries()) {
      if (timer.isPaused) continue;

      timer.remainingSeconds = Math.max(0, timer.remainingSeconds - deltaSeconds);

      if (timer.remainingSeconds === 0) {
        expired.push({ ...timer });
        this.timers.delete(id);
      }
    }

    for (const timer of expired) {
      this.notifyExpired(timer);
    }

    return expired;
  }

  /**
   * Subscribes to timer expiration events
   */
  onTimerExpired(listener: TimerExpiredListener): () => void {
    this.expiredListeners.add(listener);
    return () => this.expiredListeners.delete(listener);
  }

  private notifyExpired(timer: ActiveTimer) {
    for (const listener of this.expiredListeners) {
      try {
        listener(timer);
      } catch (err) {
        console.error('Error in TimerExpiredListener:', err);
      }
    }
  }

  /**
   * Starts a real-time interval (e.g., 1000ms ticks in browser environment)
   */
  startRealTimeClock(intervalMs: number = 1000): void {
    if (this.intervalHandle !== null) return;
    this.intervalHandle = setInterval(() => {
      this.tick(intervalMs / 1000);
    }, intervalMs);
  }

  /**
   * Stops real-time clock
   */
  stopRealTimeClock(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle as any);
      this.intervalHandle = null;
    }
  }

  /**
   * Clears all timers and stops real-time clock
   */
  reset(): void {
    this.stopRealTimeClock();
    this.timers.clear();
  }
}
