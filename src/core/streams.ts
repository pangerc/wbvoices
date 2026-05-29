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

export type SimpleAsyncGenerator<T> = AsyncGenerator<T, void, unknown>;

export type Streamable<T> = {
  stream: () => ReadableStream<T>;
};

export type StreamableAsyncIterator<TData, TStreamData> =
  SimpleAsyncGenerator<TData> & Streamable<TStreamData>;

export function toStreamableAsyncIterator<TData>(
  getIterator: () => SimpleAsyncGenerator<TData>,
): StreamableAsyncIterator<TData, Uint8Array<ArrayBufferLike>> {
  const iterator = getIterator();

  return {
    ...iterator,
    stream: () => iteratorToJsonTextEncodedStream(iterator),
  };
}
