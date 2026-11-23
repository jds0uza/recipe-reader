/**
 * SousChef Browser UI Controller
 * Integrates the deterministic state machine with browser window.speechSynthesis & SpeechRecognition
 */

// --- Deterministic Recipe Scaler (Browser Implementation) ---
const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCharCode(parseInt(code, 10)); } catch { return _; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try { return String.fromCharCode(parseInt(code, 16)); } catch { return _; }
    })
    .replace(/<[^>]+>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatQuantityFraction(qty) {
  if (qty <= 0) return '0';
  const tolerance = 0.04;
  const whole = Math.floor(qty);
  const remainder = qty - whole;
  const fractionMap = [
    [0.125, '1/8'], [0.25, '1/4'], [0.333, '1/3'], [0.375, '3/8'],
    [0.5, '1/2'], [0.625, '5/8'], [0.667, '2/3'], [0.75, '3/4'],
    [0.875, '7/8'], [1.0, '1']
  ];
  if (remainder < tolerance) return whole === 0 ? '0' : `${whole}`;
  for (const [dec, frac] of fractionMap) {
    if (Math.abs(remainder - dec) <= tolerance) {
      if (frac === '1') return `${whole + 1}`;
      return whole > 0 ? `${whole} ${frac}` : frac;
    }
  }
  return (Math.round(qty * 100) / 100).toString();
}

const UNIT_EXPANSIONS = {
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

function formatUnitForVoice(unit, quantity) {
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

function expandTextForSpeech(text) {
  if (!text) return '';

  let result = text;

  // 1. Expand fractions
  const fractionReplacements = [
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

// --- Client-Side Recipe Parser (Enables direct parsing on static GitHub Pages) ---
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

function parseQuantity(str) {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed) return null;

  if (UNICODE_FRACTIONS[trimmed] !== undefined) {
    return UNICODE_FRACTIONS[trimmed];
  }

  let normalized = trimmed;
  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (normalized.includes(char)) {
      normalized = normalized.replace(new RegExp(char, 'g'), ` ${val}`);
    }
  }

  const parts = normalized.trim().split(/\s+/);
  if (parts.length === 2) {
    const whole = parseFloat(parts[0]);
    const frac = parseQuantity(parts[1]);
    if (!isNaN(whole) && frac !== null) {
      return whole + frac;
    }
  }

  if (trimmed.includes('/')) {
    const [num, denom] = trimmed.split('/').map(s => parseFloat(s.trim()));
    if (!isNaN(num) && !isNaN(denom) && denom !== 0) {
      return num / denom;
    }
  }

  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? null : parsed;
}

function stripOuterParens(text) {
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

function cleanIngredientNotes(notes) {
  if (!notes) return undefined;
  let s = stripOuterParens(notes);
  s = s.replace(/^[,;:\-\s]+/, '').trim();
  s = stripOuterParens(s);
  return s || undefined;
}

function extractTrailingParenthetical(str) {
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

function parseIngredient(rawText, id = `ing-${Math.random().toString(36).substr(2, 9)}`) {
  const clean = cleanText(rawText);
  if (!clean) {
    return { id, raw: rawText, name: rawText, quantity: null, unit: null };
  }

  const dualMeasureRegex = /^(\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s*([a-z]+)\s*\/\s*(\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s*([a-z]+)\s+(.*)/i;
  const dualMatch = clean.match(dualMeasureRegex);

  let quantity = null;
  let unit = null;
  let remaining = clean;

  if (dualMatch) {
    quantity = parseQuantity(dualMatch[1]);
    const unit1 = dualMatch[2].toLowerCase();
    const unit2 = dualMatch[4].toLowerCase();
    unit = `${unit1} / ${dualMatch[3]} ${unit2}`;
    remaining = dualMatch[5].trim();
  } else {
    const rangeRegex = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*[-–—]\s*((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/i;
    const rangeMatch = remaining.match(rangeRegex);

    if (rangeMatch) {
      quantity = parseQuantity(rangeMatch[2]);
      remaining = remaining.slice(rangeMatch[0].length).trim();
    } else {
      const qtyRegex = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/i;
      const qtyMatch = remaining.match(qtyRegex);

      if (qtyMatch) {
        quantity = parseQuantity(qtyMatch[1].trim());
        remaining = remaining.slice(qtyMatch[0].length).trim();
      }
    }

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

  let candidateName = remaining;
  let notes;

  const trailingParen = extractTrailingParenthetical(remaining);
  if (trailingParen) {
    candidateName = trailingParen.name;
    notes = cleanIngredientNotes(trailingParen.notes);
  } else if (remaining.includes(',')) {
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
      candidateName = remaining.slice(0, commaIdx).trim();
      notes = cleanIngredientNotes(remaining.slice(commaIdx + 1).trim());
    }
  }

  return {
    id,
    raw: rawText,
    name: candidateName || rawText,
    quantity,
    unit,
    notes
  };
}

function parseIsoDuration(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return undefined;
  const match = durationStr.match(/P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i);
  if (!match) return undefined;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes;
}

function parseRecipeServings(yieldVal) {
  if (typeof yieldVal === 'number' && yieldVal > 0) return yieldVal;
  if (Array.isArray(yieldVal) && yieldVal.length > 0) return parseRecipeServings(yieldVal[0]);
  if (typeof yieldVal === 'string') {
    const match = yieldVal.match(/\d+/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (parsed > 0) return parsed;
    }
  }
  return 4;
}

function formatGroupTitle(raw) {
  if (!raw) return '';
  let clean = raw
    .replace(/<[^>]+>/g, '')
    .replace(/[:\-\s]+$/, '')
    .replace(/^[:#\-\s]+/, '')
    .trim();
  if (!clean) return '';
  if (clean === clean.toUpperCase() && clean.length > 2) {
    clean = clean.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return clean;
}

function isIngredientHeader(raw) {
  const clean = (raw || '').trim();
  if (!clean) return false;
  if (/^#{1,4}\s+[^#\n]+$/i.test(clean)) return true;
  if (/^={2,}\s*[^=\n]+\s*={2,}$/.test(clean)) return true;
  if (/^\d/.test(clean)) return false;
  if (/^(?:for\s+the\s+)?([a-z0-9\s/&'-]+):\s*$/i.test(clean)) return true;
  return false;
}

function cleanRecipeDescription(text) {
  if (!text) return '';
  return cleanText(text)
    .replace(/\b(?:watch|see)\s+(?:the\s+)?(?:recipe\s+)?video\s+(?:above|below|here)[^.]*\.?/gi, '')
    .replace(/\b(?:jump|scroll)\s+to\s+(?:the\s+)?recipe[^.]*\.?/gi, '')
    .replace(/\b(?:recipe\s+video\s+above)[^.]*\.?/gi, '')
    .trim()
    .replace(/\s{2,}/g, ' ');
}

function parseRecipeFromSchema(jsonLd, sourceUrl) {
  let recipeObj = jsonLd;
  if (recipeObj && recipeObj['@graph'] && Array.isArray(recipeObj['@graph'])) {
    recipeObj = recipeObj['@graph'].find(
      item => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
    );
  }
  if (Array.isArray(recipeObj)) {
    recipeObj = recipeObj.find(
      item => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
    );
  }
  if (!recipeObj) {
    throw new Error('Valid Schema.org Recipe not found');
  }

  const title = cleanRecipeDescription(recipeObj.name || recipeObj.headline || 'Untitled Recipe');
  const description = cleanRecipeDescription(recipeObj.description || '');
  const servings = parseRecipeServings(recipeObj.recipeYield);

  const rawIngredients = Array.isArray(recipeObj.recipeIngredient) ? recipeObj.recipeIngredient : [];
  const ingredients = [];
  let currentGroup;

  for (let idx = 0; idx < rawIngredients.length; idx++) {
    const raw = cleanText(String(rawIngredients[idx]));
    if (!raw) continue;
    if (isIngredientHeader(raw)) {
      currentGroup = formatGroupTitle(raw);
      continue;
    }
    const ing = parseIngredient(raw, `ing-${ingredients.length + 1}`);
    if (currentGroup) ing.group = currentGroup;
    ingredients.push(ing);
  }

  const rawInstructions = recipeObj.recipeInstructions || [];
  const steps = [];
  const processItem = item => {
    if (typeof item === 'string') {
      const text = cleanText(item);
      if (text) steps.push({ id: steps.length + 1, instruction: text });
    } else if (item && typeof item === 'object') {
      if (item['@type'] === 'HowToStep' || item.text) {
        const text = cleanText(item.text || item.description || '');
        if (text) steps.push({ id: steps.length + 1, instruction: text });
      } else if (item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
        item.itemListElement.forEach(processItem);
      }
    }
  };

  if (Array.isArray(rawInstructions)) {
    rawInstructions.forEach(processItem);
  } else if (typeof rawInstructions === 'string') {
    rawInstructions
      .split(/\n+/)
      .map(s => cleanText(s.replace(/^\d+[\.\)]\s*/, '')))
      .filter(Boolean)
      .forEach(text => {
        steps.push({ id: steps.length + 1, instruction: text });
      });
  }

  return {
    id: `recipe-${Date.now()}`,
    title,
    description,
    url: sourceUrl || recipeObj.url,
    originalServings: servings,
    currentServings: servings,
    scaleFactor: 1.0,
    ingredients,
    steps,
    prepTimeMinutes: parseIsoDuration(recipeObj.prepTime),
    cookTimeMinutes: parseIsoDuration(recipeObj.cookTime),
    totalTimeMinutes: parseIsoDuration(recipeObj.totalTime),
    source: recipeObj.publisher?.name || 'Recipe Reader'
  };
}

function extractRecipeFromHtml(html, sourceUrl) {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      return parseRecipeFromSchema(parsed, sourceUrl);
    } catch {}
  }
  throw new Error('No schema.org/Recipe JSON-LD script found in HTML');
}

function formatIngredientForVoice(ingredient, scaleFactor = 1.0) {
  if (ingredient.quantity === null) {
    return ingredient.name + (ingredient.notes ? `, ${ingredient.notes}` : '');
  }
  const scaledQty = ingredient.quantity * scaleFactor;
  const formattedFraction = formatQuantityFraction(scaledQty);

  const voiceFractionMap = {
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
  const unit = spokenUnit ? ` ${spokenUnit}` : '';
  const notes = ingredient.notes ? `, ${ingredient.notes}` : '';
  return `${spokenQty}${unit} of ${ingredient.name}${notes}`;
}

// --- Sound Effects using Web Audio API ---
class WebAudioEffects {
  constructor() {
    this.ctx = null;
  }
  getContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }
  playChime() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch {}
  }
  playClick() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch {}
  }
  playAlarm() {
    const ctx = this.getContext();
    if (!ctx) return;
    const tones = [880, 1174.66, 880, 1174.66];
    tones.forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }
  playMeow() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Dual Vocal Harmonic Oscillators (feline vocal cords)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();

      // Pitch vibrato: natural feline vocal inflection
      vibrato.frequency.setValueAtTime(6.2, now);
      vibratoGain.gain.setValueAtTime(0, now);
      vibratoGain.gain.linearRampToValueAtTime(10, now + 0.12);
      vibratoGain.gain.linearRampToValueAtTime(0, now + 0.38);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc1.frequency);
      vibratoGain.connect(osc2.frequency);

      // Fundamental pitch trajectory ("m -> ee -> oww"):
      // Gentle rise from 440Hz to 680Hz, sweet sustain, then natural curve down to 420Hz
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(440, now);
      osc1.frequency.exponentialRampToValueAtTime(680, now + 0.12);
      osc1.frequency.exponentialRampToValueAtTime(650, now + 0.22);
      osc1.frequency.exponentialRampToValueAtTime(420, now + 0.42);

      // Warm 2nd harmonic
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now);
      osc2.frequency.exponentialRampToValueAtTime(1360, now + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(1300, now + 0.22);
      osc2.frequency.exponentialRampToValueAtTime(840, now + 0.42);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.7, now);
      osc1.connect(oscGain);
      osc2.connect(oscGain);

      // 2. Breath Texture (subtle pink/white noise for organic breathiness)
      const bufferSize = Math.floor(ctx.sampleRate * 0.45);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.12;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1400, now);
      noiseFilter.Q.setValueAtTime(2.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.03, now + 0.08);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);

      // 3. Formant Vocal Tract Filters (F1 mouth opening, F2 vowel shift)
      const formantF1 = ctx.createBiquadFilter();
      formantF1.type = 'bandpass';
      formantF1.frequency.setValueAtTime(750, now);
      formantF1.frequency.linearRampToValueAtTime(950, now + 0.12);
      formantF1.frequency.exponentialRampToValueAtTime(550, now + 0.42);
      formantF1.Q.setValueAtTime(3.0, now);

      const formantF2 = ctx.createBiquadFilter();
      formantF2.type = 'peaking';
      formantF2.frequency.setValueAtTime(1800, now);
      formantF2.frequency.linearRampToValueAtTime(2100, now + 0.12);
      formantF2.frequency.exponentialRampToValueAtTime(1200, now + 0.42);
      formantF2.gain.setValueAtTime(7, now);
      formantF2.Q.setValueAtTime(2.5, now);

      // 4. Master Output Stage (Soft, gentle kitten-level volume)
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(0.09, now + 0.06);
      masterGain.gain.linearRampToValueAtTime(0.08, now + 0.24);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);

      // Connect graph
      oscGain.connect(formantF1);
      noiseGain.connect(formantF1);
      formantF1.connect(formantF2);
      formantF2.connect(masterGain);
      masterGain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      vibrato.start(now);
      noiseSource.start(now);

      const stopTime = now + 0.45;
      osc1.stop(stopTime);
      osc2.stop(stopTime);
      vibrato.stop(stopTime);
      noiseSource.stop(stopTime);
    } catch {}
  }

  playChirp() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const trill = ctx.createOscillator();
      const trillGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      // Rapid trill modulation (fluttering vocal roll at 25Hz)
      trill.frequency.setValueAtTime(25, now);
      trillGain.gain.setValueAtTime(22, now);
      trillGain.gain.exponentialRampToValueAtTime(4, now + 0.22);
      trill.connect(trillGain);
      trillGain.connect(osc.frequency);

      // Rising friendly inflection (440Hz -> 680Hz)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.24);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, now);
      filter.Q.setValueAtTime(1.5, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      trill.start(now);
      osc.stop(now + 0.25);
      trill.stop(now + 0.25);
    } catch {}
  }

  playPurr() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Multi-harmonic warm purr (audible and cozy across laptop & mobile speakers)
      const f0 = ctx.createOscillator(); // ~72 Hz fundamental
      const f1 = ctx.createOscillator(); // ~144 Hz 2nd harmonic
      const f2 = ctx.createOscillator(); // ~216 Hz 3rd harmonic
      const flutter = ctx.createOscillator(); // 23 Hz laryngeal flutter
      const flutterGain = ctx.createGain();
      const tremolo = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const masterGain = ctx.createGain();

      f0.type = 'triangle';
      f0.frequency.setValueAtTime(72, now);
      f0.frequency.linearRampToValueAtTime(76, now + 0.3);
      f0.frequency.linearRampToValueAtTime(70, now + 0.65);

      f1.type = 'sine';
      f1.frequency.setValueAtTime(144, now);
      f1.frequency.linearRampToValueAtTime(152, now + 0.3);
      f1.frequency.linearRampToValueAtTime(140, now + 0.65);

      f2.type = 'sine';
      f2.frequency.setValueAtTime(216, now);

      // 23 Hz diaphragmatic flutter
      flutter.type = 'sine';
      flutter.frequency.setValueAtTime(23, now);
      flutterGain.gain.setValueAtTime(0.42, now);
      flutter.connect(flutterGain);
      flutterGain.connect(tremolo.gain);

      tremolo.gain.setValueAtTime(0.5, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, now);

      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(0.11, now + 0.08);
      masterGain.gain.linearRampToValueAtTime(0.09, now + 0.45);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);

      f0.connect(tremolo);
      f1.connect(tremolo);
      f2.connect(tremolo);
      tremolo.connect(filter);
      filter.connect(masterGain);
      masterGain.connect(ctx.destination);

      f0.start(now);
      f1.start(now);
      f2.start(now);
      flutter.start(now);

      const stopTime = now + 0.70;
      f0.stop(stopTime);
      f1.stop(stopTime);
      f2.stop(stopTime);
      flutter.stop(stopTime);
    } catch {}
  }
}

