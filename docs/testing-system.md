# Testing System Documentation

**Status:** Initial Setup Complete
**Framework:** Vitest 4.0.8
**Test Count:** 55 tests passing in ~355ms
**Coverage:** Phase 1 Version Streams architecture

---

## Why Testing Now?

The application reached sufficient maturity after completing Phase 1 of the Version Streams architecture:
- 15 API endpoints implemented
- Complex business logic (version management, mixer rebuild)
- No existing test coverage
- Need for regression safety during future refactoring

Previously, all testing was manual (curl commands). This was unsustainable.

---

## Framework Choice: Vitest

### Why Vitest Over Jest?

Despite Jest being the traditional choice with built-in Next.js integration (`next/jest`), we chose **Vitest**:

**Vitest Advantages:**
- ✅ Officially supported by Next.js (documented in Next.js 15 guides)
- ✅ **4x faster** than Jest (355ms vs ~1.5s for 55 tests)
- ✅ Native TypeScript support (zero config pain)
- ✅ Modern ESM support (critical for Next.js 15)
- ✅ Jest-compatible API (easy migration path)
- ✅ Better DX with superior error messages

**Trade-offs:**
- ❌ No `next/vitest` helper (manual config required)
- ❌ Slightly less mature ecosystem
- ✅ But faster, cleaner, and officially blessed by Next.js team

**Limitations (applies to BOTH Jest and Vitest):**
- Cannot test async React Server Components
- For those, use Playwright/Cypress for E2E tests

### Environment: Node (not jsdom)

We use `environment: "node"` because:
- All Phase 1 code is server-side (API routes, Redis, business logic)
- No React components tested yet (Phase 2)
- jsdom has ESM compatibility issues with current tooling
- Node environment is faster and simpler for backend testing

---

## Architecture

### Dependencies

**Core Testing:**
- `vitest` - Test runner
- `@vitejs/plugin-react` - React support (for future UI tests)
- `vite-tsconfig-paths` - Path alias resolution (@/ imports)

**Test Utilities:**
- `@testing-library/react` - Component testing (Phase 2)
- `@testing-library/dom` - DOM utilities
- `@testing-library/user-event` - User interaction simulation

**Mocking:**
- `msw@2` - Mock Service Worker (API mocking)
- `ioredis-mock` - In-memory Redis
- `@types/ioredis-mock` - Type definitions for ioredis-mock
- `@faker-js/faker` - Test data generation (not yet used)

### File Structure

```
src/
├── test/                          # Test infrastructure
│   ├── setup.ts                   # Global setup (MSW server)
│   ├── utils.ts                   # Test utilities (createMockRedis, etc.)
│   ├── fixtures/                  # Reusable test data
│   │   └── versions.ts
│   └── mocks/
│       ├── server.ts              # MSW server instance
│       └── handlers/
│           └── index.ts           # API mock handlers
│
├── lib/
│   ├── redis/
│   │   ├── versions.ts
│   │   └── __tests__/
│   │       └── versions.test.ts   # ✅ 30 tests
│   └── mixer/
│       ├── rebuilder.ts
│       └── __tests__/
│           └── rebuilder.test.ts  # ✅ 17 tests
│
└── app/
    └── api/
        └── ads/
            └── [id]/
                └── mixer/
                    └── rebuild/
                        ├── route.ts
                        └── __tests__/
                            └── route.test.ts  # ✅ 8 tests
```

### Configuration

**`vitest.config.mts`:**
- Node environment
- Global test utilities (`vi`, `expect`, etc.)
- Path aliases (@/ → src/)
- Coverage with v8 provider
- Setup file: `src/test/setup.ts`

**`package.json` scripts:**
```json
{
  "test": "vitest",              // Watch mode
  "test:run": "vitest run",      // CI mode (run once)
  "test:ui": "vitest --ui",      // Visual UI
  "test:coverage": "vitest run --coverage",
  "test:watch": "vitest watch"   // Explicit watch
}
```

---

## Test Coverage (55 tests)

### 1. Version Management (30 tests)
**File:** `src/lib/redis/__tests__/versions.test.ts`

**Covers:**
- ✅ Redis key builders (AD_KEYS)
- ✅ Version creation with auto-increment IDs (v1, v2, v3)
- ✅ Version retrieval (single, list, all with data)
- ✅ Active version management (get, set, switch)
- ✅ Version updates (immutability with exceptions)
- ✅ Version deletion (with active version protection)
- ✅ Ad metadata CRUD
- ✅ JSON serialization/deserialization
- ✅ Independent version sequences per stream

**Example test:**
```typescript
it("should auto-increment version IDs", async () => {
  const v1 = await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
  const v2 = await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
  const v3 = await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

  expect(v1).toBe("v1");
  expect(v2).toBe("v2");
  expect(v3).toBe("v3");
});
```

