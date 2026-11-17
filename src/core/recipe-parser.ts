/**
 * Recipe Parser and Extractor
 * Parses Schema.org Recipe JSON-LD, microdata, or text format,
 * and extracts instruction steps, ingredients, and metadata.
 */

import type { Recipe, RecipeStep, Ingredient } from './types.ts';
import { parseIngredient } from './recipe-scaler.ts';

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
          instruction: text
        });
      }
    } else if (item && typeof item === 'object') {
      if (item['@type'] === 'HowToStep' || item.text) {
        const text = (item.text || item.description || '').trim();
        if (text) {
          steps.push({
            id: steps.length + 1,
            instruction: text
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
          instruction: text
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
