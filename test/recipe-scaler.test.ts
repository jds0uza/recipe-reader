import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuantity,
  parseIngredient,
  formatQuantityFraction,
  formatIngredientForVoice,
  formatUnitForVoice,
  expandTextForSpeech,
  scaleIngredients
} from '../src/core/recipe-scaler.ts';

test('Recipe Scaler - Quantity Parsing', async (t) => {
  await t.test('parses simple integers and decimals', () => {
    assert.equal(parseQuantity('2'), 2);
    assert.equal(parseQuantity('1.5'), 1.5);
    assert.equal(parseQuantity('0.25'), 0.25);
  });

  await t.test('parses unicode fractions', () => {
    assert.equal(parseQuantity('½'), 0.5);
    assert.equal(parseQuantity('¼'), 0.25);
    assert.equal(parseQuantity('¾'), 0.75);
    assert.equal(Math.round(parseQuantity('⅓')! * 100) / 100, 0.33);
  });

  await t.test('parses string fractions and mixed fractions', () => {
    assert.equal(parseQuantity('1/2'), 0.5);
    assert.equal(parseQuantity('3/4'), 0.75);
    assert.equal(parseQuantity('1 1/2'), 1.5);
    assert.equal(parseQuantity('2 1/4'), 2.25);
  });

  await t.test('returns null for empty or invalid strings', () => {
    assert.equal(parseQuantity(''), null);
    assert.equal(parseQuantity('pinch'), null);
  });
});

test('Recipe Scaler - Ingredient Parsing', async (t) => {
  await t.test('parses quantity, unit, name, and notes', () => {
    const ing1 = parseIngredient('2 1/4 cups all-purpose flour');
    assert.equal(ing1.quantity, 2.25);
    assert.equal(ing1.unit, 'cups');
    assert.equal(ing1.name, 'all-purpose flour');

    const ing2 = parseIngredient('1 cup unsalted butter, softened');
    assert.equal(ing2.quantity, 1);
    assert.equal(ing2.unit, 'cup');
    assert.equal(ing2.name, 'unsalted butter');
    assert.equal(ing2.notes, 'softened');

    const ing3 = parseIngredient('salt and freshly ground pepper to taste');
    assert.equal(ing3.quantity, null);
    assert.equal(ing3.unit, null);
    assert.equal(ing3.name, 'salt and freshly ground pepper to taste');

    // Tests stripping redundant outer parens when notes already contain them
    const ing4 = parseIngredient('2 small onions, (halved then cut into 8mm / 1/3" wedges (or 1 1/2 large onions))');
    assert.equal(ing4.quantity, 2);
    assert.equal(ing4.name, 'small onions');
    assert.equal(ing4.notes, 'halved then cut into 8mm / 1/3" wedges (or 1 1/2 large onions)');

    // Tests user's exact case with double parentheses containing commas
    const ing5 = parseIngredient('1 tsp onion powder ((substitute garlic powder, or 1 garlic clove finely grated))');
    assert.equal(ing5.quantity, 1);
    assert.equal(ing5.unit, 'tsp');
    assert.equal(ing5.name, 'onion powder');
    assert.equal(ing5.notes, 'substitute garlic powder, or 1 garlic clove finely grated');

    // Tests double parens without commas
    const ing6 = parseIngredient('3 tbsp flour ((all purpose / plain))');
    assert.equal(ing6.quantity, 3);
    assert.equal(ing6.unit, 'tbsp');
    assert.equal(ing6.name, 'flour');
    assert.equal(ing6.notes, 'all purpose / plain');

    // Tests spaced nested parens
    const ing7 = parseIngredient('2 small onions ( (halved then cut into 8mm / 1/3" wedges (or 1 1/2 large onions)))');
    assert.equal(ing7.quantity, 2);
    assert.equal(ing7.name, 'small onions');
    assert.equal(ing7.notes, 'halved then cut into 8mm / 1/3" wedges (or 1 1/2 large onions)');
  });
});

test('Recipe Scaler - Fraction Formatting', async (t) => {
  await t.test('formats numbers to clean cooking fractions', () => {
    assert.equal(formatQuantityFraction(0.5), '1/2');
    assert.equal(formatQuantityFraction(0.25), '1/4');
    assert.equal(formatQuantityFraction(0.75), '3/4');
    assert.equal(formatQuantityFraction(1.5), '1 1/2');
    assert.equal(formatQuantityFraction(2.25), '2 1/4');
    assert.equal(formatQuantityFraction(3), '3');
  });
});