### 2. Mixer Rebuild Logic (17 tests)
**File:** `src/lib/mixer/__tests__/rebuilder.test.ts`

**Covers:**
- ✅ Union of all three streams (voices + music + sfx)
- ✅ Partial activation scenarios (voices only, music only, etc.)
- ✅ Empty mixer handling (no active versions)
- ✅ Track skipping when generatedUrls empty
- ✅ Multiple voice/sfx tracks
- ✅ Timeline calculation integration
- ✅ Version switching (activate v1, then v2)
- ✅ Redis persistence
- ✅ Track metadata preservation

**Example test:**
```typescript
it("should build mixer with voice, music, and sfx tracks", async () => {
  // Create and activate versions...
  const mixerState = await rebuildMixer(mockAdId);

  expect(mixerState.tracks).toHaveLength(3);
  expect(mixerState.tracks[0].type).toBe("voice");
  expect(mixerState.tracks[1].type).toBe("music");
  expect(mixerState.tracks[2].type).toBe("soundfx");
});
```

**⚠️ Refactoring Risk:**
Tests that verify exact timeline calculations may break when `LegacyTimelineCalculator` is replaced or mixer becomes editable.

### 3. API Integration (8 tests)
**File:** `src/app/api/ads/[id]/mixer/rebuild/__tests__/route.test.ts`

**Covers:**
- ✅ POST /api/ads/[id]/mixer/rebuild success
- ✅ Empty mixer handling
- ✅ Response structure validation
- ✅ Calculated timeline in response
- ✅ Error handling (500 status)
- ✅ Multi-ad isolation
- ✅ Redis persistence verification

**Example test:**
```typescript
it("should rebuild mixer successfully with active versions", async () => {
  // Setup versions...
  const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
    method: "POST",
  });
  const params = Promise.resolve({ id: mockAdId });

  const response = await POST(request, { params });

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.tracks).toHaveLength(2);
});
```

### What's NOT Tested Yet

- ❌ Other 12 API endpoints (voices, music, sfx CRUD)
- ❌ UI components (Phase 2 - VersionAccordion, etc.)
  - Note: Build errors revealed a bug in `SfxVersionContent.tsx` where `SoundFxPlacementIntent` objects were being rendered directly in JSX (fixed)
- ❌ LLM integration (OpenAI script generation)
- ❌ Audio provider integrations (ElevenLabs, Lovo, Loudly, Mubert)
- ❌ Blob storage uploads
- ❌ Async Server Components (requires E2E tests)

---

## Running Tests

### Development

```bash
# Watch mode (recommended during development)
pnpm test

# Run once (for quick check)
pnpm test:run

# Visual UI (great for debugging)
pnpm test:ui

# With coverage report
pnpm test:coverage

# Type-check tests (catches type errors in test files)
pnpm build
```

**Note:** The build process type-checks all files including tests, catching type errors that Vitest might not surface. Run `pnpm build` after adding or modifying tests to ensure type safety.

### Expected Output

```
✓ src/lib/redis/__tests__/versions.test.ts (30 tests) 24ms
✓ src/lib/mixer/__tests__/rebuilder.test.ts (17 tests) 27ms
✓ src/app/api/ads/[id]/mixer/rebuild/__tests__/route.test.ts (8 tests) 22ms

Test Files  3 passed (3)
     Tests  55 passed (55)
  Start at  20:58:26
  Duration  355ms
```

### CI/CD Integration (Future)

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:run
      - run: pnpm test:coverage
```

---

## Writing New Tests

### Pattern: Unit Test

**Location:** Co-located with source file in `__tests__/` directory

```typescript
// src/lib/mymodule/__tests__/myfunction.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { myFunction } from "../myfunction";
import { createMockRedis } from "@/test/utils";

// Mock dependencies
vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
}));

let mockRedis: ReturnType<typeof createMockRedis>;

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall(); // Clear between tests
});

describe("myFunction", () => {
  it("should do something", async () => {
    // Arrange
    const input = "test";

    // Act
    const result = await myFunction(input);

    // Assert
    expect(result).toBe("expected");
  });
});
```

### Pattern: API Route Test

```typescript
import { POST } from "../route";

it("should return 200 with valid data", async () => {
  const request = new Request("http://localhost:3003/api/test", {
    method: "POST",
    body: JSON.stringify({ data: "test" }),
  });
  const params = Promise.resolve({ id: "test-id" });

  const response = await POST(request, { params });

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("result");
});
```

### Using Fixtures

```typescript
import {
  mockAdId,
  mockVoiceVersionDraft,
  mockVoiceTrack,
} from "@/test/fixtures/versions";

