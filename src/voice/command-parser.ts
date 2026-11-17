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

  return { action: 'UNKNOWN', rawTranscript };
}
