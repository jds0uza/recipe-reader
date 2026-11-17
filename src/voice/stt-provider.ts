/**
 * Speech Recognition (STT) Provider
 * Uses browser Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 * with noise resilience, continuous mode, and graceful fallbacks.
 */

export interface STTResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export interface STTCallbacks {
  onResult: (result: STTResult) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

export interface STTProvider {
  start(callbacks: STTCallbacks): void;
  stop(): void;
  isListening(): boolean;
  isSupported(): boolean;
}

export class BrowserSpeechRecognitionSTT implements STTProvider {
  private recognition: any = null;
  private _isListening: boolean = false;
  private shouldAutoRestart: boolean = false;
  private callbacks: STTCallbacks | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        this.recognition = new SpeechRec();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
      }
    }
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  start(callbacks: STTCallbacks): void {
    if (!this.recognition) {
      console.warn('SpeechRecognition is not supported in this browser environment.');
      return;
    }

    if (this._isListening) {
      this.stop();
    }

    this.callbacks = callbacks;
    this.shouldAutoRestart = true;

    this.recognition.onstart = () => {
      this._isListening = true;
      this.callbacks?.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const transcript = item[0].transcript.trim();
        const isFinal = item.isFinal;
        const confidence = item[0].confidence || 0.9;

        this.callbacks?.onResult({
          transcript,
          isFinal,
          confidence
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      // Don't auto-restart on 'not-allowed' or 'service-not-allowed'
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.shouldAutoRestart = false;
      }
      this.callbacks?.onError?.(event);
    };

    this.recognition.onend = () => {
      this._isListening = false;
      this.callbacks?.onEnd?.();

      // Gracefully restart for hands-free kitchen voice mode
      if (this.shouldAutoRestart) {
        try {
          this.recognition.start();
        } catch {
          // Ignore if unable to restart immediately
        }
      }
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.error('Failed to start SpeechRecognition:', e);
    }
  }

  stop(): void {
    this.shouldAutoRestart = false;
    if (this.recognition && this._isListening) {
      this._isListening = false;
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  isListening(): boolean {
    return this._isListening;
  }
}
