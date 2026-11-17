/**
 * Recipe Parser and Extractor
 * Parses Schema.org Recipe JSON-LD, microdata, or text format,
 * and extracts instruction steps, ingredients, and automated timer cues.
 */

import type { Recipe, RecipeStep, Ingredient } from './types.ts';
import { parseIngredient } from './recipe-scaler.ts';

/**
 * Automatically detects cooking timer durations mentioned in step instruction text.
 * Returns duration in seconds if detected, or undefined.
 */
export function detectStepTimerSeconds(instruction: string): number | undefined {
  if (!instruction) return undefined;

  // Regex patterns for hours, minutes, seconds, and ranges
  // e.g. "for 15 minutes", "bake 25-30 mins", "for 1 hour", "for 45 seconds", "simmer 1.5 hours"
  const patterns: Array<{ regex: RegExp; toSeconds: (m: RegExpMatchArray) => number }> = [
    // Hours and minutes: e.g. "1 hour and 30 minutes", "1 hr 15 mins"
    {
      regex: /(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)\s*(?:and)?\s*(\d+)\s*(?:minute|minutes|min|mins)\b/i,
      toSeconds: (m) => Math.round(parseFloat(m[1]) * 3600 + parseInt(m[2], 10) * 60)
    },
    // Single or range hours: "2 hours", "1.5 hours", "1 to 2 hours"
    {
      regex: /(?:for|about)?\s*(\d+(?:\.\d+)?)(?:\s*(?:to|-)\s*(\d+(?:\.\d+)?))?\s*(?:hour|hours|hr|hrs)\b/i,
      toSeconds: (m) => {
        const val = m[2] ? parseFloat(m[2]) : parseFloat(m[1]);
        return Math.round(val * 3600);
      }
    },
    // Single or range minutes: "15 minutes", "25-30 mins", "10 to 12 minutes"
    {
      regex: /(?:for|about)?\s*(\d+(?:\.\d+)?)(?:\s*(?:to|-)\s*(\d+(?:\.\d+)?))?\s*(?:minute|minutes|min|mins)\b/i,
      toSeconds: (m) => {
        // If range, default to upper bound or average; here we pick lower or upper
        const val = m[2] ? parseFloat(m[1]) : parseFloat(m[1]);
        return Math.round(val * 60);
      }
    },
    // Seconds: "30 seconds", "45 secs"
    {
      regex: /(?:for|about)?\s*(\d+)\s*(?:second|seconds|sec|secs)\b/i,
      toSeconds: (m) => parseInt(m[1], 10)
    }
  ];

  for (const { regex, toSeconds } of patterns) {
    const match = instruction.match(regex);
    if (match) {
      const secs = toSeconds(match);
      if (secs > 0 && secs <= 86400) {
        return secs;
      }
    }
  }

  return undefined;
}

/**
 * Parses ISO 8601 duration string (e.g. "PT30M", "PT1H15M") to minutes
 */
export function parseIsoDuration(durationStr?: string): number | undefined {
  if (!durationStr || typeof durationStr !== 'string') return undefined;

  const match = durationStr.match(/P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i);
  if (!match) return undefined;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes;
}

/**
 * Extracts and normalizes servings count from schema.org recipeYield
 */
export function parseRecipeServings(yieldVal?: any): number {
  if (typeof yieldVal === 'number' && yieldVal > 0) return yieldVal;
  if (Array.isArray(yieldVal) && yieldVal.length > 0) return parseRecipeServings(yieldVal[0]);

  if (typeof yieldVal === 'string') {
    const match = yieldVal.match(/\d+/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (parsed > 0) return parsed;
    }
  }

  return 4; // Sensible default
}

/**
 * Extracts Schema.org Recipe from raw JSON-LD object or embedded HTML string
 */
export function parseRecipeFromSchema(jsonLd: any, sourceUrl?: string): Recipe {
  let recipeObj = jsonLd;

  // Handle @graph container common in WordPress/Yoast SEO
  if (recipeObj && recipeObj['@graph'] && Array.isArray(recipeObj['@graph'])) {
    recipeObj = recipeObj['@graph'].find(
      (item: any) => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
    );
  }

  // Handle array of items
  if (Array.isArray(recipeObj)) {
    recipeObj = recipeObj.find(
      (item: any) => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
    );
  }

  if (!recipeObj) {
    throw new Error('Valid Schema.org Recipe not found in provided data');
  }

  const title: string = recipeObj.name || recipeObj.headline || 'Untitled Recipe';
  const description: string = recipeObj.description || '';
  const servings = parseRecipeServings(recipeObj.recipeYield);

  // Ingredients extraction
  const rawIngredients: string[] = Array.isArray(recipeObj.recipeIngredient)
    ? recipeObj.recipeIngredient
    : [];

  const ingredients: Ingredient[] = rawIngredients.map((raw, idx) =>
    parseIngredient(String(raw), `ing-${idx + 1}`)
  );

  // Steps extraction
  const rawInstructions = recipeObj.recipeInstructions || [];
  const steps: RecipeStep[] = [];

  const processInstructionItem = (item: any) => {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) {
        steps.push({
          id: steps.length + 1,
          instruction: text,
          timerSeconds: detectStepTimerSeconds(text)
        });
      }
    } else if (item && typeof item === 'object') {
      if (item['@type'] === 'HowToStep' || item.text) {
        const text = (item.text || item.description || '').trim();
        if (text) {
          steps.push({
            id: steps.length + 1,
            instruction: text,
            timerSeconds: detectStepTimerSeconds(text)
          });
        }
      } else if (item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
        item.itemListElement.forEach(processInstructionItem);
      }
    }
  };

  if (Array.isArray(rawInstructions)) {
    rawInstructions.forEach(processInstructionItem);
  } else if (typeof rawInstructions === 'string') {
    // Split by newlines or numbered steps
    rawInstructions
      .split(/\n+/)
      .map(s => s.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean)
      .forEach(text => {
        steps.push({
          id: steps.length + 1,
          instruction: text,
          timerSeconds: detectStepTimerSeconds(text)
        });
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

/**
 * Extracts JSON-LD from HTML string
 */
export function extractRecipeFromHtml(html: string, sourceUrl?: string): Recipe {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      return parseRecipeFromSchema(parsed, sourceUrl);
    } catch {
      // Continue to next JSON-LD block
    }
  }

  throw new Error('No schema.org/Recipe JSON-LD script tag found in HTML');
}
