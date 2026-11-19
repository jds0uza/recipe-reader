/**
 * Sample Recipes for Offline Testing & Browser UI Showcase
 */

import type { Recipe } from '../core/types.ts';

export const CHOCOLATE_CHIP_COOKIES: Recipe = {
  id: 'recipe-cookies',
  title: 'Classic Chewy Chocolate Chip Cookies',
  description: 'Golden edges with a soft, chewy center loaded with melted chocolate chunks.',
  url: 'https://example.com/recipes/chewy-chocolate-chip-cookies',
  originalServings: 24,
  currentServings: 24,
  scaleFactor: 1.0,
  prepTimeMinutes: 15,
  cookTimeMinutes: 10,
  totalTimeMinutes: 30,
  source: 'Grandma Kitchen',
  ingredients: [
    { id: 'ing-1', raw: '2 1/4 cups all-purpose flour', name: 'all-purpose flour', quantity: 2.25, unit: 'cups' },
    { id: 'ing-2', raw: '1 tsp baking soda', name: 'baking soda', quantity: 1, unit: 'tsp' },
    { id: 'ing-3', raw: '1/2 tsp fine sea salt', name: 'fine sea salt', quantity: 0.5, unit: 'tsp' },
    { id: 'ing-4', raw: '1 cup unsalted butter, softened', name: 'unsalted butter', quantity: 1, unit: 'cup', notes: 'softened' },
    { id: 'ing-5', raw: '3/4 cup granulated sugar', name: 'granulated sugar', quantity: 0.75, unit: 'cup' },
    { id: 'ing-6', raw: '3/4 cup packed brown sugar', name: 'packed brown sugar', quantity: 0.75, unit: 'cup' },
    { id: 'ing-7', raw: '2 large eggs, room temperature', name: 'eggs', quantity: 2, unit: 'piece', notes: 'room temperature' },
    { id: 'ing-8', raw: '2 tsp pure vanilla extract', name: 'vanilla extract', quantity: 2, unit: 'tsp' },
    { id: 'ing-9', raw: '2 cups semi-sweet chocolate chips', name: 'chocolate chips', quantity: 2, unit: 'cups' }
  ],
  steps: [
    { id: 1, instruction: 'Preheat oven to 375°F (190°C) and line two large baking sheets with parchment paper.' },
    { id: 2, instruction: 'In a medium bowl, whisk together the flour, baking soda, and salt. Set dry mixture aside.' },
    { id: 3, instruction: 'In a large stand mixer, beat the softened butter, granulated sugar, and brown sugar until creamy and light, about 2 minutes.' },
    { id: 4, instruction: 'Add eggs one at a time, beating well after each addition, then stir in vanilla extract.' },
    { id: 5, instruction: 'Gradually blend in flour mixture on low speed, then fold in the chocolate chips with a spatula.' },
    { id: 6, instruction: 'Drop rounded tablespoons of dough onto prepared baking sheets, leaving 2 inches between cookies.' },
    { id: 7, instruction: 'Bake for 9 to 11 minutes until golden brown around the edges but still soft in the center.' },
    { id: 8, instruction: 'Cool on baking sheets for 2 minutes, then transfer cookies to wire racks to cool completely.' }
  ]
};

