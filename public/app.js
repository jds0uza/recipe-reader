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
  playClick() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
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

  // Stop / Pause / Silence (Top priority to interrupt assistant speech)
  // Matches any utterance containing stop, pause, quiet, silence, halt, etc.
  if (/\b(stop|pause|halt|be\s+quiet|quiet|shut\s+up|silence|cancel|stop\s+talking|mute|stfu)\b/i.test(clean)) {
    return { action: 'STOP', rawTranscript: text };
  }

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

  if (/\b(?:list|read|what\s+are)\s+(?:the\s+)?ingredients\b/i.test(clean) || clean === 'ingredients') {
    return { action: 'LIST_INGREDIENTS', rawTranscript: text };
  }

  const queryMatch = clean.match(/(?:how\s+(?:much|many)|amount\s+of|quantity\s+of|check)\s+([a-z\s]+?)(?:\s+do\s+i\s+need|\s+left)?\??$/i);
  if (queryMatch) {
    return { action: 'QUERY_INGREDIENT', payload: { ingredientName: queryMatch[1].trim() }, rawTranscript: text };
  }

  return { action: 'UNKNOWN', rawTranscript: text };
}

// --- Browser SpeechSynthesis Voice Engine ---
class SpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isSpeaking = false;
    this.echoDecayUntil = 0;
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
      this.echoDecayUntil = Date.now() + 650; // 650ms speaker echo cancellation cooldown
      document.getElementById('speechStatusIndicator').style.display = 'none';
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.echoDecayUntil = Date.now() + 200;
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
      this.echoDecayUntil = Date.now() + 200;
      const indicator = document.getElementById('speechStatusIndicator');
      if (indicator) indicator.style.display = 'none';
      try {
        this.synth.pause(); // Flushes Chromium audio buffer queue immediately
      } catch {}
      this.synth.cancel();
    }
  }
}

// --- Browser SpeechRecognition Listener with Echo Cancellation ---
class VoiceRecognitionManager {
  constructor(speechManager, onIntent) {
    this.speechManager = speechManager;
    this.onIntent = onIntent;
    this.recognition = null;
    this.isListening = false;
    this.shouldKeepListening = false;
    this.restartTimeout = null;
    this.lastActionTime = 0;
    this.lastActionType = null;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.updateUi();
        const displayEl = document.getElementById('liveTranscriptDisplay');
        if (displayEl) {
          displayEl.innerText = 'Listening… Say “Next,” “Repeat,” or “Stop.”';
        }
      };

