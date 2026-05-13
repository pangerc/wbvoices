/**
 * Global test setup
 * Runs before all tests
 */

import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
});

// Suppress console errors in tests (optional)
// global.console = {
//   ...console,
//   error: vi.fn(),
// };
