# Iterative Revolution: From One-Shot to Iterative Refinement

**Status**: Architecture Design
**Author**: Architecture Review
**Date**: 2025-01-27
**Target Version**: v2.0

## Executive Summary

### The Problem

Our current voice ad generation platform operates on a "one-shot" model:
1. User fills out BriefPanel with all requirements
2. Clicks "Generate" and gets voices + music + sound effects
3. If anything is wrong, the user must understand the entire system to iterate

This creates a steep learning curve and frustrates users who aren't familiar with the tool. Common pain points:

- **Love music, hate voices** → Need to recast but unclear how
- **Like everything but voices aren't happy enough** → Need better emotional tagging
- **Keep voices and music but make script shorter** → Text editing feels disconnected
- **Just change the music** → Regenerating everything is overkill

### The Solution

Transform the platform into an **iterative refinement system** where users:
1. Generate initial content (existing flow remains)
2. Use natural language to request changes ("make the voices happier", "shorten to 45 seconds")
3. Preview iterations before committing
4. Choose which iteration to add to the master mix

The LLM interprets user intent and makes granular changes as diffs from the previous state.

### Core Architectural Principles

1. **AI-Driven Iteration** - LLM makes choices, not manual tweaking
2. **Diff-Based Responses** - LLM returns only changes, not full state
3. **Lazy Activation** - Preview iterations before committing to mixer
4. **Backwards Compatible** - Existing "auto-generate" flow untouched
5. **Progressive Rollout** - Feature flags for incremental deployment

## User Experience Flow

### Example Use Case: Voice Recasting

```
1. User generates initial ad
   → Gets script with ElevenLabs voices + Loudly music + sound effects

2. User types in ScripterPanel:
   "The first voice sounds too serious. Make it friendlier."
   → Selects radio: "Change Voices/Acting Only"
   → Clicks "Refine"

3. System creates new iteration:
   → LLM analyzes current state + change request
   → Suggests different ElevenLabs voice with "warm, friendly" style
   → Returns diff JSON with only voice + voiceInstructions changed

4. User sees new iteration in accordion:
   → "Iteration 2: Friendlier first voice"
   → Clicks "Preview" to generate and hear audio
   → Clicks "Add to Master Mix" to commit

5. MixerPanel updates with new voice track
   → Old iteration remains in history (can rollback)
```

### Example Use Case: Provider Switch

```
1. User has ad with ElevenLabs voices but wants to try OpenAI
   → Types: "Try using OpenAI voices instead"
   → Selects target provider: "OpenAI"

2. System migrates voices:
   → Finds best-match OpenAI voices (preserving gender/age/style)
   → Returns new voice tracks with equivalent characteristics

3. User previews and commits
   → All voice tracks switched to OpenAI
   → Script and timing preserved
```

### UI Interaction Pattern

Each panel (Scripter, Music, SoundFx) gets:

```
┌─────────────────────────────────────────┐
│ [Current Active State Display]         │
│   - Voice tracks / Music / Sound FX    │
│   - All current settings visible       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ What do you want to change?            │
│ [Text area for natural language input] │
│                                         │
│ [○ Script  ○ Acting  ● Both]           │ (ScripterPanel only)
│ [Voice Provider: ElevenLabs ▼]         │
│ [Pacing: Normal ──●── Fast]            │
│                                         │
│ [Refine Button]                         │
└─────────────────────────────────────────┘

After submission:
┌─────────────────────────────────────────┐
│ ▼ Iteration 3: Make voices happier     │
│   [Collapsed state summary]            │
│   [Preview] [Add to Master Mix]        │
├─────────────────────────────────────────┤
│ ▼ Iteration 2: Shorten to 45s          │
│   [Collapsed state summary]            │
│   [Preview] [Add to Master Mix]        │
├─────────────────────────────────────────┤
│ ▼ Iteration 1: Original                │ ← Currently active
│   [Collapsed state summary]            │
│   [Preview] [Add to Master Mix]        │
└─────────────────────────────────────────┘
```

## State Management Architecture

### Redis Schema Design

```typescript
// New Redis key patterns
const ITERATION_KEYS = {
  // Collection of iterations per module per project
  voiceIterations: (projectId: string) =>
    `project:${projectId}:iterations:voice`,
  musicIterations: (projectId: string) =>
    `project:${projectId}:iterations:music`,
  soundfxIterations: (projectId: string) =>
    `project:${projectId}:iterations:soundfx`,

  // Individual iteration data
  iteration: (projectId: string, module: string, iterationId: string) =>
    `project:${projectId}:iteration:${module}:${iterationId}`,

  // Active/chosen iteration for each module
  activeIteration: (projectId: string, module: string) =>
    `project:${projectId}:active:${module}`,

  // Iteration metadata for quick listing
  iterationMeta: (projectId: string, module: string, iterationId: string) =>
    `project:${projectId}:iteration_meta:${module}:${iterationId}`,

  // Garbage collection tracking
  iterationGC: (projectId: string) =>
    `project:${projectId}:gc_candidates`
};
```

### Type Definitions

```typescript
// Base iteration type
type IterationBase = {
  id: string;
  timestamp: number;
  parentId: string | null; // Links to parent iteration for history
  changeRequest: string | null; // User's natural language input
  status: 'generating' | 'complete' | 'failed' | 'abandoned';
  isActive: boolean; // Currently chosen for mixer
  metadata: {
    llmModel: string;
    provider: string;
    generationTime: number;
  };
};

// Voice iteration with full state
type VoiceIteration = IterationBase & {
  type: 'voice';
  data: {
    voiceTracks: VoiceTrack[];
    pronunciationRules?: PronunciationDictionary;
    voiceProvider: Provider;
    pacing: Pacing | null;
    editMode?: 'script' | 'acting' | 'both';
  };
  generatedUrls?: string[]; // Cached audio URLs
};

// Music iteration
type MusicIteration = IterationBase & {
  type: 'music';
  data: {
    prompt: string;
    provider: MusicProvider;
    duration: number;
  };
  generatedUrl?: string;
};

// Sound FX iteration
type SoundFxIteration = IterationBase & {
  type: 'soundfx';
  data: {
    prompts: SoundFxPrompt[];
    provider: 'elevenlabs';
  };
  generatedUrls?: string[];
};

// Extended project type
type ProjectWithIterations = Project & {
  iterations?: {
    voice: string[];      // Array of iteration IDs (newest first)
    music: string[];
    soundfx: string[];
    activeVoice: string | null;
    activeMusic: string | null;
    activeSoundFx: string | null;
  };
};
```