      this.recognition.onresult = (event) => {
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
            displayEl.innerText = `Heard “${transcript}” — stopping now.`;
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

      this.recognition.onend = () => {
        if (this.shouldKeepListening) {
          clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.shouldKeepListening) {
              try { this.recognition.start(); } catch {}
            }
          }, 200);
        } else {
          this.isListening = false;
          this.updateUi();
        }
      };

      this.recognition.onerror = (err) => {
        console.warn('Speech recognition error event:', err.error);
        const micStatus = document.getElementById('micStatusText');
        const displayEl = document.getElementById('liveTranscriptDisplay');

        if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
          this.shouldKeepListening = false;
          this.isListening = false;
          this.updateUi();
          if (micStatus) {
            micStatus.innerText = 'Permission Blocked';
            micStatus.style.color = 'var(--accent-danger)';
          }
          if (displayEl) {
            if (window.location.protocol === 'file:') {
              displayEl.innerHTML = '<strong>Speech is disabled on file://</strong><br/>Run <code>npm start</code> and open <a href="http://localhost:3000" style="color:var(--accent-primary)">http://localhost:3000</a>';
            } else {
              displayEl.innerHTML = '<strong>Microphone blocked.</strong> Open the site permissions beside the address bar, set Microphone to <strong>Allow</strong>, and reload.';
            }
          }
        } else if (err.error === 'audio-capture') {
          this.shouldKeepListening = false;
          this.isListening = false;
          this.updateUi();
          if (displayEl) displayEl.innerText = 'No microphone input was detected on this device.';
        } else if (err.error === 'network') {
          if (displayEl) displayEl.innerText = 'Speech network error. Retrying…';
        }
      };
    } else {
      setTimeout(() => {
        const micStatus = document.getElementById('micStatusText');
        const displayEl = document.getElementById('liveTranscriptDisplay');
        if (micStatus) {
          micStatus.innerText = 'Browser Not Supported';
          micStatus.style.color = 'var(--accent-danger)';
        }
        if (displayEl) {
          displayEl.innerHTML = '<strong>Voice recognition is not supported in this browser.</strong><br/>Please use Google Chrome, Safari, or Microsoft Edge.';
        }
      }, 100);
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

  async start() {
    const displayEl = document.getElementById('liveTranscriptDisplay');
    const micStatus = document.getElementById('micStatusText');

    // 1. Check browser engine support
    if (!this.recognition) {
      const msg = 'Speech recognition is not supported in this browser (e.g. Firefox). Please use Google Chrome, Safari, or Microsoft Edge.';
      if (displayEl) displayEl.innerText = msg;
      alert(msg);
      return;
    }

    // 2. Check if on file:// protocol
    if (window.location.protocol === 'file:') {
      if (displayEl) {
        displayEl.innerHTML = '<strong>Microphone blocked on file://</strong><br/>Please open <strong><a href="http://localhost:3000" style="color:var(--accent-primary)">http://localhost:3000</a></strong>.';
      }
      alert('Microphone speech recognition is blocked by browser security on file:// URLs.\n\nPlease open http://localhost:3000 in Chrome or Safari.');
      return;
    }

    // 3. Inspect existing permission status if query API is available
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'microphone' });
        if (perm.state === 'denied') {
          if (micStatus) {
            micStatus.innerText = 'Permission Blocked';
            micStatus.style.color = 'var(--accent-danger)';
          }
          if (displayEl) {
            displayEl.innerHTML = '<strong>Microphone blocked in browser.</strong><br/>Open the site permissions beside the address bar, change Microphone from “Block” to “Allow,” then refresh.';
          }
          alert('Microphone access is currently Blocked for localhost.\n\nTo fix:\n1. Click the icon directly to the left of "localhost:3000" in the address bar.\n2. Toggle Microphone to "Allow".\n3. Refresh the page.');
          return;
        }
      } catch (e) {
        // Permissions query not supported or failed, proceed to start()
      }
    }

    // 4. Start SpeechRecognition directly (this natively invokes the browser prompt)
    this.shouldKeepListening = true;
    try {
      this.recognition.start();
      this.isListening = true;
      this.updateUi();
      if (displayEl) displayEl.innerText = 'Requesting mic access...';
    } catch (e) {
      console.warn('SpeechRecognition start error:', e);
      if (e.name === 'InvalidStateError') {
        // Already started
        this.isListening = true;
        this.updateUi();
      } else {
        if (displayEl) displayEl.innerText = `Recognition failed: ${e.message || e.name}`;
      }
    }
  }

  stop() {
    this.shouldKeepListening = false;
    clearTimeout(this.restartTimeout);
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch {}
      this.isListening = false;
      this.updateUi();
    }
  }

  updateUi() {
    const micBtn = document.getElementById('btnToggleMic');
    const micStatus = document.getElementById('micStatusText');
    const micHint = document.getElementById('micHintText');

    if (this.isListening) {
      micBtn.classList.add('active');
      micStatus.classList.add('is-active');
      micStatus.innerText = 'Listening';
      if (micHint) micHint.innerText = 'Pause microphone';
    } else {
      micBtn.classList.remove('active');
      micStatus.classList.remove('is-active');
      micStatus.innerText = 'Mic off';
      if (micHint) micHint.innerText = 'Turn on microphone';
    }
  }
}

// --- App State & UI Bindings ---
class RecipeApp {
  constructor() {
    this.soundEffects = new WebAudioEffects();
    this.speech = new SpeechManager();
    this.voiceRecognition = new VoiceRecognitionManager(this.speech, (intent) => this.handleVoiceIntent(intent));

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
    document.getElementById('btnNextStep').addEventListener('click', () => {
      this.soundEffects.playClick();
      // Auto-engage voice mode on first user interaction if not listening yet
      if (!this.voiceRecognition.isListening && window.location.protocol !== 'file:') {
        this.voiceRecognition.start();
      }
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

    const stopBtn = document.getElementById('btnStopSpeech');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.soundEffects.playClick();
        this.handleVoiceIntent({ action: 'STOP', rawTranscript: 'Manual Stop Button' });
      });
    }

