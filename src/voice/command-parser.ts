/**
 * Voice Command Parser
 * Deterministic natural language matcher translating spoken audio transcripts
 * into typed kitchen recipe state machine intents.
 */

import type { VoiceCommandIntent } from '../core/types.ts';

/**
 * Parses spoken duration formats into total seconds.
 * Supports patterns like "10 minutes", "1 minute 30 seconds", "45 seconds", "1.5 hours", "half an hour".
 */
export function parseDurationSeconds(text: string): number | null {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;

  if (/\b(?:half\s+(?:an?\s+)?hour)\b/i.test(clean)) return 1800;
  if (/\b(?:quarter\s+(?:of\s+an?\s+)?hour)\b/i.test(clean)) return 900;
  if (/\b(?:an?\s+hour\s+and\s+a\s+half)\b/i.test(clean)) return 5400;
  if (/\b(?:an?\s+hour)\b/i.test(clean) && !/\d+\s*hours?/i.test(clean)) return 3600;
  if (/\b(?:a\s+minute)\b/i.test(clean) && !/\d+\s*minutes?/i.test(clean)) return 60;

  // Word numbers (e.g. "one minute", "ten minutes", "five minutes")
  const wordMap: Record<string, number> = {
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

/**
 * Extracts potential timer durations from recipe step text.
 * Matches phrases like "bake for 20 to 25 minutes", "simmer 15 minutes", "rest 1 hour", "for 45 seconds".
 */
export function extractStepTimers(instruction: string): Array<{ durationSeconds: number; label: string; text: string }> {
  if (!instruction) return [];
  const results: Array<{ durationSeconds: number; label: string; text: string }> = [];
  const seenSeconds = new Set<number>();

  // Match range durations: e.g. "20 to 25 minutes", "3-4 mins"
  const rangeRegex = /\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/gi;
  let rangeMatch: RegExpExecArray | null;
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

  // Match single durations: e.g. "15 minutes", "1 hour", "45 seconds"
  const singleRegex = /\b(?:for|simmer|bake|cook|boil|roast|rest|chill|wait|steep)?\s*(?:about\s+|approximately\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/gi;
  let singleMatch: RegExpExecArray | null;
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

export function parseVoiceCommand(rawTranscript: string): VoiceCommandIntent {
  const text = rawTranscript.trim().toLowerCase();

  if (!text) {
    return { action: 'UNKNOWN', rawTranscript };
  }

  // Cancel / Clear Timer: "cancel timer", "stop timer", "clear timer"
  if (
    /\b(?:cancel|clear|delete|remove)\s+(?:the\s+)?timer\b/i.test(text) ||
    /^(?:cancel|stop)\s+(?:the\s+)?timer$/i.test(text)
  ) {
    return { action: 'CANCEL_TIMER', rawTranscript };
  }

  // Check Timer: "check timer", "how much time is left", "time left", "timer status"
  if (
    /\b(?:check\s+timer|timer\s+status|how\s+much\s+time(?:\s+is)?\s+left|how\s+long\s+left|time\s+left(?:\s+on\s+timer)?|is\s+the\s+timer\s+done)\b/i.test(text) ||
    /^(?:timer|check\s+timers?)$/i.test(text)
  ) {
    return { action: 'CHECK_TIMER', rawTranscript };
  }

  // Set Timer: requires explicit imperative command (e.g. "set a timer for 10 minutes", "start 5 minute timer", "pasta timer 8 minutes", "set the timer")
  // Must NOT trigger on descriptive utterances like "starting a 10 minute timer", "Step 3 bake for 10 minutes", or "timer is done"
  const isExcludedTimerPhrase =
    /^(?:starting|your|there\s+is|here\s+is)\b/i.test(text) ||
    /\b(?:done|completed|finished|cancelled|canceled|started|remaining|running)\b/i.test(text) ||
    /^step\s+\d+/i.test(text);

  const isSetTimerCommand =
    !isExcludedTimerPhrase &&
    (/^(?:please\s+)?(?:set|start|create|begin|new)\s+(?:a\s+|the\s+)?(?:([a-z0-9\s]+?)\s+)?timer\b/i.test(text) ||
     /^(?:please\s+)?(?:set|start)\s+(?:a\s+|the\s+)?(.+?)\s+timer$/i.test(text) ||
     /^(?:please\s+)?(?:([a-z0-9\s]+?)\s+)?timer\s+(?:for\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter)/i.test(text) ||
     /^(?:please\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter)\s+(?:minute|min|hour|second|sec)s?\s+timer$/i.test(text));

  if (isSetTimerCommand) {
    const durationSeconds = parseDurationSeconds(text);
    let timerLabel = 'Timer';
    const labelMatch = text.match(/(?:set|start|create)\s+(?:a\s+|the\s+)?([a-z0-9\s]+?)\s+timer/i);
    const labelAfterMatch = text.match(/timer\s+for\s+([a-z]+)\s+for/i);
    const prefixLabelMatch = text.match(/^([a-z]+)\s+timer/i);

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
      rawTranscript
    };
  }

  // Stop / Pause / Silence (Top priority to interrupt speech)
  // Matches any utterance containing stop, pause, quiet, silence, etc.,
  // including natural phrasing like "stop reading", "please stop", "stop it", or when speaker audio blends in.
  if (/\b(stop|pause|halt|be\s+quiet|quiet|shut\s+up|silence|cancel|stop\s+talking|mute|stfu)\b/i.test(text)) {
    return { action: 'STOP', rawTranscript };
  }

  // Next step / Start recipe
  if (
    /^(next|next\s+step|continue|done|finished|what(?:'?s|\s+is)\s+next|move\s+on|proceed|start|start\s+recipe|start\s+cooking|begin|begin\s+recipe|begin\s+cooking|let'?s\s+(?:cook|start|begin))$/i.test(text) ||
    /\b(next\s+step|what(?:'?s|\s+is)\s+next|start\s+recipe|start\s+cooking|begin\s+recipe)\b/i.test(text)
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
  // Strictly anchored so instructions being read aloud (e.g. "Step 3: In a bowl...") aren't self-interpreted as jumps
  const jumpMatch =
    text.match(/^(?:please\s+)?(?:can\s+you\s+)?(?:jump\s+to|go\s+to|skip\s+to|take\s+me\s+to)\s+(?:step\s+)?(\d+)$/i) ||
    text.match(/^step\s+(\d+)$/i);
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