### Garbage Collection Strategy

```typescript
const GC_RULES = {
  maxIterationsPerModule: 20,          // Hard limit per module
  maxInactiveAge: 24 * 60 * 60 * 1000, // 24 hours for inactive
  maxAbandonedAge: 60 * 60 * 1000,     // 1 hour for abandoned/failed
  preserveActive: true,                 // Never GC active iterations
  preserveParents: true,                // Keep parent chain of active
};

// Garbage collection implementation
async function gcIterations(projectId: string, module: string) {
  const iterations = await redis.lrange(
    ITERATION_KEYS[`${module}Iterations`](projectId),
    0,
    -1
  );

  const activeId = await redis.get(
    ITERATION_KEYS.activeIteration(projectId, module)
  );

  // Build parent chain for active iteration
  const parentChain = await buildParentChain(projectId, module, activeId);

  // Identify GC candidates
  const candidates = [];
  for (const iterationId of iterations) {
    const iteration = await redis.get(
      ITERATION_KEYS.iteration(projectId, module, iterationId)
    );

    // Skip if in parent chain or is active
    if (parentChain.has(iterationId) || iterationId === activeId) {
      continue;
    }

    // Check age rules
    const age = Date.now() - iteration.timestamp;
    if (iteration.status === 'abandoned' && age > GC_RULES.maxAbandonedAge) {
      candidates.push(iterationId);
    } else if (!iteration.isActive && age > GC_RULES.maxInactiveAge) {
      candidates.push(iterationId);
    }
  }

  // Enforce hard limit (keep newest N)
  if (iterations.length > GC_RULES.maxIterationsPerModule) {
    const excess = iterations
      .slice(GC_RULES.maxIterationsPerModule)
      .filter(id => !parentChain.has(id) && id !== activeId);
    candidates.push(...excess);
  }

  // Delete candidates
  for (const id of candidates) {
    await redis.del(ITERATION_KEYS.iteration(projectId, module, id));
    await redis.lrem(
      ITERATION_KEYS[`${module}Iterations`](projectId),
      1,
      id
    );
  }

  return candidates.length;
}
```

### Backwards Compatibility

Existing projects without `iterations` field will:
1. Continue to work as-is
2. First iteration request creates iteration collection
3. Current state becomes "Iteration 1" (parent of first change)

Migration is lazy and automatic:

```typescript
async function ensureIterationStructure(
  projectId: string,
  module: string
): Promise<string> {
  // Check if iterations exist
  const hasIterations = await redis.exists(
    ITERATION_KEYS[`${module}Iterations`](projectId)
  );

  if (hasIterations) {
    return; // Already migrated
  }

  // Create base iteration from current state
  const project = await redis.get(PROJECT_KEYS.project(projectId));
  const baseIteration = createBaseIterationFromProject(project, module);

  // Save base iteration
  await redis.set(
    ITERATION_KEYS.iteration(projectId, module, baseIteration.id),
    baseIteration
  );

  // Initialize iteration list
  await redis.lpush(
    ITERATION_KEYS[`${module}Iterations`](projectId),
    baseIteration.id
  );

  // Mark as active
  await redis.set(
    ITERATION_KEYS.activeIteration(projectId, module),
    baseIteration.id
  );

  return baseIteration.id;
}
```

## API Design

### Iteration Endpoint Structure

```typescript
// /src/app/api/ai/iterate/voice/route.ts
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    projectId,
    parentIterationId,  // Previous iteration to build from
    changeRequest,      // User's natural language request
    editMode,          // 'script' | 'acting' | 'both'
    voiceProvider,     // Target provider (for switching)
    pacing,           // Pacing adjustment
  } = body;

  // Validate inputs
  if (!projectId || !changeRequest) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  // Ensure iteration structure exists
  await ensureIterationStructure(projectId, 'voice');

  // Load parent iteration (or create base if first time)
  const parentId = parentIterationId ||
    await getActiveIterationId(projectId, 'voice');

  const parentIteration = await redis.get(
    ITERATION_KEYS.iteration(projectId, 'voice', parentId)
  );

  // Load original project context
  const project = await redis.get(PROJECT_KEYS.project(projectId));

  // Build LLM prompt with diff-based approach
  const strategy = new IterativePromptStrategy(voiceProvider);
  const { systemPrompt, userPrompt } = strategy.buildIterationPrompt({
    originalBrief: {
      clientDescription: project.clientDescription,
      creativeBrief: project.creativeBrief,
      selectedLanguage: project.selectedLanguage,
      adDuration: project.adDuration,
      campaignFormat: project.campaignFormat,
    },
    parentState: parentIteration.data,
    changeRequest,
    editMode,
    targetProvider: voiceProvider,
    pacing,
  });

  // Call LLM for partial update
  const startTime = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.5, // Lower temp for consistency
  });

  // Parse and validate diff response
  const rawContent = response.choices[0].message.content;
  const diff = JSON.parse(rawContent);

  const validator = new IterationResponseValidator();
  const validation = validator.validate(diff, 'voice');

  if (!validation.valid) {
    if (validation.fallback === 'parent') {
      // Return parent state with error
      return NextResponse.json({
        error: 'Invalid response from AI, using previous state',
        iteration: parentIteration,
      }, { status: 200 });
    } else {
      // Critical failure
      return NextResponse.json({
        error: validation.error,
      }, { status: 500 });
    }
  }

  // Apply diff to parent state
  const newState = applyIterationDiff(
    parentIteration.data,
    validation.data,
    editMode
  );

  // Create new iteration
  const iterationId = `iter_${Date.now()}_${randomId()}`;
  const iteration: VoiceIteration = {
    id: iterationId,
    timestamp: Date.now(),
    parentId: parentId,
    changeRequest,
    status: 'complete',
    isActive: false,
    type: 'voice',
    data: newState,
    metadata: {
      llmModel: 'gpt-4.1',
      provider: voiceProvider,
      generationTime: Date.now() - startTime,
    }
  };

  // Save iteration
  await redis.set(
    ITERATION_KEYS.iteration(projectId, 'voice', iterationId),
    iteration
  );

  // Add to iterations list (newest first)
  await redis.lpush(
    ITERATION_KEYS.voiceIterations(projectId),
    iterationId
  );

  // Trigger GC if needed
  const count = await redis.llen(ITERATION_KEYS.voiceIterations(projectId));
  if (count > GC_RULES.maxIterationsPerModule) {
    await gcIterations(projectId, 'voice');
  }

  return NextResponse.json({ iteration });
}
```

