/**
 * Deterministic Recipe Scaler
 * Handles fraction parsing, quantity scaling, and formatted text generation for display and TTS readout.
 */

import type { Ingredient } from './types.ts';

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

const COMMON_UNITS = [
  'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tb',
  'teaspoon', 'teaspoons', 'tsp', 'ts',
  'cup', 'cups', 'c',
  'ounce', 'ounces', 'oz',
  'fluid ounce', 'fluid ounces', 'fl oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml',
  'liter', 'liters', 'l',
  'pinch', 'pinches',
  'dash', 'dashes',
  'clove', 'cloves',
  'slice', 'slices',
  'piece', 'pieces',
  'sprig', 'sprigs',
  'stalk', 'stalks',
  'can', 'cans',
  'package', 'packages', 'pkg',
  'bunch', 'bunches',
  'head', 'heads'
];

/**
 * Converts a raw quantity string (e.g. "1 1/2", "3/4", "½", "2.5") to a number
 */
export function parseQuantity(str: string): number | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed) return null;

  // Check for unicode fractions directly
  if (UNICODE_FRACTIONS[trimmed] !== undefined) {
    return UNICODE_FRACTIONS[trimmed];
  }

  // Replace unicode fractions with space + decimal or fraction
  let normalized = trimmed;
  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (normalized.includes(char)) {
      normalized = normalized.replace(new RegExp(char, 'g'), ` ${val}`);
    }
  }

  // Handle mixed fractions like "1 1/2" or "1 0.5"
  const parts = normalized.trim().split(/\s+/);
  if (parts.length === 2) {
    const whole = parseFloat(parts[0]);
    const frac = parseQuantity(parts[1]);
    if (!isNaN(whole) && frac !== null) {
      return whole + frac;
    }
  }

  // Handle simple fraction "1/2", "3/4"
  if (trimmed.includes('/')) {
    const [num, denom] = trimmed.split('/').map(s => parseFloat(s.trim()));
    if (!isNaN(num) && !isNaN(denom) && denom !== 0) {
      return num / denom;
    }
  }

  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parses a raw ingredient line into structured Ingredient object
 */
export function parseIngredient(rawText: string, id: string = `ing-${Math.random().toString(36).substr(2, 9)}`): Ingredient {
  const clean = rawText.trim();
  if (!clean) {
    return { id, raw: rawText, name: rawText, quantity: null, unit: null };
  }

  // Match leading quantity: decimals, fractions, unicode fractions, mixed numbers
  // e.g. "1 1/2 cups flour", "½ tsp salt", "2.5 lbs chicken", "salt and pepper to taste"
  const qtyRegex = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/i;
  const qtyMatch = clean.match(qtyRegex);

  let quantity: number | null = null;
  let remaining = clean;

  if (qtyMatch) {
    quantity = parseQuantity(qtyMatch[1].trim());
    remaining = clean.slice(qtyMatch[0].length).trim();
  }

  // Match unit
  let unit: string | null = null;
  const unitMatch = remaining.match(/^([a-z]+(?:\s+[a-z]+)?)\b/i);
  if (unitMatch) {
    const candidateUnit = unitMatch[1].toLowerCase();
    const matched = COMMON_UNITS.find(u => u === candidateUnit || candidateUnit.startsWith(u + ' '));
    if (matched) {
      unit = matched;
      remaining = remaining.slice(unit.length).trim();
      // Remove leading "of" if present, e.g. "1 cup of milk"
      if (remaining.toLowerCase().startsWith('of ')) {
        remaining = remaining.slice(3).trim();
      }
    }
  }

  // Check for notes in parentheses or after comma
  let notes: string | undefined;
  if (remaining.includes(',')) {
    const parts = remaining.split(',');
    remaining = parts[0].trim();
    notes = parts.slice(1).join(',').trim();
  }

  return {
    id,
    raw: rawText,
    name: remaining || clean,
    quantity,
    unit,
    notes
  };
}

/**
 * Converts a decimal quantity into a human-friendly cooking fraction
 */
export function formatQuantityFraction(qty: number): string {
  if (qty <= 0) return '0';

  const tolerance = 0.04;
  const whole = Math.floor(qty);
  const remainder = qty - whole;

  const fractionMap: Array<[number, string]> = [
    [0.125, '1/8'],
    [0.25, '1/4'],
    [0.333, '1/3'],
    [0.375, '3/8'],
    [0.5, '1/2'],
    [0.625, '5/8'],
    [0.667, '2/3'],
    [0.75, '3/4'],
    [0.875, '7/8'],
    [1.0, '1'],
  ];

  if (remainder < tolerance) {
    return whole === 0 ? '0' : `${whole}`;
  }

  for (const [dec, frac] of fractionMap) {
    if (Math.abs(remainder - dec) <= tolerance) {
      if (frac === '1') {
        return `${whole + 1}`;
      }
      return whole > 0 ? `${whole} ${frac}` : frac;
    }
  }

  // Fallback to max 2 decimals, trimmed
  return (Math.round(qty * 100) / 100).toString();
}

/**
 * Converts quantity and unit into natural spoken text for TTS
 */
export function formatIngredientForVoice(ingredient: Ingredient, scaleFactor: number = 1): string {
  if (ingredient.quantity === null) {
    return ingredient.name + (ingredient.notes ? `, ${ingredient.notes}` : '');
  }

  const scaledQty = ingredient.quantity * scaleFactor;
  const formattedFraction = formatQuantityFraction(scaledQty);

  // Spoken conversions for pleasant TTS:
  const voiceFractionMap: Record<string, string> = {
    '1/8': 'one eighth',
    '1/4': 'one quarter',
    '1/3': 'one third',
    '3/8': 'three eighths',
    '1/2': 'one half',
    '5/8': 'five eighths',
    '2/3': 'two thirds',
    '3/4': 'three quarters',
    '7/8': 'seven eighths',
  };

  let spokenQty = formattedFraction;
  for (const [frac, spoken] of Object.entries(voiceFractionMap)) {
    if (formattedFraction.includes(frac)) {
      spokenQty = formattedFraction.replace(frac, spoken);
      break;
    }
  }

  const unitPart = ingredient.unit ? ` ${ingredient.unit}` : '';
  const notesPart = ingredient.notes ? `, ${ingredient.notes}` : '';
  return `${spokenQty}${unitPart} of ${ingredient.name}${notesPart}`;
}

/**
 * Deterministically scales an array of ingredients by a given factor
 */
export function scaleIngredients(ingredients: Ingredient[], scaleFactor: number): Ingredient[] {
  if (scaleFactor <= 0) {
    throw new Error(`Scale factor must be positive, received: ${scaleFactor}`);
  }

  return ingredients.map(ing => {
    if (ing.quantity === null) {
      return { ...ing };
    }
    const scaledQuantity = Math.round(ing.quantity * scaleFactor * 1000) / 1000;
    return {
      ...ing,
      quantity: scaledQuantity
    };
  });
}
