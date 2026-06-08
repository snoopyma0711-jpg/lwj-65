import type { Note, Segment, ArrangementItem } from './types';
import { synth } from './synth';

export interface PlayerState {
  isPlaying: boolean;
  playheadTicks: number;
  startTime: number;
  startTicks: number;
  bpm: number;
  ticksPerBeat: number;
  activeNoteIds: Set<string>;
  scheduledEvents: Map<string, { noteOffId: number }>;
}

export class Player {
  private state: PlayerState = {
    isPlaying: false,
    playheadTicks: 0,
    startTime: 0,
    startTicks: 0,
    bpm: 120,
    ticksPerBeat: 480,
    activeNoteIds: new Set(),
    scheduledEvents: new Map(),
  };

  private notes: Note[] = [];
  private animationFrameId: number | null = null;
  private onPlayheadChange: ((ticks: number) => void) | null = null;
  private onStop: (() => void) | null = null;

  private segments: Segment[] = [];
  private arrangement: ArrangementItem[] = [];

  setNotes(notes: Note[]): void {
    this.notes = notes;
    if (this.state.isPlaying) {
      this.updateScheduledEvents();
    }
  }

  setSegments(segments: Segment[], arrangement: ArrangementItem[]): void {
    this.segments = segments;
    this.arrangement = arrangement;
  }

  setBpm(bpm: number): void {
    if (this.state.isPlaying) {
      const currentTime = synth.getCurrentTime();
      const elapsedTicks = this.state.playheadTicks - this.state.startTicks;
      this.state.startTime = currentTime;
      this.state.startTicks = this.state.playheadTicks;
    }
    this.state.bpm = bpm;
  }

  setOnPlayheadChange(callback: (ticks: number) => void): void {
    this.onPlayheadChange = callback;
  }

  setOnStop(callback: () => void): void {
    this.onStop = callback;
  }

  setPlayhead(ticks: number): void {
    this.state.playheadTicks = Math.max(0, ticks);
  }

  getPlayhead(): number {
    return this.state.playheadTicks;
  }

  isPlaying(): boolean {
    return this.state.isPlaying;
  }

  async play(): Promise<void> {
    if (this.state.isPlaying) return;

    this.state.isPlaying = true;

    try {
      await synth.ensureContext();
    } catch (e) {
      this.state.isPlaying = false;
      throw e;
    }

    this.state.startTime = synth.getCurrentTime();
    this.state.startTicks = this.state.playheadTicks;
    this.state.activeNoteIds.clear();

    this.scheduleEvents();
    this.animationLoop();
  }

  stop(): void {
    this.state.isPlaying = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    for (const noteId of this.state.activeNoteIds) {
      synth.noteOff(noteId);
    }
    this.state.activeNoteIds.clear();

    for (const { noteOffId } of this.state.scheduledEvents.values()) {
      clearTimeout(noteOffId);
    }
    this.state.scheduledEvents.clear();

    synth.stopAll();

    if (this.onStop) {
      this.onStop();
    }
  }

  private ticksToSeconds(ticks: number): number {
    const beats = ticks / this.state.ticksPerBeat;
    const seconds = (beats * 60) / this.state.bpm;
    return seconds;
  }

  private secondsToTicks(seconds: number): number {
    const beats = (seconds * this.state.bpm) / 60;
    return beats * this.state.ticksPerBeat;
  }

  private scheduleEvents(): void {
    const context = synth.getContext();
    if (!context) return;

    const currentAudioTime = context.currentTime;
    const scheduleAheadTime = 0.1;

    for (const note of this.notes) {
      const noteStartTicks = note.start;
      const noteEndTicks = note.start + note.duration;

      if (noteEndTicks <= this.state.playheadTicks) continue;

      const startOffsetTicks = Math.max(0, noteStartTicks - this.state.playheadTicks);
      const startOffsetSeconds = this.ticksToSeconds(startOffsetTicks);
      const scheduledStartTime = this.state.startTime + startOffsetSeconds;

      if (scheduledStartTime > currentAudioTime + scheduleAheadTime + 1) continue;

      const noteId = note.id;
      const alreadyActive = this.state.activeNoteIds.has(noteId);
      const alreadyScheduled = this.state.scheduledEvents.has(noteId);

      if (alreadyActive || alreadyScheduled) continue;

      if (noteStartTicks <= this.state.playheadTicks) {
        synth.noteOn(noteId, note.pitch, note.velocity, note.trackId);
        this.state.activeNoteIds.add(noteId);

        const remainingTicks = noteEndTicks - this.state.playheadTicks;
        const remainingSeconds = this.ticksToSeconds(remainingTicks);
        const noteOffId = window.setTimeout(() => {
          synth.noteOff(noteId);
          this.state.activeNoteIds.delete(noteId);
          this.state.scheduledEvents.delete(noteId);
        }, remainingSeconds * 1000);

        this.state.scheduledEvents.set(noteId, { noteOffId });
      } else {
        const delayMs = startOffsetSeconds * 1000;
        const durationTicks = note.duration;
        const durationSeconds = this.ticksToSeconds(durationTicks);

        const noteOnId = window.setTimeout(() => {
          synth.noteOn(noteId, note.pitch, note.velocity, note.trackId);
          this.state.activeNoteIds.add(noteId);

          const noteOffId = window.setTimeout(() => {
            synth.noteOff(noteId);
            this.state.activeNoteIds.delete(noteId);
            this.state.scheduledEvents.delete(noteId);
          }, durationSeconds * 1000);

          this.state.scheduledEvents.set(noteId, { noteOffId });
        }, delayMs);

        this.state.scheduledEvents.set(noteId, { noteOffId: noteOnId });
      }
    }
  }

  private updateScheduledEvents(): void {
    const activeNotes = new Set(this.notes.map(n => n.id));

    for (const noteId of this.state.scheduledEvents.keys()) {
      if (!activeNotes.has(noteId)) {
        const event = this.state.scheduledEvents.get(noteId);
        if (event) {
          clearTimeout(event.noteOffId);
        }
        synth.noteOff(noteId);
        this.state.activeNoteIds.delete(noteId);
        this.state.scheduledEvents.delete(noteId);
      }
    }

    this.scheduleEvents();
  }

  private animationLoop = (): void => {
    if (!this.state.isPlaying) return;

    const currentAudioTime = synth.getCurrentTime();
    const elapsedSeconds = currentAudioTime - this.state.startTime;
    const elapsedTicks = this.secondsToTicks(elapsedSeconds);
    this.state.playheadTicks = this.state.startTicks + elapsedTicks;

    if (this.onPlayheadChange) {
      this.onPlayheadChange(this.state.playheadTicks);
    }

    this.scheduleEvents();

    const maxTicks = this.getMaxTicks();
    if (this.state.playheadTicks >= maxTicks) {
      this.stop();
      return;
    }

    this.animationFrameId = requestAnimationFrame(this.animationLoop);
  };

  private getMaxTicks(): number {
    if (this.notes.length === 0) return 32 * 4 * this.state.ticksPerBeat;
    return Math.max(...this.notes.map(n => n.start + n.duration)) + this.state.ticksPerBeat * 4;
  }

  destroy(): void {
    this.stop();
  }
}

export const player = new Player();
