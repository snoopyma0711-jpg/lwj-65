export interface Note {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
  selected: boolean;
}

export interface ProjectState {
  notes: Note[];
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  totalMeasures: number;
  scrollX: number;
  scrollY: number;
}

export interface ViewConfig {
  keysWidth: number;
  headerHeight: number;
  rowHeight: number;
  beatWidth: number;
  ticksPerBeat: number;
  minPitch: number;
  maxPitch: number;
  totalKeys: number;
  resizeHandleWidth: number;
}

export type MouseMode =
  | 'idle'
  | 'creating'
  | 'moving'
  | 'resizing'
  | 'selecting'
  | 'panning';

export interface MouseState {
  mode: MouseMode;
  startX: number;
  startY: number;
  startScrollX: number;
  startScrollY: number;
  targetNoteId: string | null;
  originalNotes: Note[];
  selectionBox: { x: number; y: number; width: number; height: number } | null;
}

export interface HistoryState {
  past: Note[][];
  future: Note[][];
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function pitchToName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const note = pitch % 12;
  return `${NOTE_NAMES[note]}${octave}`;
}

export function isBlackKey(pitch: number): boolean {
  return BLACK_KEYS.has(pitch % 12);
}