export const TUSCAN_GARLIC_CHICKEN: Recipe = {
  id: 'recipe-tuscan-chicken',
  title: 'Creamy Tuscan Garlic Chicken',
  description: 'Pan-seared chicken breasts smothered in a rich garlic, sun-dried tomato, and spinach cream sauce.',
  url: 'https://example.com/recipes/tuscan-garlic-chicken',
  originalServings: 4,
  currentServings: 4,
  scaleFactor: 1.0,
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  totalTimeMinutes: 30,
  source: 'Culinary Bistro',
  ingredients: [
    { id: 'ing-1', raw: '1.5 lbs boneless skinless chicken breasts', name: 'boneless skinless chicken breasts', quantity: 1.5, unit: 'lbs', group: 'Chicken' },
    { id: 'ing-2', raw: '2 tbsp olive oil', name: 'olive oil', quantity: 2, unit: 'tbsp', group: 'Chicken' },
    { id: 'ing-3', raw: '1 tsp Italian seasoning', name: 'Italian seasoning', quantity: 1, unit: 'tsp', group: 'Chicken' },
    { id: 'ing-4', raw: '1 cup heavy whipping cream', name: 'heavy whipping cream', quantity: 1, unit: 'cup', group: 'Cream Sauce' },
    { id: 'ing-5', raw: '1/2 cup chicken broth', name: 'chicken broth', quantity: 0.5, unit: 'cup', group: 'Cream Sauce' },
    { id: 'ing-6', raw: '4 cloves garlic, minced', name: 'garlic', quantity: 4, unit: 'cloves', notes: 'minced', group: 'Cream Sauce' },
    { id: 'ing-7', raw: '1/2 cup sun-dried tomatoes, drained and sliced', name: 'sun-dried tomatoes', quantity: 0.5, unit: 'cup', notes: 'sliced', group: 'Cream Sauce' },
    { id: 'ing-8', raw: '2 cups fresh baby spinach', name: 'fresh baby spinach', quantity: 2, unit: 'cups', group: 'Cream Sauce' },
    { id: 'ing-9', raw: '1/2 cup grated Parmesan cheese', name: 'grated Parmesan cheese', quantity: 0.5, unit: 'cup', group: 'Cream Sauce' }
  ],
  steps: [
    { id: 1, instruction: 'Season chicken breasts evenly with Italian seasoning, salt, and freshly cracked black pepper.' },
    { id: 2, instruction: 'Heat olive oil in a large skillet over medium-high heat. Add chicken and sear for 5 minutes per side until golden brown and cooked through (165°F). Transfer to a plate.' },
    { id: 3, instruction: 'In the same skillet over medium heat, add minced garlic and sauté for 1 minute until fragrant.' },
    { id: 4, instruction: 'Pour in heavy whipping cream and chicken broth, stirring to scrape up any browned bits from the pan. Simmer for 3 minutes.' },
    { id: 5, instruction: 'Stir in sun-dried tomatoes and grated Parmesan cheese until sauce is smooth and slightly thickened.' },
    { id: 6, instruction: 'Add fresh baby spinach and stir for 2 minutes until wilted, then return cooked chicken to skillet and spoon sauce over top before serving.' }
  ]
};

export const SAMPLE_JSON_LD_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Fresh Blueberry Pancakes Recipe</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Fluffy Buttermilk Blueberry Pancakes",
    "description": "Thick, diner-style fluffy blueberry pancakes made with real buttermilk.",
    "recipeYield": "4 servings",
    "prepTime": "PT10M",
    "cookTime": "PT15M",
    "recipeIngredient": [
      "2 cups all-purpose flour",
      "2 tbsp granulated sugar",
      "2 tsp baking powder",
      "1/2 tsp baking soda",
      "1/2 tsp salt",
      "2 cups buttermilk",
      "2 large eggs",
      "1/4 cup unsalted butter, melted",
      "1 cup fresh blueberries"
    ],
    "recipeInstructions": [
      {
        "@type": "HowToStep",
        "text": "In a large bowl, whisk together flour, sugar, baking powder, baking soda, and salt."
      },
      {
        "@type": "HowToStep",
        "text": "In a separate bowl, whisk buttermilk, eggs, and melted butter until combined."
      },
      {
        "@type": "HowToStep",
        "text": "Fold wet ingredients into dry ingredients until just combined. Gently fold in fresh blueberries. Let batter rest for 5 minutes."
      },
      {
        "@type": "HowToStep",
        "text": "Heat a lightly oiled griddle or nonstick pan over medium heat. Pour 1/4 cup batter per pancake and cook for 3 minutes until bubbles form on surface."
      },
      {
        "@type": "HowToStep",
        "text": "Flip and cook another 2 minutes until golden brown. Serve hot with maple syrup."
      }
    ]
  }
  </script>
</head>
<body><h1>Fluffy Buttermilk Blueberry Pancakes</h1></body>
</html>
`;
