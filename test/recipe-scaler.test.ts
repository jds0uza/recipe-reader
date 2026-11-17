import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuantity,
  parseIngredient,
  formatQuantityFraction,
  formatIngredientForVoice,
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
});