### Prompt Engineering Strategy

The key innovation is **diff-based prompting** - the LLM only returns changes, not the entire state.

```typescript
class IterativePromptStrategy {
  buildIterationPrompt(context: IterationContext): PromptResult {
    const systemPrompt = `
You are an expert at refining voice ad scripts based on user feedback.
You will receive the CURRENT STATE and a CHANGE REQUEST.
Your job is to return ONLY the fields that need to change as a JSON diff.

CRITICAL RULES:
1. Return ONLY changed fields, not the entire state
2. If changing script text, preserve timing relationships
3. If changing voices, match gender/age/style appropriately
4. If switching providers, select equivalent voices from the target provider
5. Preserve all unchanged elements exactly as they are
6. Use the same voice ID format as the input

Current Provider: ${context.parentState.voiceProvider}
Target Provider: ${context.targetProvider || context.parentState.voiceProvider}
Edit Mode: ${context.editMode}
Available Voices: ${context.availableVoices.length} voices loaded
`;

    const editModeInstructions =
      context.editMode === 'script'
        ? 'ONLY modify the script text. Keep the same voices and delivery instructions.'
        : context.editMode === 'acting'
        ? 'ONLY modify voice selection and delivery instructions. Keep the same script text.'
        : 'You may modify both script and voice/delivery as needed.';

    const userPrompt = `
ORIGINAL BRIEF:
Client: ${context.originalBrief.clientDescription}
Creative: ${context.originalBrief.creativeBrief}
Language: ${context.originalBrief.selectedLanguage}
Duration: ${context.originalBrief.adDuration} seconds
Format: ${context.originalBrief.campaignFormat}

CURRENT STATE:
${JSON.stringify(context.parentState, null, 2)}

USER WANTS TO CHANGE:
"${context.changeRequest}"

CONSTRAINT:
${editModeInstructions}

Return a JSON diff with ONLY the fields that should change.

Example diff format:
{
  "voiceTracks": [
    {
      "index": 0,  // Which track to modify
      "text": "new text here",           // Only if text changes
      "voice": { "id": "...", ... },     // Only if voice changes
      "voiceInstructions": "speak warmly" // Only if instructions change
    }
  ],
  "pacing": "fast"  // Only if pacing changes
}

If no changes are needed, return: { "noChange": true }
`;

    return { systemPrompt, userPrompt };
  }
}

// Apply diff to parent state
function applyIterationDiff(
  parentState: VoiceIterationData,
  diff: any,
  editMode: string
): VoiceIterationData {
  // Deep clone parent
  const newState = JSON.parse(JSON.stringify(parentState));

  // Handle no-change case
  if (diff.noChange) {
    return newState;
  }

  // Apply voice track changes
  if (diff.voiceTracks) {
    for (const trackDiff of diff.voiceTracks) {
      const index = trackDiff.index;
      if (index >= 0 && index < newState.voiceTracks.length) {
        // Merge changes into track
        if (trackDiff.text !== undefined) {
          newState.voiceTracks[index].text = trackDiff.text;
        }
        if (trackDiff.voice !== undefined) {
          newState.voiceTracks[index].voice = trackDiff.voice;
        }
        if (trackDiff.voiceInstructions !== undefined) {
          newState.voiceTracks[index].voiceInstructions = trackDiff.voiceInstructions;
        }
        if (trackDiff.style !== undefined) {
          newState.voiceTracks[index].style = trackDiff.style;
        }
        if (trackDiff.useCase !== undefined) {
          newState.voiceTracks[index].useCase = trackDiff.useCase;
        }
      }
    }
  }

  // Apply pacing changes
  if (diff.pacing !== undefined) {
    newState.pacing = diff.pacing;
  }

  // Apply provider changes
  if (diff.voiceProvider !== undefined) {
    newState.voiceProvider = diff.voiceProvider;
  }

  return newState;
}
```

### Response Validation

