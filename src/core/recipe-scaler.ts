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
 * Decodes standard and numeric HTML entities
 */
export function cleanHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Strips matching outer parentheses safely using depth tracking
 */
function stripOuterParens(text: string): string {
  let s = text.trim();
  let changed = true;
  while (changed && s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let matchedEnd = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') {
        depth--;
        if (depth === 0) {
          if (i === s.length - 1) matchedEnd = true;
          break;
        }
      }
    }
    if (matchedEnd) {
      s = s.slice(1, -1).trim();
    } else {
      changed = false;
    }
  }
  return s;
}

/**
 * Strips outer brackets and common leading punctuation from ingredient notes
 */
function cleanIngredientNotes(notes?: string): string | undefined {
  if (!notes) return undefined;
  let s = stripOuterParens(notes);
  // Remove leading comma, dash, colon, or semicolon (e.g. ", or olive oil", "- for colour")
  s = s.replace(/^[,;:\-\s]+/, '').trim();
  s = stripOuterParens(s);
  return s || undefined;
}

/**
 * Detects and extracts trailing parenthetical notes from an ingredient string,
 * scanning backward from the final ')' to correctly handle nested parens and double brackets.
 */
function extractTrailingParenthetical(str: string): { name: string; notes: string } | null {
  const s = str.trim();
  if (!s.endsWith(')')) return null;

  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++;
    else if (s[i] === '(') {
      depth--;
      if (depth === 0) {
        let startIdx = i;
        while (startIdx > 0 && (s[startIdx - 1] === '(' || (s[startIdx - 1] === ' ' && startIdx > 1 && s[startIdx - 2] === '('))) {
          startIdx--;
        }
        return {
          name: s.slice(0, startIdx).trim(),
          notes: s.slice(startIdx).trim()
        };
      }
    }
  }
  return null;
}

/**
 * Parses a raw ingredient line into structured Ingredient object
 */