// --- Kitchen Timer Parser Helpers ---
function parseDurationSeconds(text) {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;

  if (/\b(?:half\s+(?:an?\s+)?hour)\b/i.test(clean)) return 1800;
  if (/\b(?:quarter\s+(?:of\s+an?\s+)?hour)\b/i.test(clean)) return 900;
  if (/\b(?:an?\s+hour\s+and\s+a\s+half)\b/i.test(clean)) return 5400;
  if (/\b(?:an?\s+hour)\b/i.test(clean) && !/\d+\s*hours?/i.test(clean)) return 3600;
  if (/\b(?:a\s+minute)\b/i.test(clean) && !/\d+\s*minutes?/i.test(clean)) return 60;

  const wordMap = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fortyfive: 45, fifty: 50
  };

  let normalized = clean;
  for (const [w, n] of Object.entries(wordMap)) {
    const rx = new RegExp(`\\b${w}\\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)\\b`, 'gi');
    normalized = normalized.replace(rx, `${n} $1`);
  }

  let totalSeconds = 0;
  let matchedAny = false;

  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hourMatch) {
    totalSeconds += Math.round(parseFloat(hourMatch[1]) * 3600);
    matchedAny = true;
  }

  const minMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i);
  if (minMatch) {
    totalSeconds += Math.round(parseFloat(minMatch[1]) * 60);
    matchedAny = true;
  }

  const secMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?)\b/i);
  if (secMatch) {
    totalSeconds += Math.round(parseFloat(secMatch[1]));
    matchedAny = true;
  }

  return matchedAny && totalSeconds > 0 ? totalSeconds : null;
}

