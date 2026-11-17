import test from 'node:test';
import assert from 'node:assert/strict';
import { RecipeStateMachine } from '../src/core/state-machine.ts';
import { CHOCOLATE_CHIP_COOKIES } from '../src/fixtures/sample-recipes.ts';

test('Recipe State Machine - Initialization & Loading', async (t) => {
  await t.test('starts in IDLE state', () => {
    const sm = new RecipeStateMachine();
    const state = sm.get_state();
    assert.equal(state.status, 'IDLE');
    assert.equal(state.recipe, null);
    assert.equal(state.currentStepIndex, -1);
  });

  await t.test('loads recipe into READY state', () => {
    const sm = new RecipeStateMachine();
    sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

    const state = sm.get_state();
    assert.equal(state.status, 'READY');
    assert.equal(state.recipe?.title, 'Classic Chewy Chocolate Chip Cookies');
    assert.equal(state.totalSteps, 8);
    assert.equal(state.currentStepIndex, -1);
  });

  await t.test('throws when calling next_step without loading recipe', () => {
    const sm = new RecipeStateMachine();
    assert.throws(() => sm.next_step(), /No recipe currently loaded/);
  });
});

test('Recipe State Machine - Step Traversal & Progression', async (t) => {
  await t.test('first next_step() starts at step 1 in READING_STEP', () => {
    const sm = new RecipeStateMachine();
    sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

    const result = sm.next_step();
    assert.equal(result.status, 'READING_STEP');
    assert.equal(result.step?.id, 1);
    assert.equal(sm.get_state().currentStepIndex, 0);

    // Finish reading step transitions to AWAITING_INPUT
    sm.finish_reading_step();
    assert.equal(sm.get_state().status, 'AWAITING_INPUT');
  });

  await t.test('advances through steps sequentially with next_step()', () => {
    const sm = new RecipeStateMachine();
    sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

    sm.next_step(); // Step 1
    assert.equal(sm.get_state().currentStepIndex, 0);

    sm.next_step(); // Step 2
    assert.equal(sm.get_state().currentStepIndex, 1);
    assert.equal(sm.getCurrentStep()?.id, 2);

    sm.next_step(); // Step 3
    assert.equal(sm.get_state().currentStepIndex, 2);
    assert.equal(sm.getCurrentStep()?.id, 3);
  });

  await t.test('previous_step() goes back one step and bounds at step 1', () => {
    const sm = new RecipeStateMachine();
    sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

    sm.next_step(); // Step 1
    sm.next_step(); // Step 2
    assert.equal(sm.getCurrentStep()?.id, 2);

    sm.previous_step(); // Back to Step 1
    assert.equal(sm.getCurrentStep()?.id, 1);

    // Calling previous_step() again stays at Step 1
    sm.previous_step();
    assert.equal(sm.getCurrentStep()?.id, 1);
    assert.equal(sm.get_state().currentStepIndex, 0);
  });

  await t.test('repeat_step() re-triggers current step without changing index', () => {
    const sm = new RecipeStateMachine();
    sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

    sm.next_step(); // Step 1
    sm.next_step(); // Step 2
    sm.finish_reading_step();
    assert.equal(sm.get_state().status, 'AWAITING_INPUT');

    const step = sm.repeat_step();
    assert.equal(step.id, 2);
    assert.equal(sm.get_state().status, 'READING_STEP');
    assert.equal(sm.get_state().currentStepIndex, 1);
  });

  await t.test('jump_to_step() jumps directly to target step', () => {
    const sm = new RecipeStateMachine();
    sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

    const step5 = sm.jump_to_step(5);
    assert.equal(step5.id, 5);
    assert.equal(sm.get_state().currentStepIndex, 4);

    assert.throws(() => sm.jump_to_step(99), /Invalid step number/);
    assert.throws(() => sm.jump_to_step(0), /Invalid step number/);
  });

  await t.test('transitions to COMPLETED when advancing past last step', () => {
    const sm = new RecipeStateMachine();
    sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

    sm.jump_to_step(8); // Last step
    assert.equal(sm.get_state().status, 'READING_STEP');

    const result = sm.next_step();
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.step, null);
    assert.equal(sm.get_state().status, 'COMPLETED');
  });
});

test('Recipe State Machine - Ingredient Queries & Voice Readout', async (t) => {
  const sm = new RecipeStateMachine();
  sm.loadRecipe(CHOCOLATE_CHIP_COOKIES);

  await t.test('queries ingredient quantity by name', () => {
    const butter = sm.query_ingredient('butter');
    assert.equal(butter.found, true);
    assert.ok(butter.spokenText.includes('1 cup of unsalted butter'));

    const flour = sm.query_ingredient('flour');
    assert.equal(flour.found, true);
    assert.ok(flour.spokenText.includes('all-purpose flour'));
  });

  await t.test('handles missing ingredient query gracefully', () => {
    const saffron = sm.query_ingredient('saffron');
    assert.equal(saffron.found, false);
    assert.ok(saffron.spokenText.includes('could not find saffron'));
  });

  await t.test('lists all ingredients formatted for voice', () => {
    const list = sm.list_ingredients();
    assert.equal(list.length, 9);
    assert.ok(list[0].includes('flour'));
  });
});