export function parseIngredient(rawText: string, id: string = `ing-${Math.random().toString(36).substr(2, 9)}`): Ingredient {
  const clean = cleanHtmlEntities(rawText).trim();
  if (!clean) {
    return { id, raw: rawText, name: rawText, quantity: null, unit: null };
  }

  // 1. Dual measurement support (e.g. '500 g/ 1 lb pork mince', '30g / 2 tbsp butter')
  const dualMeasureRegex = /^(\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s*([a-z]+)\s*\/\s*(\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s*([a-z]+)\s+(.*)/i;
  const dualMatch = clean.match(dualMeasureRegex);

  let quantity: number | null = null;
  let unit: string | null = null;
  let remaining = clean;

  if (dualMatch) {
    quantity = parseQuantity(dualMatch[1]);
    const unit1 = dualMatch[2].toLowerCase();
    const unit2 = dualMatch[4].toLowerCase();
    unit = `${unit1} / ${dualMatch[3]} ${unit2}`;
    remaining = dualMatch[5].trim();
  } else {
    // 2. Quantity range: e.g. '1/4 - 1/2 tsp' or '1 - 2 cloves'
    const rangeRegex = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*[-–—]\s*((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/i;
    const rangeMatch = remaining.match(rangeRegex);

    if (rangeMatch) {
      quantity = parseQuantity(rangeMatch[2]);
      remaining = remaining.slice(rangeMatch[0].length).trim();
    } else {
      // 3. Single leading quantity
      const qtyRegex = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/i;
      const qtyMatch = remaining.match(qtyRegex);

      if (qtyMatch) {
        quantity = parseQuantity(qtyMatch[1].trim());
        remaining = remaining.slice(qtyMatch[0].length).trim();
      }
    }

    // Match unit
    const unitMatch = remaining.match(/^([a-z]+(?:\s+[a-z]+)?)\b/i);
    if (unitMatch) {
      const candidateUnit = unitMatch[1].toLowerCase();
      const matched = COMMON_UNITS.find(u => u === candidateUnit || candidateUnit.startsWith(u + ' '));
      if (matched) {
        unit = matched;
        remaining = remaining.slice(unit.length).trim();
        if (remaining.toLowerCase().startsWith('of ')) {
          remaining = remaining.slice(3).trim();
        }
      }
    }
  }

  // 4. Extract name and notes
  let candidateName = remaining;
  let notes: string | undefined;

  // Check for trailing parenthetical first (handles nested parens and double brackets without splitting commas inside them)
  const trailingParen = extractTrailingParenthetical(remaining);
  if (trailingParen) {
    candidateName = trailingParen.name;
    notes = cleanIngredientNotes(trailingParen.notes);
  } else if (remaining.includes(',')) {
    // If no trailing parenthetical, split by the first comma that is outside of any parentheses
    let commaIdx = -1;
    let depth = 0;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === '(') depth++;
      else if (remaining[i] === ')') depth = Math.max(0, depth - 1);
      else if (remaining[i] === ',' && depth === 0) {
        commaIdx = i;
        break;
      }
    }

    if (commaIdx !== -1) {
      candidateName = remaining.slice(0, commaIdx);
      notes = cleanIngredientNotes(remaining.slice(commaIdx + 1));
    }
  }

  // Strip trailing/leading punctuation or dangling parens from candidateName
  let finalName = candidateName.replace(/[,;:\-\s(]+$/, '').replace(/^[\s(]+/, '').trim();
  if (!finalName) {
    finalName = clean;
  }

  return {
    id,
    raw: rawText,
    name: finalName,
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

export const UNIT_EXPANSIONS: Record<string, { singular: string; plural: string }> = {
  tsp: { singular: 'teaspoon', plural: 'teaspoons' },
  ts: { singular: 'teaspoon', plural: 'teaspoons' },
  teaspoon: { singular: 'teaspoon', plural: 'teaspoons' },
  teaspoons: { singular: 'teaspoon', plural: 'teaspoons' },

  tbsp: { singular: 'tablespoon', plural: 'tablespoons' },
  tbs: { singular: 'tablespoon', plural: 'tablespoons' },
  tb: { singular: 'tablespoon', plural: 'tablespoons' },
  tablespoon: { singular: 'tablespoon', plural: 'tablespoons' },
  tablespoons: { singular: 'tablespoon', plural: 'tablespoons' },

  c: { singular: 'cup', plural: 'cups' },
  cup: { singular: 'cup', plural: 'cups' },
  cups: { singular: 'cup', plural: 'cups' },

  oz: { singular: 'ounce', plural: 'ounces' },
  ounce: { singular: 'ounce', plural: 'ounces' },
  ounces: { singular: 'ounce', plural: 'ounces' },

  'fl oz': { singular: 'fluid ounce', plural: 'fluid ounces' },
  'fl. oz': { singular: 'fluid ounce', plural: 'fluid ounces' },
  'fl oz.': { singular: 'fluid ounce', plural: 'fluid ounces' },
  'fluid ounce': { singular: 'fluid ounce', plural: 'fluid ounces' },
  'fluid ounces': { singular: 'fluid ounce', plural: 'fluid ounces' },

  lb: { singular: 'pound', plural: 'pounds' },
  lbs: { singular: 'pound', plural: 'pounds' },
  pound: { singular: 'pound', plural: 'pounds' },
  pounds: { singular: 'pound', plural: 'pounds' },

  g: { singular: 'gram', plural: 'grams' },
  gram: { singular: 'gram', plural: 'grams' },
  grams: { singular: 'gram', plural: 'grams' },

  kg: { singular: 'kilogram', plural: 'kilograms' },
  kgs: { singular: 'kilogram', plural: 'kilograms' },
  kilogram: { singular: 'kilogram', plural: 'kilograms' },
  kilograms: { singular: 'kilogram', plural: 'kilograms' },

  ml: { singular: 'milliliter', plural: 'milliliters' },
  milliliter: { singular: 'milliliter', plural: 'milliliters' },
  milliliters: { singular: 'milliliter', plural: 'milliliters' },

  l: { singular: 'liter', plural: 'liters' },
  liter: { singular: 'liter', plural: 'liters' },
  liters: { singular: 'liter', plural: 'liters' },

  pt: { singular: 'pint', plural: 'pints' },
  pint: { singular: 'pint', plural: 'pints' },
  pints: { singular: 'pint', plural: 'pints' },

  qt: { singular: 'quart', plural: 'quarts' },
  quart: { singular: 'quart', plural: 'quarts' },
  quarts: { singular: 'quart', plural: 'quarts' },

  gal: { singular: 'gallon', plural: 'gallons' },
  gallon: { singular: 'gallon', plural: 'gallons' },
  gallons: { singular: 'gallon', plural: 'gallons' },

  pinch: { singular: 'pinch', plural: 'pinches' },
  pinches: { singular: 'pinch', plural: 'pinches' },

  dash: { singular: 'dash', plural: 'dashes' },
  dashes: { singular: 'dash', plural: 'dashes' },

  clove: { singular: 'clove', plural: 'cloves' },
  cloves: { singular: 'clove', plural: 'cloves' },

  slice: { singular: 'slice', plural: 'slices' },
  slices: { singular: 'slice', plural: 'slices' },

  piece: { singular: 'piece', plural: 'pieces' },
  pieces: { singular: 'piece', plural: 'pieces' },

  sprig: { singular: 'sprig', plural: 'sprigs' },
  sprigs: { singular: 'sprig', plural: 'sprigs' },

  stalk: { singular: 'stalk', plural: 'stalks' },
  stalks: { singular: 'stalk', plural: 'stalks' },

  can: { singular: 'can', plural: 'cans' },
  cans: { singular: 'can', plural: 'cans' },

  pkg: { singular: 'package', plural: 'packages' },
  pkgs: { singular: 'package', plural: 'packages' },
  package: { singular: 'package', plural: 'packages' },
  packages: { singular: 'package', plural: 'packages' },

  bunch: { singular: 'bunch', plural: 'bunches' },
  bunches: { singular: 'bunch', plural: 'bunches' },

  head: { singular: 'head', plural: 'heads' },
  heads: { singular: 'head', plural: 'heads' },
};

/**
 * Normalizes unit abbreviations to their full spoken singular or plural form for TTS
 */
export function formatUnitForVoice(unit: string | null | undefined, quantity: number | null): string {
  if (!unit) return '';
  const trimmed = unit.trim();
  if (!trimmed) return '';

  const isPlural = quantity !== null && quantity > 1;

  if (trimmed === 'T') {
    return isPlural ? 'tablespoons' : 'tablespoon';
  }
  if (trimmed === 't') {
    return isPlural ? 'teaspoons' : 'teaspoon';
  }

  const cleanUnit = trimmed.toLowerCase().replace(/\.+$/, '');
  const match = UNIT_EXPANSIONS[cleanUnit];
  if (match) {
    return isPlural ? match.plural : match.singular;
  }

  return trimmed;
}

/**
 * Expands fractions and common unit abbreviations in arbitrary text (e.g. step instructions) for natural TTS
 */
export function expandTextForSpeech(text: string): string {
  if (!text) return '';

  let result = text;

  // 1. Expand fractions
  const fractionReplacements: [RegExp, string][] = [
    [/\b1\/8\b/g, 'one eighth'],
    [/\b1\/4\b/g, 'one quarter'],
    [/\b1\/3\b/g, 'one third'],
    [/\b3\/8\b/g, 'three eighths'],
    [/\b1\/2\b/g, 'one half'],
    [/\b5\/8\b/g, 'five eighths'],
    [/\b2\/3\b/g, 'two thirds'],
    [/\b3\/4\b/g, 'three quarters'],
    [/\b7\/8\b/g, 'seven eighths'],
    [/½/g, 'one half'],
    [/⅓/g, 'one third'],
    [/⅔/g, 'two thirds'],
    [/¼/g, 'one quarter'],
    [/¾/g, 'three quarters'],
  ];
  for (const [pattern, replacement] of fractionReplacements) {
    result = result.replace(pattern, replacement);
  }

  // 2. Expand common unit abbreviations
  result = result.replace(/\b(1|one half|one quarter|one third|three quarters|one eighth)\s*(?:tsp|ts)\.?\b/gi, '$1 teaspoon');
  result = result.replace(/\b(1|one half|one quarter|one third|three quarters|one eighth)\s*(?:tbsp|tbs|tb)\.?\b/gi, '$1 tablespoon');
  result = result.replace(/\b(1|one half|one quarter|one third|three quarters|one eighth)\s*(?:oz)\.?\b/gi, '$1 ounce');
  result = result.replace(/\b(1|one half|one quarter|one third|three quarters|one eighth)\s*(?:lb)\.?\b/gi, '$1 pound');
  result = result.replace(/\b(1|one half|one quarter|one third|three quarters|one eighth)\s*(?:min|mins)\.?\b/gi, '$1 minute');
  result = result.replace(/\b(1|one half|one quarter|one third|three quarters|one eighth)\s*(?:hr|hrs)\.?\b/gi, '$1 hour');

  result = result.replace(/\b(\d+(?:\.\d+)?)\s*(?:tsp|ts|teaspoons?)\.?\b/gi, (_match, num) => {
    return parseFloat(num) <= 1 ? `${num} teaspoon` : `${num} teaspoons`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*(?:tbsp|tbs|tb|tablespoons?)\.?\b/gi, (_match, num) => {
    return parseFloat(num) <= 1 ? `${num} tablespoon` : `${num} tablespoons`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\.?\b/gi, (_match, num) => {
    return parseFloat(num) <= 1 ? `${num} ounce` : `${num} ounces`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\.?\b/gi, (_match, num) => {
    return parseFloat(num) <= 1 ? `${num} pound` : `${num} pounds`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\.?\b/gi, (_match, num) => {
    return parseFloat(num) <= 1 ? `${num} minute` : `${num} minutes`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*(?:hr|hrs|hours?)\.?\b/gi, (_match, num) => {
    return parseFloat(num) <= 1 ? `${num} hour` : `${num} hours`;
  });

  return result;
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

  const spokenUnit = formatUnitForVoice(ingredient.unit, scaledQty);
  const unitPart = spokenUnit ? ` ${spokenUnit}` : '';
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