function extractStepTimers(instruction) {
  if (!instruction) return [];
  const results = [];
  const seenSeconds = new Set();

  const rangeRegex = /\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/gi;
  let rangeMatch;
  while ((rangeMatch = rangeRegex.exec(instruction)) !== null) {
    const val1 = parseFloat(rangeMatch[1]);
    const val2 = parseFloat(rangeMatch[2]);
    const unit = rangeMatch[3].toLowerCase();
    const multiplier = unit.startsWith('h') ? 3600 : unit.startsWith('s') ? 1 : 60;
    const unitLabel = unit.startsWith('h') ? 'hr' : unit.startsWith('s') ? 'sec' : 'min';

    const s1 = Math.round(val1 * multiplier);
    if (!seenSeconds.has(s1) && s1 > 0) {
      seenSeconds.add(s1);
      results.push({ durationSeconds: s1, label: `${val1} ${unitLabel}`, text: rangeMatch[0] });
    }
    const s2 = Math.round(val2 * multiplier);
    if (!seenSeconds.has(s2) && s2 > 0) {
      seenSeconds.add(s2);
      results.push({ durationSeconds: s2, label: `${val2} ${unitLabel}`, text: rangeMatch[0] });
    }
  }

  const singleRegex = /\b(?:for|simmer|bake|cook|boil|roast|rest|chill|wait|steep)?\s*(?:about\s+|approximately\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/gi;
  let singleMatch;
  while ((singleMatch = singleRegex.exec(instruction)) !== null) {
    const val = parseFloat(singleMatch[1]);
    const unit = singleMatch[2].toLowerCase();
    const multiplier = unit.startsWith('h') ? 3600 : unit.startsWith('s') ? 1 : 60;
    const unitLabel = unit.startsWith('h') ? 'hr' : unit.startsWith('s') ? 'sec' : 'min';
    const s = Math.round(val * multiplier);
    if (!seenSeconds.has(s) && s > 0) {
      seenSeconds.add(s);
      results.push({ durationSeconds: s, label: `${val} ${unitLabel}`, text: singleMatch[0].trim() });
    }
  }

  return results;
}

// --- Voice Command Intent Matcher ---
function parseVoiceCommand(text) {
  const clean = text.trim().toLowerCase();
  if (!clean) return { action: 'UNKNOWN', rawTranscript: text };

  // Cancel / Clear Timer: "cancel timer", "stop timer", "clear timer"
  if (
    /\b(?:cancel|clear|delete|remove)\s+(?:the\s+)?timer\b/i.test(clean) ||
    /^(?:cancel|stop)\s+(?:the\s+)?timer$/i.test(clean)
  ) {
    return { action: 'CANCEL_TIMER', rawTranscript: text };
  }

  // Check Timer: "check timer", "how much time is left", "time left", "timer status"
  if (
    /\b(?:check\s+timer|timer\s+status|how\s+much\s+time(?:\s+is)?\s+left|how\s+long\s+left|time\s+left(?:\s+on\s+timer)?|is\s+the\s+timer\s+done)\b/i.test(clean) ||
    /^(?:timer|check\s+timers?)$/i.test(clean)
  ) {
    return { action: 'CHECK_TIMER', rawTranscript: text };
  }

  // Set Timer: requires explicit imperative command (e.g. "set a timer for 10 minutes", "start 5 minute timer", "pasta timer 8 minutes", "set the timer")
  // Must NOT trigger on descriptive utterances like "starting a 10 minute timer", "Step 3 bake for 10 minutes", or "timer is done"
  const isExcludedTimerPhrase =
    /^(?:starting|your|there\s+is|here\s+is)\b/i.test(clean) ||
    /\b(?:done|completed|finished|cancelled|canceled|started|remaining|running)\b/i.test(clean) ||
    /^step\s+\d+/i.test(clean);

  const isSetTimerCommand =
    !isExcludedTimerPhrase &&
    (/^(?:please\s+)?(?:set|start|create|begin|new)\s+(?:a\s+|the\s+)?(?:([a-z0-9\s]+?)\s+)?timer\b/i.test(clean) ||
     /^(?:please\s+)?(?:set|start)\s+(?:a\s+|the\s+)?(.+?)\s+timer$/i.test(clean) ||
     /^(?:please\s+)?(?:([a-z0-9\s]+?)\s+)?timer\s+(?:for\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter)/i.test(clean) ||
     /^(?:please\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter)\s+(?:minute|min|hour|second|sec)s?\s+timer$/i.test(clean));

  if (isSetTimerCommand) {
    const durationSeconds = parseDurationSeconds(clean);
    let timerLabel = 'Timer';
    const labelMatch = clean.match(/(?:set|start|create)\s+(?:a\s+|the\s+)?([a-z0-9\s]+?)\s+timer/i);
    const labelAfterMatch = clean.match(/timer\s+for\s+([a-z]+)\s+for/i);
    const prefixLabelMatch = clean.match(/^([a-z]+)\s+timer/i);

    let rawLabel = '';
    if (labelAfterMatch && labelAfterMatch[1]) {
      rawLabel = labelAfterMatch[1].trim();
    } else if (labelMatch && labelMatch[1]) {
      rawLabel = labelMatch[1].trim();
    } else if (prefixLabelMatch && prefixLabelMatch[1]) {
      rawLabel = prefixLabelMatch[1].trim();
    }

    const cleanedLabel = rawLabel
      .replace(/\b(?:minutes?|mins?|seconds?|secs?|hours?|hrs?|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter|a|the|kitchen|cooking|new|quick)\b/gi, '')
      .trim();

    if (cleanedLabel) {
      timerLabel = cleanedLabel;
    }

    return {
      action: 'SET_TIMER',
      payload: { durationSeconds, timerLabel },
      rawTranscript: text
    };
  }

  // Stop / Pause / Silence (Top priority to interrupt assistant speech)
  // Matches any utterance containing stop, pause, quiet, silence, halt, etc.
  if (/\b(stop|pause|halt|be\s+quiet|quiet|shut\s+up|silence|cancel|stop\s+talking|mute|stfu)\b/i.test(clean)) {
    return { action: 'STOP', rawTranscript: text };
  }

  if (
    /^(next|next\s+step|continue|done|finished|what(?:'?s|\s+is)\s+next|move\s+on|proceed|start|start\s+recipe|start\s+cooking|begin|begin\s+recipe|begin\s+cooking|let'?s\s+(?:cook|start|begin))$/i.test(clean) ||
    /\b(next\s+step|what(?:'?s|\s+is)\s+next|start\s+recipe|start\s+cooking|begin\s+recipe)\b/i.test(clean)
  ) {
    return { action: 'NEXT_STEP', rawTranscript: text };
  }
  if (/^(back|previous|previous\s+step|go\s+back)$/i.test(clean) || /\b(previous\s+step|go\s+back)\b/i.test(clean)) {
    return { action: 'PREVIOUS_STEP', rawTranscript: text };
  }
  if (/^(repeat|repeat\s+step|say\s+that?\s+again|say\s+again|what\s+was\s+that|again)$/i.test(clean) || /\b(repeat\s+step|say\s+again)\b/i.test(clean)) {
    return { action: 'REPEAT_STEP', rawTranscript: text };
  }

  // Jump to step: "jump to step 4", "go to step 2", "step 3"
  // Strictly anchored so instructions being read aloud (e.g. "Step 3: In a bowl...") aren't self-interpreted as jumps
  const jumpMatch =
    clean.match(/^(?:please\s+)?(?:can\s+you\s+)?(?:jump\s+to|go\s+to|skip\s+to|take\s+me\s+to)\s+(?:step\s+)?(\d+)$/i) ||
    clean.match(/^step\s+(\d+)$/i);
  if (jumpMatch) {
    return { action: 'JUMP_TO_STEP', payload: { stepIndex: parseInt(jumpMatch[1], 10) }, rawTranscript: text };
  }

  if (/\b(?:list|read|what\s+are)\s+(?:the\s+)?ingredients\b/i.test(clean) || clean === 'ingredients') {
    return { action: 'LIST_INGREDIENTS', rawTranscript: text };
  }

  const queryMatch = clean.match(/(?:how\s+(?:much|many)|amount\s+of|quantity\s+of|check)\s+([a-z\s]+?)(?:\s+do\s+i\s+need|\s+left)?\??$/i);
  if (queryMatch) {
    return { action: 'QUERY_INGREDIENT', payload: { ingredientName: queryMatch[1].trim() }, rawTranscript: text };
  }

  return { action: 'UNKNOWN', rawTranscript: text };
}

// --- Speech Synthesis Manager (Hybrid: ElevenLabs Streaming + Browser Speech Fallback) ---
class SpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isSpeaking = false;
    this.echoDecayUntil = 0;
    this.currentSpokenText = '';
    this.audioContext = null;
    this.currentElevenSource = null;
    this.loadSettings();
  }

  loadSettings() {
    this.elevenKey = localStorage.getItem('souschef_eleven_key') || '';
    this.elevenVoiceId = localStorage.getItem('souschef_eleven_voice') || '21m00Tcm4TlvDq8ikWAM';
    this.elevenModelId = 'eleven_turbo_v2_5';
  }

  get isElevenLabsActive() {
    return Boolean(this.elevenKey && this.elevenKey.trim().length > 10);
  }

  async speak(text, onEnd) {
    if (!text || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    this.stop();
    this.currentSpokenText = text.toLowerCase();

    // 1. Try ElevenLabs streaming if API key is configured
    if (this.isElevenLabsActive) {
      try {
        await this.speakElevenLabs(text, onEnd);
        return;
      } catch (err) {
        console.warn('ElevenLabs speech failed, falling back to browser voice:', err);
        if (window.app?.recordAudit) {
          window.app.recordAudit(`⚠️ ElevenLabs failed (${err.message}). Using browser speech fallback.`);
        }
        // Fall through to browser speech fallback
      }
    }

    // 2. Default / Fallback: Browser built-in SpeechSynthesis
    this.speakBrowser(text, onEnd);
  }

  async speakElevenLabs(text, onEnd) {
    this.isSpeaking = true;
    const indicator = document.getElementById('speechStatusIndicator');
    if (indicator) indicator.style.display = 'inline-flex';

    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.elevenVoiceId}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.elevenKey.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: this.elevenModelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.detail?.message) errMsg = errJson.detail.message;
      } catch {}
      throw new Error(`ElevenLabs API: ${errMsg}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    return new Promise((resolve) => {
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      this.currentElevenSource = source;

      source.onended = () => {
        this.isSpeaking = false;
        this.currentElevenSource = null;
        this.echoDecayUntil = Date.now() + 850;
        if (indicator) indicator.style.display = 'none';
        setTimeout(() => {
          if (!this.isSpeaking) {
            this.currentSpokenText = '';
          }
        }, 900);
        if (onEnd) onEnd();
        resolve();
      };

      source.start(0);
    });
  }

  speakBrowser(text, onEnd) {
    if (!this.synth) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick a natural English voice if available
    const voices = this.synth.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onstart = () => {
      this.isSpeaking = true;
      const indicator = document.getElementById('speechStatusIndicator');
      if (indicator) indicator.style.display = 'inline-flex';
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.echoDecayUntil = Date.now() + 850;
      const indicator = document.getElementById('speechStatusIndicator');
      if (indicator) indicator.style.display = 'none';
      setTimeout(() => {
        if (!this.isSpeaking) {
          this.currentSpokenText = '';
        }
      }, 900);
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.echoDecayUntil = Date.now() + 1000;
      const indicator = document.getElementById('speechStatusIndicator');
      if (indicator) indicator.style.display = 'none';
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.error('TTS error:', e);
      }
      if (onEnd && e.error !== 'interrupted' && e.error !== 'canceled') {
        onEnd();
      }
    };

    this.synth.speak(utterance);
  }

  stop() {
    this.isSpeaking = false;
    this.echoDecayUntil = Date.now() + 1200;
    this.currentSpokenText = '';
    const indicator = document.getElementById('speechStatusIndicator');
    if (indicator) indicator.style.display = 'none';

    // Stop active ElevenLabs Web Audio playback
    if (this.currentElevenSource) {
      try {
        this.currentElevenSource.stop();
      } catch {}
      this.currentElevenSource = null;
    }

    // Stop active browser SpeechSynthesis
    if (this.synth) {
      try {
        this.synth.pause();
      } catch {}
      this.synth.cancel();
    }
  }
}

// --- Voice Settings Modal Controller (BYOK ElevenLabs) ---
class VoiceSettingsModalManager {
  constructor(speechManager, app) {
    this.speech = speechManager;
    this.app = app;
    this.modal = document.getElementById('voiceSettingsModal');
    this.apiKeyInput = document.getElementById('inputElevenApiKey');
    this.voiceSelect = document.getElementById('selectElevenVoice');
    this.toggleVisBtn = document.getElementById('btnToggleApiKeyVis');
    this.fetchBtn = document.getElementById('btnFetchVoices');
    this.statusTitle = document.getElementById('modalVoiceStatusTitle');
    this.statusSub = document.getElementById('modalVoiceStatusSub');
    this.modalDot = document.getElementById('modalVoiceDot');
    this.statusCard = document.getElementById('voiceStatusCard');
    this.headerDot = document.getElementById('headerVoiceDot');
    this.headerLabel = document.getElementById('voiceProviderLabel');

    this.init();
  }

  init() {
    const openBtn = document.getElementById('btnVoiceSettings');
    const closeBtn = document.getElementById('btnCloseVoiceModal');
    const saveBtn = document.getElementById('btnSaveVoiceSettings');
    const clearBtn = document.getElementById('btnClearElevenKey');
    const testBtn = document.getElementById('btnTestVoice');

    if (openBtn) openBtn.addEventListener('click', () => this.open());
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.close();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });

    if (this.toggleVisBtn && this.apiKeyInput) {
      this.toggleVisBtn.addEventListener('click', () => {
        const isPass = this.apiKeyInput.type === 'password';
        this.apiKeyInput.type = isPass ? 'text' : 'password';
        this.toggleVisBtn.textContent = isPass ? '🙈' : '👁️';
      });
    }

    if (this.fetchBtn) {
      this.fetchBtn.addEventListener('click', () => {
        const key = (this.apiKeyInput?.value || '').trim();
        if (key) this.fetchAccountVoices(key);
      });
    }

    if (this.apiKeyInput) {
      this.apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const key = (this.apiKeyInput?.value || '').trim();
          if (key) this.fetchAccountVoices(key);
        }
      });
    }

    if (saveBtn) saveBtn.addEventListener('click', () => this.save());
    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    if (testBtn) testBtn.addEventListener('click', () => this.testVoice());

    if (this.voiceSelect) {
      this.voiceSelect.addEventListener('change', () => {
        const opt = this.voiceSelect.options[this.voiceSelect.selectedIndex];
        const category = opt?.dataset?.category;
        if (category && category !== 'premade') {
          if (this.statusTitle) this.statusTitle.textContent = 'Paid API Voice Selected';
          if (this.statusSub) this.statusSub.textContent = '⚠️ Community/library voices require a paid ElevenLabs tier. On the Free Tier, select a "Free Tier ✓" voice like Rachel or Adam.';
        } else {
          const voiceName = opt?.text?.split('(')[0]?.trim() || 'Rachel';
          if (this.statusTitle) this.statusTitle.textContent = 'Voice Selected';
          if (this.statusSub) this.statusSub.textContent = `Ready to use ${voiceName} (Free Tier compatible).`;
          if (this.statusCard) this.statusCard.classList.remove('error');
        }
      });
    }

    this.updateUi();

    // Auto-load account voices on startup if key is already saved in localStorage
    if (this.speech.isElevenLabsActive) {
      this.fetchAccountVoices(this.speech.elevenKey);
    }
  }

  async fetchAccountVoices(keyToUse) {
    const key = (keyToUse || this.apiKeyInput?.value || this.speech.elevenKey || '').trim();
    if (!key) return;

    if (this.statusTitle) this.statusTitle.textContent = 'Connecting to ElevenLabs...';
    if (this.statusSub) this.statusSub.textContent = 'Verifying API key & loading your account voices...';
    if (this.fetchBtn) {
      this.fetchBtn.disabled = true;
      this.fetchBtn.textContent = 'Checking...';
    }

    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': key }
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.detail?.message) errMsg = errData.detail.message;
        } catch {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      const voices = data.voices || [];

      if (voices.length > 0 && this.voiceSelect) {
        const currentSelected = this.voiceSelect.value || this.speech.elevenVoiceId;

        // Separate into Free-Tier Compatible (Premade) and Library/Community voices
        const premade = voices.filter(v => v.category === 'premade' || !v.category);
        const others = voices.filter(v => v.category && v.category !== 'premade');

        let html = '';
        if (premade.length > 0) {
          html += `<optgroup label="✨ Free Tier Compatible (Premade Voices)">`;
          html += premade.map(v => `<option value="${v.voice_id}" data-category="premade">${v.name} (Free Tier ✓)</option>`).join('');
          html += `</optgroup>`;
        }

        if (others.length > 0) {
          html += `<optgroup label="🔒 Requires Paid Subscription (Library / Community Voices)">`;
          html += others.map(v => `<option value="${v.voice_id}" data-category="${v.category}">${v.name} (${v.category} - Paid API)</option>`).join('');
          html += `</optgroup>`;
        }

        this.voiceSelect.innerHTML = html;

        // Default to Rachel or first premade voice to guarantee Free Tier compatibility
        const rachel = voices.find(v => v.voice_id === '21m00Tcm4TlvDq8ikWAM');
        const firstPremade = premade[0];
        const isSelectedStillValid = voices.some(v => v.voice_id === currentSelected);

        if (isSelectedStillValid && premade.some(v => v.voice_id === currentSelected)) {
          this.voiceSelect.value = currentSelected;
        } else if (rachel) {
          this.voiceSelect.value = rachel.voice_id;
        } else if (firstPremade) {
          this.voiceSelect.value = firstPremade.voice_id;
        } else {
          this.voiceSelect.value = voices[0].voice_id;
        }
      }

      const voiceName = this.voiceSelect?.options[this.voiceSelect.selectedIndex]?.text?.split('(')[0]?.trim() || 'Selected Voice';
      if (this.statusTitle) this.statusTitle.textContent = 'ElevenLabs Connected!';
      if (this.statusSub) this.statusSub.textContent = `Loaded ${voices.length} voices from your account. Active: ${voiceName}`;
      if (this.modalDot) this.modalDot.className = 'voice-status-dot active-eleven';
      if (this.statusCard) this.statusCard.classList.remove('error');
      return true;
    } catch (err) {
      console.warn('ElevenLabs voice fetch failed:', err);
      if (this.statusTitle) this.statusTitle.textContent = 'API Key Rejected';
      if (this.statusSub) this.statusSub.textContent = `${err.message}. Please check your key at elevenlabs.io`;
      if (this.modalDot) this.modalDot.className = 'voice-status-dot has-error';
      if (this.statusCard) this.statusCard.classList.add('error');
      return false;
    } finally {
      if (this.fetchBtn) {
        this.fetchBtn.disabled = false;
        this.fetchBtn.textContent = 'Connect';
      }
    }
  }

  open() {
    if (!this.modal) return;
    this.speech.loadSettings();
    if (this.apiKeyInput) this.apiKeyInput.value = this.speech.elevenKey;
    if (this.voiceSelect) this.voiceSelect.value = this.speech.elevenVoiceId;
    this.updateUi();
    this.modal.classList.remove('hidden');
    if (this.apiKeyInput) this.apiKeyInput.focus();

    if (this.speech.isElevenLabsActive) {
      this.fetchAccountVoices(this.speech.elevenKey);
    }
  }

  close() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
  }

  async save() {
    const key = (this.apiKeyInput?.value || '').trim();
    const voiceId = this.voiceSelect?.value || '21m00Tcm4TlvDq8ikWAM';

    if (key) {
      // Validate key and fetch voices if needed
      const isValid = await this.fetchAccountVoices(key);
      if (isValid === false) {
        // Keep modal open so user sees the rejection message
        return;
      }
      localStorage.setItem('souschef_eleven_key', key);
      localStorage.setItem('souschef_eleven_voice', voiceId);
    } else {
      localStorage.removeItem('souschef_eleven_key');
      localStorage.removeItem('souschef_eleven_voice');
    }

    this.speech.loadSettings();
    this.updateUi();
    this.close();

    if (this.speech.isElevenLabsActive) {
      const voiceName = this.voiceSelect?.options[this.voiceSelect.selectedIndex]?.text?.split('(')[0]?.trim() || 'ElevenLabs';
      this.app?.recordAudit(`🎙️ Activated ElevenLabs voice: ${voiceName}`);
    } else {
      this.app?.recordAudit('🎙️ Switched to browser offline voice.');
    }
  }

  clear() {
    localStorage.removeItem('souschef_eleven_key');
    if (this.apiKeyInput) this.apiKeyInput.value = '';
    this.speech.loadSettings();
    this.updateUi();
    if (this.statusCard) this.statusCard.classList.remove('error');
    this.app?.recordAudit('🗑️ ElevenLabs API key removed. Using browser offline voice.');
  }

  async testVoice() {
    const testBtn = document.getElementById('btnTestVoice');
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = '⏳ Speaking...';
    }

    const key = (this.apiKeyInput?.value || this.speech.elevenKey || '').trim();
    const voiceId = this.voiceSelect?.value || this.speech.elevenVoiceId;
    const rawVoiceName = this.voiceSelect?.options[this.voiceSelect.selectedIndex]?.text || 'Rachel';
    const voiceName = rawVoiceName.split('(')[0].replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'Rachel';

    if (key) {
      try {
        if (this.statusTitle) this.statusTitle.textContent = `Testing ElevenLabs (${voiceName})...`;
        if (this.statusSub) this.statusSub.textContent = 'Streaming audio from ElevenLabs API...';

        // Update active voice ID temporarily for test
        this.speech.elevenKey = key;
        this.speech.elevenVoiceId = voiceId;

        await this.speech.speakElevenLabs('Ready to cook hands-free.');

        if (this.statusTitle) this.statusTitle.textContent = 'ElevenLabs Audio Working!';
        if (this.statusSub) this.statusSub.textContent = `Successfully played audio using ${voiceName}.`;
        if (this.modalDot) this.modalDot.className = 'voice-status-dot active-eleven';
        if (this.statusCard) this.statusCard.classList.remove('error');
      } catch (err) {
        console.error('Test voice error:', err);
        if (this.statusTitle) this.statusTitle.textContent = 'ElevenLabs Playback Failed';
        if (this.statusSub) this.statusSub.textContent = `${err.message}. Falling back to browser voice.`;
        if (this.modalDot) this.modalDot.className = 'voice-status-dot has-error';
        if (this.statusCard) this.statusCard.classList.add('error');
        this.speech.speakBrowser('ElevenLabs failed to connect. Falling back to browser speech.');
      }
    } else {
      this.speech.speakBrowser('Ready to cook hands-free.');
    }

    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = '🔊 Test Voice';
    }
  }

  updateUi() {
    const isEleven = this.speech.isElevenLabsActive;
    const voiceName = this.voiceSelect?.options[this.voiceSelect.selectedIndex]?.text?.split('(')[0]?.trim() || 'Rachel';

    if (this.headerDot) {
      this.headerDot.classList.toggle('active-eleven', isEleven);
    }
    if (this.headerLabel) {
      this.headerLabel.textContent = isEleven ? `ElevenLabs (${voiceName})` : 'Browser Voice';
    }

    if (this.modalDot) {
      this.modalDot.classList.toggle('active-eleven', isEleven);
    }
    if (this.statusTitle) {
      this.statusTitle.textContent = isEleven ? `ElevenLabs Active (${voiceName})` : 'Browser Voice Active';
    }
    if (this.statusSub) {
      this.statusSub.textContent = isEleven ? 'Ultra-realistic streaming voice enabled' : 'Zero-setup offline speech synthesis';
    }
  }
}

// --- Browser SpeechRecognition Listener with Memory Management & Inactivity Sleep ---
class VoiceRecognitionManager {
  constructor(speechManager, onIntent) {
    this.speechManager = speechManager;
    this.onIntent = onIntent;
    this.recognition = null;
    this.isListening = false;
    this.shouldKeepListening = false;
    this.restartTimeout = null;
    this.inactivityInterval = null;
    this.lastActionTime = 0;
    this.lastActionType = null;
    this.lastInteractionTime = Date.now();
    this.INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5-minute auto-shutoff to protect memory & CPU

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.SpeechRec = SpeechRec;

    if (!SpeechRec) {
      setTimeout(() => {
        const micStatus = document.getElementById('micStatusText');
        const displayEl = document.getElementById('liveTranscriptDisplay');
        if (micStatus) {
          micStatus.innerText = 'Browser Not Supported';
          micStatus.style.color = 'var(--accent-danger)';
        }
        if (displayEl) {
          displayEl.innerHTML = '⚠️ <strong>Web Speech API is not supported in this browser.</strong><br/>Please open <code>http://localhost:3000</code> in <strong>Google Chrome</strong>, <strong>Safari</strong>, or <strong>Edge</strong>.';
        }
      }, 100);
    }

    // 1. Inactivity Watchdog: automatically shut off mic after 5 minutes of silence/inactivity
    this.inactivityInterval = setInterval(() => {
      if (this.isListening) {
        const idleTime = Date.now() - this.lastInteractionTime;
        if (idleTime > this.INACTIVITY_TIMEOUT_MS) {
          this.sleep('💤 Mic paused after 5 min of inactivity to save memory. Tap mic or press M to resume.');
        }
      }
    }, 15000);

    // 2. Page Visibility Listener: pause speech recognition when browser tab is minimized or hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isListening) {
        this.sleep('💤 Mic paused (tab in background). Tap mic or press M when you return.');
      }
    });

    // 3. User interaction listener to reset inactivity watchdog
    ['click', 'keydown', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, () => this.bumpActivity(), { passive: true });
    });
  }

  bumpActivity() {
    this.lastInteractionTime = Date.now();
  }

  initRecognizer() {
    if (!this.SpeechRec) return null;

    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    const rec = new this.SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => {
      this.isListening = true;
      this.bumpActivity();
      this.updateUi();
      const displayEl = document.getElementById('liveTranscriptDisplay');
      if (displayEl) {
        displayEl.innerText = '🎙️ Listening... Say "Next", "Repeat", "Stop"';
      }
    };

    rec.onresult = (event) => {
      this.bumpActivity();
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const transcript = item[0].transcript.trim();
        if (!transcript) continue;
        const displayEl = document.getElementById('liveTranscriptDisplay');

        let intent = parseVoiceCommand(transcript);

        // If top alternative didn't flag STOP, check other interim alternatives
        if (intent.action !== 'STOP' && item.length > 1) {
          for (let a = 1; a < item.length; ++a) {
            const altIntent = parseVoiceCommand(item[a].transcript);
            if (altIntent.action === 'STOP') {
              intent = altIntent;
              break;
            }
          }
        }

        // 1. High-priority STOP command: interrupts assistant mid-sentence!
        if (intent.action === 'STOP') {
          displayEl.innerText = `🛑 Heard: "${transcript}" [STOP]`;
          this.lastActionTime = Date.now();
          this.lastActionType = 'STOP';
          this.onIntent(intent);
          return;
        }

        // 2. ECHO CANCELLATION: Ignore audio while the computer itself is speaking or echoing
        if (this.speechManager && (this.speechManager.isSpeaking || Date.now() < this.speechManager.echoDecayUntil)) {
          console.log(`[Echo Cancellation] Ignored speaker output: "${transcript}"`);
          return;
        }

        // 3. COMMAND DEBOUNCE: Prevent rapid multi-firing
        if (item.isFinal) {
          const now = Date.now();
          if (now - this.lastActionTime < 1100 && this.lastActionType === intent.action) {
            console.log(`[Debounce] Ignored duplicate ${intent.action}`);
            return;
          }
          this.lastActionTime = now;
          this.lastActionType = intent.action;

          displayEl.innerText = `Heard: "${transcript}"`;
          this.onIntent(intent);
        } else {
          displayEl.innerText = `Listening: "${transcript}..."`;
        }
      }
    };

    rec.onend = () => {
      if (this.shouldKeepListening) {
        clearTimeout(this.restartTimeout);
        this.restartTimeout = setTimeout(() => {
          if (this.shouldKeepListening && this.recognition) {
            try {
              this.recognition.start();
            } catch (err) {
              if (err.name !== 'InvalidStateError') {
                console.warn('Recognition resume error:', err);
              }
            }
          }
        }, 250);
      } else {
        this.isListening = false;
        this.updateUi();
      }
    };

    rec.onerror = (err) => {
      console.warn('Speech recognition error event:', err.error);
      const micStatus = document.getElementById('micStatusText');
      const displayEl = document.getElementById('liveTranscriptDisplay');

      if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
        this.stop();
        if (micStatus) {
          micStatus.innerText = 'Permission Blocked';
          micStatus.style.color = 'var(--accent-danger)';
        }
        if (displayEl) {
          if (window.location.protocol === 'file:') {
            displayEl.innerHTML = '⚠️ <strong>Speech disabled on file://</strong><br/>Run <code>npm start</code> and open <a href="http://localhost:3000" style="color:var(--accent-primary)">http://localhost:3000</a>';
          } else {
            displayEl.innerHTML = '⚠️ <strong>Microphone Blocked</strong>: Click the tune/lock icon 🔒 next to the URL in your address bar, set Microphone to <strong>"Allow"</strong>, and reload.';
          }
        }
      } else if (err.error === 'audio-capture') {
        this.stop();
        if (displayEl) displayEl.innerText = '⚠️ No microphone input detected on your machine.';
      } else if (err.error === 'network') {
        if (displayEl) displayEl.innerText = '⚠️ Speech network error. Retrying...';
      }
    };

    this.recognition = rec;
    return rec;
  }

  toggle() {
    if (!this.SpeechRec) {
      alert('SpeechRecognition is not supported in this browser. You can still test all voice intents using the clickable cheat-sheet buttons!');
      return;
    }
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    this.bumpActivity();
    const displayEl = document.getElementById('liveTranscriptDisplay');

    if (!this.SpeechRec) {
      const msg = 'Speech recognition is not supported in this browser (e.g. Firefox). Please use Google Chrome, Safari, or Microsoft Edge.';
      if (displayEl) displayEl.innerText = `⚠️ ${msg}`;
      alert(msg);
      return;
    }

    if (window.location.protocol === 'file:') {
      if (displayEl) {
        displayEl.innerHTML = '⚠️ <strong>Microphone blocked on file://</strong><br/>Please open via <strong><a href="http://localhost:3000" style="color:var(--accent-primary)">http://localhost:3000</a></strong>';
      }
      alert('Microphone speech recognition is blocked by browser security on file:// URLs.\n\nPlease open http://localhost:3000 in Chrome or Safari.');
      return;
    }

    this.shouldKeepListening = true;
    if (!this.recognition) {
      this.initRecognizer();
    }

    if (this.recognition) {
      try {
        this.recognition.start();
        this.isListening = true;
        this.updateUi();
        if (displayEl) displayEl.innerText = 'Requesting mic access...';
      } catch (e) {
        if (e.name === 'InvalidStateError') {
          this.isListening = true;
          this.updateUi();
        } else {
          console.warn('SpeechRecognition start error:', e);
          if (displayEl) displayEl.innerText = `⚠️ Recognition failed: ${e.message || e.name}`;
        }
      }
    }
  }

  sleep(reasonText) {
    this.stop();
    if (this.app?.showCatBubble) {
      this.app.showCatBubble('Zzz... 💤', 2200);
    }
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
    const micStatus = document.getElementById('micStatusText');
    const displayEl = document.getElementById('liveTranscriptDisplay');
    const micHint = document.getElementById('micHintText');
    if (micStatus) {
      micStatus.innerText = 'Mic paused (Kitty sleeping)';
      micStatus.style.color = '';
    }
    if (micHint) {
      micHint.innerText = 'Wake up Kitty to resume';
    }
    if (displayEl && reasonText) {
      displayEl.innerText = reasonText;
    }
  }

  stop() {
    this.shouldKeepListening = false;
    clearTimeout(this.restartTimeout);
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.updateUi();
  }

  updateUi() {
    const micBtn = document.getElementById('btnToggleMic');
    const micStatus = document.getElementById('micStatusText');
    const micHint = document.getElementById('micHintText');

    if (this.isListening) {
      if (micBtn) micBtn.classList.add('active');
      if (micStatus) {
        micStatus.innerText = 'Listening Continuously (Kitty awake!)';
        micStatus.style.color = 'var(--terracotta)';
      }
      if (micHint) micHint.innerText = 'Tap Kitty to pause listening';
    } else {
      if (micBtn) micBtn.classList.remove('active');
      if (micStatus) {
        micStatus.innerText = 'Mic off (Kitty sleeping)';
        micStatus.style.color = '';
      }
      if (micHint) micHint.innerText = 'Wake up Kitty to listen';
    }
  }
}

// --- Kitchen Timer Manager ---
class KitchenTimerManager {
  constructor(app) {
    this.app = app;
    this.timers = [];
    this.timerInterval = null;
    this.alarmLoopTimer = null;
    this.container = document.getElementById('activeTimersContainer');
    this.listEl = document.getElementById('activeTimersList');
  }

  createTimer(durationSeconds, label = 'Timer', stepId = null) {
    if (!durationSeconds || durationSeconds <= 0) return null;

    // Deduplication guard: ignore duplicate timer creation within 3 seconds
    const now = Date.now();
    if (this.lastCreatedTime && (now - this.lastCreatedTime < 3000) && this.lastCreatedDuration === durationSeconds && this.lastCreatedStepId === stepId) {
      console.log('[Timer Guard] Ignored duplicate timer creation within 3 seconds.');
      return null;
    }
    this.lastCreatedTime = now;
    this.lastCreatedDuration = durationSeconds;
    this.lastCreatedStepId = stepId;

    const id = 'timer_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const timer = {
      id,
      label,
      durationSeconds,
      remainingSeconds: durationSeconds,
      endTime: now + durationSeconds * 1000,
      status: 'running',
      stepId
    };

    this.timers.push(timer);
    this.startTicker();
    this.render();

    const readable = this.formatDurationReadable(durationSeconds);
    const isStepTimer = label && label.toLowerCase().startsWith('step ');
    const cleanSpokenName = (label && label !== 'Timer' && !isStepTimer) ? `${label} ` : '';
    this.app.speech.speak(`${readable} ${cleanSpokenName}timer started.`);
    this.app.recordAudit(`⏱️ Timer started: "${label}" (${readable})`);
    return timer;
  }

  startTicker() {
    if (this.timerInterval) return;
    this.timerInterval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  stopTickerIfIdle() {
    if (this.timers.length === 0) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  tick() {
    const now = Date.now();
    let hasRinging = false;

    this.timers.forEach(t => {
      if (t.status === 'running') {
        t.remainingSeconds = Math.max(0, Math.round((t.endTime - now) / 1000));
        if (t.remainingSeconds <= 0) {
          t.status = 'ringing';
          this.onTimerCompleted(t);
        }
      }
      if (t.status === 'ringing') {
        hasRinging = true;
      }
    });

    if (hasRinging) {
      this.startAlarmLoop();
    } else {
      this.stopAlarmLoop();
    }

    this.render();
  }

  onTimerCompleted(timer) {
    const readable = this.formatDurationReadable(timer.durationSeconds);
    const name = timer.label && timer.label !== 'Timer' ? timer.label : `${readable}`;
    this.app.recordAudit(`🔔 Timer finished: "${name}"`);
    this.app.speech.speak(`Ding! Your ${name} timer is done!`);
    this.app.soundEffects.playAlarm();
  }

  startAlarmLoop() {
    if (this.alarmLoopTimer) return;
    this.alarmLoopTimer = setInterval(() => {
      this.app.soundEffects.playAlarm();
    }, 1800);
  }

  stopAlarmLoop() {
    if (this.alarmLoopTimer) {
      clearInterval(this.alarmLoopTimer);
      this.alarmLoopTimer = null;
    }
  }

  stopRingingTimers() {
    let stoppedAny = false;
    this.timers.forEach(t => {
      if (t.status === 'ringing') {
        t.status = 'completed';
        stoppedAny = true;
      }
    });
    this.timers = this.timers.filter(t => t.status !== 'completed');
    this.stopAlarmLoop();
    this.stopTickerIfIdle();
    this.render();
    return stoppedAny;
  }

  cancelTimer(timerId = null, speakAnnouncement = true) {
    if (!timerId) {
      if (this.timers.length === 0) {
        if (speakAnnouncement) this.app.speech.speak('There are no active timers to cancel.');
        return;
      }
      const removed = this.timers.pop();
      if (speakAnnouncement) {
        const isStep = removed.label && removed.label.toLowerCase().startsWith('step ');
        const name = (removed.label && removed.label !== 'Timer' && !isStep) ? `${removed.label} timer` : 'timer';
        this.app.speech.speak(`${name} cancelled.`);
      }
      this.app.recordAudit(`⏱️ Timer cancelled: "${removed.label}"`);
    } else {
      const idx = this.timers.findIndex(t => t.id === timerId);
      if (idx !== -1) {
        const [removed] = this.timers.splice(idx, 1);
        if (speakAnnouncement) {
          const isStep = removed.label && removed.label.toLowerCase().startsWith('step ');
          const name = (removed.label && removed.label !== 'Timer' && !isStep) ? `${removed.label} timer` : 'timer';
          this.app.speech.speak(`${name} cancelled.`);
        }
        this.app.recordAudit(`⏱️ Timer cancelled: "${removed.label}"`);
      }
    }
    this.stopAlarmLoop();
    this.stopTickerIfIdle();
    this.render();
  }

  checkTimer() {
    const active = this.timers.filter(t => t.status === 'running' || t.status === 'paused');
    if (active.length === 0) {
      this.app.speech.speak('You do not have any active timers running right now.');
      return;
    }

    if (active.length === 1) {
      const t = active[0];
      const rem = this.formatDurationReadable(t.remainingSeconds);
      const name = t.label && t.label !== 'Timer' ? `${t.label} timer` : 'timer';
      this.app.speech.speak(`There is ${rem} remaining on your ${name}.`);
    } else {
      const summaries = active.map(t => {
        const rem = this.formatDurationReadable(t.remainingSeconds);
        return `${t.label}: ${rem}`;
      });
      this.app.speech.speak(`You have ${active.length} active timers: ${summaries.join(', ')}.`);
    }
  }

  togglePause(timerId) {
    const t = this.timers.find(x => x.id === timerId);
    if (!t) return;
    if (t.status === 'running') {
      t.status = 'paused';
    } else if (t.status === 'paused') {
      t.status = 'running';
      t.endTime = Date.now() + t.remainingSeconds * 1000;
    }
    this.render();
  }

  formatTimeDigital(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const h = Math.floor(m / 60);
    if (h > 0) {
      const remM = m % 60;
      return `${h}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatDurationReadable(secs) {
    if (secs < 60) return `${secs} second${secs === 1 ? '' : 's'}`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const h = Math.floor(m / 60);
    const remM = m % 60;

    const parts = [];
    if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
    if (remM > 0) parts.push(`${remM} minute${remM === 1 ? '' : 's'}`);
    if (s > 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
    return parts.join(' and ') || '0 seconds';
  }

  render() {
    if (!this.container || !this.listEl) return;
    if (this.timers.length === 0) {
      this.container.hidden = true;
      this.listEl.innerHTML = '';
      return;
    }

    this.container.hidden = false;
    this.listEl.innerHTML = this.timers.map(t => {
      const isRinging = t.status === 'ringing';
      const isPaused = t.status === 'paused';
      const timeDisplay = isRinging ? 'DONE!' : this.formatTimeDigital(t.remainingSeconds);

      return `
        <div class="timer-card ${isRinging ? 'is-ringing' : ''}" data-id="${t.id}">
          <div class="timer-info">
            <span class="timer-name">${t.label}</span>
            <span class="timer-time">${timeDisplay}</span>
          </div>
          <div class="timer-actions">
            ${isRinging ? `
              <button class="btn-timer-action btn-timer-stop" data-action="stop" data-id="${t.id}">Stop</button>
            ` : `
              <button class="btn-timer-action" data-action="toggle" data-id="${t.id}">
                ${isPaused ? 'Resume' : 'Pause'}
              </button>
              <button class="btn-timer-action" data-action="cancel" data-id="${t.id}" title="Cancel timer">✕</button>
            `}
          </div>
        </div>
      `;
    }).join('');

    this.listEl.querySelectorAll('.btn-timer-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const action = e.currentTarget.dataset.action;
        if (action === 'stop') {
          this.stopRingingTimers();
        } else if (action === 'toggle') {
          this.togglePause(id);
        } else if (action === 'cancel') {
          this.cancelTimer(id, false);
        }
      });
    });
  }
}

