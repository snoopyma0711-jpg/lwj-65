import type { Note } from './types';

export class Synthesizer {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNotes: Map<string, { oscillators: OscillatorNode[]; gain: GainNode }> = new Map();

  async init(): Promise<void> {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.audioContext.destination);
  }

  async ensureContext(): Promise<void> {
    if (!this.audioContext) {
      await this.init();
    }
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  pitchToFrequency(pitch: number): number {
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  noteOn(noteId: string, pitch: number, velocity: number = 100): void {
    if (!this.audioContext || !this.masterGain) return;

    const freq = this.pitchToFrequency(pitch);
    const gainValue = (velocity / 127) * 0.5;

    const osc1 = this.audioContext.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;

    const osc2 = this.audioContext.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = freq * 2;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(gainValue, this.audioContext.currentTime + 0.01);

    const osc2Gain = this.audioContext.createGain();
    osc2Gain.gain.value = 0.3;

    osc1.connect(gainNode);
    osc2.connect(osc2Gain);
    osc2Gain.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc1.start();
    osc2.start();

    this.activeNotes.set(noteId, { oscillators: [osc1, osc2], gain: gainNode });
  }

  noteOff(noteId: string): void {
    const note = this.activeNotes.get(noteId);
    if (!note || !this.audioContext) return;

    const releaseTime = 0.1;
    note.gain.gain.cancelScheduledValues(this.audioContext.currentTime);
    note.gain.gain.setValueAtTime(note.gain.gain.value, this.audioContext.currentTime);
    note.gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + releaseTime);

    for (const osc of note.oscillators) {
      osc.stop(this.audioContext.currentTime + releaseTime + 0.05);
    }
    this.activeNotes.delete(noteId);
  }

  playNote(pitch: number, duration: number = 0.5, velocity: number = 100): void {
    this.ensureContext();
    const noteId = `preview_${Date.now()}_${Math.random()}`;
    this.noteOn(noteId, pitch, velocity);
    setTimeout(() => this.noteOff(noteId), duration * 1000);
  }

  stopAll(): void {
    for (const noteId of this.activeNotes.keys()) {
      this.noteOff(noteId);
    }
  }

  getCurrentTime(): number {
    return this.audioContext?.currentTime || 0;
  }

  getContext(): AudioContext | null {
    return this.audioContext;
  }
}

export const synth = new Synthesizer();