    // Mic Toggle (Button & Subtitle Hint)
    const toggleMic = () => {
      this.soundEffects.playClick();
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
        diagBox.innerHTML += `• Protocol: <code>${window.location.protocol}//</code> ${isFile ? '<strong style="color:var(--accent-danger)">Blocked on file:// (run npm start and open http://localhost:3000)</strong>' : '<strong style="color:var(--accent-secondary)">Valid web origin</strong>'}<br/>`;

        // 2. Web Speech Recognition API check
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        diagBox.innerHTML += `• Speech engine: ${SpeechRec ? '<strong style="color:var(--accent-secondary)">SpeechRecognition available</strong>' : '<strong style="color:var(--accent-danger)">Missing or unsupported</strong>'}<br/>`;

        // 3. MediaDevices API
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          diagBox.innerHTML += `• Audio devices API: <strong style="color:var(--accent-danger)">navigator.mediaDevices is unavailable</strong><br/>`;
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
          diagBox.innerHTML += `• Audio device: <strong style="color:var(--accent-secondary)">${track ? track.label || 'Default microphone' : 'Active'}</strong><br/>`;
          track.stop();
          diagBox.innerHTML += `<strong style="color:var(--accent-secondary)">Permission granted. Starting voice recognition…</strong><br/>`;
          this.voiceRecognition.start();
        } catch (err) {
          console.error('Diagnostic mic error:', err);
          diagBox.innerHTML += `• Browser Result: <strong style="color:var(--accent-danger)">${err.name}</strong> - ${err.message}<br/>`;

          if (err.name === 'NotAllowedError') {
            diagBox.innerHTML += `<br/><strong>How to unblock:</strong><br/>1. Open the site permissions beside <strong>localhost:3000</strong>.<br/>2. Switch <strong>Microphone</strong> from <em>Block</em> to <strong>Allow</strong>.<br/>3. Refresh the page.`;
          } else if (err.name === 'NotFoundError') {
            diagBox.innerHTML += `<br/><strong>How to fix:</strong> No microphone input device was detected. Plug in a microphone or select one in your system settings.`;
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

  // --- Core State Machine Transitions ---
  loadRecipe(recipeData) {
    this.speech.stop();
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

  handleVoiceIntent(intent) {
    this.recordAudit(`Voice command: [${intent.action}] "${intent.rawTranscript}"`);

    switch (intent.action) {
      case 'STOP':
        this.speech.stop();
        this.status = 'AWAITING_INPUT';
        document.getElementById('stateStatusBadge').innerText = 'AWAITING_INPUT';
        this.recordAudit(`Stopped speaking (voice: "${intent.rawTranscript}")`);
        const liveEl = document.getElementById('liveTranscriptDisplay');
        if (liveEl) liveEl.innerText = 'Stopped. Ready for your next command.';
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

  // --- Rendering UI Updates ---
  render() {
    if (!this.recipe) return;

    // Header & Meta
    document.getElementById('recipeTitleDisplay').innerText = this.recipe.title;
    document.getElementById('recipeDescDisplay').innerText = this.recipe.description || 'Hands-free cooking assistant ready.';
    document.getElementById('servingsDisplay').innerText = `${this.recipe.currentServings} Servings`;
    document.getElementById('stateStatusBadge').innerText = this.status;

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

    if (this.currentStepIndex === -1) {
      stepCounterEl.innerText = `Ready • ${this.recipe.steps.length} Steps Total`;
      instructionEl.innerText = `Click "Next Step" or say "Next" to begin Step 1.`;
      progressBar.style.width = '0%';
      document.getElementById('btnNextStep').innerHTML = '<span>Start recipe</span><svg><use href="#icon-forward"></use></svg>';
    } else if (this.status === 'COMPLETED') {
      stepCounterEl.innerText = 'Recipe complete';
      instructionEl.innerHTML = `<div class="completed-banner"><h2>All done.</h2><p>You have finished making ${this.recipe.title}. Enjoy your meal.</p></div>`;
      progressBar.style.width = '100%';
      document.getElementById('btnNextStep').innerHTML = '<span>Cook again</span><svg><use href="#icon-repeat"></use></svg>';
    } else {
      const step = this.recipe.steps[this.currentStepIndex];
      stepCounterEl.innerText = `Step ${step.id} of ${this.recipe.steps.length}`;
      instructionEl.innerText = step.instruction;

      const pct = Math.round(((this.currentStepIndex + 1) / this.recipe.steps.length) * 100);
      progressBar.style.width = `${pct}%`;

      document.getElementById('btnNextStep').innerHTML = this.currentStepIndex === this.recipe.steps.length - 1
        ? '<span>Finish recipe</span><svg><use href="#icon-forward"></use></svg>'
        : '<span>Next step</span><svg><use href="#icon-forward"></use></svg>';
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
          { id: 'ing-1', raw: '1.5 lbs chicken breasts', name: 'boneless chicken breasts', quantity: 1.5, unit: 'lbs' },
          { id: 'ing-2', raw: '2 tbsp olive oil', name: 'olive oil', quantity: 2, unit: 'tbsp' },
          { id: 'ing-3', raw: '1 cup heavy cream', name: 'heavy cream', quantity: 1, unit: 'cup' },
          { id: 'ing-4', raw: '4 cloves garlic', name: 'garlic', quantity: 4, unit: 'cloves', notes: 'minced' },
          { id: 'ing-5', raw: '2 cups baby spinach', name: 'fresh baby spinach', quantity: 2, unit: 'cups' },
          { id: 'ing-6', raw: '1/2 cup Parmesan cheese', name: 'grated Parmesan cheese', quantity: 0.5, unit: 'cup' }
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
      } else {
        wakeLockBtn.style.display = 'none'; // Unsupported browser
      }
    }
  }

  async toggleWakeLock(btn) {
    try {
      if (!this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        btn.innerHTML = '<svg><use href="#icon-eye"></use></svg><span>Screen stays awake</span>';
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
        btn.classList.add('active');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
          btn.innerHTML = '<svg><use href="#icon-eye"></use></svg><span>Keep screen awake</span>';
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-secondary');
          btn.classList.remove('active');
        });
      } else {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch (err) {
      console.warn('Wake Lock error:', err);
    }
  }
}

// Initialize Application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new RecipeApp();
  window.screenManager = new ScreenWakeLockManager();
});
