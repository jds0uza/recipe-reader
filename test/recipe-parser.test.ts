import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIsoDuration,
  parseRecipeServings,
  extractRecipeFromHtml
} from '../src/core/recipe-parser.ts';
import { SAMPLE_JSON_LD_HTML } from '../src/fixtures/sample-recipes.ts';

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
  });
});
