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

function formatIngredientForVoice(ingredient, scaleFactor = 1.0) {
  if (ingredient.quantity === null) {
    return ingredient.name + (ingredient.notes ? `, ${ingredient.notes}` : '');
  }
  const scaledQty = ingredient.quantity * scaleFactor;
  const fractionStr = formatQuantityFraction(scaledQty);
  const unit = ingredient.unit ? ` ${ingredient.unit}` : '';
  const notes = ingredient.notes ? `, ${ingredient.notes}` : '';
  return `${fractionStr}${unit} of ${ingredient.name}${notes}`;
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
}

// --- Voice Command Intent Matcher ---
function parseVoiceCommand(text) {
  const clean = text.trim().toLowerCase();
  if (!clean) return { action: 'UNKNOWN', rawTranscript: text };

  if (/^(next|next\s+step|continue|done|finished|what(?:'?s|\s+is)\s+next|move\s+on)$/i.test(clean) || /\b(next\s+step|what(?:'?s|\s+is)\s+next)\b/i.test(clean)) {
    return { action: 'NEXT_STEP', rawTranscript: text };
  }
  if (/^(back|previous|previous\s+step|go\s+back)$/i.test(clean) || /\b(previous\s+step|go\s+back)\b/i.test(clean)) {
    return { action: 'PREVIOUS_STEP', rawTranscript: text };
  }
  if (/^(repeat|repeat\s+step|say\s+that?\s+again|say\s+again|what\s+was\s+that|again)$/i.test(clean) || /\b(repeat\s+step|say\s+again)\b/i.test(clean)) {
    return { action: 'REPEAT_STEP', rawTranscript: text };
  }

  const jumpMatch = clean.match(/(?:jump\s+to|go\s+to|skip\s+to|step)\s+(?:step\s+)?(\d+)/i);
  if (jumpMatch) {
    return { action: 'JUMP_TO_STEP', payload: { stepIndex: parseInt(jumpMatch[1], 10) }, rawTranscript: text };
  }

  if (/\b(?:double|twice)\s+(?:the\s+)?(?:recipe|servings)?\b/i.test(clean)) {
    return { action: 'SCALE_RECIPE', payload: { scaleFactor: 2.0 }, rawTranscript: text };
  }
  if (/\b(?:half|halve)\s+(?:the\s+)?(?:recipe|servings)?\b/i.test(clean)) {
    return { action: 'SCALE_RECIPE', payload: { scaleFactor: 0.5 }, rawTranscript: text };
  }
  if (/\btriple\s+(?:the\s+)?(?:recipe|servings)?\b/i.test(clean)) {
    return { action: 'SCALE_RECIPE', payload: { scaleFactor: 3.0 }, rawTranscript: text };
  }

  const scaleMatch = clean.match(/scale\s+(?:the\s+)?(?:recipe\s+)?to\s+(\d+(?:\.\d+)?)\s*(?:servings|people|portions|x)?/i);
  if (scaleMatch) {
    const val = parseFloat(scaleMatch[1]);
    const isMultiplier = clean.endsWith('x') || clean.includes('factor');
    return { action: 'SCALE_RECIPE', payload: isMultiplier ? { scaleFactor: val } : { targetServings: val }, rawTranscript: text };
  }

  if (/\b(?:list|read|what\s+are)\s+(?:the\s+)?ingredients\b/i.test(clean) || clean === 'ingredients') {
    return { action: 'LIST_INGREDIENTS', rawTranscript: text };
  }

  const queryMatch = clean.match(/(?:how\s+(?:much|many)|amount\s+of|quantity\s+of|check)\s+([a-z\s]+?)(?:\s+do\s+i\s+need|\s+left)?\??$/i);
  if (queryMatch) {
    return { action: 'QUERY_INGREDIENT', payload: { ingredientName: queryMatch[1].trim() }, rawTranscript: text };
  }

  const timerMatch = clean.match(/(?:set|start)(?:\s+a)?\s+timer\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|second|seconds|sec|secs)/i);
  if (timerMatch) {
    const amt = parseFloat(timerMatch[1]);
    const unit = timerMatch[2].toLowerCase();
    const secs = unit.startsWith('min') ? amt * 60 : amt;
    return { action: 'START_TIMER', payload: { timerSeconds: Math.round(secs), timerLabel: `${amt} ${unit} Timer` }, rawTranscript: text };
  }

  return { action: 'UNKNOWN', rawTranscript: text };
}

