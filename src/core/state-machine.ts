/**
 * Deterministic Recipe State Machine
 * Core engine managing recipe progression, ingredient scaling, timer synchronization,
 * and state transitions for hands-free kitchen voice control.
 */

import type {
  Recipe,
  RecipeStep,
  Ingredient,
  StateMachineStatus,
  StateSnapshot,
  StateListener,
  StepChangeListener
} from './types.ts';
import { scaleIngredients, formatIngredientForVoice } from './recipe-scaler.ts';

export class RecipeStateMachine {
  private status: StateMachineStatus = 'IDLE';
  private recipe: Recipe | null = null;
  private currentStepIndex: number = -1; // 0-based; -1 before starting
  private stateListeners: Set<StateListener> = new Set();
  private stepChangeListeners: Set<StepChangeListener> = new Set();
  private history: string[] = [];
  private lastError: string | null = null;

  constructor() {}

  /**
   * Loads a recipe into the state machine, resetting progress to READY state
   */
  loadRecipe(recipe: Recipe): StateSnapshot {
    if (!recipe || !recipe.steps || recipe.steps.length === 0) {
      throw new Error('Cannot load recipe: Recipe must contain at least one step.');
    }

    this.recipe = JSON.parse(JSON.stringify(recipe)); // Deep clone
    this.currentStepIndex = -1;
    this.status = 'READY';
    this.lastError = null;
    this.history = [];
    this.recordHistory(`Loaded recipe: "${recipe.title}" (${recipe.steps.length} steps, ${recipe.currentServings} servings)`);

    this.notifyListeners();
    return this.get_state();
  }

  /**
   * Starts reading the recipe from step 1
   */
  start(): RecipeStep {
    this.assertRecipeLoaded();
    this.currentStepIndex = 0;
    this.status = 'READING_STEP';
    this.recordHistory(`Started recipe at step 1.`);

    const step = this.getCurrentStep()!;
    this.handleStepEntered(step);
    this.notifyListeners();
    return step;
  }

  /**
   * Advances to the next step
   */
  next_step(): { step: RecipeStep | null; status: StateMachineStatus } {
    this.assertRecipeLoaded();

    if (this.status === 'READY' || this.currentStepIndex === -1) {
      const step = this.start();
      return { step, status: this.status };
    }

    if (this.currentStepIndex >= this.recipe!.steps.length - 1) {
      this.status = 'COMPLETED';
      this.recordHistory('Recipe completed! Bon appétit!');
      this.notifyListeners();
      return { step: null, status: 'COMPLETED' };
    }

    this.currentStepIndex += 1;
    this.status = 'READING_STEP';
    const step = this.getCurrentStep()!;
    this.recordHistory(`Moved to step ${step.id}: "${step.instruction.substring(0, 40)}..."`);

    this.handleStepEntered(step);
    this.notifyListeners();
    return { step, status: this.status };
  }

  /**
   * Goes back to the previous step
   */
  previous_step(): { step: RecipeStep; status: StateMachineStatus } {
    this.assertRecipeLoaded();

    if (this.currentStepIndex <= 0) {
      this.currentStepIndex = 0;
      this.status = 'READING_STEP';
      const step = this.getCurrentStep()!;
      this.recordHistory('Already at first step. Repeating step 1.');
      this.handleStepEntered(step);
      this.notifyListeners();
      return { step, status: this.status };
    }

    this.currentStepIndex -= 1;
    this.status = 'READING_STEP';
    const step = this.getCurrentStep()!;
    this.recordHistory(`Moved back to step ${step.id}`);

    this.handleStepEntered(step);
    this.notifyListeners();
    return { step, status: this.status };
  }

  /**
   * Repeats current step instruction
   */
  repeat_step(): RecipeStep {
    this.assertRecipeLoaded();

    if (this.currentStepIndex === -1) {
      return this.start();
    }

    const step = this.getCurrentStep();
    if (!step) {
      throw new Error('No current step to repeat.');
    }

    this.status = 'READING_STEP';
    this.recordHistory(`Repeating step ${step.id}`);
    this.handleStepEntered(step);
    this.notifyListeners();
    return step;
  }

  /**
   * Directly jumps to a specific 1-based step number or 0-based index
   */
  jump_to_step(stepNumber: number): RecipeStep {
    this.assertRecipeLoaded();

    const targetIndex = stepNumber - 1;
    if (targetIndex < 0 || targetIndex >= this.recipe!.steps.length) {
      throw new Error(`Invalid step number: ${stepNumber}. Recipe has ${this.recipe!.steps.length} steps.`);
    }

    this.currentStepIndex = targetIndex;
    this.status = 'READING_STEP';
    const step = this.getCurrentStep()!;
    this.recordHistory(`Jumped to step ${step.id}`);
    this.handleStepEntered(step);
    this.notifyListeners();
    return step;
  }

