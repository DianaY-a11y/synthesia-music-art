import { AudioParams } from "../types";

// Helper to convert MIDI note to Frequency
const mtof = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

// Scales (Relative to root)
const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 3, 5, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  wholetone: [0, 2, 4, 6, 8, 10],
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private params: AudioParams | null = null;
  private scaleNotes: number[] = [];

  public init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // Lower gain to accommodate polyphony
      
      this.reverbNode = this.ctx.createConvolver();
      this.generateReverbImpulse();
      
      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.ctx.destination);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private generateReverbImpulse() {
    if (!this.ctx || !this.reverbNode) return;
    const duration = 2.5;
    const decay = 2.0;
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
    }
    this.reverbNode.buffer = impulse;
  }

  public setParams(params: AudioParams) {
    this.params = params;
    // Pre-calculate the available notes across 3 octaves based on the scale
    const baseScale = SCALES[params.scale] || SCALES.major;
    const root = 48; // C3
    this.scaleNotes = [];
    
    // Generate 4 octaves of notes for wider range
    for (let octave = 0; octave < 4; octave++) {
      baseScale.forEach(interval => {
        this.scaleNotes.push(root + (octave * 12) + interval);
      });
    }
  }

  // New: Accepts RGB to modulate sound character
  public triggerGrain(yPosition: number, intensity: number, r: number, g: number, b: number) {
    if (!this.ctx || !this.params || !this.masterGain || this.scaleNotes.length === 0) return;

    // 1. PITCH LOGIC
    const noteIndex = Math.floor(yPosition * (this.scaleNotes.length - 1));
    let note = this.scaleNotes[noteIndex];

    // -- INSTRUMENT SPECIFIC LOGIC --
    const now = this.ctx.currentTime;
    let attack = 0.05;
    let release = 1.0;
    let oscType: OscillatorType = 'sine';
    let baseRoughness = this.params.roughness;
    let filterFreq = 0;

    // Determine Timbre based on temperature (default)
    const warmth = r - b; 
    if (warmth > 50) {
      oscType = 'sawtooth';
      baseRoughness += 0.2; 
    } else if (warmth < -50) {
      oscType = 'triangle';
      baseRoughness = Math.max(0, baseRoughness - 0.2); 
    } else {
      oscType = 'square';
    }

    // SPECIAL CASE: VIOLIN (Rebuilt for Realism)
    if (this.params.instrument === 'violin') {
        // PITCH FIX: Clamp to G3 (55) minimum to avoid "farting" low freqs
        if (note < 55) note += 12;
        if (note < 55) note = 55; // Hard floor

        // DYNAMICS: Longer sustain and slower attack for "Legato" feel
        attack = 0.8; // Slow swelling start
        release = 3.5; // Long, lingering tail

        // DUAL OSCILLATOR STRATEGY (Ensemble Effect)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';

        const freq = mtof(note);
        osc1.frequency.value = freq;
        osc2.frequency.value = freq;
        
        // Detune Osc 2 slightly for thickness
        osc2.detune.value = 8 + (Math.random() * 5); 

        // DYNAMIC FILTERING (The "Breathing" Fix)
        // Instead of a static filter, we move the filter cutoff.
        // As the note gets louder, the filter opens (brighter).
        // As the note fades, the filter closes (darker).
        filter.type = 'lowpass';
        filter.Q.value = 1.0; // Resonance
        
        // Start Muffled -> Swell to Bright -> Fade to Muffled
        filter.frequency.setValueAtTime(600, now); 
        filter.frequency.linearRampToValueAtTime(3000, now + attack); 
        filter.frequency.exponentialRampToValueAtTime(600, now + attack + release);

        // Vibrato
        const vibrato = this.ctx.createOscillator();
        vibrato.frequency.value = 5.0; // Slower, more emotional vibrato 
        const vibGain = this.ctx.createGain();
        vibGain.gain.value = 8;
        vibrato.connect(vibGain);
        vibGain.connect(osc1.frequency);
        vibGain.connect(osc2.frequency);
        vibrato.start(now);
        vibrato.stop(now + attack + release);

        // Connections
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(env);
        env.connect(this.masterGain);

        // Envelope
        const velocity = Math.min(intensity, 1.0) * 0.2; // Lower volume for 2 oscillators + polyphony
        
        env.gain.setValueAtTime(0, now);
        // Linear swell
        env.gain.linearRampToValueAtTime(velocity, now + attack);
        // Slow exponential fade out
        env.gain.exponentialRampToValueAtTime(0.001, now + attack + release);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + attack + release);
        osc2.stop(now + attack + release);
        
        return; // Exit early since we handled the graph manually
    }

    // STANDARD INSTRUMENTS
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    let filter: BiquadFilterNode | null = null;

    switch (this.params.instrument) {
      case 'pluck':
        attack = 0.01;
        release = 0.3; 
        break;
      case 'pad':
        attack = 1.0;
        release = 3.0; 
        break;
      case 'drone':
        attack = 2.0;
        release = 5.0; 
        break;
      case 'chime':
        note += 24;
        oscType = 'sine'; 
        attack = 0.01;
        release = 2.5;
        break;
      case 'bass':
        note -= 12; // Shift down only 1 octave, -24 was too low (rumble)
        if (note < 28) note = 28; // Clamp to E1 (41Hz)
        oscType = 'triangle'; 
        attack = 0.05;
        release = 0.4;
        break;
      case '8-bit':
        oscType = 'square';
        attack = 0.001;
        release = 0.1; 
        baseRoughness = 0; 
        break;
      case 'synth':
      default:
        attack = 0.05;
        release = 1.5; 
        break;
    }

    osc.type = oscType;
    osc.frequency.value = mtof(note);

    // Modulate release by reverb
    release = release * (0.8 + this.params.reverb);

    // Apply Roughness (Detune)
    if (baseRoughness > 0) {
      const detuneAmount = (Math.random() - 0.5) * 50 * baseRoughness;
      osc.detune.value = detuneAmount;
    }

    const velocity = Math.min(intensity, 1.0) * 0.4;

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(velocity, now + attack);
    env.gain.exponentialRampToValueAtTime(0.001, now + attack + release);

    osc.connect(env);
    env.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + attack + release);
  }

  public stop() {
    if (this.ctx) {
      this.ctx.suspend();
    }
  }
  
  public resume() {
     if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export const audioEngine = new AudioEngine();