// --- Browser SpeechSynthesis Voice Engine ---
class SpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isSpeaking = false;
  }

  speak(text, onEnd) {
    if (!this.synth) {
      if (onEnd) onEnd();
      return;
    }
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick a natural English voice if available
    const voices = this.synth.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onstart = () => {
      this.isSpeaking = true;
      document.getElementById('speechStatusIndicator').style.display = 'inline-flex';
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      document.getElementById('speechStatusIndicator').style.display = 'none';
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      document.getElementById('speechStatusIndicator').style.display = 'none';
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.error('TTS error:', e);
      }
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }

  stop() {
    if (this.synth) {
      this.isSpeaking = false;
      document.getElementById('speechStatusIndicator').style.display = 'none';
      this.synth.cancel();
    }
  }
}

// --- Browser SpeechRecognition Listener ---
class VoiceRecognitionManager {
  constructor(onIntent) {
    this.onIntent = onIntent;
    this.recognition = null;
    this.isListening = false;
    this.shouldKeepListening = false;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0].transcript.trim();
          const displayEl = document.getElementById('liveTranscriptDisplay');

          if (item.isFinal) {
            displayEl.innerText = `Heard: "${transcript}"`;
            const intent = parseVoiceCommand(transcript);
            this.onIntent(intent);
          } else {
            displayEl.innerText = `Listening: "${transcript}..."`;
          }
        }
      };

      this.recognition.onend = () => {
        if (this.shouldKeepListening) {
          try { this.recognition.start(); } catch {}
        } else {
          this.isListening = false;
          this.updateUi();
        }
      };

      this.recognition.onerror = (err) => {
        console.warn('Speech recognition warning:', err.error);
        if (err.error === 'not-allowed') {
          this.shouldKeepListening = false;
          this.isListening = false;
          this.updateUi();
        }
      };
    }
  }

  toggle() {
    if (!this.recognition) {
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
    if (!this.recognition) return;
    this.shouldKeepListening = true;
    try {
      this.recognition.start();
      this.isListening = true;
      this.updateUi();
    } catch {}
  }

  stop() {
    this.shouldKeepListening = false;
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch {}
      this.isListening = false;
      this.updateUi();
    }
  }

  updateUi() {
    const micBtn = document.getElementById('btnToggleMic');
    const micStatus = document.getElementById('micStatusText');
    if (this.isListening) {
      micBtn.classList.add('active');
      micStatus.innerText = 'Listening Continuously';
      micStatus.style.color = 'var(--accent-secondary)';
    } else {
      micBtn.classList.remove('active');
      micStatus.innerText = 'Mic Inactive';
      micStatus.style.color = 'var(--text-muted)';
    }
  }
}

// --- App State & UI Bindings ---
class RecipeApp {
  constructor() {
    this.soundEffects = new WebAudioEffects();
    this.speech = new SpeechManager();
    this.voiceRecognition = new VoiceRecognitionManager((intent) => this.handleVoiceIntent(intent));

    // Core State Machine variables
    this.status = 'IDLE';
    this.recipe = null;
    this.currentStepIndex = -1;
    this.timers = [];
    this.history = [];

    // Real-time timer clock interval
    setInterval(() => this.tickTimers(1), 1000);

    this.bindEvents();
    this.loadSampleRecipe('cookies'); // Preload sample recipe for immediate offline readiness
  }

