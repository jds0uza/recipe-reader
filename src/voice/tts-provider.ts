/**
 * Speech Synthesis (TTS) Abstractions
 * Designed with a swappable provider interface so you can start with browser window.speechSynthesis
 * and seamlessly plug in the ElevenLabs streaming voice API.
 */

export interface TTSVoice {
  id: string;
  name: string;
  lang: string;
  provider: 'browser' | 'elevenlabs';
}

export interface TTSOptions {
  voiceId?: string;
  rate?: number;    // 0.5 to 2.0
  pitch?: number;   // 0.5 to 2.0
  volume?: number;  // 0.0 to 1.0
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

export interface TTSProvider {
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  isSpeaking(): boolean;
  getVoices(): Promise<TTSVoice[]>;
}

/**
 * Browser Built-in window.speechSynthesis Provider
 * Completely offline, zero external dependencies.
 */
export class BrowserSpeechSynthesisTTS implements TTSProvider {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private _isSpeaking: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }
  }

  async getVoices(): Promise<TTSVoice[]> {
    if (!this.synth) return [];

    let voices = this.synth.getVoices();
    if (voices.length === 0) {
      await new Promise<void>((resolve) => {
        if (!this.synth) return resolve();
        this.synth.onvoiceschanged = () => resolve();
        setTimeout(resolve, 300); // Timeout fallback
      });
      voices = this.synth.getVoices();
    }

    return voices.map((v, i) => ({
      id: v.voiceURI || `voice-${i}`,
      name: v.name,
      lang: v.lang,
      provider: 'browser' as const
    }));
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.synth) {
      console.warn('SpeechSynthesis not available in this environment');
      options.onEnd?.();
      return;
    }

    this.stop(); // Stop any pending speech

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;
      this._isSpeaking = true;

      if (options.rate) utterance.rate = options.rate;
      if (options.pitch) utterance.pitch = options.pitch;
      if (options.volume !== undefined) utterance.volume = options.volume;

      // Select voice if requested
      if (options.voiceId) {
        const voices = this.synth!.getVoices();
        const found = voices.find(v => v.voiceURI === options.voiceId || v.name === options.voiceId);
        if (found) utterance.voice = found;
      }

      utterance.onstart = () => {
        this._isSpeaking = true;
        options.onStart?.();
      };

      utterance.onend = () => {
        this._isSpeaking = false;
        this.currentUtterance = null;
        options.onEnd?.();
        resolve();
      };

      utterance.onerror = (event) => {
        this._isSpeaking = false;
        this.currentUtterance = null;
        // Ignore synthetic cancels
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          console.error('TTS error:', event);
          options.onError?.(event);
        }
        resolve();
      };

      this.synth!.speak(utterance);
    });
  }

  stop(): void {
    if (this.synth) {
      this._isSpeaking = false;
      this.currentUtterance = null;
      this.synth.cancel();
    }
  }

  pause(): void {
    if (this.synth && this.synth.speaking) {
      this.synth.pause();
    }
  }

  resume(): void {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
    }
  }

  isSpeaking(): boolean {
    return this._isSpeaking || (this.synth ? this.synth.speaking : false);
  }
}

/**
 * ElevenLabs TTS Adapter
 * Ready-to-go client architecture for ElevenLabs REST / Streaming WebSockets.
 * Plug in your ELEVENLABS_API_KEY when ready to activate ultra-realistic studio voices.
 */
export class ElevenLabsTTSAdapter implements TTSProvider {
  private apiKey: string;
  private voiceId: string;
  private modelId: string;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private _isSpeaking: boolean = false;

  constructor(config: { apiKey?: string; voiceId?: string; modelId?: string } = {}) {
    this.apiKey = config.apiKey || '';
    // Default to 'Rachel' - ElevenLabs conversational voice
    this.voiceId = config.voiceId || '21m00Tcm4TlvDq8ikWAM';
    this.modelId = config.modelId || 'eleven_turbo_v2_5';
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async getVoices(): Promise<TTSVoice[]> {
    if (!this.apiKey) {
      return [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (ElevenLabs Calm/Friendly)', lang: 'en', provider: 'elevenlabs' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (ElevenLabs Strong/Engaging)', lang: 'en', provider: 'elevenlabs' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (ElevenLabs Expressive)', lang: 'en', provider: 'elevenlabs' }
      ];
    }

    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.apiKey }
      });
      const data = await res.json();
      return (data.voices || []).map((v: any) => ({
        id: v.voice_id,
        name: `${v.name} (${v.category || 'ElevenLabs'})`,
        lang: 'en',
        provider: 'elevenlabs' as const
      }));
    } catch {
      return [];
    }
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.apiKey) {
      console.warn('ElevenLabs API key not set. Please set an API key or use BrowserSpeechSynthesisTTS.');
      options.onEnd?.();
      return;
    }

    this.stop();

    try {
      options.onStart?.();
      this._isSpeaking = true;

      const voice = options.voiceId || this.voiceId;
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!res.ok) {
        throw new Error(`ElevenLabs API HTTP ${res.status}: ${res.statusText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx();
      }

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      this.currentSource = source;

      return new Promise((resolve) => {
        source.onended = () => {
          this._isSpeaking = false;
          this.currentSource = null;
          options.onEnd?.();
          resolve();
        };
        source.start(0);
      });
    } catch (err) {
      this._isSpeaking = false;
      console.error('ElevenLabs playback error:', err);
      options.onError?.(err);
    }
  }

  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {}
      this.currentSource = null;
    }
    this._isSpeaking = false;
  }

  pause(): void {
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend();
    }
  }

  resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }
}
