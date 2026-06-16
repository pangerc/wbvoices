import { NextResponse } from "next/server";
import {
  iteratorToJsonTextEncodedStream,
  NormalizedAsyncInterator,
} from "./streams";

/**
 * A specialized JSON response class for streaming JSON payloads
 * in Next.js route handlers.
 *
 * Extends {@link NextResponse} and automatically applies the
 * `application/json` content type while preserving any custom
 * response configuration.
 */
export class NextJSONResponseFromStream extends NextResponse {
  /**
   * Creates a new streaming JSON response.
   *
   * @param stream - A readable stream containing UTF-8 encoded JSON chunks.
   * @param init - Optional response (see {@link RequestInit}) configuration such as status, headers, etc.
   */
  constructor(
    bodyInit:
      | ReadableStream<Uint8Array<ArrayBufferLike>>
      | NormalizedAsyncInterator<unknown, Uint8Array<ArrayBufferLike>>,
    init?: ResponseInit,
  ) {
    let stream =
      bodyInit instanceof ReadableStream ? bodyInit : bodyInit.stream();

    super(stream, {
      ...init,
      headers: {
        ...init?.headers,
        /**
         * Ensures the response is interpreted as JSON.
         */
        "Content-Type": "application/json",
      },
    });
  }
}

export class NextJSONResponseFromIterator<
  T,
> extends NextJSONResponseFromStream {
  constructor(bodyInit: AsyncGenerator<T, void, unknown>, init?: ResponseInit) {
    super(iteratorToJsonTextEncodedStream(bodyInit), init);
  }
}
