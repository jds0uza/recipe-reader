import test from 'node:test';
import assert from 'node:assert/strict';
import { RecipeStateMachine } from '../src/core/state-machine.ts';
import { parseVoiceCommand } from '../src/voice/command-parser.ts';
import { TUSCAN_GARLIC_CHICKEN } from '../src/fixtures/sample-recipes.ts';
import type { StateSnapshot } from '../src/core/types.ts';

test('Integration Test - End-to-End Voice Cooking Session', async (t) => {
  const sm = new RecipeStateMachine();
  const stateTransitions: string[] = [];

  sm.subscribe((snapshot: StateSnapshot) => {
    stateTransitions.push(snapshot.status);
  });

  // 1. Load recipe
  sm.loadRecipe(TUSCAN_GARLIC_CHICKEN);
  assert.equal(sm.get_state().status, 'READY');
  assert.equal(sm.get_state().recipe?.currentServings, 4);

  // 2. User says: "scale the recipe to 2 servings"
  const scaleIntent = parseVoiceCommand('scale the recipe to 2 servings');
  assert.equal(scaleIntent.action, 'SCALE_RECIPE');
  sm.scale_recipe(scaleIntent.payload!.targetServings!);
  assert.equal(sm.get_state().recipe?.currentServings, 2);
  assert.equal(sm.get_state().recipe?.scaleFactor, 0.5);

  // 3. User asks: "how much chicken do I need?"
  const queryIntent = parseVoiceCommand('how much chicken do I need?');
  assert.equal(queryIntent.action, 'QUERY_INGREDIENT');
  const queryResult = sm.query_ingredient('chicken');
  assert.equal(queryResult.found, true);
  // 1.5 lbs halved = 0.75 lbs -> 3/4 lbs
  assert.ok(queryResult.spokenText.includes('three quarters lbs of boneless skinless chicken breasts'));

  // 4. User says: "what is next" -> Starts Step 1
  const next1 = parseVoiceCommand('what is next');
  assert.equal(next1.action, 'NEXT_STEP');
  const step1 = sm.next_step().step;
  assert.equal(step1?.id, 1);
  assert.equal(sm.get_state().status, 'READING_STEP');
  sm.finish_reading_step();
  assert.equal(sm.get_state().status, 'AWAITING_INPUT');

  // 5. User says: "next step" -> Advances to Step 2 (sear chicken)
  const next2 = parseVoiceCommand('next step');
  assert.equal(next2.action, 'NEXT_STEP');
  const step2 = sm.next_step().step;
  assert.equal(step2?.id, 2);
  assert.equal(step2?.timerSeconds, 300); // 5 minutes timer
  sm.finish_reading_step();

  // 6. User says: "set a timer for 5 minutes"
  const timerIntent = parseVoiceCommand('set a timer for 5 minutes');
  assert.equal(timerIntent.action, 'START_TIMER');
  const timer = sm.set_timer(timerIntent.payload!.timerSeconds!, timerIntent.payload!.timerLabel);
  assert.equal(timer.durationSeconds, 300);
  assert.equal(sm.get_state().activeTimers.length, 1);

  // 7. Fast forward 5 minutes deterministically
  let expiredTimerLabel = '';
  sm.onTimerExpired((exp) => {
    expiredTimerLabel = exp.label;
  });
  sm.tick(300);
  assert.ok(expiredTimerLabel.includes('Timer'));
  assert.equal(sm.get_state().activeTimers.length, 0);

  // 8. User asks: "say that again" -> Repeats current step 2
  const repeatIntent = parseVoiceCommand('say that again');
  assert.equal(repeatIntent.action, 'REPEAT_STEP');
  const repeatedStep = sm.repeat_step();
  assert.equal(repeatedStep.id, 2);
  assert.equal(sm.get_state().status, 'READING_STEP');
  sm.finish_reading_step();

  // 9. Jump to step 6 (final step)
  const jumpIntent = parseVoiceCommand('jump to step 6');
  assert.equal(jumpIntent.action, 'JUMP_TO_STEP');
  const step6 = sm.jump_to_step(jumpIntent.payload!.stepIndex!);
  assert.equal(step6.id, 6);
  sm.finish_reading_step();

  // 10. User says: "done" -> Finishes recipe!
  const doneIntent = parseVoiceCommand('done');
  assert.equal(doneIntent.action, 'NEXT_STEP');
  const finished = sm.next_step();
  assert.equal(finished.status, 'COMPLETED');
  assert.equal(finished.step, null);
  assert.equal(sm.get_state().status, 'COMPLETED');

  // Verify history audit log contains full session trace
  const state = sm.get_state();
  assert.ok(state.history.length >= 6);
  assert.ok(state.history.some(h => h.includes('Scaled recipe to 2 servings')));
  assert.ok(state.history.some(h => h.includes('Started recipe at step 1')));
  assert.ok(state.history.some(h => h.includes('Recipe completed!')));
});