```typescript
class IterationResponseValidator {
  private ajv = new Ajv();

  validate(response: any, module: string): ValidationResult {
    try {
      // Get schema for module
      const schema = this.getSchemaForModule(module);
      const valid = this.ajv.validate(schema, response);

      if (!valid) {
        console.error('Validation errors:', this.ajv.errors);

        // Attempt repair for common issues
        const repaired = this.attemptRepair(response, schema);
        if (repaired) {
          console.log('Successfully repaired response');
          return { valid: true, data: repaired };
        }

        // Fallback to parent state
        return {
          valid: false,
          error: 'Invalid response structure',
          fallback: 'parent'
        };
      }

      return { valid: true, data: response };
    } catch (error) {
      // Critical failure - abandon iteration
      console.error('Validation exception:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        fallback: 'abandon'
      };
    }
  }

  private getSchemaForModule(module: string) {
    if (module === 'voice') {
      return {
        type: 'object',
        properties: {
          noChange: { type: 'boolean' },
          voiceTracks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['index'],
              properties: {
                index: { type: 'number' },
                text: { type: 'string' },
                voice: { type: 'object' },
                voiceInstructions: { type: 'string' },
                style: { type: 'string' },
                useCase: { type: 'string' },
              }
            }
          },
          pacing: { type: 'string', enum: ['fast', null] },
          voiceProvider: { type: 'string' },
        }
      };
    }
    // ... schemas for music and soundfx
  }

  private attemptRepair(response: any, schema: any): any | null {
    // Common repair patterns

    // Fix: Missing index in voice tracks
    if (response.voiceTracks && Array.isArray(response.voiceTracks)) {
      response.voiceTracks = response.voiceTracks.map((track, idx) => ({
        ...track,
        index: track.index !== undefined ? track.index : idx
      }));
    }

    // Fix: Wrapped in code blocks
    if (typeof response === 'string') {
      try {
        const cleaned = response
          .replace(/^```(?:json)?\s*\n/, '')
          .replace(/\n```\s*$/, '');
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    }

    // Revalidate
    if (this.ajv.validate(schema, response)) {
      return response;
    }

    return null;
  }
}
```

### Additional Endpoints

```typescript
// /src/app/api/iterations/route.ts
// GET - List iterations for a module
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const module = searchParams.get('module');
  const cursor = searchParams.get('cursor');
  const limit = parseInt(searchParams.get('limit') || '10');

  // Load iterations with pagination
  const start = cursor ? parseInt(cursor) : 0;
  const iterationIds = await redis.lrange(
    ITERATION_KEYS[`${module}Iterations`](projectId),
    start,
    start + limit - 1
  );

  // Load full iterations
  const iterations = await Promise.all(
    iterationIds.map(id =>
      redis.get(ITERATION_KEYS.iteration(projectId, module, id))
    )
  );

  // Get active ID
  const activeId = await redis.get(
    ITERATION_KEYS.activeIteration(projectId, module)
  );

  return NextResponse.json({
    iterations,
    activeId,
    nextCursor: start + limit < await redis.llen(ITERATION_KEYS[`${module}Iterations`](projectId))
      ? start + limit
      : null,
    hasMore: start + limit < await redis.llen(ITERATION_KEYS[`${module}Iterations`](projectId))
  });
}

// /src/app/api/iterations/activate/route.ts
// POST - Mark iteration as active (adds to mixer)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, module, iterationId } = body;

  // Load iteration
  const iteration = await redis.get(
    ITERATION_KEYS.iteration(projectId, module, iterationId)
  );

  if (!iteration) {
    return NextResponse.json(
      { error: 'Iteration not found' },
      { status: 404 }
    );
  }

  // Update active iteration
  await redis.set(
    ITERATION_KEYS.activeIteration(projectId, module),
    iterationId
  );

  // Mark iteration as active
  iteration.isActive = true;
  await redis.set(
    ITERATION_KEYS.iteration(projectId, module, iterationId),
    iteration
  );

  // Update project's active iteration reference
  const project = await redis.get(PROJECT_KEYS.project(projectId));
  project.iterations = project.iterations || { voice: [], music: [], soundfx: [] };
  project.iterations[`active${capitalize(module)}`] = iterationId;
  await redis.set(PROJECT_KEYS.project(projectId), project);

  return NextResponse.json({ success: true, iteration });
}
```

## UI Component Architecture

### Enhanced ScripterPanel

```typescript
// /src/components/ScripterPanel.tsx

export function ScripterPanel({
  // ... existing props
  projectId: string,
}) {
  // Iteration state
  const [iterations, setIterations] = useState<VoiceIteration[]>([]);
  const [activeIterationId, setActiveIterationId] = useState<string | null>(null);
  const [isIterating, setIsIterating] = useState(false);
  const [showIterationHistory, setShowIterationHistory] = useState(false);

  // Iteration form state
  const [changeRequest, setChangeRequest] = useState('');
  const [editMode, setEditMode] = useState<'script' | 'acting' | 'both'>('both');
  const [targetProvider, setTargetProvider] = useState<Provider>(selectedProvider);

  // Load iterations on mount
  useEffect(() => {
    if (FEATURES.ITERATION_VOICE) {
      loadIterations();
    }
  }, [projectId]);

  const loadIterations = async () => {
    const response = await fetch(
      `/api/iterations?projectId=${projectId}&module=voice&limit=10`
    );
    const data = await response.json();
    setIterations(data.iterations || []);
    setActiveIterationId(data.activeId);
  };

  const handleIterationSubmit = async () => {
    if (!changeRequest.trim()) return;

    setIsIterating(true);

    try {
      const request = {
        projectId,
        parentIterationId: activeIterationId || iterations[0]?.id,
        changeRequest,
        editMode,
        voiceProvider: targetProvider,
        pacing: selectedPacing,
      };

      const response = await fetch('/api/ai/iterate/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (data.error) {
        console.error('Iteration failed:', data.error);
        // Show error to user
        return;
      }

      // Add new iteration to list
      setIterations([data.iteration, ...iterations]);
      setShowIterationHistory(true);
      setChangeRequest('');
    } finally {
      setIsIterating(false);
    }
  };

  const handlePreview = async (iterationId: string) => {
    const iteration = iterations.find(i => i.id === iterationId);
    if (!iteration) return;

    // Generate audio for this iteration's voice tracks
    await generateAudio(
      iteration.data.voiceProvider,
      iteration.data.voiceTracks
    );
  };

  const handleAddToMasterMix = async (iterationId: string) => {
    const iteration = iterations.find(i => i.id === iterationId);
    if (!iteration) return;

    // Mark as active
    await fetch('/api/iterations/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        module: 'voice',
        iterationId,
      }),
    });

    setActiveIterationId(iterationId);

    // Update mixer with new tracks
    if (iteration.generatedUrls) {
      clearTracks('voice');
      iteration.generatedUrls.forEach((url, index) => {
        const track = iteration.data.voiceTracks[index];
        addTrack({
          id: `voice-${iterationId}-${index}`,
          url,
          label: track.voice?.name || `Voice ${index + 1}`,
          type: 'voice',
          metadata: {
            scriptText: track.text,
            voiceProvider: iteration.data.voiceProvider,
            iterationId,
          }
        });
      });
    }

    setShowIterationHistory(false);
  };

  return (
    <div className="space-y-6">
      {/* Current/Active View */}
      {!showIterationHistory && (
        <>
          {/* Existing voice track UI */}
          <div className="space-y-4">
            {voiceTracks.map((track, index) => (
              <div key={`track-${index}`} className="...">
                {/* Existing track rendering */}
              </div>
            ))}
          </div>

          {/* Iteration Controls */}
          {FEATURES.ITERATION_VOICE && (
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-sm font-medium text-white/70 mb-3">
                Want to refine this?
              </h3>

              <GlassyTextarea
                value={changeRequest}
                onChange={(e) => setChangeRequest(e.target.value)}
                placeholder="Describe what you'd like to change... (e.g., 'Make the voices sound happier' or 'Shorten the script to 45 seconds')"
                rows={3}
                className="mb-4"
              />

              <div className="grid grid-cols-3 gap-4 mb-4">
                {/* Edit Mode Radio */}
                <div>
                  <label className="block text-xs text-white/50 mb-2">
                    What to change
                  </label>
                  <GlassyListbox
                    value={editMode}
                    onChange={setEditMode}
                    options={[
                      { value: 'script', label: 'Script Only' },
                      { value: 'acting', label: 'Voices/Acting Only' },
                      { value: 'both', label: 'Both' },
                    ]}
                  />
                </div>

                {/* Voice Provider Picker (when editMode includes acting) */}
                {(editMode === 'acting' || editMode === 'both') && (
                  <div>
                    <label className="block text-xs text-white/50 mb-2">
                      Voice Provider
                    </label>
                    <GlassyListbox
                      value={targetProvider}
                      onChange={setTargetProvider}
                      options={[
                        { value: 'elevenlabs', label: 'ElevenLabs' },
                        { value: 'openai', label: 'OpenAI' },
                        { value: 'qwen', label: 'Qwen' },
                        { value: 'bytedance', label: 'ByteDance' },
                      ]}
                    />
                  </div>
                )}

                {/* Pacing Control */}
                <div>
                  <label className="block text-xs text-white/50 mb-2">
                    Pacing
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPacing(null)}
                      className={`flex-1 p-2 rounded ${
                        selectedPacing === null
                          ? 'bg-wb-blue/30 ring-1 ring-wb-blue/50'
                          : 'bg-white/10'
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      onClick={() => setSelectedPacing('fast')}
                      className={`flex-1 p-2 rounded ${
                        selectedPacing === 'fast'
                          ? 'bg-wb-blue/30 ring-1 ring-wb-blue/50'
                          : 'bg-white/10'
                      }`}
                    >
                      Fast
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={() => setShowIterationHistory(true)}
                  className="text-sm text-white/50 hover:text-white/70"
                >
                  View iteration history ({iterations.length})
                </button>

                <GenerateButton
                  onClick={handleIterationSubmit}
                  disabled={!changeRequest.trim()}
                  isGenerating={isIterating}
                  text="Refine"
                  generatingText="Refining..."
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Iteration History Accordion */}
      {showIterationHistory && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Iteration History</h3>
            <button
              onClick={() => setShowIterationHistory(false)}
              className="text-sm text-white/50 hover:text-white/70"
            >
              ← Back to current
            </button>
          </div>

          {iterations.map((iteration, index) => (
            <IterationAccordionItem
              key={iteration.id}
              iteration={iteration}
              isActive={iteration.id === activeIterationId}
              isLatest={index === 0}
              onPreview={() => handlePreview(iteration.id)}
              onAddToMix={() => handleAddToMasterMix(iteration.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### Iteration Accordion Item Component

```typescript
// /src/components/IterationAccordionItem.tsx

type IterationAccordionItemProps = {
  iteration: VoiceIteration | MusicIteration | SoundFxIteration;
  isActive: boolean;
  isLatest: boolean;
  onPreview: () => void;
  onAddToMix: () => void;
};

export function IterationAccordionItem({
  iteration,
  isActive,
  isLatest,
  onPreview,
  onAddToMix,
}: IterationAccordionItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          {isActive && (
            <div className="w-2 h-2 bg-green-500 rounded-full" title="Active in mixer" />
          )}

          {/* Iteration info */}
          <div className="text-left">
            <div className="font-medium">
              {iteration.changeRequest || 'Initial Version'}
            </div>
            <div className="text-xs text-white/50">
              {new Date(iteration.timestamp).toLocaleString()}
              {isLatest && ' • Latest'}
            </div>
          </div>
        </div>

        {/* Expand icon */}
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-white/10">
          {/* Iteration details */}
          {iteration.type === 'voice' && (
            <div className="space-y-2 mb-4">
              {iteration.data.voiceTracks.map((track, idx) => (
                <div key={idx} className="text-sm">
                  <div className="text-white/70">
                    Voice {idx + 1}: {track.voice?.name}
                  </div>
                  <div className="text-white/50 text-xs line-clamp-2">
                    {track.text}
                  </div>
                </div>
              ))}
              <div className="text-xs text-white/40">
                Provider: {iteration.data.voiceProvider}
                {iteration.data.pacing && ` • Pacing: ${iteration.data.pacing}`}
              </div>
            </div>
          )}

          {iteration.type === 'music' && (
            <div className="space-y-2 mb-4">
              <div className="text-sm text-white/70">
                {iteration.data.prompt}
              </div>
              <div className="text-xs text-white/40">
                Provider: {iteration.data.provider} • Duration: {iteration.data.duration}s
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onPreview}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              Preview
            </button>
            {!isActive && (
              <button
                onClick={onAddToMix}
                className="flex-1 px-4 py-2 bg-wb-blue hover:bg-wb-blue/80 rounded-lg transition-colors font-medium"
              >
                Add to Master Mix
              </button>
            )}
            {isActive && (
              <div className="flex-1 px-4 py-2 bg-green-500/20 text-green-300 rounded-lg text-center">
                Active in Mix
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

## Provider Switching

### Voice Provider Migration

```typescript
// /src/utils/voice-provider-migrator.ts

class VoiceProviderMigrator {
  /**
   * Migrate voice tracks from one provider to another
   */
  async migrateVoices(
    voiceTracks: VoiceTrack[],
    fromProvider: Provider,
    toProvider: Provider,
    language: Language,
    region?: string,
    accent?: string
  ): Promise<VoiceTrack[]> {
    // Load target provider voices
    const targetVoices = await this.loadTargetVoices(
      toProvider,
      language,
      region,
      accent
    );

    if (targetVoices.length === 0) {
      throw new Error(`No voices available for ${toProvider} in ${language}`);
    }

    // Map each track to best match in target provider
    return voiceTracks.map(track => {
      if (!track.voice) {
        return track;
      }

      const match = this.findBestVoiceMatch(
        track.voice,
        targetVoices,
        {
          preserveGender: true,
          preserveAge: true,
          preserveStyle: true,
        }
      );

      return {
        ...track,
        voice: match,
        // Reset provider-specific fields
        voiceInstructions: toProvider === 'openai' ? '' : track.voiceInstructions,
        style: toProvider === 'elevenlabs' ? track.style : undefined,
        useCase: toProvider === 'elevenlabs' ? track.useCase : undefined,
      };
    });
  }

  /**
   * Find best matching voice in target provider
   */
  private findBestVoiceMatch(
    source: Voice,
    targets: Voice[],
    criteria: MatchCriteria
  ): Voice {
    // Score each target voice
    const scored = targets.map(target => ({
      voice: target,
      score: this.calculateMatchScore(source, target, criteria)
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    console.log('Voice matching results:', {
      source: source.name,
      topMatches: scored.slice(0, 3).map(s => ({
        name: s.voice.name,
        score: s.score
      }))
    });

    return scored[0].voice;
  }

  /**
   * Calculate match score between two voices
   */
  private calculateMatchScore(
    source: Voice,
    target: Voice,
    criteria: MatchCriteria
  ): number {
    let score = 0;

    // Gender match (critical)
    if (criteria.preserveGender && source.gender === target.gender) {
      score += 10;
    } else if (criteria.preserveGender) {
      score -= 5; // Penalty for gender mismatch
    }

    // Age match (important)
    if (criteria.preserveAge && source.age && target.age) {
      const ageDiff = Math.abs(
        this.getAgeValue(source.age) - this.getAgeValue(target.age)
      );
      score += Math.max(0, 5 - ageDiff); // Max 5 points
    }

    // Style match (nice to have)
    if (criteria.preserveStyle && source.style && target.style) {
      if (source.style.toLowerCase() === target.style.toLowerCase()) {
        score += 3;
      } else if (this.isSimilarStyle(source.style, target.style)) {
        score += 1;
      }
    }

    // Description similarity (bonus)
    if (source.description && target.description) {
      const similarity = this.calculateTextSimilarity(
        source.description,
        target.description
      );
      score += similarity * 2; // Max 2 points
    }

    return score;
  }

  /**
   * Load voices for target provider
   */
  private async loadTargetVoices(
    provider: Provider,
    language: Language,
    region?: string,
    accent?: string
  ): Promise<Voice[]> {
    const url = new URL('/api/voice-catalogue', window.location.origin);
    url.searchParams.set('operation', 'filtered-voices');
    url.searchParams.set('language', language);
    url.searchParams.set('provider', provider);

    if (region) url.searchParams.set('region', region);
    if (accent) url.searchParams.set('accent', accent);

    const response = await fetch(url);
    const data = await response.json();

    return data.voices || [];
  }

  private getAgeValue(age: string): number {
    const ageMap: Record<string, number> = {
      'young': 1,
      'middle aged': 2,
      'old': 3,
    };
    return ageMap[age.toLowerCase()] || 2;
  }

  private isSimilarStyle(style1: string, style2: string): boolean {
    const similarityMap: Record<string, string[]> = {
      'warm': ['friendly', 'conversational'],
      'professional': ['business', 'corporate'],
      'excited': ['energetic', 'enthusiastic'],
    };

    const s1 = style1.toLowerCase();
    const s2 = style2.toLowerCase();

    return similarityMap[s1]?.includes(s2) || similarityMap[s2]?.includes(s1);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple word overlap similarity
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

export const voiceProviderMigrator = new VoiceProviderMigrator();
```

## Data Flow

### End-to-End Iteration Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     ITERATION CYCLE                          │
└──────────────────────────────────────────────────────────────┘

1. USER ACTION
   └─> User types change request in ScripterPanel
       "Make the voices sound happier"

2. PANEL STATE
   └─> ScripterPanel collects:
       • changeRequest
       • editMode ('acting')
       • targetProvider (same as current)
       • pacing (unchanged)

3. API REQUEST
   └─> POST /api/ai/iterate/voice
       {
         projectId,
         parentIterationId,
         changeRequest,
         editMode,
         voiceProvider,
         pacing
       }

4. LOAD CONTEXT
   └─> API loads from Redis:
       • Parent iteration (current voice state)
       • Original project brief
       • Available voices for target provider

5. LLM GENERATION
   └─> Build diff-based prompt:
       • System: "Return only changed fields"
       • User: Original brief + current state + change request

   └─> Call OpenAI GPT-4.1
       temperature: 0.5 (consistent iterations)

   └─> Receive JSON diff:
       {
         "voiceTracks": [
           {
             "index": 0,
             "voiceInstructions": "speak with warmth and enthusiasm"
           },
           {
             "index": 1,
             "voiceInstructions": "cheerful and upbeat delivery"
           }
         ]
       }

6. VALIDATE & APPLY
   └─> Validate diff against schema
   └─> Apply diff to parent state
   └─> Create new iteration object

7. SAVE ITERATION
   └─> Redis operations:
       • Save iteration to project:${projectId}:iteration:voice:${iterationId}
       • Add to list: project:${projectId}:iterations:voice
       • Check GC threshold (>20 iterations?)

8. RETURN TO UI
   └─> ScripterPanel receives new iteration
   └─> Adds to local state
   └─> Shows in accordion view

9. USER PREVIEW
   └─> User clicks "Preview"
   └─> ScripterPanel calls generateAudio() with iteration's voice tracks
   └─> Audio generated and played

10. USER COMMITS
    └─> User clicks "Add to Master Mix"
    └─> POST /api/iterations/activate
        • Mark iteration as active
        • Update project.iterations.activeVoice

    └─> ScripterPanel updates mixer:
        • clearTracks('voice')
        • addTrack() for each generated URL

11. MIXER INTEGRATION
    └─> MixerPanel receives new tracks
    └─> Recalculates timeline
    └─> Updates mixer state in Redis
    └─> Ready for preview/export
```

### Concurrent Iterations Handling

Users may trigger multiple iterations simultaneously (e.g., changing music while script is generating). The system handles this gracefully:

```typescript
// Each iteration is independent
// No locks needed - iterations are immutably stored
// Activation is atomic (single Redis SET)

// Example: User changes music while voice is generating
// Timeline:
// t=0s:  User clicks "Refine" on voice → iteration V2 starts
// t=5s:  User clicks "Refine" on music → iteration M2 starts
// t=10s: V2 completes → Shows in accordion
// t=12s: M2 completes → Shows in accordion
// t=15s: User activates V2 → Voice tracks update in mixer
// t=20s: User activates M2 → Music track updates in mixer

// Both iterations coexist peacefully
// User can preview/activate in any order
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goals**: Set up iteration infrastructure without UI

**Tasks**:
1. Create Redis schema types in `/src/types/iterations.ts`
2. Implement Redis utility functions in `/src/utils/redis-iterations.ts`
3. Create base iteration API route structure
4. Build `IterativePromptStrategy` base class
5. Implement feature flags in `.env.local`
6. Write unit tests for diff application logic

**Deliverables**:
- Type definitions for all iteration types
- Redis CRUD operations for iterations
- Feature flag: `NEXT_PUBLIC_FEATURE_ITERATION_ENABLED=false`
- Test coverage: >80% for core logic

### Phase 2: MusicPanel MVP (Week 2-3)

**Why MusicPanel First?**
- Simplest iteration logic (single prompt, single provider)
- No complex relationships (unlike voice tracks)
- Fast feedback loop for testing UX patterns

**Tasks**:
1. Add iteration UI to MusicPanel:
   - "What do you want to change?" textarea
   - Submit button
   - Iteration history accordion
2. Implement `/api/ai/iterate/music/route.ts`
3. Build music-specific prompt strategy
4. Integrate with existing music generation flow
5. Test preview → activate flow

**Deliverables**:
- Functional music iteration in MusicPanel
- Feature flag: `NEXT_PUBLIC_FEATURE_ITERATION_MUSIC=true`
- User can iterate on music prompts
- Iteration history visible and functional

### Phase 3: SoundFxPanel (Week 3-4)

**New Complexity**: Multiple sound effect prompts

**Tasks**:
1. Port iteration UI from MusicPanel
2. Implement `/api/ai/iterate/soundfx/route.ts`
3. Handle array of sound effect prompts in diff logic
4. Test with multiple sound effects per ad
5. Refine UX based on MusicPanel learnings

**Deliverables**:
- Sound effect iteration working
- Feature flag: `NEXT_PUBLIC_FEATURE_ITERATION_SOUNDFX=true`
- Support for multiple sound effects
- GC tested with multiple iterations

### Phase 4: ScripterPanel (Week 4-5)

**Highest Complexity**:
- Multiple voice tracks with relationships
- Provider switching logic
- Script vs acting vs both modes
- Pacing controls

**Tasks**:
1. Implement voice iteration UI with mode controls
2. Build `/api/ai/iterate/voice/route.ts`
3. Integrate `VoiceProviderMigrator`
4. Implement edit mode branching logic
5. Handle pronunciation dictionaries
6. Test provider switching (ElevenLabs ↔ OpenAI)
7. Test complex scenarios (dialog format, multi-track)

**Deliverables**:
- Full voice iteration capability
- Feature flag: `NEXT_PUBLIC_FEATURE_ITERATION_VOICE=true`
- Provider switching tested
- All edit modes working

### Phase 5: Polish & Optimization (Week 5-6)

**Focus**: Production readiness

**Tasks**:
1. Performance optimization:
   - Lazy loading for iteration history
   - Optimistic UI updates
   - Debounce iteration requests
2. Error handling:
   - Graceful LLM failure handling
   - Retry logic for transient errors
   - User-friendly error messages
3. UI polish:
   - Loading animations
   - Success/error toasts
   - Smooth accordion transitions
4. Testing:
   - E2E tests for full iteration flows
   - Load testing (20+ iterations)
   - Cross-browser testing
5. Documentation:
   - User guide for iteration feature
   - API documentation
   - Migration guide for existing projects

**Deliverables**:
- Production-ready feature
- Comprehensive test coverage
- Performance benchmarks met
- User documentation

## Risk Assessment & Mitigation

### Risk 1: Invalid LLM Responses

**Probability**: Medium
**Impact**: High (breaks iteration flow)

**Mitigation**:
- Schema validation with Ajv
- Repair logic for common issues
- Fallback to parent state on critical failure
- Log all invalid responses for analysis
- Lower temperature (0.5) for consistency

**Monitoring**:
```typescript
// Track validation failures
const validationMetrics = {
  totalIterations: 0,
  validationFailures: 0,
  repairSuccesses: 0,
  criticalFailures: 0,
};

// Log to analytics
logIterationMetrics(validationMetrics);
```

### Risk 2: Performance with Many Iterations

**Probability**: High (power users will iterate)
**Impact**: Medium (slow UI, high storage)

**Mitigation**:
- Lazy loading (5 iterations at a time)
- Aggressive GC (20 iteration limit)
- Index-based pagination in Redis
- Virtual scrolling for history list

**Monitoring**:
```typescript
// Track iteration counts per project
async function getIterationStats() {
  const projects = await redis.keys('project:*:iterations:*');
  const stats = await Promise.all(
    projects.map(key => redis.llen(key))
  );

  return {
    maxIterations: Math.max(...stats),
    avgIterations: stats.reduce((a, b) => a + b) / stats.length,
    projectsOver20: stats.filter(n => n > 20).length,
  };
}
```

### Risk 3: Mixed Providers in Mix

**Probability**: Medium (user experiments)
**Impact**: Low (aesthetic, not functional)

**Mitigation**:
- Warning system (not blocking)
- Track provider metadata on mixer tracks
- Validator checks provider consistency
- User education in UI

**Implementation**:
```typescript
class MixValidator {
  validateProviderMix(tracks: MixerTrackWithProvider[]): ValidationResult {
    const providers = new Set(
      tracks
        .filter(t => t.type === 'voice')
        .map(t => t.metadata.voiceProvider)
    );

    if (providers.size > 1) {
      return {
        valid: true,
        warning: `Multiple voice providers detected: ${[...providers].join(', ')}. Audio characteristics may vary.`,
      };
    }

    return { valid: true };
  }
}
```

### Risk 4: State Synchronization

**Probability**: Medium
**Impact**: High (user confusion, data loss)

**Mitigation**:
- Single source of truth (Redis)
- Optimistic UI updates with rollback
- Periodic state refresh from server
- Clear loading states

### Risk 5: Migration from Existing Projects

**Probability**: Certain
**Impact**: Low (handled gracefully)

**Mitigation**:
- Backwards compatible schema
- Lazy migration (first iteration creates base)
- No breaking changes to existing flow
- Feature flags prevent accidents

## Technical Decisions & Rationale

### Decision 1: Diff-Based LLM Responses

**Rationale**:
- **Token Efficiency**: Returning full state wastes tokens (cost + latency)
- **Consistency**: Smaller responses = fewer parsing errors
- **Clarity**: LLM focuses on changes, not reproducing everything

**Alternative Considered**: Full state regeneration
- Rejected: Wasteful, error-prone, inconsistent

### Decision 2: Lazy Activation Pattern

**Rationale**:
- **User Control**: User decides when to commit
- **Safety**: Can preview before breaking current mix
- **Exploration**: Encourages experimentation

**Alternative Considered**: Auto-activation
- Rejected: Too aggressive, ruins existing work

### Decision 3: Phased Rollout (Music → SoundFx → Voice)

**Rationale**:
- **Risk Management**: Learn UX patterns on simple cases first
- **Fast Feedback**: Music iterations quickest to test
- **Incremental Complexity**: Build confidence before tackling voice

**Alternative Considered**: Big bang launch
- Rejected: Too risky, harder to debug

### Decision 4: Feature Flags

**Rationale**:
- **Safe Deployment**: Can disable if issues arise
- **A/B Testing**: Can test with subset of users
- **Gradual Rollout**: Enable module by module

**Implementation**:
```typescript
// .env.local
NEXT_PUBLIC_FEATURE_ITERATION_ENABLED=true
NEXT_PUBLIC_FEATURE_ITERATION_MUSIC=true
NEXT_PUBLIC_FEATURE_ITERATION_SOUNDFX=true
NEXT_PUBLIC_FEATURE_ITERATION_VOICE=false  # Still in dev
```

### Decision 5: Parent-Child Iteration Linking

**Rationale**:
- **History Tracking**: Can trace how we got here
- **Rollback Support**: Can revert to any ancestor
- **GC Protection**: Preserve parent chain of active iteration

**Alternative Considered**: Flat iteration list
- Rejected: Loses context, harder to understand evolution

## Next Steps

1. **Review & Approve**: Architecture review with team
2. **Setup**: Create feature branch `feature/iterative-revolution`
3. **Kickoff**: Begin Phase 1 implementation
4. **Weekly Check-ins**: Review progress, adjust timeline
5. **User Testing**: Beta test after Phase 2 (MusicPanel)

---

## Appendices

### Appendix A: Files to Modify

```
NEW FILES:
- /src/types/iterations.ts
- /src/utils/redis-iterations.ts
- /src/utils/voice-provider-migrator.ts
- /src/components/IterationAccordionItem.tsx
- /src/app/api/ai/iterate/voice/route.ts
- /src/app/api/ai/iterate/music/route.ts
- /src/app/api/ai/iterate/soundfx/route.ts
- /src/app/api/iterations/route.ts
- /src/app/api/iterations/activate/route.ts
- /src/lib/prompt-strategies/iterative-strategy.ts

MODIFIED FILES:
- /src/components/ScripterPanel.tsx (add iteration UI)
- /src/components/MusicPanel.tsx (add iteration UI)
- /src/components/SoundFxPanel.tsx (add iteration UI)
- /src/types/index.ts (add iteration types)
- .env.local (add feature flags)
```

### Appendix B: Redis Storage Estimates

```
Single Voice Iteration: ~5KB
- Metadata: 500B
- Voice tracks (3): 4KB
- Generated URLs: 500B

20 Iterations per Project: 100KB
10,000 Projects: 1GB

Conclusion: Storage is not a concern
```

### Appendix C: Cost Analysis

**LLM Costs per Iteration**:
- Input tokens: ~2000 (context + prompt)
- Output tokens: ~500 (diff response)
- GPT-4.1 cost: ~$0.015 per iteration

**Expected Volume**:
- Average: 5 iterations per project
- Cost per project: $0.075
- 1000 projects/month: $75/month

**Conclusion**: Negligible cost increase

---

**Document Status**: Ready for Implementation
**Next Review**: After Phase 2 completion
