import type { Note, Track, WaveformType } from './types';

export class Synthesizer {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNotes: Map<string, { oscillators: OscillatorNode[]; gain: GainNode }> = new Map();
  private tracks: Track[] = [];

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

  setTracks(tracks: Track[]): void {
    this.tracks = tracks;
  }

  private hasSoloTrack(): boolean {
    return this.tracks.some(t => t.solo);
  }

  private isTrackPlayable(trackId: number): boolean {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return false;
    
    if (this.hasSoloTrack()) {
      return track.solo && !track.muted;
    }
    return !track.muted;
  }

  pitchToFrequency(pitch: number): number {
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  noteOn(noteId: string, pitch: number, velocity: number = 100, trackId: number = 0): void {
    if (!this.audioContext || !this.masterGain) return;

    if (!this.isTrackPlayable(trackId)) return;

    const track = this.tracks.find(t => t.id === trackId);
    const waveform: WaveformType = track?.waveform || 'sawtooth';
    const trackVolume = track?.volume ?? 0.8;

    const freq = this.pitchToFrequency(pitch);
    const gainValue = (velocity / 127) * 0.5 * trackVolume;

    const osc1 = this.audioContext.createOscillator();
    osc1.type = waveform;
    osc1.frequency.value = freq;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(gainValue, this.audioContext.currentTime + 0.01);

    osc1.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc1.start();

    this.activeNotes.set(noteId, { oscillators: [osc1], gain: gainNode });
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

  playNote(pitch: number, duration: number = 0.5, velocity: number = 100, trackId: number = 0): void {
    this.ensureContext();
    const noteId = `preview_${Date.now()}_${Math.random()}`;
    this.noteOn(noteId, pitch, velocity, trackId);
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
