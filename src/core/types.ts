/**
 * Core type definitions for the Deterministic Recipe State Machine
 */

export interface Ingredient {
  id: string;
  raw: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes?: string;
}

export interface RecipeStep {
  id: number; // 1-based index for human display
  instruction: string;
  timerSeconds?: number;
  ingredientsReferenced?: string[];
  notes?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  url?: string;
  originalServings: number;
  currentServings: number;
  scaleFactor: number;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  source?: string;
}

export type StateMachineStatus =
  | 'IDLE'            // No recipe loaded or awaiting load
  | 'READY'           // Recipe loaded, ready to start at step 0
  | 'READING_STEP'    // Currently speaking/presenting current step
  | 'AWAITING_INPUT'  // Step readout complete, waiting for voice/UI action
  | 'PAUSED'          // Step progression or timer paused
  | 'COMPLETED';      // All steps completed

export interface ActiveTimer {
  id: string;
  label: string;
  durationSeconds: number;
  remainingSeconds: number;
  isPaused: boolean;
  stepIndex?: number;
}

export interface StateSnapshot {
  status: StateMachineStatus;
  recipe: Recipe | null;
  currentStepIndex: number; // 0-based index (-1 if before step 1)
  totalSteps: number;
  activeTimers: ActiveTimer[];
  history: string[];
  lastError: string | null;
}

export type StateListener = (snapshot: StateSnapshot) => void;
export type TimerExpiredListener = (timer: ActiveTimer) => void;
export type StepChangeListener = (step: RecipeStep, stepIndex: number, totalSteps: number) => void;

export interface VoiceCommandIntent {
  action:
    | 'NEXT_STEP'
    | 'PREVIOUS_STEP'
    | 'REPEAT_STEP'
    | 'JUMP_TO_STEP'
    | 'QUERY_INGREDIENT'
    | 'LIST_INGREDIENTS'
    | 'START_TIMER'
    | 'PAUSE_TIMER'
    | 'RESUME_TIMER'
    | 'CANCEL_TIMER'
    | 'PAUSE_RECIPE'
    | 'RESUME_RECIPE'
    | 'STOP'
    | 'UNKNOWN';
  payload?: {
    stepIndex?: number;
    scaleFactor?: number;
    targetServings?: number;
    ingredientName?: string;
    timerSeconds?: number;
    timerLabel?: string;
  };
  rawTranscript: string;
  confidence?: number;
}