test('Recipe Scaler - Deterministic Scaling', async (t) => {
  const ingredients = [
    { id: '1', raw: '2 cups flour', name: 'flour', quantity: 2, unit: 'cups' },
    { id: '2', raw: '1/2 tsp salt', name: 'salt', quantity: 0.5, unit: 'tsp' },
    { id: '3', raw: 'dash cinnamon', name: 'cinnamon', quantity: null, unit: null }
  ];

  await t.test('scales up by 2x', () => {
    const scaled = scaleIngredients(ingredients, 2.0);
    assert.equal(scaled[0].quantity, 4);
    assert.equal(scaled[1].quantity, 1);
    assert.equal(scaled[2].quantity, null);
  });

  await t.test('scales down by 0.5x', () => {
    const scaled = scaleIngredients(ingredients, 0.5);
    assert.equal(scaled[0].quantity, 1);
    assert.equal(scaled[1].quantity, 0.25);
  });

  await t.test('throws on zero or negative scale factor', () => {
    assert.throws(() => scaleIngredients(ingredients, 0), /Scale factor must be positive/);
    assert.throws(() => scaleIngredients(ingredients, -1), /Scale factor must be positive/);
  });
});

test('Recipe Scaler - Voice Formatting', async (t) => {
  await t.test('formats naturally for speech synthesis', () => {
    const ing = { id: '1', raw: '1 1/2 cups flour', name: 'flour', quantity: 1.5, unit: 'cups' };
    const spoken = formatIngredientForVoice(ing, 1.0);
    assert.equal(spoken, '1 one half cups of flour');

    const spoken2x = formatIngredientForVoice(ing, 2.0);
    assert.equal(spoken2x, '3 cups of flour');
  });

  await t.test('converts unit abbreviations to full spoken words based on quantity', () => {
    assert.equal(formatUnitForVoice('tsp', 1), 'teaspoon');
    assert.equal(formatUnitForVoice('tsp', 2), 'teaspoons');
    assert.equal(formatUnitForVoice('tbsp', 1), 'tablespoon');
    assert.equal(formatUnitForVoice('tbsp', 3), 'tablespoons');
    assert.equal(formatUnitForVoice('oz', 1), 'ounce');
    assert.equal(formatUnitForVoice('oz', 8), 'ounces');
    assert.equal(formatUnitForVoice('lb', 1), 'pound');
    assert.equal(formatUnitForVoice('lbs', 2), 'pounds');
    assert.equal(formatUnitForVoice('c', 1), 'cup');
    assert.equal(formatUnitForVoice('c', 2), 'cups');
  });

  await t.test('formats ingredients with unit abbreviations into spoken text', () => {
    const onionPowder = { id: '2', raw: '1 tsp onion powder', name: 'onion powder', quantity: 1, unit: 'tsp' };
    assert.equal(formatIngredientForVoice(onionPowder), '1 teaspoon of onion powder');

    const bakingPowder = { id: '3', raw: '2 tsp baking powder', name: 'baking powder', quantity: 2, unit: 'tsp' };
    assert.equal(formatIngredientForVoice(bakingPowder), '2 teaspoons of baking powder');

    const flour = { id: '4', raw: '3 tbsp flour', name: 'flour', quantity: 3, unit: 'tbsp' };
    assert.equal(formatIngredientForVoice(flour), '3 tablespoons of flour');

    const salt = { id: '5', raw: '1/2 tsp salt', name: 'salt', quantity: 0.5, unit: 'tsp' };
    assert.equal(formatIngredientForVoice(salt), 'one half teaspoon of salt');
  });

  await t.test('expands text abbreviations in step instructions', () => {
    assert.equal(
      expandTextForSpeech('Add 1 tsp salt and 2 tbsp olive oil.'),
      'Add 1 teaspoon salt and 2 tablespoons olive oil.'
    );
    assert.equal(
      expandTextForSpeech('Simmer for 15 min.'),
      'Simmer for 15 minutes.'
    );
    assert.equal(
      expandTextForSpeech('Mix 1/2 tsp pepper with 1 lb beef.'),
      'Mix one half teaspoon pepper with 1 pound beef.'
    );
  });
});