it("should use fixtures", async () => {
  await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
  // ...
});
```

**Type Safety Notes:**
- **Language codes:** Use normalized base codes (`"en"`, `"es"`, `"de"`) not region-specific codes (`"en-US"`, `"es-MX"`). The `Language` type from `@/utils/language` only accepts normalized codes.
- **MusicPrompts structure:** Must include all three provider fields (`loudly`, `mubert`, `elevenlabs`) as strings, not generic fields like `genre` or `mood`.
- **Voice properties:** Only include properties defined in the `Voice` type. Provider-specific fields like `model` don't belong in the base Voice object.

When creating new fixtures, verify against type definitions to avoid build errors.

### Mocking External APIs (MSW)

MSW handlers are in `src/test/mocks/handlers/index.ts`:

```typescript
// Already mocked:
// - OpenAI chat completions
// - ElevenLabs TTS
// - Lovo TTS
// - Loudly music generation
// - Mubert music generation
// - Vercel Blob uploads

// To add new mocks:
export const myApiHandlers = [
  http.post("https://api.example.com/endpoint", () => {
    return HttpResponse.json({ success: true });
  }),
];

export const handlers = [
  ...openAIHandlers,
  ...myApiHandlers, // Add here
];
```

### Mock Redis

```typescript
import { createMockRedis } from "@/test/utils";

const mockRedis = createMockRedis();

// Supports:
await mockRedis.set("key", "value");
await mockRedis.get("key");
await mockRedis.lpush("list", "item");
await mockRedis.lrange("list", 0, -1);
await mockRedis.flushall(); // Clear all data
```

---

## Maintenance Notes

### Tests Likely to Break During Refactoring

**Timeline Calculation Tests:**
- Any test asserting exact `calculatedTracks` structure
- Tests checking `totalDuration` values
- Tests verifying `startTime` positions

**Why:** `LegacyTimelineCalculator` is planned for replacement. Mixer will become editable.

**Safe to Keep:**
- Tests verifying tracks EXIST (not exact timing)
- Tests checking track types and metadata
- Tests ensuring mixer state persists

### Tests Safe from Refactoring

**Core Infrastructure:**
- Version CRUD operations
- Active version pointers
- Ad metadata management
- Redis key patterns
- Version auto-increment logic

**Why:** These are architectural foundations unlikely to change.

### When to Add Tests

**Always test:**
- New API endpoints
- New business logic functions
- Complex algorithms
- Data transformations

**Consider skipping:**
- Simple getters/setters
- Pure UI components (test with E2E instead)
- Temporary/experimental features
- Code marked for deprecation

### Test Maintenance Philosophy

> "Tests document behavior, but too many fragile tests create friction. Focus on testing contracts (inputs/outputs) rather than implementation details."

**Good test:** "Creating a version returns a version ID"
**Fragile test:** "The version ID is formatted as 'v' + timestamp.toString()"

---

## Next Steps

### Phase 2: UI Component Testing

When building VersionAccordion and other React components:
1. Switch to `jsdom` environment for those test files
2. Use `@testing-library/react` for component tests
3. Test user interactions, not implementation

### Phase 3: E2E Testing

For full user flows and async Server Components:
1. Add Playwright
2. Test critical paths (create ad → generate → mix → export)
3. Test error recovery flows

### Coverage Targets

**Current:** ~40% (55 tests, Phase 1 only)
**Goal:** 60-70% by Phase 3

**Priority areas:**
- Remaining API endpoints (12 routes)
- Provider integrations (with mocks)
- Error handling paths
- Edge cases in timeline calculation

### CI/CD Integration

1. Add GitHub Actions workflow
2. Run tests on every PR
3. Block merges if tests fail
4. Generate coverage reports
5. Consider: Fail if coverage drops below threshold

---

## References

- **Next.js Testing Docs:** https://nextjs.org/docs/app/building-your-application/testing/vitest
- **Vitest Docs:** https://vitest.dev/
- **MSW Docs:** https://mswjs.io/
- **Testing Library:** https://testing-library.com/

---

## Common Issues

### Build Errors After Adding Tests

If `pnpm build` fails with type errors in test files:

1. **Language type errors:** Use normalized codes (`"en"`) not regional (`"en-US"`)
2. **Missing type definitions:** Install `@types/package-name` if needed
3. **Mock data mismatch:** Verify fixtures match current type definitions
4. **Clean build cache:** Run `rm -rf .next && pnpm build` if stale cache causes false errors

The build process is stricter than Vitest's runtime checks, so always run it before committing.

---

**Last Updated:** 2025-01-12
**Test Count:** 55 passing
**Duration:** ~355ms
**Framework:** Vitest 4.0.8
