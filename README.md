# 👩‍🍳 SousChef: A Hands-Free Voice Interface for Kitchen Recipe Navigation

When cooking, it's difficult to constantly tap a screen with messy hands or remember exact ingredient measurements. SousChef solves this with a voice interface for recipe navigation.

Works offline out of the box using your browser's built-in voice, with a plug-and-play architecture ready for ElevenLabs AI voices to bring warmth and natural, human narration to the kitchen.

1. **Messy hands & distance:** Users stand several feet away from the screen; once the mic is active, navigation operates via voice commands so you don't have to touch greasy screens.
2. **Deterministic step progression:** The state machine guarantees steps are read in order without skipping ahead or losing state.
3. **Echo suppression & feedback prevention:** When the assistant speaks, mic input is automatically suppressed with a cooldown period so the device doesn't hear and re-execute its own voice.
4. **Inactivity:** The app stays reliable during long sessions by pausing listening when the browser tab is minimized, recycling speech listeners, and sleeping after 5 minutes of inactivity.
5. **Zero external dependencies:** Runs entirely on native browser Web APIs and modern Node.js with built-in TypeScript support—no npm packages or build step to install.
6. **Kitchen-first UI:** Designed and prototyped in **Figma** with large typography and high-contrast buttons readable from across the counter, built with clean semantic HTML and CSS.

---

## 🏗️ System Architecture

SousChef is organized into three clean layers designed for deterministic, hands-free kitchen interaction:

```mermaid
flowchart TD
    subgraph UI_Layer ["1. Audio & Interaction Layer"]
        Chef(["👨‍🍳 Cook (Voice or Touch)"])
        STT["Microphone Listener\n(Speech-to-Text)"]
        TTS["Voice Narrator\n(Text-to-Speech / ElevenLabs)"]
        AudioFX["Web Audio Synthesizer\n(Zero-Asset Chimes & Alarms)"]
    end

    subgraph Parser_Layer ["2. Intent & Ingestion Layer"]
        CommandParser["Voice Command Parser\n(Imperative Intent Extraction)"]
        RecipeParser["Recipe & Web Extractor\n(Schema.org JSON-LD / HTML)"]
    end

    subgraph Core_Engine ["3. Deterministic State Engine"]
        StateMachine["Recipe State Machine\n(Step Tracking, Progression, Bounds)"]
        TimerManager["Concurrent Timer Manager\n(Active Countdowns & Web Audio Alarms)"]
        IngredientEngine["Ingredient Lookup & Scaler\n(Fraction Math & Spoken Readouts)"]
    end

    Chef -->|Speaks Command| STT
    Chef -->|Touches Screen| StateMachine
    STT -->|Raw Spoken Transcript| CommandParser
    CommandParser -->|Structured Intent| StateMachine
    CommandParser -->|Timer Intent| TimerManager
    RecipeParser -->|Parsed Recipe Data| StateMachine
    StateMachine <--> IngredientEngine
    StateMachine -->|Current Step Narration| TTS
    TimerManager -->|Alarm Trigger| AudioFX
    TimerManager -->|Voice Alerts| TTS
```

### State Machine Lifecycle

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> READY: loadRecipe(recipe)
    READY --> READING_STEP: start() / next_step()
    READING_STEP --> AWAITING_INPUT: finish_reading_step() / TTS onEnd
    AWAITING_INPUT --> READING_STEP: next / previous / repeat / jump_to_step
    AWAITING_INPUT --> COMPLETED: next_step() [at final step]
    COMPLETED --> READY: loadRecipe()
```

---

## ✨ Key Features

- **Deterministic Step Traversal:** Formal `next_step()`, `previous_step()`, `repeat_step()`, and `jump_to_step()` methods with bounds checking, transition guards, and audit history logging.
- **Hands-Free Kitchen Timers & Step Duration Detection:** Set multiple concurrent timers by voice (*"Set a timer for 10 minutes"*, *"Set pasta timer for 8 minutes"*, *"How much time is left?"*, *"Cancel timer"*). SousChef automatically parses duration ranges in step text (e.g., *"Bake for 20 to 25 minutes"*) and renders interactive one-tap quick-start timer chips with synthesized Web Audio alarms.
- **Instant Interrupt / Stop:** Saying *"Stop"*, *"Pause"*, or *"Quiet"* immediately cuts off text-to-speech audio, silences active timer alarms, and cancels speech queues.
- **Echo & Feedback Suppression:** Mic input is suppressed while the assistant speaks, followed by a 650ms decay cooldown to prevent speaker audio from re-triggering commands.
- **Natural Ingredient Inquiries:** Ask *"How much butter do I need?"* or *"How many eggs?"* at any time; SousChef extracts phonetic ingredient quantities without interrupting step progress.
- **Zero-Dependency Schema.org Recipe Extractor:** Ingest any recipe URL supporting Schema.org/Recipe JSON-LD, or load pre-bundled offline recipes.
- **Swappable Audio Architecture:**
  - `TTSProvider` and `STTProvider` interfaces.
  - Active offline implementation: Native `window.speechSynthesis` and `window.SpeechRecognition`.
  - Ready-to-use adapter: `ElevenLabsTTSAdapter` for ultra-realistic studio voices.
  - **Zero-cost offline fallback:** When ElevenLabs is unconfigured, rate-limited, or offline, the app automatically falls back to browser speech synthesis.

---

## 🚀 Getting Started

Run tests:
```bash
npm test
```

Start the local server:
```bash
npm start
```

Open your browser at:
```
http://localhost:3000
```

*(Alternatively, open `public/index.html` directly in any modern browser—offline sample recipes work with zero server required!)*

### Voice Commands Supported

- **Progression:** `"Next"`, `"Next step"`, `"What's next"`, `"Done"`
- **Repetition:** `"Repeat"`, `"Say that again"`, `"What was that"`
- **Backtracking:** `"Back"`, `"Previous step"`, `"Go back"`
- **Navigation:** `"Jump to step 4"`, `"Go to step 2"`
- **Cooking Timers:** `"Set a 10 minute timer"`, `"Set pasta timer for 8 minutes"`, `"Start timer"`, `"Check timer"`, `"Cancel timer"`
- **Interruption / Stop:** `"Stop"`, `"Pause"`, `"Quiet"`, `"Be quiet"`, `"Silence"`
- **Ingredient Queries:** `"How much butter do I need?"`, `"How many eggs?"`, `"List ingredients"`

---

## 🎙️ Transitioning to ElevenLabs

When you are ready to plug in ElevenLabs studio voices:

1. Look at [src/voice/tts-provider.ts](src/voice/tts-provider.ts). The `ElevenLabsTTSAdapter` implements the identical `TTSProvider` contract:
```typescript
import { ElevenLabsTTSAdapter } from './src/voice/tts-provider.ts';

const tts = new ElevenLabsTTSAdapter({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
  modelId: 'eleven_turbo_v2_5'
});

await tts.speak("Step 1. Preheat your oven to 375 degrees.");
```
2. The state machine and command parser require zero modifications—audio delivery is completely decoupled from recipe logic!
3. **Automatic Offline Fallback:** If no API key is set, or if you're cooking offline without internet, SousChef seamlessly falls back to the browser's built-in `window.speechSynthesis` with zero configuration or cost.