  bindEvents() {
    // Navigation buttons
    document.getElementById('btnNextStep').addEventListener('click', () => {
      this.soundEffects.playClick();
      this.next_step();
    });

    document.getElementById('btnPrevStep').addEventListener('click', () => {
      this.soundEffects.playClick();
      this.previous_step();
    });

    document.getElementById('btnRepeatStep').addEventListener('click', () => {
      this.soundEffects.playClick();
      this.repeat_step();
    });

    // Scaler controls
    document.getElementById('btnServingsPlus').addEventListener('click', () => {
      this.soundEffects.playClick();
      if (this.recipe) this.scale_recipe(this.recipe.currentServings + (this.recipe.originalServings <= 6 ? 1 : 2));
    });

    document.getElementById('btnServingsMinus').addEventListener('click', () => {
      this.soundEffects.playClick();
      if (this.recipe && this.recipe.currentServings > 1) {
        this.scale_recipe(Math.max(1, this.recipe.currentServings - (this.recipe.originalServings <= 6 ? 1 : 2)));
      }
    });

    document.querySelectorAll('.preset-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.soundEffects.playClick();
        const factor = parseFloat(e.target.dataset.scale);
        if (this.recipe) this.scale_recipe(factor, false);
      });
    });

    // Mic Toggle
    document.getElementById('btnToggleMic').addEventListener('click', () => {
      this.soundEffects.playClick();
      this.voiceRecognition.toggle();
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

    // Step Timer Cue
    document.getElementById('btnStartStepTimer').addEventListener('click', () => {
      this.soundEffects.playClick();
      this.startCurrentStepTimer();
    });

    // Quick Timer
    document.getElementById('btnAddQuickTimer').addEventListener('click', () => {
      this.soundEffects.playClick();
      this.addTimer(300, '5 Min Kitchen Timer');
    });
  }

  // --- Core State Machine Transitions ---
  loadRecipe(recipeData) {
    this.speech.stop();
    this.timers = [];
    this.recipe = JSON.parse(JSON.stringify(recipeData));
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
    this.currentStepIndex = targetIdx;
    this.status = 'READING_STEP';
    this.recordAudit(`Jumped to step ${stepNumber}.`);
    this.soundEffects.playChime();
    this.render();
    this.speakCurrentStep();
  }

  scale_recipe(target, isServings = true) {
    if (!this.recipe || target <= 0) return;

    let factor;
    let newServings;

    if (isServings) {
      newServings = target;
      factor = target / this.recipe.originalServings;
    } else {
      factor = target;
      newServings = Math.round(this.recipe.originalServings * factor * 10) / 10;
    }

    this.recipe.scaleFactor = Math.round(factor * 100) / 100;
    this.recipe.currentServings = newServings;

    // Rescale ingredients
    this.recipe.ingredients = this.recipe.ingredients.map(ing => {
      if (ing.quantity === null) return { ...ing };
      return {
        ...ing,
        quantity: Math.round(ing.quantity * factor * 100) / 100
      };
    });

    this.recordAudit(`Scaled recipe to ${newServings} servings (${this.recipe.scaleFactor}x).`);
    this.speech.speak(`Recipe scaled to ${newServings} servings.`);
    this.render();
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

    const textToSpeak = `Step ${step.id}. ${step.instruction}`;
    this.speech.speak(textToSpeak, () => {
      this.status = 'AWAITING_INPUT';
      document.getElementById('stateStatusBadge').innerText = 'AWAITING_INPUT';
    });
  }

  startCurrentStepTimer() {
    if (!this.recipe || this.currentStepIndex < 0) return;
    const step = this.recipe.steps[this.currentStepIndex];
    if (step && step.timerSeconds) {
      this.addTimer(step.timerSeconds, `Step ${step.id} Timer`);
    }
  }

  addTimer(durationSeconds, label = 'Timer') {
    const timer = {
      id: `timer-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      label,
      durationSeconds,
      remainingSeconds: durationSeconds,
      isPaused: false
    };
    this.timers.push(timer);
    this.recordAudit(`Started timer: ${label} (${Math.round(durationSeconds / 60)} min).`);
    this.speech.speak(`Timer set for ${Math.round(durationSeconds / 60)} minutes.`);
    this.renderTimers();
  }

  tickTimers(deltaSec = 1) {
    if (this.timers.length === 0) return;

    const expired = [];
    this.timers.forEach(t => {
      if (!t.isPaused) {
        t.remainingSeconds = Math.max(0, t.remainingSeconds - deltaSec);
        if (t.remainingSeconds === 0) expired.push(t);
      }
    });

    if (expired.length > 0) {
      this.timers = this.timers.filter(t => t.remainingSeconds > 0);
      expired.forEach(t => {
        this.soundEffects.playAlarm();
        this.recordAudit(`🔔 Timer Expired: ${t.label}!`);
        this.speech.speak(`Your timer for ${t.label} is done!`);
      });
    }

    this.renderTimers();
  }

  handleVoiceIntent(intent) {
    this.recordAudit(`Voice command: [${intent.action}] "${intent.rawTranscript}"`);

    switch (intent.action) {
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
      case 'SCALE_RECIPE':
        if (intent.payload?.scaleFactor) this.scale_recipe(intent.payload.scaleFactor, false);
        else if (intent.payload?.targetServings) this.scale_recipe(intent.payload.targetServings, true);
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
      case 'START_TIMER':
        if (intent.payload?.timerSeconds) {
          this.addTimer(intent.payload.timerSeconds, intent.payload.timerLabel || 'Kitchen Timer');
        }
        break;
      default:
        console.log('Unrecognized voice intent:', intent.rawTranscript);
    }
  }

  // --- Rendering UI Updates ---
  render() {
    if (!this.recipe) return;

    // Header & Meta
    document.getElementById('recipeTitleDisplay').innerText = this.recipe.title;
    document.getElementById('recipeDescDisplay').innerText = this.recipe.description || 'Hands-free cooking assistant ready.';
    document.getElementById('servingsDisplay').innerText = this.recipe.currentServings;
    document.getElementById('stateStatusBadge').innerText = this.status;

    // Update preset chips active state
    document.querySelectorAll('.preset-chip').forEach(btn => {
      const chipScale = parseFloat(btn.dataset.scale);
      btn.classList.toggle('active', Math.abs(chipScale - this.recipe.scaleFactor) < 0.05);
    });

    // Render Ingredients List
    const ingListEl = document.getElementById('ingredientsList');
    document.getElementById('ingredientCount').innerText = `${this.recipe.ingredients.length} items`;
    ingListEl.innerHTML = '';

    this.recipe.ingredients.forEach(ing => {
      const li = document.createElement('li');
      li.className = 'ingredient-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.addEventListener('change', () => li.classList.toggle('checked', checkbox.checked));

      const span = document.createElement('span');
      span.className = 'ingredient-text';

      const qtyStr = ing.quantity !== null ? formatQuantityFraction(ing.quantity) : '';
      const unitStr = ing.unit ? ` ${ing.unit}` : '';
      const notesStr = ing.notes ? ` (${ing.notes})` : '';

      span.innerHTML = `<span class="ingredient-qty">${qtyStr}${unitStr}</span> ${ing.name}${notesStr}`;

      li.appendChild(checkbox);
      li.appendChild(span);
      ingListEl.appendChild(li);
    });

    // Render Step Reader
    const stepCounterEl = document.getElementById('stepCounterDisplay');
    const instructionEl = document.getElementById('stepInstructionText');
    const progressBar = document.getElementById('stepProgressBar');
    const timerCueBox = document.getElementById('stepTimerCueBox');

    if (this.currentStepIndex === -1) {
      stepCounterEl.innerText = `Ready • ${this.recipe.steps.length} Steps Total`;
      instructionEl.innerText = `Click "Next Step" or say "Next" to begin Step 1.`;
      progressBar.style.width = '0%';
      timerCueBox.style.display = 'none';
      document.getElementById('btnNextStep').innerText = 'Start Recipe ➡';
    } else if (this.status === 'COMPLETED') {
      stepCounterEl.innerText = 'Completed! 🎉';
      instructionEl.innerHTML = `<div class="completed-banner"><h2>All Done! 👨‍🍳</h2><p>You have finished making ${this.recipe.title}. Enjoy!</p></div>`;
      progressBar.style.width = '100%';
      timerCueBox.style.display = 'none';
      document.getElementById('btnNextStep').innerText = 'Restart 🔄';
    } else {
      const step = this.recipe.steps[this.currentStepIndex];
      stepCounterEl.innerText = `Step ${step.id} of ${this.recipe.steps.length}`;
      instructionEl.innerText = step.instruction;

      const pct = Math.round(((this.currentStepIndex + 1) / this.recipe.steps.length) * 100);
      progressBar.style.width = `${pct}%`;

      if (step.timerSeconds) {
        timerCueBox.style.display = 'inline-flex';
        const mins = Math.floor(step.timerSeconds / 60);
        const secs = step.timerSeconds % 60;
        document.getElementById('stepTimerCueText').innerText = `Step Timer Detected (${mins}:${secs.toString().padStart(2, '0')})`;
      } else {
        timerCueBox.style.display = 'none';
      }

      document.getElementById('btnNextStep').innerText =
        this.currentStepIndex === this.recipe.steps.length - 1 ? 'Finish Recipe 🏆' : 'Next Step ➡';
    }
  }

  renderTimers() {
    const container = document.getElementById('timersContainer');
    if (this.timers.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem 0;">No active timers.</div>`;
      return;
    }

    container.innerHTML = '';
    this.timers.forEach(t => {
      const mins = Math.floor(t.remainingSeconds / 60);
      const secs = Math.floor(t.remainingSeconds % 60);
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      const div = document.createElement('div');
      div.className = 'timer-item';
      div.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 0.88rem;">${t.label}</div>
          <div class="timer-time">${timeStr}</div>
        </div>
        <div style="display: flex; gap: 0.35rem;">
          <button class="btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;" data-action="toggle" data-id="${t.id}">
            ${t.isPaused ? '▶' : '⏸'}
          </button>
          <button class="btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem; color: var(--accent-danger);" data-action="cancel" data-id="${t.id}">
            ✕
          </button>
        </div>
      `;

      div.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        t.isPaused = !t.isPaused;
        this.renderTimers();
      });

      div.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        this.timers = this.timers.filter(timer => timer.id !== t.id);
        this.renderTimers();
      });

      container.appendChild(div);
    });
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

  async fetchRecipeFromUrl(url) {
    try {
      this.recordAudit(`Fetching recipe from URL: ${url}`);
      const res = await fetch('/api/parse-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success && data.recipe) {
        this.loadRecipe(data.recipe);
      } else {
        alert(data.error || 'Failed to extract recipe from URL.');
      }
    } catch (e) {
      console.error(e);
      alert('Could not connect to recipe extraction server. Ensure `npm start` is running.');
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
          { id: 2, instruction: 'Whisk together flour, baking soda, and salt in a bowl. Set aside.', timerSeconds: 30 },
          { id: 3, instruction: 'Beat softened butter, granulated sugar, and brown sugar until creamy, about 2 minutes.', timerSeconds: 120 },
          { id: 4, instruction: 'Add eggs one at a time, beating well, then fold in flour mixture and chocolate chips.' },
          { id: 5, instruction: 'Drop rounded tablespoons of dough onto baking sheets 2 inches apart.' },
          { id: 6, instruction: 'Bake for 9 to 11 minutes until golden brown around edges but soft in center.', timerSeconds: 600 },
          { id: 7, instruction: 'Cool on baking sheets for 2 minutes, then transfer to wire racks.', timerSeconds: 120 }
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
          { id: 'ing-1', raw: '1.5 lbs chicken breasts', name: 'boneless chicken breasts', quantity: 1.5, unit: 'lbs' },
          { id: 'ing-2', raw: '2 tbsp olive oil', name: 'olive oil', quantity: 2, unit: 'tbsp' },
          { id: 'ing-3', raw: '1 cup heavy cream', name: 'heavy cream', quantity: 1, unit: 'cup' },
          { id: 'ing-4', raw: '4 cloves garlic', name: 'garlic', quantity: 4, unit: 'cloves', notes: 'minced' },
          { id: 'ing-5', raw: '2 cups baby spinach', name: 'fresh baby spinach', quantity: 2, unit: 'cups' },
          { id: 'ing-6', raw: '1/2 cup Parmesan cheese', name: 'grated Parmesan cheese', quantity: 0.5, unit: 'cup' }
        ],
        steps: [
          { id: 1, instruction: 'Season chicken breasts evenly with Italian seasoning, salt, and pepper.' },
          { id: 2, instruction: 'Heat olive oil in a skillet. Sear chicken for 5 minutes per side until golden brown (165°F).', timerSeconds: 300 },
          { id: 3, instruction: 'Sauté minced garlic in skillet for 1 minute until fragrant.', timerSeconds: 60 },
          { id: 4, instruction: 'Pour in heavy cream and broth, simmer for 3 minutes.', timerSeconds: 180 },
          { id: 5, instruction: 'Stir in fresh baby spinach for 2 minutes until wilted, return chicken to pan, and serve.', timerSeconds: 120 }
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
          { id: 2, instruction: 'Whisk buttermilk, eggs, and melted butter. Fold wet ingredients into dry and rest for 5 minutes.', timerSeconds: 300 },
          { id: 3, instruction: 'Pour 1/4 cup batter per pancake onto medium heat skillet. Cook for 3 minutes until bubbles form.', timerSeconds: 180 },
          { id: 4, instruction: 'Flip and cook another 2 minutes until golden brown. Serve hot with maple syrup.', timerSeconds: 120 }
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

// Initialize Application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new RecipeApp();
});
