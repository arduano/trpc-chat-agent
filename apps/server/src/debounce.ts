/**
 * A Debouncer class that ensures:
 *  - Events are delivered at most once every `delayInMs` milliseconds.
 *  - If a new event arrives within the delay, the new event replaces the old event.
 *  - If no new event arrives within the delay, the current event is delivered exactly after `delayInMs`.
 *  - A `flush()` method to immediately deliver the pending event (if any) without duplication or re-sending.
 */
export class Debouncer<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentEvent: T | null = null;

  /**
   * @param delayInMs  The debounce delay in milliseconds
   * @param onSend     Callback function to send the event
   */
  constructor(
    private readonly delayInMs: number,
    private readonly onSend: (event: T) => void
  ) {}

  /**
   * Receives an event and schedules it for sending after the debounce delay.
   * If another event is received during the waiting time, it replaces the old event.
   */
  public debounce(event: T): void {
    this.currentEvent = event;

    this.clearTimer();

    // Schedule a new send
    this.timer = setTimeout(() => {
      this.sendEvent();
    }, this.delayInMs);
  }

  /**
   * Immediately sends the current pending event (if any), and clears the timer.
   * After flushing, the event won't be resent automatically.
   */
  public flush(): void {
    this.clearTimer();

    // Only send if there is an event queued
    if (this.currentEvent != null) {
      this.sendEvent();
    }
  }

  /**
   * Helper method to send the event if available.
   */
  private sendEvent(): void {
    if (this.currentEvent != null) {
      try {
        this.onSend(this.currentEvent);
      } catch (error) {
        console.error(error);
      }
      this.currentEvent = null;
    }
    this.clearTimer();
  }

  /**
   * Clears the current timer.
   */
  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
