export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface Track {
  id: number;
  name: string;
  waveform: WaveformType;
  volume: number;
  muted: boolean;
  solo: boolean;
  color: string;
}

export interface Note {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
  selected: boolean;
  trackId: number;
}

export const TRACK_COLORS: string[] = [
  '#e94560',
  '#4ecdc4',
  '#ffd93d',
  '#6c5ce7',
];

export const DEFAULT_TRACKS: Track[] = [
  { id: 0, name: 'Track 1', waveform: 'sawtooth', volume: 0.8, muted: false, solo: false, color: TRACK_COLORS[0] },
  { id: 1, name: 'Track 2', waveform: 'square', volume: 0.7, muted: false, solo: false, color: TRACK_COLORS[1] },
  { id: 2, name: 'Track 3', waveform: 'sine', volume: 0.6, muted: false, solo: false, color: TRACK_COLORS[2] },
  { id: 3, name: 'Track 4', waveform: 'triangle', volume: 0.75, muted: false, solo: false, color: TRACK_COLORS[3] },
];

export const WAVEFORM_NAMES: Record<WaveformType, string> = {
  'sine': '正弦波',
  'square': '方波',
  'sawtooth': '锯齿波',
  'triangle': '三角波',
};

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
  chordBarHeight: number;
  rowHeight: number;
  beatWidth: number;
  ticksPerBeat: number;
  minPitch: number;
  maxPitch: number;
  totalKeys: number;
  resizeHandleWidth: number;
  velocityEditorHeight: number;
}

export type MouseMode =
  | 'idle'
  | 'creating'
  | 'moving'
  | 'resizing'
  | 'selecting'
  | 'panning'
  | 'editingVelocity';

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

export interface Chord {
  beat: number;
  name: string;
  noteIds: string[];
}

export type ChordType = 'major' | 'minor' | 'dominant7' | 'minor7' | 'unknown';

export type GridSubdivision = 1 | 2 | 4 | 8 | 16 | 32;

export interface RhythmPattern {
  name: string;
  description: string;
  pattern: { start: number; duration: number }[];
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

export type ScaleType = 'none' | 'C-major' | 'A-minor' | 'D-major' | 'G-minor' | 'pentatonic' | 'blues';

export interface Scale {
  name: string;
  intervals: number[];
  rootNote: number;
}

export const SCALES: Record<ScaleType, Scale> = {
  'none': { name: '无约束', intervals: [], rootNote: 0 },
  'C-major': { name: 'C大调', intervals: [0, 2, 4, 5, 7, 9, 11], rootNote: 0 },
  'A-minor': { name: 'A小调', intervals: [0, 2, 3, 5, 7, 8, 10], rootNote: 9 },
  'D-major': { name: 'D大调', intervals: [0, 2, 4, 5, 7, 9, 11], rootNote: 2 },
  'G-minor': { name: 'G小调', intervals: [0, 2, 3, 5, 7, 8, 10], rootNote: 7 },
  'pentatonic': { name: '五声音阶', intervals: [0, 2, 4, 7, 9], rootNote: 0 },
  'blues': { name: '布鲁斯音阶', intervals: [0, 3, 5, 6, 7, 10], rootNote: 0 },
};

export function isInScale(pitch: number, scaleType: ScaleType): boolean {
  if (scaleType === 'none') return true;
  const scale = SCALES[scaleType];
  const pitchClass = (pitch % 12 + 12) % 12;
  const normalizedRoot = (scale.rootNote + 12) % 12;
  return scale.intervals.some(interval => {
    const scaleNote = (normalizedRoot + interval + 12) % 12;
    return scaleNote === pitchClass;
  });
}

export function snapToScale(pitch: number, scaleType: ScaleType): number {
  if (scaleType === 'none' || isInScale(pitch, scaleType)) return pitch;

  const scale = SCALES[scaleType];
  const normalizedRoot = (scale.rootNote + 12) % 12;
  const pitchClass = (pitch % 12 + 12) % 12;

  let minDistance = Infinity;
  let closestPitch = pitch;

  for (const interval of scale.intervals) {
    const scaleNote = (normalizedRoot + interval + 12) % 12;
    let distance = Math.abs(scaleNote - pitchClass);
    if (distance > 6) distance = 12 - distance;

    if (distance < minDistance) {
      minDistance = distance;
      const octave = Math.floor(pitch / 12);
      let newPitchClass = scaleNote;
      if (newPitchClass - pitchClass > 6) {
        closestPitch = (octave - 1) * 12 + newPitchClass;
      } else if (pitchClass - newPitchClass > 6) {
        closestPitch = (octave + 1) * 12 + newPitchClass;
      } else {
        closestPitch = octave * 12 + newPitchClass;
      }
    }
  }

  return closestPitch;
}

export const INTERVAL_NAMES: Record<number, string> = {
  0: '纯一度',
  1: '小二度',
  2: '大二度',
  3: '小三度',
  4: '大三度',
  5: '纯四度',
  6: '增四度/减五度',
  7: '纯五度',
  8: '小六度',
  9: '大六度',
  10: '小七度',
  11: '大七度',
  12: '纯八度',
};

export function getIntervalName(pitch1: number, pitch2: number): string {
  const distance = Math.abs(pitch2 - pitch1);
  const simpleInterval = distance % 12;
  const octaves = Math.floor(distance / 12);
  
  let name = INTERVAL_NAMES[simpleInterval] || `未知音程(${simpleInterval})`;
  
  if (octaves > 0) {
    name = `${name} + ${octaves}个八度`;
  }
  
  return name;
}

export function analyzeIntervals(notes: Note[]): { single?: string; sequence?: string[]; notes: string[] } {
  const sortedNotes = [...notes].sort((a, b) => a.pitch - b.pitch);
  const noteNames = sortedNotes.map(n => pitchToName(n.pitch));

  if (sortedNotes.length === 2) {
    return {
      single: getIntervalName(sortedNotes[0].pitch, sortedNotes[1].pitch),
      notes: noteNames,
    };
  } else if (sortedNotes.length >= 3) {
    const sequence: string[] = [];
    for (let i = 0; i < sortedNotes.length - 1; i++) {
      sequence.push(getIntervalName(sortedNotes[i].pitch, sortedNotes[i + 1].pitch));
    }
    return {
      sequence,
      notes: noteNames,
    };
  }

  return { notes: noteNames };
}
