/**
 * A container type that safely wraps potentially nullable events while
 * maintaining type safety and avoiding ambiguous null checks.
 */
type EventContainer<T> = { hasEvent: true; event: T } | { hasEvent: false };

/**
 * Debounces events of type T, ensuring they are delivered at most once every
 * `delayInMs` milliseconds. If events arrive more frequently, only the most
 * recent event within each time window is delivered.
 *
 * Features:
 * - Events are delivered at most once every `delayInMs` milliseconds
 * - New events during the delay replace previous ones
 * - Handles all values of T including null/undefined as valid events
 * - Provides flush() method for immediate delivery
 *
 * @template T - The type of event being debounced
 */
export class Debouncer<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingEvent: EventContainer<T> = { hasEvent: false };

  /**
   * Creates a new Debouncer instance.
   *
   * @param delayInMs - Minimum time (in milliseconds) between event deliveries
   * @param onSend - Callback function that receives the debounced events
   */
  constructor(
    private readonly delayInMs: number,
    private readonly onSend: (event: T) => void
  ) {}

  /**
   * Queues an event for debounced delivery. If the delay timer isn't running,
   * starts it. Otherwise, updates the pending event without resetting the timer.
   *
   * @param event - The event to deliver after the delay (can be any value of T)
   */
  public debounce(event: T): void {
    this.pendingEvent = { hasEvent: true, event };

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.sendEvent();
      }, this.delayInMs);
    }
  }

  /**
   * Immediately delivers any pending event and clears the timer.
   * Useful when you need to ensure delivery before the delay expires.
   */
  public flush(): void {
    this.clearTimer();
    if (this.pendingEvent.hasEvent) {
      this.sendEvent();
    }
  }

  /**
   * Internal method to deliver the event and reset internal state.
   * Handles error catching and state cleanup.
   */
  private sendEvent(): void {
    const container = this.pendingEvent;
    this.pendingEvent = { hasEvent: false };
    this.clearTimer();

    if (container.hasEvent) {
      try {
        this.onSend(container.event);
      } catch (error) {
        console.error('Error in debounced callback:', error);
      }
    }
  }

  /**
   * Clears any active timer and resets timer state.
   */
  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