// --- App State & UI Bindings ---
class RecipeApp {
  constructor() {
    this.soundEffects = new WebAudioEffects();
    this.speech = new SpeechManager();
    this.voiceRecognition = new VoiceRecognitionManager(this.speech, (intent) => this.handleVoiceIntent(intent));
    this.voiceRecognition.app = this;
    this.timerManager = new KitchenTimerManager(this);
    this.voiceSettings = new VoiceSettingsModalManager(this.speech, this);
    this.catBubbleTimer = null;

    // Core State Machine variables
    this.status = 'IDLE';
    this.recipe = null;
    this.currentStepIndex = -1;
    this.history = [];

    this.bindEvents();
    this.loadSampleRecipe('cookies'); // Preload sample recipe for immediate offline readiness
  }

  bindEvents() {
    // Protocol warning check for browser security on file://
    if (window.location.protocol === 'file:') {
      const banner = document.getElementById('fileProtocolWarning');
      if (banner) banner.style.display = 'block';
    }

    // Navigation buttons
    const nextBtn = document.getElementById('btnNextStep');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        try { this.soundEffects.playClick(); } catch {}
        // Auto-engage voice mode on first user interaction if not listening yet
        if (this.voiceRecognition && !this.voiceRecognition.isListening && window.location.protocol !== 'file:') {
          try {
            this.voiceRecognition.start();
          } catch (e) {
            console.warn('Voice auto-start failed:', e);
          }
        }
        this.next_step();
      });
    }

    const prevBtn = document.getElementById('btnPrevStep');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        try { this.soundEffects.playClick(); } catch {}
        this.previous_step();
      });
    }

    const repeatBtn = document.getElementById('btnRepeatStep');
    if (repeatBtn) {
      repeatBtn.addEventListener('click', () => {
        try { this.soundEffects.playClick(); } catch {}
        this.repeat_step();
      });
    }

    const stopBtn = document.getElementById('btnStopSpeech');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        try { this.soundEffects.playClick(); } catch {}
        this.handleVoiceIntent({ action: 'STOP', rawTranscript: 'Manual Stop Button' });
      });
    }

    // Mic Toggle (Button & Subtitle Hint)
    const toggleMic = () => {
      if (!this.voiceRecognition.isListening) {
        // Randomly choose between a sweet meow, friendly chirp, or cozy purr
        const wakeVariants = [
          { sound: () => this.soundEffects.playMeow(), text: 'Meow! 🐾' },
          { sound: () => this.soundEffects.playChirp(), text: 'Mrrp! ✨' },
          { sound: () => this.soundEffects.playPurr(), text: 'Purrr... 💕' },
          { sound: () => this.soundEffects.playChirp(), text: 'Prrr! 🐾' }
        ];
        const chosen = wakeVariants[Math.floor(Math.random() * wakeVariants.length)];
        chosen.sound();
        this.showCatBubble(chosen.text, 2200);
      } else {
        this.soundEffects.playPurr();
        this.showCatBubble('Zzz... 💤', 1800);
      }
      this.voiceRecognition.toggle();
    };
    document.getElementById('btnToggleMic').addEventListener('click', toggleMic);
    const micHint = document.getElementById('micHintText');
    if (micHint) micHint.addEventListener('click', toggleMic);

    // Direct Browser Mic Permission Request & Diagnostic Helper
    const forceBtn = document.getElementById('btnForceMicPrompt');
    const diagBox = document.getElementById('diagnosticInfo');

    if (forceBtn && diagBox) {
      forceBtn.addEventListener('click', async () => {
        diagBox.style.display = 'block';
        diagBox.innerHTML = '<span style="color:var(--accent-info)">[Running Voice Diagnostics...]</span><br/>';

        // 1. Origin & Protocol check
        const isFile = window.location.protocol === 'file:';
        diagBox.innerHTML += `• Protocol: <code>${window.location.protocol}//</code> ${isFile ? '<strong style="color:var(--accent-danger)">❌ BLOCKED on file:// (Must run npm start & open http://localhost:3000)</strong>' : '<strong style="color:var(--accent-secondary)">✅ OK (Valid Web Origin)</strong>'}<br/>`;

        // 2. Web Speech Recognition API check
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        diagBox.innerHTML += `• Speech Engine: ${SpeechRec ? '<strong style="color:var(--accent-secondary)">✅ SpeechRecognition Available</strong>' : '<strong style="color:var(--accent-danger)">❌ Missing (Firefox/Unsupported)</strong>'}<br/>`;

        // 3. MediaDevices API
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          diagBox.innerHTML += `• Audio Devices API: <strong style="color:var(--accent-danger)">❌ navigator.mediaDevices is undefined</strong><br/>`;
          return;
        }

        // 4. Permission query if available
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const p = await navigator.permissions.query({ name: 'microphone' });
            const pColor = p.state === 'granted' ? 'var(--accent-secondary)' : (p.state === 'denied' ? 'var(--accent-danger)' : 'var(--accent-primary)');
            diagBox.innerHTML += `• Permission Query State: <strong style="color:${pColor}">${p.state.toUpperCase()}</strong><br/>`;
          } catch (e) {
            diagBox.innerHTML += `• Permission Query: ${e.message}<br/>`;
          }
        }

        // 5. Explicitly invoke getUserMedia to trigger the browser prompt
        try {
          diagBox.innerHTML += `• Requesting <code>getUserMedia({ audio: true })</code>...<br/>`;
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const track = stream.getAudioTracks()[0];
          diagBox.innerHTML += `• Audio Device: <strong style="color:var(--accent-secondary)">✅ ${track ? track.label || 'Default Microphone' : 'Active'}</strong><br/>`;
          track.stop();
          diagBox.innerHTML += `<strong style="color:var(--accent-secondary)">🎉 Permission GRANTED! Starting voice recognition now...</strong><br/>`;
          this.voiceRecognition.start();
        } catch (err) {
          console.error('Diagnostic mic error:', err);
          diagBox.innerHTML += `• Browser Result: <strong style="color:var(--accent-danger)">${err.name}</strong> - ${err.message}<br/>`;

          if (err.name === 'NotAllowedError') {
            diagBox.innerHTML += `<br/>👉 <strong>HOW TO UNBLOCK:</strong><br/>1. Look at the top of your browser directly to the left of <strong>localhost:3000</strong>.<br/>2. Click the <strong>tune / sliders icon 🔒</strong> in the address bar.<br/>3. Switch <strong>Microphone</strong> from <em>Block</em> to <strong>Allow</strong>.<br/>4. Refresh the page ($⌘+R$).`;
          } else if (err.name === 'NotFoundError') {
            diagBox.innerHTML += `<br/>👉 <strong>HOW TO FIX:</strong> No microphone input device was detected on your machine. Please plug in or select a microphone in macOS System Settings.`;
          }
        }
      });
    }

    // Keyboard shortcuts:
    // 'm' -> toggle mic
    // Space or Escape or 's' -> instantly STOP speech
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'm' || e.key === 'M') {
        toggleMic();
      } else if (e.key === ' ' || e.key === 'Escape' || e.key === 's' || e.key === 'S') {
        if (this.speech && this.speech.isSpeaking) {
          e.preventDefault();
          this.handleVoiceIntent({ action: 'STOP', rawTranscript: 'Keyboard Stop' });
        }
      }
    });

    // Voice Cheat Sheet Pills (Clickable testing)
    document.querySelectorAll('.voice-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const cmd = e.target.dataset.cmd;
        document.getElementById('liveTranscriptDisplay').innerText = `Simulated Voice: "${cmd}"`;
        const intent = parseVoiceCommand(cmd);
        this.handleVoiceIntent(intent);
      });
    });

    // URL Loading
    document.getElementById('btnLoadUrl').addEventListener('click', () => {
      const url = document.getElementById('recipeUrlInput').value.trim();
      if (url) this.fetchRecipeFromUrl(url);
    });

    document.getElementById('sampleSelect').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) this.loadSampleRecipe(val);
    });
  }

  showCatBubble(text, durationMs = 2200) {
    const bubble = document.getElementById('catBubble');
    if (!bubble) return;
    bubble.innerText = text;
    bubble.classList.add('visible');
    clearTimeout(this.catBubbleTimer);
    this.catBubbleTimer = setTimeout(() => {
      bubble.classList.remove('visible');
    }, durationMs);
  }

  // --- Core State Machine Transitions ---
  loadRecipe(recipeData) {
    this.speech.stop();
    const recipe = JSON.parse(JSON.stringify(recipeData));
    if (recipe.title) recipe.title = cleanText(recipe.title);
    if (recipe.description) recipe.description = cleanText(recipe.description);
    if (Array.isArray(recipe.steps)) {
      recipe.steps.forEach(s => {
        if (s.instruction) s.instruction = cleanText(s.instruction);
      });
    }
    if (Array.isArray(recipe.ingredients)) {
      recipe.ingredients.forEach(i => {
        if (i.name) i.name = cleanText(i.name);
        if (i.notes) i.notes = cleanText(i.notes);
        if (i.group) i.group = cleanText(i.group);
      });
    }
    this.recipe = recipe;
    this.currentStepIndex = -1;
    this.status = 'READY';
    this.recordAudit(`Loaded recipe: "${this.recipe.title}" (${this.recipe.steps.length} steps)`);
    this.render();
  }

  next_step() {
    if (!this.recipe) return;

    if (this.status === 'READY' || this.currentStepIndex === -1) {
      this.currentStepIndex = 0;
      this.status = 'READING_STEP';
      this.recordAudit(`Started recipe at step 1.`);
    } else if (this.currentStepIndex >= this.recipe.steps.length - 1) {
      this.status = 'COMPLETED';
      this.recordAudit(`Finished recipe! All steps completed.`);
      this.speech.speak('Congratulations! You have completed all steps of the recipe. Enjoy your meal!');
      this.render();
      return;
    } else {
      this.currentStepIndex += 1;
      this.status = 'READING_STEP';
      this.recordAudit(`Advanced to step ${this.currentStepIndex + 1}.`);
    }

    this.soundEffects.playChime();
    this.render();
    this.speakCurrentStep();
  }

  previous_step() {
    if (!this.recipe || this.currentStepIndex <= 0) {
      this.currentStepIndex = 0;
      this.repeat_step();
      return;
    }

    this.currentStepIndex -= 1;
    this.status = 'READING_STEP';
    this.recordAudit(`Moved back to step ${this.currentStepIndex + 1}.`);
    this.soundEffects.playChime();
    this.render();
    this.speakCurrentStep();
  }

  repeat_step() {
    if (!this.recipe) return;
    if (this.currentStepIndex === -1) {
      this.next_step();
      return;
    }
    this.status = 'READING_STEP';
    this.recordAudit(`Repeating step ${this.currentStepIndex + 1}.`);
    this.soundEffects.playChime();
    this.render();
    this.speakCurrentStep();
  }

  jump_to_step(stepNumber) {
    if (!this.recipe) return;
    const targetIdx = stepNumber - 1;
    if (targetIdx < 0 || targetIdx >= this.recipe.steps.length) {
      this.speech.speak(`Step ${stepNumber} does not exist in this recipe.`);
      return;
    }
    // Prevent acoustic loop if already reading or on this step
    if (this.currentStepIndex === targetIdx && (this.status === 'READING_STEP' || this.speech.isSpeaking)) {
      console.log(`[Jump Guard] Already on step ${stepNumber}, ignoring redundant jump.`);
      return;
    }
    this.currentStepIndex = targetIdx;
    this.status = 'READING_STEP';
    this.recordAudit(`Jumped to step ${stepNumber}.`);
    this.soundEffects.playChime();
    this.render();
    this.speakCurrentStep();
  }

  query_ingredient(name) {
    if (!this.recipe) return;
    const cleanName = name.toLowerCase().trim();
    const found = this.recipe.ingredients.find(i =>
      i.name.toLowerCase().includes(cleanName) || cleanName.includes(i.name.toLowerCase())
    );

    if (found) {
      const spoken = formatIngredientForVoice(found, 1.0);
      const text = `You need ${spoken}.`;
      this.recordAudit(`Queried "${name}": ${text}`);
      this.speech.speak(text);
    } else {
      const text = `I could not find ${name} in the ingredients list.`;
      this.recordAudit(`Queried "${name}": Not found.`);
      this.speech.speak(text);
    }
  }

  speakCurrentStep() {
    const step = this.recipe.steps[this.currentStepIndex];
    if (!step) return;

    const textToSpeak = `Step ${step.id}. ${expandTextForSpeech(cleanText(step.instruction))}`;
    this.speech.speak(textToSpeak, () => {
      this.status = 'AWAITING_INPUT';
      this.updateStatusBadge();
    });
  }

  handleVoiceIntent(intent) {
    this.recordAudit(`Voice command: [${intent.action}] "${intent.rawTranscript}"`);

    switch (intent.action) {
      case 'STOP':
        const stoppedTimer = this.timerManager?.stopRingingTimers();
        this.speech.stop();
        this.status = 'AWAITING_INPUT';
        this.updateStatusBadge();
        if (stoppedTimer) {
          this.recordAudit(`🔔 Timer alarm silenced.`);
        }
        this.recordAudit(`🛑 Stopped speaking (Voice: "${intent.rawTranscript}")`);
        const liveEl = document.getElementById('liveTranscriptDisplay');
        if (liveEl) liveEl.innerText = '🛑 Stopped. Ready for next command.';
        break;
      case 'SET_TIMER':
        if (intent.payload?.durationSeconds) {
          this.timerManager?.createTimer(
            intent.payload.durationSeconds,
            intent.payload.timerLabel || 'Timer'
          );
        } else {
          // Contextual step timer: "set the timer", "start timer" without explicit seconds
          let startedStepTimer = false;
          if (this.recipe && this.recipe.steps && this.currentStepIndex >= 0 && this.recipe.steps[this.currentStepIndex]) {
            const currentStep = this.recipe.steps[this.currentStepIndex];
            const detected = extractStepTimers(currentStep.instruction);
            if (detected.length > 0) {
              this.timerManager?.createTimer(
                detected[0].durationSeconds,
                `Step ${currentStep.id} (${detected[0].label})`,
                currentStep.id
              );
              startedStepTimer = true;
            }
          }
          if (!startedStepTimer) {
            this.speech.speak('How long should I set the timer for? Please specify a duration, like 10 minutes.');
          }
        }
        break;
      case 'CHECK_TIMER':
        this.timerManager?.checkTimer();
        break;
      case 'CANCEL_TIMER':
        this.timerManager?.cancelTimer();
        break;
      case 'NEXT_STEP':
        this.next_step();
        break;
      case 'PREVIOUS_STEP':
        this.previous_step();
        break;
      case 'REPEAT_STEP':
        this.repeat_step();
        break;
      case 'JUMP_TO_STEP':
        if (intent.payload?.stepIndex) this.jump_to_step(intent.payload.stepIndex);
        break;
      case 'QUERY_INGREDIENT':
        if (intent.payload?.ingredientName) this.query_ingredient(intent.payload.ingredientName);
        break;
      case 'LIST_INGREDIENTS':
        if (this.recipe) {
          const summary = `This recipe has ${this.recipe.ingredients.length} ingredients, including ${this.recipe.ingredients.slice(0, 3).map(i => i.name).join(', ')}.`;
          this.speech.speak(summary);
        }
        break;
      default:
        console.log('Unrecognized voice intent:', intent.rawTranscript);
    }
  }

  updateStatusBadge(status = this.status) {
    const badge = document.getElementById('stateStatusBadge');
    if (!badge) return;
    const labels = {
      'IDLE': 'Ready',
      'READY': 'Ready',
      'READING_STEP': 'Reading step',
      'AWAITING_INPUT': 'Listening for commands',
      'COMPLETED': 'Finished'
    };
    badge.innerText = labels[status] || status;
  }

  // --- Rendering UI Updates ---
  render() {
    if (!this.recipe) return;

    // Header & Meta: Render clean cooking metrics under title - no blog fluff
    document.getElementById('recipeTitleDisplay').innerText = this.recipe.title;
    
    const descEl = document.getElementById('recipeDescDisplay');
    if (descEl) {
      const metaParts = [];
      if (this.recipe.prepTimeMinutes) metaParts.push(`Prep: ${this.recipe.prepTimeMinutes}m`);
      if (this.recipe.cookTimeMinutes) metaParts.push(`Cook: ${this.recipe.cookTimeMinutes}m`);
      if (this.recipe.totalTimeMinutes) metaParts.push(`Total: ${this.recipe.totalTimeMinutes}m`);
      metaParts.push(`${this.recipe.steps.length} guided steps`);
      descEl.innerText = `⏱️ ${metaParts.join(' • ')}`;
    }

    document.getElementById('servingsDisplay').innerText = `${this.recipe.currentServings} Servings`;
    this.updateStatusBadge();

    // Render Ingredients List
    const ingListEl = document.getElementById('ingredientsList');
    document.getElementById('ingredientCount').innerText = `${this.recipe.ingredients.length} items`;
    ingListEl.innerHTML = '';

    // Group ingredients by their .group (preserving order)
    const sections = [];
    let currentSection = null;

    this.recipe.ingredients.forEach(ing => {
      const groupName = ing.group ? ing.group.trim() : '';
      if (!currentSection || currentSection.title !== groupName) {
        currentSection = { title: groupName, items: [] };
        sections.push(currentSection);
      }
      currentSection.items.push(ing);
    });

    sections.forEach(section => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'ingredient-section';

      if (section.title) {
        const titleEl = document.createElement('h4');
        titleEl.className = 'ingredient-group-title';
        titleEl.innerText = section.title;
        sectionEl.appendChild(titleEl);
      }

      const ul = document.createElement('ul');
      ul.className = 'ingredient-grid';

      section.items.forEach(ing => {
        const li = document.createElement('li');
        li.className = 'ingredient-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.addEventListener('change', () => li.classList.toggle('checked', checkbox.checked));

        const span = document.createElement('span');
        span.className = 'ingredient-text';

        const qtyStr = ing.quantity !== null ? formatQuantityFraction(ing.quantity) : '';
        const unitStr = ing.unit ? ` ${ing.unit}` : '';
        
        let cleanName = (ing.name || '').trim()
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');

        let cleanNotes = (ing.notes || '').trim()
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');

        // If cleanName ends with a parenthetical and cleanNotes is empty, extract it client-side
        if (!cleanNotes && cleanName.endsWith(')')) {
          let depth = 0;
          for (let i = cleanName.length - 1; i >= 0; i--) {
            if (cleanName[i] === ')') depth++;
            else if (cleanName[i] === '(') {
              depth--;
              if (depth === 0) {
                let startIdx = i;
                while (startIdx > 0 && (cleanName[startIdx - 1] === '(' || (cleanName[startIdx - 1] === ' ' && startIdx > 1 && cleanName[startIdx - 2] === '('))) {
                  startIdx--;
                }
                cleanNotes = cleanName.slice(startIdx).trim();
                cleanName = cleanName.slice(0, startIdx).trim();
                break;
              }
            }
          }
        }

        // Clean dangling punctuation or open parens from cleanName
        cleanName = cleanName.replace(/[,;:\-\s(]+$/, '').replace(/^[\s(]+/, '').trim();

        // Clean outer parens and leading punctuation from notes
        if (cleanNotes) {
          let stripped = true;
          while (stripped && cleanNotes.startsWith('(') && cleanNotes.endsWith(')')) {
            let depth = 0;
            let matchedEnd = false;
            for (let i = 0; i < cleanNotes.length; i++) {
              if (cleanNotes[i] === '(') depth++;
              else if (cleanNotes[i] === ')') {
                depth--;
                if (depth === 0) {
                  if (i === cleanNotes.length - 1) matchedEnd = true;
                  break;
                }
              }
            }
            if (matchedEnd) {
              cleanNotes = cleanNotes.slice(1, -1).trim();
            } else {
              stripped = false;
            }
          }
          cleanNotes = cleanNotes.replace(/^[,;:\-\s]+/, '').trim();
          while (cleanNotes.startsWith('(') && cleanNotes.endsWith(')')) {
            cleanNotes = cleanNotes.slice(1, -1).trim();
          }
        }

        let notesStr = '';
        if (cleanNotes) {
          notesStr = ` <em class="ingredient-notes">${cleanNotes}</em>`;
        }

        const space = (qtyStr || unitStr) ? ' ' : '';
        span.innerHTML = `<span class="ingredient-qty">${qtyStr}${unitStr}</span>${space}<span class="ingredient-name">${cleanName}</span>${notesStr}`;

        li.appendChild(checkbox);
        li.appendChild(span);
        ul.appendChild(li);
      });

      sectionEl.appendChild(ul);
      ingListEl.appendChild(sectionEl);
    });

    // Render Step Reader
    const stepCounterEl = document.getElementById('stepCounterDisplay');
    const instructionEl = document.getElementById('stepInstructionText');
    const progressBar = document.getElementById('stepProgressBar');
    const nextBtn = document.getElementById('btnNextStep');

    if (this.currentStepIndex === -1) {
      if (stepCounterEl) stepCounterEl.innerText = `Ready • ${this.recipe.steps.length} Steps Total`;
      if (instructionEl) instructionEl.innerText = `Click "Start recipe" or say "Next" to begin Step 1.`;
      if (progressBar) progressBar.style.width = '0%';
      if (nextBtn) nextBtn.innerHTML = '<span>Start recipe</span><svg><use href="#icon-forward"></use></svg>';
    } else if (this.status === 'COMPLETED') {
      if (stepCounterEl) stepCounterEl.innerText = 'Completed! 🎉';
      if (instructionEl) instructionEl.innerHTML = `<div class="completed-banner"><h2>All Done! 👨‍🍳</h2><p>You have finished making ${this.recipe.title}. Enjoy!</p></div>`;
      if (progressBar) progressBar.style.width = '100%';
      if (nextBtn) nextBtn.innerHTML = '<span>Restart</span><svg><use href="#icon-repeat"></use></svg>';
    } else {
      const step = this.recipe.steps[this.currentStepIndex];
      if (stepCounterEl) stepCounterEl.innerText = `Step ${step.id} of ${this.recipe.steps.length}`;
      if (instructionEl) instructionEl.innerText = cleanText(step.instruction);

      const pct = Math.round(((this.currentStepIndex + 1) / this.recipe.steps.length) * 100);
      if (progressBar) progressBar.style.width = `${pct}%`;

      const isFinal = this.currentStepIndex === this.recipe.steps.length - 1;
      if (nextBtn) {
        nextBtn.innerHTML = `<span>${isFinal ? 'Finish recipe' : 'Next step'}</span><svg><use href="#icon-forward"></use></svg>`;
      }
    }

    // Render detected step timer suggestions
    const timerSuggestionContainer = document.getElementById('stepTimerSuggestion');
    const timerChipsContainer = document.getElementById('stepTimerChips');
    if (timerSuggestionContainer && timerChipsContainer) {
      if (this.currentStepIndex >= 0 && this.recipe.steps[this.currentStepIndex]) {
        const currentStep = this.recipe.steps[this.currentStepIndex];
        const detected = extractStepTimers(currentStep.instruction);
        if (detected.length > 0) {
          timerChipsContainer.innerHTML = detected.map(d => `
            <button class="btn-step-timer" data-seconds="${d.durationSeconds}" data-label="Step ${currentStep.id} (${d.label})" title="Start a ${d.label} timer for Step ${currentStep.id}">
              <svg><use href="#icon-timer"></use></svg>
              <span>${d.label} timer</span>
            </button>
          `).join('');
          timerChipsContainer.querySelectorAll('.btn-step-timer').forEach(b => {
            b.addEventListener('click', (e) => {
              const sec = parseInt(e.currentTarget.dataset.seconds, 10);
              const lbl = e.currentTarget.dataset.label;
              if (this.timerManager) {
                this.timerManager.createTimer(sec, lbl, currentStep.id);
              }
            });
          });
          timerSuggestionContainer.hidden = false;
        } else {
          timerSuggestionContainer.hidden = true;
          timerChipsContainer.innerHTML = '';
        }
      } else {
        timerSuggestionContainer.hidden = true;
        timerChipsContainer.innerHTML = '';
      }
    }
  }

  recordAudit(text) {
    const time = new Date().toLocaleTimeString();
    this.history.unshift(`[${time}] ${text}`);
    if (this.history.length > 30) this.history.pop();

    const el = document.getElementById('auditLogDisplay');
    if (el) {
      el.innerHTML = this.history.map(item => `<div class="audit-entry">${item}</div>`).join('');
    }
  }

  async fetchRecipeFromUrl(rawUrl) {
    const input = (rawUrl || '').trim();
    if (!input) return;

    // 1. Instant offline sample keyword detection
    const lower = input.toLowerCase();
    if (lower.includes('cookie') || lower === 'cookies') {
      this.recordAudit('Loading built-in sample: Chocolate Chip Cookies');
      this.loadSampleRecipe('cookies');
      return;
    }
    if (lower.includes('chicken') || lower.includes('tuscan')) {
      this.recordAudit('Loading built-in sample: Tuscan Garlic Chicken');
      this.loadSampleRecipe('chicken');
      return;
    }
    if (lower.includes('pancake') || lower.includes('blueberry') || lower === 'pancakes') {
      this.recordAudit('Loading built-in sample: Blueberry Pancakes');
      this.loadSampleRecipe('pancakes');
      return;
    }

    // 2. Direct JSON-LD or HTML markup pasted in
    if (input.startsWith('{') || input.includes('"@type"') || input.includes('<script') || input.includes('<html')) {
      try {
        this.recordAudit('Parsing pasted recipe markup...');
        let recipe;
        if (input.startsWith('{')) {
          recipe = parseRecipeFromSchema(JSON.parse(input), 'Pasted Recipe');
        } else {
          recipe = extractRecipeFromHtml(input, 'Pasted HTML');
        }
        if (recipe && recipe.steps.length > 0) {
          this.loadRecipe(recipe);
          return;
        }
      } catch (err) {
        console.warn('Direct markup parse failed:', err);
      }
    }

    this.recordAudit(`Fetching recipe: ${input}`);

    // 3. Localhost Node server backend (if running npm start locally)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      try {
        const res = await fetch('/api/parse-recipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.recipe) {
            this.loadRecipe(data.recipe);
            return;
          }
        }
      } catch (e) {
        console.warn('Local API fetch failed, trying client-side fallback:', e);
      }
    }

    // 4. Client-side extraction via CORS proxies (for GitHub Pages & static hosting)
    const proxyGateways = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(input)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(input)}`
    ];

    for (const proxyUrl of proxyGateways) {
      try {
        this.recordAudit('Fetching via CORS proxy...');
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const html = await response.text();
          const recipe = extractRecipeFromHtml(html, input);
          if (recipe && recipe.steps.length > 0) {
            this.recordAudit(`Extracted: ${recipe.title}`);
            this.loadRecipe(recipe);
            return;
          }
        }
      } catch (proxyErr) {
        console.warn(`Proxy ${proxyUrl} failed:`, proxyErr);
      }
    }

    // 5. Friendly GitHub Pages static hosting explanation
    const isGitHubPages = window.location.hostname.endsWith('github.io');
    if (isGitHubPages || !isLocalhost) {
      alert(
        'GitHub Pages is a static host, and this external website blocked third-party scrapers (CORS).\n\n' +
        'Tips to continue:\n' +
        '• Choose a recipe from the "Or start with a sample" dropdown below.\n' +
        '• Or paste the recipe\'s text or JSON-LD into the box.\n' +
        '• Or run `npm start` locally for full server-side scraping.'
      );
    } else {
      alert('Could not extract recipe from this URL. Please verify the URL or try another recipe.');
    }
  }

  async loadSampleRecipe(sampleKey) {
    // Built-in offline fallback recipes for instant zero-network usage
    const OFFLINE_SAMPLES = {
      cookies: {
        id: 'recipe-cookies',
        title: 'Classic Chewy Chocolate Chip Cookies',
        description: 'Golden edges with a soft, chewy center loaded with melted chocolate chunks.',
        originalServings: 24,
        currentServings: 24,
        scaleFactor: 1.0,
        ingredients: [
          { id: 'ing-1', raw: '2 1/4 cups flour', name: 'all-purpose flour', quantity: 2.25, unit: 'cups' },
          { id: 'ing-2', raw: '1 tsp baking soda', name: 'baking soda', quantity: 1, unit: 'tsp' },
          { id: 'ing-3', raw: '1/2 tsp salt', name: 'salt', quantity: 0.5, unit: 'tsp' },
          { id: 'ing-4', raw: '1 cup butter', name: 'unsalted butter', quantity: 1, unit: 'cup', notes: 'softened' },
          { id: 'ing-5', raw: '3/4 cup granulated sugar', name: 'granulated sugar', quantity: 0.75, unit: 'cup' },
          { id: 'ing-6', raw: '3/4 cup brown sugar', name: 'packed brown sugar', quantity: 0.75, unit: 'cup' },
          { id: 'ing-7', raw: '2 large eggs', name: 'large eggs', quantity: 2, unit: 'piece' },
          { id: 'ing-8', raw: '2 cups chocolate chips', name: 'chocolate chips', quantity: 2, unit: 'cups' }
        ],
        steps: [
          { id: 1, instruction: 'Preheat oven to 375°F (190°C) and line two baking sheets with parchment paper.' },
          { id: 2, instruction: 'Whisk together flour, baking soda, and salt in a bowl. Set aside.' },
          { id: 3, instruction: 'Beat softened butter, granulated sugar, and brown sugar until creamy, about 2 minutes.' },
          { id: 4, instruction: 'Add eggs one at a time, beating well, then fold in flour mixture and chocolate chips.' },
          { id: 5, instruction: 'Drop rounded tablespoons of dough onto baking sheets 2 inches apart.' },
          { id: 6, instruction: 'Bake for 9 to 11 minutes until golden brown around edges but soft in center.' },
          { id: 7, instruction: 'Cool on baking sheets for 2 minutes, then transfer to wire racks.' }
        ]
      },
      chicken: {
        id: 'recipe-chicken',
        title: 'Creamy Tuscan Garlic Chicken',
        description: 'Pan-seared chicken breasts smothered in a rich garlic, sun-dried tomato, and spinach cream sauce.',
        originalServings: 4,
        currentServings: 4,
        scaleFactor: 1.0,
        ingredients: [
          { id: 'ing-1', raw: '1.5 lbs chicken breasts', name: 'boneless chicken breasts', quantity: 1.5, unit: 'lbs', group: 'Chicken' },
          { id: 'ing-2', raw: '2 tbsp olive oil', name: 'olive oil', quantity: 2, unit: 'tbsp', group: 'Chicken' },
          { id: 'ing-3', raw: '1 cup heavy cream', name: 'heavy cream', quantity: 1, unit: 'cup', group: 'Cream Sauce' },
          { id: 'ing-4', raw: '4 cloves garlic', name: 'garlic', quantity: 4, unit: 'cloves', notes: 'minced', group: 'Cream Sauce' },
          { id: 'ing-5', raw: '2 cups baby spinach', name: 'fresh baby spinach', quantity: 2, unit: 'cups', group: 'Cream Sauce' },
          { id: 'ing-6', raw: '1/2 cup Parmesan cheese', name: 'grated Parmesan cheese', quantity: 0.5, unit: 'cup', group: 'Cream Sauce' }
        ],
        steps: [
          { id: 1, instruction: 'Season chicken breasts evenly with Italian seasoning, salt, and pepper.' },
          { id: 2, instruction: 'Heat olive oil in a skillet. Sear chicken for 5 minutes per side until golden brown (165°F).' },
          { id: 3, instruction: 'Sauté minced garlic in skillet for 1 minute until fragrant.' },
          { id: 4, instruction: 'Pour in heavy cream and broth, simmer for 3 minutes.' },
          { id: 5, instruction: 'Stir in fresh baby spinach for 2 minutes until wilted, return chicken to pan, and serve.' }
        ]
      },
      pancakes: {
        id: 'recipe-pancakes',
        title: 'Fluffy Blueberry Pancakes',
        description: 'Thick, diner-style fluffy blueberry pancakes made with real buttermilk.',
        originalServings: 4,
        currentServings: 4,
        scaleFactor: 1.0,
        ingredients: [
          { id: 'ing-1', raw: '2 cups flour', name: 'all-purpose flour', quantity: 2, unit: 'cups' },
          { id: 'ing-2', raw: '2 cups buttermilk', name: 'buttermilk', quantity: 2, unit: 'cups' },
          { id: 'ing-3', raw: '2 large eggs', name: 'eggs', quantity: 2, unit: 'piece' },
          { id: 'ing-4', raw: '1 cup fresh blueberries', name: 'fresh blueberries', quantity: 1, unit: 'cup' }
        ],
        steps: [
          { id: 1, instruction: 'Whisk together flour, sugar, baking powder, and salt in a large bowl.' },
          { id: 2, instruction: 'Whisk buttermilk, eggs, and melted butter. Fold wet ingredients into dry and rest for 5 minutes.' },
          { id: 3, instruction: 'Pour 1/4 cup batter per pancake onto medium heat skillet. Cook for 3 minutes until bubbles form.' },
          { id: 4, instruction: 'Flip and cook another 2 minutes until golden brown. Serve hot with maple syrup.' }
        ]
      }
    };

    if (OFFLINE_SAMPLES[sampleKey]) {
      this.loadRecipe(OFFLINE_SAMPLES[sampleKey]);
      return;
    }

    try {
      const res = await fetch('/api/samples');
      const data = await res.json();
      const found = data.samples.find(s => s.id === sampleKey);
      if (found && found.recipe) {
        this.loadRecipe(found.recipe);
      }
    } catch {
      console.log('Server not responding, using offline fallback.');
    }
  }
}

// --- Screen Wake Lock Support (Keeps screen awake while cooking) ---
class ScreenWakeLockManager {
  constructor() {
    this.wakeLock = null;
    this.init();
  }

  init() {
    const wakeLockBtn = document.getElementById('btnWakeLock');
    if (wakeLockBtn) {
      if ('wakeLock' in navigator) {
        wakeLockBtn.addEventListener('click', () => this.toggleWakeLock(wakeLockBtn));
        document.addEventListener('visibilitychange', async () => {
          if (this.wakeLock !== null && document.visibilityState === 'visible') {
            try {
              this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
              console.warn('Re-acquiring wake lock failed:', err);
            }
          }
        });
      } else {
        const control = wakeLockBtn.closest('.assistant-wake-control') || wakeLockBtn;
        control.style.display = 'none'; // Unsupported browser
      }
    }
  }

  async toggleWakeLock(btn) {
    const label = document.getElementById('wakeLockLabel');
    try {
      if (!this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('is-active');
        if (label) {
          label.textContent = 'Screen stays awake';
        } else {
          btn.innerText = '👁️ Screen stays awake';
        }

        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
          btn.setAttribute('aria-pressed', 'false');
          btn.classList.remove('is-active');
          if (label) {
            label.textContent = 'Keep screen awake';
          } else {
            btn.innerText = '👁️ Keep screen awake';
          }
        });
      } else {
        await this.wakeLock.release();
        this.wakeLock = null;
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('is-active');
        if (label) {
          label.textContent = 'Keep screen awake';
        } else {
          btn.innerText = '👁️ Keep screen awake';
        }
      }
    } catch (err) {
      console.warn('Wake Lock error:', err);
      const msg = document.getElementById('wakeLockMessage');
      if (msg) {
        msg.textContent = 'Could not keep screen awake';
        setTimeout(() => { msg.textContent = ''; }, 3000);
      }
    }
  }
}

// Initialize Application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new RecipeApp();
  window.screenManager = new ScreenWakeLockManager();
});
