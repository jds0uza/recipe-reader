/**
 * Voice Command Parser
 * Deterministic natural language matcher translating spoken audio transcripts
 * into typed kitchen recipe state machine intents.
 */

import type { VoiceCommandIntent } from '../core/types.ts';

export function parseVoiceCommand(rawTranscript: string): VoiceCommandIntent {
  const text = rawTranscript.trim().toLowerCase();

  if (!text) {
    return { action: 'UNKNOWN', rawTranscript };
  }

  // Stop / Pause / Silence (Top priority to interrupt speech)
  if (
    /^(stop|pause|halt|be\s+quiet|quiet|shut\s+up|silence|cancel|stop\s+talking|mute|stfu)$/i.test(text) ||
    /\b(stop\s+talking|be\s+quiet|cancel\s+speech)\b/i.test(text)
  ) {
    return { action: 'STOP', rawTranscript };
  }

  // Next step
  if (
    /^(next|next\s+step|continue|done|finished|what(?:'?s|\s+is)\s+next|move\s+on|proceed)$/i.test(text) ||
    /\b(next\s+step|what(?:'?s|\s+is)\s+next)\b/i.test(text)
  ) {
    return { action: 'NEXT_STEP', rawTranscript };
  }

  // Previous step / back
  if (
    /^(back|previous|previous\s+step|go\s+back|last\s+step)$/i.test(text) ||
    /\b(previous\s+step|go\s+back)\b/i.test(text)
  ) {
    return { action: 'PREVIOUS_STEP', rawTranscript };
  }

  // Repeat step
  if (
    /^(repeat|repeat\s+step|say\s+that?\s+again|say\s+again|what\s+was\s+that|again|one\s+more\s+time)$/i.test(text) ||
    /\b(repeat\s+step|say\s+again)\b/i.test(text)
  ) {
    return { action: 'REPEAT_STEP', rawTranscript };
  }

  // Jump to step: "jump to step 4", "go to step 2", "step 3"
  const jumpMatch = text.match(/(?:jump\s+to|go\s+to|skip\s+to|step)\s+(?:step\s+)?(\d+)/i);
  if (jumpMatch) {
    const stepIndex = parseInt(jumpMatch[1], 10);
    return { action: 'JUMP_TO_STEP', payload: { stepIndex }, rawTranscript };
  }

  // Double / Half / Triple recipe shortcuts
  if (/\b(?:double|twice)\s+(?:the\s+)?(?:recipe|servings)?\b/i.test(text)) {
    return { action: 'SCALE_RECIPE', payload: { scaleFactor: 2.0 }, rawTranscript };
  }
  if (/\b(?:half|halve)\s+(?:the\s+)?(?:recipe|servings)?\b/i.test(text)) {
    return { action: 'SCALE_RECIPE', payload: { scaleFactor: 0.5 }, rawTranscript };
  }
  if (/\btriple\s+(?:the\s+)?(?:recipe|servings)?\b/i.test(text)) {
    return { action: 'SCALE_RECIPE', payload: { scaleFactor: 3.0 }, rawTranscript };
  }

  // Scale recipe to N servings or factor
  const scaleMatch = text.match(/scale\s+(?:the\s+)?(?:recipe\s+)?to\s+(\d+(?:\.\d+)?)\s*(?:servings|people|portions|x)?/i);
  if (scaleMatch) {
    const val = parseFloat(scaleMatch[1]);
    const isMultiplier = text.endsWith('x') || text.includes('factor');
    return {
      action: 'SCALE_RECIPE',
      payload: isMultiplier ? { scaleFactor: val } : { targetServings: val },
      rawTranscript
    };
  }

  // List all ingredients
  if (
    /\b(?:list|read|what\s+are)\s+(?:the\s+)?ingredients\b/i.test(text) ||
    text === 'ingredients'
  ) {
    return { action: 'LIST_INGREDIENTS', rawTranscript };
  }

  // Query specific ingredient: "how much butter", "how many eggs", "amount of sugar"
  const queryMatch = text.match(
    /(?:how\s+(?:much|many)|amount\s+of|quantity\s+of|check)\s+([a-z\s]+?)(?:\s+do\s+i\s+need|\s+left)?\??$/i
  );
  if (queryMatch) {
    const ingredientName = queryMatch[1].trim();
    return { action: 'QUERY_INGREDIENT', payload: { ingredientName }, rawTranscript };
  }

  // Start timer: "set a timer for 10 minutes", "start timer 5 mins", "set 30 second timer"
  const timerMatch = text.match(
    /(?:set|start)(?:\s+a)?\s+timer\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|second|seconds|sec|secs|hour|hours|hr|hrs)/i
  );
  if (timerMatch) {
    const amount = parseFloat(timerMatch[1]);
    const unit = timerMatch[2].toLowerCase();
    let seconds = amount;
    if (unit.startsWith('min')) seconds = amount * 60;
    else if (unit.startsWith('hour') || unit.startsWith('hr')) seconds = amount * 3600;

    return {
      action: 'START_TIMER',
      payload: { timerSeconds: Math.round(seconds), timerLabel: `${amount} ${unit} Timer` },
      rawTranscript
    };
  }

  // Pause / resume / cancel timer
  if (/\b(?:pause|stop)\s+(?:the\s+)?timer\b/i.test(text)) {
    return { action: 'PAUSE_TIMER', rawTranscript };
  }
  if (/\b(?:resume|unpause)\s+(?:the\s+)?timer\b/i.test(text)) {
    return { action: 'RESUME_TIMER', rawTranscript };
  }
  if (/\b(?:cancel|clear)\s+(?:the\s+)?timer\b/i.test(text)) {
    return { action: 'CANCEL_TIMER', rawTranscript };
  }

  return { action: 'UNKNOWN', rawTranscript };
}
