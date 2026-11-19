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
 * Formats a raw section header into clean title-case text (e.g. "MEATBALLS:" -> "Meatballs")
 */
export function formatGroupTitle(raw: string): string {
  if (!raw) return '';
  let clean = raw
    .replace(/<[^>]+>/g, '')
    .replace(/[:\-\s]+$/, '')
    .replace(/^[:#\-\s]+/, '')
    .trim();
  if (!clean) return '';
  // If text is ALL CAPS, convert to Title Case (e.g. "ONION GRAVY" -> "Onion Gravy")
  if (clean === clean.toUpperCase() && clean.length > 2) {
    clean = clean
      .toLowerCase()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return clean;
}

/**
 * Determines whether a raw ingredient string is actually an inline section header
 * (e.g. "## Meatballs", "Meatballs:", "For the Gravy:", "=== Toppings ===")
 */
export function isIngredientHeader(raw: string): boolean {
  const clean = raw.trim();
  if (!clean) return false;
  // Markdown style: "## Meatballs" or "# Gravy"
  if (/^#{1,4}\s+[^#\n]+$/i.test(clean)) return true;
  // Section style: "=== Meatballs ==="
  if (/^={2,}\s*[^=\n]+\s*={2,}$/.test(clean)) return true;
  // Never treat lines starting with digits or fractions as headers
  if (/^\d/.test(clean)) return false;
  // "For the Meatballs:" or "Meatballs:" or "Gravy:" or "Toppings:"
  if (/^(?:for\s+the\s+)?([a-z0-9\s/&'-]+):\s*$/i.test(clean)) {
    return true;
  }
  return false;
}

/**
 * Extracts ingredient group sections from structured HTML markup
 * (supports WP Recipe Maker, Tasty Recipes, Mediavine Create, and semantic HTML groups)
 */
export function extractHtmlIngredientGroups(html: string): Array<{ title?: string; count: number }> {
  const groups: Array<{ title?: string; count: number }> = [];

  // Pattern 1: WP Recipe Maker ingredient groups
  const wprmRegex = /<div[^>]*class=["'][^"']*wprm-recipe-ingredient-group[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = wprmRegex.exec(html)) !== null) {
    const block = match[1];
    const headerMatch = block.match(/<h\d[^>]*class=["'][^"']*wprm-recipe-group-name[^"']*["'][^>]*>([\s\S]*?)<\/h\d>/i);
    const title = headerMatch ? formatGroupTitle(headerMatch[1]) : undefined;
    const count = (block.match(/<li[^>]*class=["'][^"']*wprm-recipe-ingredient[^"']*["'][^>]*>/gi) || []).length;
    if (count > 0) {
      groups.push({ title, count });
    }
  }

  // Pattern 2: Generic / Tasty Recipes / Mediavine Create groups
  if (groups.length === 0) {
    const genericRegex = /<(?:div|section)[^>]*class=["'][^"']*(?:ingredient-group|recipe-group|mv-create-ingredient-group|tasty-recipes-ingredients)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
    while ((match = genericRegex.exec(html)) !== null) {
      const block = match[1];
      const headerMatch = block.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i);
      const title = headerMatch ? formatGroupTitle(headerMatch[1]) : undefined;
      const count = (block.match(/<li[^>]*>/gi) || []).length;
      if (count > 0) {
        groups.push({ title, count });
      }
    }
  }

  return groups;
}

/**
 * Decodes all HTML entities and strips any embedded HTML tags
 */
export function cleanText(text: string): string {
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

/**
 * Decodes HTML entities and strips blog artifact phrases (e.g. "recipe video above", "jump to recipe")
 */
export function cleanRecipeDescription(text: string): string {
  if (!text) return '';

  let cleaned = cleanText(text)
    .replace(/\b(?:watch|see)\s+(?:the\s+)?(?:recipe\s+)?video\s+(?:above|below|here)[^.]*\.?/gi, '')
    .replace(/\b(?:jump|scroll)\s+to\s+(?:the\s+)?recipe[^.]*\.?/gi, '')
    .replace(/\b(?:recipe\s+video\s+above)[^.]*\.?/gi, '')
    .trim();

  return cleaned.replace(/\s{2,}/g, ' ');
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

  const title: string = cleanRecipeDescription(recipeObj.name || recipeObj.headline || 'Untitled Recipe');
  const description: string = cleanRecipeDescription(recipeObj.description || '');
  const servings = parseRecipeServings(recipeObj.recipeYield);

  // Ingredients extraction (supporting inline section headers e.g. "## Meatballs" or "For the Gravy:")
  const rawIngredients: string[] = Array.isArray(recipeObj.recipeIngredient)
    ? recipeObj.recipeIngredient
    : [];

  const ingredients: Ingredient[] = [];
  let currentGroup: string | undefined = undefined;

  for (let idx = 0; idx < rawIngredients.length; idx++) {
    const raw = cleanText(String(rawIngredients[idx]));
    if (!raw) continue;

    if (isIngredientHeader(raw)) {
      currentGroup = formatGroupTitle(raw);
      continue;
    }

    const ing = parseIngredient(raw, `ing-${ingredients.length + 1}`);
    if (currentGroup) {
      ing.group = currentGroup;
    }
    ingredients.push(ing);
  }

  // Steps extraction
  const rawInstructions = recipeObj.recipeInstructions || [];
  const steps: RecipeStep[] = [];

  const processInstructionItem = (item: any) => {
    if (typeof item === 'string') {
      const text = cleanText(item);
      if (text) {
        steps.push({
          id: steps.length + 1,
          instruction: text
        });
      }
    } else if (item && typeof item === 'object') {
      if (item['@type'] === 'HowToStep' || item.text) {
        const text = cleanText(item.text || item.description || '');
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
      .map(s => cleanText(s.replace(/^\d+[\.\)]\s*/, '')))
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
 * Extracts JSON-LD from HTML string and enriches ingredient groups from markup
 */
export function extractRecipeFromHtml(html: string, sourceUrl?: string): Recipe {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const recipe = parseRecipeFromSchema(parsed, sourceUrl);

      // If ingredients didn't have groups from JSON-LD inline headers, enrich from HTML groups
      const hasAnyGroup = recipe.ingredients.some(ing => Boolean(ing.group));
      if (!hasAnyGroup) {
        const htmlGroups = extractHtmlIngredientGroups(html);
        if (htmlGroups.length > 0) {
          const totalGrouped = htmlGroups.reduce((acc, g) => acc + g.count, 0);
          if (totalGrouped === recipe.ingredients.length) {
            let ingIdx = 0;
            for (const group of htmlGroups) {
              for (let i = 0; i < group.count; i++) {
                if (ingIdx < recipe.ingredients.length) {
                  if (group.title) {
                    recipe.ingredients[ingIdx].group = group.title;
                  }
                  ingIdx++;
                }
              }
            }
          }
        }
      }

      return recipe;
    } catch {
      // Continue to next JSON-LD block
    }
  }

  throw new Error('No schema.org/Recipe JSON-LD script tag found in HTML');
}
