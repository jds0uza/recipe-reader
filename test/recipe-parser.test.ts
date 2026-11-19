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

  await t.test('extracts inline section headers from JSON-LD recipeIngredient', () => {
    const html = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": "Meatballs with Gravy",
      "recipeIngredient": [
        "## Meatballs",
        "1 lb ground pork",
        "1 large egg",
        "## Gravy",
        "2 tbsp butter",
        "2 cups beef broth",
        "## Toppings",
        "fresh parsley"
      ],
      "recipeInstructions": ["Cook meatballs.", "Make gravy."]
    }
    </script>
    `;

    const recipe = extractRecipeFromHtml(html);
    assert.equal(recipe.ingredients.length, 5);
    assert.equal(recipe.ingredients[0].group, 'Meatballs');
    assert.equal(recipe.ingredients[0].name, 'ground pork');
    assert.equal(recipe.ingredients[1].group, 'Meatballs');
    assert.equal(recipe.ingredients[2].group, 'Gravy');
    assert.equal(recipe.ingredients[2].name, 'butter');
    assert.equal(recipe.ingredients[3].group, 'Gravy');
    assert.equal(recipe.ingredients[4].group, 'Toppings');
  });

  await t.test('extracts structured ingredient groups from HTML markup', () => {
    const html = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": "Pork Meatballs",
      "recipeIngredient": [
        "1 1/2 tbsp olive oil",
        "1 lb pork mince",
        "2 tbsp butter",
        "2 cups beef stock"
      ],
      "recipeInstructions": ["Cook."]
    }
    </script>
    <div class="wprm-recipe-ingredient-group">
      <ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient">1 1/2 tbsp olive oil</li></ul>
    </div>
    <div class="wprm-recipe-ingredient-group">
      <h4 class="wprm-recipe-group-name">MEATBALLS:</h4>
      <ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient">1 lb pork mince</li></ul>
    </div>
    <div class="wprm-recipe-ingredient-group">
      <h4 class="wprm-recipe-group-name">ONION GRAVY:</h4>
      <ul class="wprm-recipe-ingredients">
        <li class="wprm-recipe-ingredient">2 tbsp butter</li>
        <li class="wprm-recipe-ingredient">2 cups beef stock</li>
      </ul>
    </div>
    `;

    const recipe = extractRecipeFromHtml(html);
    assert.equal(recipe.ingredients.length, 4);
    assert.equal(recipe.ingredients[0].group, undefined);
    assert.equal(recipe.ingredients[1].group, 'Meatballs');
    assert.equal(recipe.ingredients[2].group, 'Onion Gravy');
    assert.equal(recipe.ingredients[3].group, 'Onion Gravy');
  });
});
