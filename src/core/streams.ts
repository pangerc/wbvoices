/**
 * Converts an async iterator into a JSON array stream.
 *
 * The resulting stream emits a valid JSON array incrementally,
 * allowing large datasets to be streamed without buffering the
 * entire payload in memory.
 *
 * Example output:
 * ```json
 * [{"id":1},{"id":2},{"id":3}]
 * ```
 *
 * @typeParam T - The type yielded by the async iterator.
 *
 * @param iterator - An async generator producing serializable values.
 *
 * @returns A {@link ReadableStream} emitting UTF-8 encoded JSON chunks.
 */
export function iteratorToJsonTextEncodedStream<T>(
  iterator: AsyncGenerator<T, void, unknown>,
): ReadableStream<Uint8Array> {
  /**
   * Encodes string chunks into UTF-8 byte arrays
   * required by `ReadableStream`.
   */
  const encoder = new TextEncoder();

  /**
   * Tracks whether the next emitted value is the first
   * item in the JSON array.
   */
  let start = true;

  /**
   * Tracks whether at least one item has been streamed.
   * Used to determine whether to emit `[]` or close
   * an existing array with `]`.
   */
  let sent = false;

  return new ReadableStream({
    /**
     * Pulls the next value from the iterator whenever
     * the stream consumer requests more data.
     */
    async pull(controller) {
      const { value, done } = await iterator.next();

      /**
       * Finalize the JSON array when iteration completes.
       */
      if (done) {
        if (sent) {
          /**
           * Close a non-empty JSON array.
           */
          controller.enqueue(encoder.encode("]"));
        } else {
          /**
           * Emit an empty JSON array if no values
           * were produced.
           */
          controller.enqueue(encoder.encode("[]"));
        }

        controller.close();
        return;
      }

      /**
       * Emit the first item with the opening array bracket.
       */
      if (start) {
        controller.enqueue(encoder.encode("[" + JSON.stringify(value)));

        start = false;
      } else {
        /**
         * Emit subsequent items prefixed with a comma
         * to maintain valid JSON array syntax.
         */
        controller.enqueue(encoder.encode("," + JSON.stringify(value)));
      }

      sent = true;
    },

    /**
     * Ensures the underlying iterator is properly cleaned up
     * if the stream consumer cancels the stream early.
     */
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Drains an async generator, collecting every yielded value into an array.
 * Awaits the generator to completion, so only use on finite streams.
 */
export async function toArray<T>(
  iterator: AsyncGenerator<T, void, unknown>,
): Promise<Array<T>> {
  const items: T[] = [];

  for await (const item of iterator) {
    items.push(item);
  }

  return items;
}

/**
 * Convenience accessors layered on top of an async generator: collect every
 * value into an array, or expose it as a JSON-encoded byte stream.
 */
type Normalized<TData, TStreamData> = {
  stream: () => ReadableStream<TStreamData>;
  toArray: () => Promise<Array<TData>>;
};

/**
 * An async generator augmented with the {@link Normalized} accessors, so a
 * single value can be consumed either by iteration, as an array, or as a
 * stream.
 */
export type NormalizedAsyncInterator<TData, TStreamData> = AsyncGenerator<
  TData,
  void,
  unknown
> &
  Normalized<TData, TStreamData>;

/**
 * Wraps an async generator so it also exposes `toArray` and `stream`. The
 * underlying generator is shared across all three consumption modes, so it
 * can only be drained once — pick one.
 */
export function toNormalizedAsyncIterator<TData>(
  iterator: AsyncGenerator<TData, void, unknown>,
): NormalizedAsyncInterator<TData, Uint8Array<ArrayBufferLike>> {
  return {
    // Spread keeps the generator's own iteration protocol intact.
    ...iterator,
    toArray: () => toArray(iterator),
    stream: () => iteratorToJsonTextEncodedStream(iterator),
  };
}
