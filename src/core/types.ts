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
  | 'PAUSED'          // Step progression paused
  | 'COMPLETED';      // All steps completed

export interface StateSnapshot {
  status: StateMachineStatus;
  recipe: Recipe | null;
  currentStepIndex: number; // 0-based index (-1 if before step 1)
  totalSteps: number;
  history: string[];
  lastError: string | null;
}

export type StateListener = (snapshot: StateSnapshot) => void;
export type StepChangeListener = (step: RecipeStep, stepIndex: number, totalSteps: number) => void;

export interface VoiceCommandIntent {
  action:
    | 'NEXT_STEP'
    | 'PREVIOUS_STEP'
    | 'REPEAT_STEP'
    | 'JUMP_TO_STEP'
    | 'QUERY_INGREDIENT'
    | 'LIST_INGREDIENTS'
    | 'PAUSE_RECIPE'
    | 'RESUME_RECIPE'
    | 'STOP'
    | 'UNKNOWN';
  payload?: {
    stepIndex?: number;
    ingredientName?: string;
  };
  rawTranscript: string;
  confidence?: number;
}
