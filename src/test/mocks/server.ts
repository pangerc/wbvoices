/**
 * MSW (Mock Service Worker) server setup
 * Intercepts HTTP requests in tests
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