  /**
   * Transitions from READING_STEP to AWAITING_INPUT once TTS audio readout is completed
   */
  finish_reading_step(): void {
    if (this.status === 'READING_STEP') {
      this.status = 'AWAITING_INPUT';
      this.notifyListeners();
    }
  }

  /**
   * Deterministically scales recipe ingredients by target servings or factor
   * @param target Either target servings number or scaling multiplier
   * @param isServings If true, target is servings count; if false, target is multiplier factor
   */
  scale_recipe(target: number, isServings: boolean = true): Recipe {
    this.assertRecipeLoaded();

    if (target <= 0) {
      throw new Error(`Scale target must be positive. Received: ${target}`);
    }

    let factor: number;
    let newServings: number;

    if (isServings) {
      newServings = target;
      factor = target / this.recipe!.originalServings;
    } else {
      factor = target;
      newServings = Math.round(this.recipe!.originalServings * factor * 10) / 10;
    }

    this.recipe!.scaleFactor = Math.round(factor * 1000) / 1000;
    this.recipe!.currentServings = newServings;
    this.recipe!.ingredients = scaleIngredients(this.recipe!.ingredients, factor);

    this.recordHistory(`Scaled recipe to ${newServings} servings (${this.recipe!.scaleFactor}x).`);
    this.notifyListeners();
    return JSON.parse(JSON.stringify(this.recipe));
  }

  /**
   * Formats current ingredients for voice readout or listing
   */
  list_ingredients(): string[] {
    this.assertRecipeLoaded();
    return this.recipe!.ingredients.map(ing => formatIngredientForVoice(ing, 1.0));
  }

  /**
   * Queries an ingredient by name (e.g. "butter", "flour") and returns the formatted quantity
   */
  query_ingredient(nameQuery: string): { found: boolean; ingredient?: Ingredient; spokenText: string } {
    this.assertRecipeLoaded();

    const normalizedQuery = nameQuery.toLowerCase().trim();
    if (!normalizedQuery) {
      return { found: false, spokenText: "Please specify which ingredient you'd like to check." };
    }

    const matched = this.recipe!.ingredients.find(ing =>
      ing.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(ing.name.toLowerCase())
    );

    if (!matched) {
      return {
        found: false,
        spokenText: `I could not find ${nameQuery} in this recipe's ingredients list.`
      };
    }

    const spoken = formatIngredientForVoice(matched, 1.0);
    return {
      found: true,
      ingredient: { ...matched },
      spokenText: `You need ${spoken}.`
    };
  }

  /**
   * Returns current RecipeStep or null
   */
  getCurrentStep(): RecipeStep | null {
    if (!this.recipe || this.currentStepIndex < 0 || this.currentStepIndex >= this.recipe.steps.length) {
      return null;
    }
    return { ...this.recipe.steps[this.currentStepIndex] };
  }

  /**
   * Returns an immutable snapshot of current state
   */
  get_state(): StateSnapshot {
    return {
      status: this.status,
      recipe: this.recipe ? JSON.parse(JSON.stringify(this.recipe)) : null,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.recipe ? this.recipe.steps.length : 0,
      history: [...this.history],
      lastError: this.lastError
    };
  }

  /**
   * Subscribes to all state machine changes
   */
  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.get_state());
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribes to step change events
   */
  onStepChange(listener: StepChangeListener): () => void {
    this.stepChangeListeners.add(listener);
    return () => this.stepChangeListeners.delete(listener);
  }

  private handleStepEntered(step: RecipeStep): void {
    for (const listener of this.stepChangeListeners) {
      try {
        listener(step, this.currentStepIndex, this.recipe!.steps.length);
      } catch (err) {
        console.error('Error in StepChangeListener:', err);
      }
    }
  }

  private recordHistory(entry: string): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    this.history.push(`[${timestamp}] ${entry}`);
  }

  private notifyListeners(): void {
    const snapshot = this.get_state();
    for (const listener of this.stateListeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in StateListener:', err);
      }
    }
  }

  private assertRecipeLoaded(): void {
    if (!this.recipe) {
      this.lastError = 'No recipe currently loaded';
      throw new Error('No recipe currently loaded. Call loadRecipe() first.');
    }
  }
}
