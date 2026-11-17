import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectStepTimerSeconds,
  parseIsoDuration,
  parseRecipeServings,
  extractRecipeFromHtml
} from '../src/core/recipe-parser.ts';
import { SAMPLE_JSON_LD_HTML } from '../src/fixtures/sample-recipes.ts';

test('Recipe Parser - Step Timer Auto-Detection', async (t) => {
  await t.test('detects minutes in step descriptions', () => {
    assert.equal(detectStepTimerSeconds('Simmer covered for 15 minutes.'), 900);
    assert.equal(detectStepTimerSeconds('Bake in the preheated oven for 25 to 30 minutes.'), 1500);
    assert.equal(detectStepTimerSeconds('Rest dough for 5 mins.'), 300);
  });

  await t.test('detects seconds in step descriptions', () => {
    assert.equal(detectStepTimerSeconds('Whisk vigorously for 45 seconds.'), 45);
    assert.equal(detectStepTimerSeconds('Microwave for 30 secs.'), 30);
  });

  await t.test('detects hours and mixed durations', () => {
    assert.equal(detectStepTimerSeconds('Chill in refrigerator for 2 hours.'), 7200);
    assert.equal(detectStepTimerSeconds('Slow cook for 1 hour and 30 minutes.'), 5400);
  });

  await t.test('returns undefined when no duration mentioned', () => {
    assert.equal(detectStepTimerSeconds('Preheat oven to 400 degrees and grease a baking pan.'), undefined);
  });
});

test('Recipe Parser - ISO Duration & Servings Parsing', async (t) => {
  await t.test('parses ISO 8601 durations', () => {
    assert.equal(parseIsoDuration('PT15M'), 15);
    assert.equal(parseIsoDuration('PT1H30M'), 90);
    assert.equal(parseIsoDuration('PT2H'), 120);
    assert.equal(parseIsoDuration(undefined), undefined);
  });

  await t.test('parses recipe yield formats', () => {
    assert.equal(parseRecipeServings(4), 4);
    assert.equal(parseRecipeServings('6 servings'), 6);
    assert.equal(parseRecipeServings('Yield: 12 cookies'), 12);
    assert.equal(parseRecipeServings(['8 people']), 8);
    assert.equal(parseRecipeServings(undefined), 4);
  });
});

test('Recipe Parser - Schema.org HTML Extraction', async (t) => {
  await t.test('extracts recipe title, ingredients, and steps from embedded JSON-LD', () => {
    const recipe = extractRecipeFromHtml(SAMPLE_JSON_LD_HTML, 'https://example.com/pancakes');

    assert.equal(recipe.title, 'Fluffy Buttermilk Blueberry Pancakes');
    assert.equal(recipe.currentServings, 4);
    assert.equal(recipe.prepTimeMinutes, 10);
    assert.equal(recipe.cookTimeMinutes, 15);
    assert.equal(recipe.ingredients.length, 9);
    assert.equal(recipe.steps.length, 5);

    // Checks auto-detected timer in step 3: "Let batter rest for 5 minutes." -> 300s
    assert.equal(recipe.steps[2].timerSeconds, 300);

    // Checks auto-detected timer in step 4: "cook for 3 minutes" -> 180s
    assert.equal(recipe.steps[3].timerSeconds, 180);
  });
});
