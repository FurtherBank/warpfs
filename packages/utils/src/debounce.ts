/**
 * Debounced write: collapses rapid consecutive writes into a single call.
 * macOS save can trigger multiple PUT requests in quick succession.
 */
export interface DebounceHandle<T> {
  /** Push a new value; the actual flush will happen after the quiet period. */
  push(value: T): Promise<void>;
  /** Force immediate flush of the pending value. */
  flush(): Promise<void>;
  /** Cancel any pending debounce timer. */
  cancel(): void;
}

export function createDebouncedWrite<T>(
  writeFn: (value: T) => Promise<void>,
  delayMs: number,
): DebounceHandle<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | undefined;
  let resolveQueue: Array<() => void> = [];
  let rejectQueue: Array<(err: unknown) => void> = [];

  async function doFlush() {
    if (pending === undefined) return;
    const value = pending;
    pending = undefined;
    const currentResolves = resolveQueue;
    const currentRejects = rejectQueue;
    resolveQueue = [];
    rejectQueue = [];
    try {
      await writeFn(value);
      currentResolves.forEach((r) => r());
    } catch (err) {
      currentRejects.forEach((r) => r(err));
    }
  }

  return {
    push(value: T): Promise<void> {
      pending = value;
      if (timer) clearTimeout(timer);
      return new Promise<void>((resolve, reject) => {
        resolveQueue.push(resolve);
        rejectQueue.push(reject);
        timer = setTimeout(() => {
          timer = null;
          doFlush();
        }, delayMs);
      });
    },

    async flush(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await doFlush();
    },

    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = undefined;
      resolveQueue = [];
      rejectQueue = [];
    },
  };
}

/**
 * Decorator-style factory: wraps a class method with debounced writes.
 */
export function DebounceWrite(delayMs: number) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(content: Buffer) => Promise<void>>,
  ) {
    const original = descriptor.value!;
    let handle: DebounceHandle<Buffer> | null = null;

    descriptor.value = async function (this: unknown, content: Buffer) {
      if (!handle) {
        handle = createDebouncedWrite((buf: Buffer) => original.call(this, buf), delayMs);
      }
      return handle.push(content);
    };

    return descriptor;
  };
}
