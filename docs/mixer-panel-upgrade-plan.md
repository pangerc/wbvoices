# MixerPanel Upgrade Plan

## Current Implementation Analysis

### Data Flow Overview

Our voice creation pipeline currently works as follows:

1. **AI Prompt & Generation (ai-api.ts)**

   - We instruct LLMs to create scripts with specific timing plans
   - This creates a structured output with voice, music, and sound effect components
   - The output also includes timing relationships between elements

2. **JSON Parsing (json-parser.ts)**

   - Parses the LLM response JSON into a structured format
   - Extracts voice segments, music prompt, sound effect prompts
   - Extracts timing information including:
     - Sequential/concurrent voice patterns
     - Which elements play after which others
     - Overlap timing between elements

3. **State Management (page.tsx)**

   - Maintains all application state:
     - Voice tracks with audio URLs and metadata
     - Music tracks with audio URLs and metadata
     - Sound effect tracks with audio URLs and metadata
     - Generation status for different asset types
   - Manages transitions between tabs
   - Passes track data to MixerPanel

4. **Visualization & Mixing (MixerPanel.tsx)**
   - Takes track data and renders a timeline view
   - Calculates complex timing relationships
   - Creates separate lists for voice, music, and sound effect tracks
   - Handles audio element creation and management
   - Manages preview and export functionality

### Current Issues

1. **Disconnected Visuals and Controls**

   - Timeline visualization is separate from audio players
   - Users need to mentally map between timeline elements and their corresponding players
   - This creates a non-intuitive user experience

2. **Complex and Fragile Code Structure**

   - Timing calculation logic is complex and embedded in the UI component
   - No clear separation between data model and UI presentation
   - Difficult to maintain or extend timing logic

3. **Distributed State Management**

   - Timing information is duplicated across components
   - Timing info appears in ScripterPanel, MusicPanel, SoundFxPanel, and MixerPanel
   - No single source of truth for track timing relationships

4. **Lack of Interactive Control**
   - Users can't easily adjust timing relationships
   - Volume controls are separate from visual timeline
   - No drag-and-drop capability for rearranging tracks

## Proposed Solution

### Step 1: Unifying Timeline and Track Controls

Our immediate goal is to unify the timeline visualization with the track preview controls. This means:

- Embedding audio players directly within timeline elements
- Grouping tracks by type (voice, music, sound effects)
- Maintaining volume controls within each track

### Step 2 (Future): Interactive Timeline with Drag & Drop

The second phase will introduce:

- Draggable timeline elements
- Visual feedback for timing relationships
- Ability to adjust start/end times visually

### Data Model Considerations

The critical question is where to maintain the "masterplan" for track timing and relationships.

#### Option 1: Keep Using page.tsx as State Container

**Pros:**

- Minimal changes required
- Already has access to all track data
- Familiar pattern in our codebase

**Cons:**

- Already complex component with too many responsibilities
- Makes drag-and-drop implementation harder in step 2
- Mixes application logic with UI concerns

#### Option 2: State Management Inside MixerPanel.tsx

**Pros:**

- Contains most timing logic already
- Closer to the UI that needs the state

**Cons:**

- Still couples data and UI too tightly
- Will make drag-and-drop functionality harder to implement
- Doesn't solve the fragility issue

#### Option 3: Dedicated State Management Service

**Pros:**

- Cleaner separation of concerns
- Creates a single source of truth for timing
- Better prepares for drag-and-drop functionality
- Makes the UI components more focused and maintainable

**Cons:**

- Requires more upfront work
- Introduces a new pattern in the codebase

#### Option 4: Server-side Persistence (Upstash/Redis)

**Pros:**

- Would enable saving and loading mixes
- Could enable future collaboration features
- Provides true persistence beyond browser sessions

**Cons:**

- Adds significant complexity
- Still needs client-side state management
- Might be premature for current needs

### Voice Provider & AI Integration Considerations

After examining the BriefPanel and related APIs, it's clear our application has additional complexity to consider:

1. **Multi-Provider Voice System**

   - We handle multiple voice providers (Elevenlabs, Lovo)
   - Complex language/accent filtering and selection
   - Provider-specific voice metadata and capabilities

2. **AI-Generated Content Flow**

   - Content structure is determined by AI models (GPT-4.1, DeepSeek)
   - Timing suggestions come from AI interpretation
   - Parse logic transforms AI output into track specifications

3. **Data Transformation Chain**
   - Content flows through multiple transformation steps before reaching the mixer
   - Voice selections → AI creative generation → JSON/XML parsing → Track creation → Timeline calculation

This additional complexity affects our mixer state management approach in several ways:

- **More Metadata to Track**: Voice provider details are needed for potential regeneration
- **Provenance Tracking**: Maintaining the connection between AI suggestions and final mix
- **State Synchronization**: Changes in the mixer may need to propagate back to script elements

These considerations strengthen the case for a dedicated state management solution that can handle the complete content lifecycle while maintaining a clear separation of concerns.

### Recommended Approach

We recommend implementing a dedicated client-side state management solution:

1. Create a **TrackMixer** service that:

   - Maintains the master track list
   - Handles all timing calculations
   - Provides methods for manipulating track timing
   - Uses reactive patterns to notify UI of changes
   - **Preserves voice provider metadata**
   - **Maintains linkage to original AI suggestions**

2. Use a lightweight state management library like **Zustand** or **Jotai** to:

   - Provide a central store for track data
   - Enable component access to timing information
   - Simplify state updates without prop drilling
   - **Support slices for different domains** (voices, mixing, generation state)

3. Implement basic client-side persistence using:
   - localStorage for saving current session state
   - Optional export/import of mix configurations
   - **Structured serialization format that preserves all metadata**

This approach will:

- Create a cleaner separation between UI and data
- Prepare for drag-and-drop functionality
- Improve maintainability
- Allow focused UI components
- **Support the complex data flow from AI generation to final mix**

## Implementation Plan

1. **Create Track Mixer State Service**

   - Define track data model with timing relationships
   - Extract timing calculation logic from MixerPanel
   - Implement methods for track manipulation
   - **Include provider-specific metadata in the model**

2. **Refactor MixerPanel Component**

   - Split into smaller, focused components
   - Timeline component with embedded audio players
   - Group tracks by type (voice, music, sound effects)
   - Connect components to the track mixer service

3. **Update Page Component**

   - Integrate with track mixer service
   - Remove duplicated state management
   - Simplify track data flow
   - **Delegate voice/language/accent state to appropriate slices**

4. **Improve Visual Design**
   - Enhance timeline visualization
   - Design unified track elements with playback controls
   - Create consistent styles for different track types

After completing these steps, we'll have a more maintainable, unified mixer interface that prepares us for implementing drag-and-drop functionality in the future.
