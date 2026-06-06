import type { Note, Chord, ChordType } from './types';
import { NOTE_NAMES } from './types';

export interface ChordPattern {
  type: ChordType;
  intervals: number[];
  suffix: string;
}

const CHORD_PATTERNS: ChordPattern[] = [
  { type: 'dominant7', intervals: [0, 4, 7, 10], suffix: '7' },
  { type: 'minor7', intervals: [0, 3, 7, 10], suffix: 'm7' },
  { type: 'major', intervals: [0, 4, 7], suffix: 'maj' },
  { type: 'minor', intervals: [0, 3, 7], suffix: 'm' },
];

export class ChordDetector {
  private ticksPerBeat: number;

  constructor(ticksPerBeat: number) {
    this.ticksPerBeat = ticksPerBeat;
  }

  detectChords(notes: Note[]): Chord[] {
    const chords: Chord[] = [];
    const beatGroups = this.groupNotesByBeat(notes);

    for (const [beat, groupNotes] of beatGroups.entries()) {
      if (groupNotes.length < 3) {
        continue;
      }

      const chordName = this.identifyChord(groupNotes);
      const noteIds = groupNotes.map(n => n.id);

      chords.push({
        beat,
        name: chordName,
        noteIds,
      });
    }

    return chords;
  }

  private groupNotesByBeat(notes: Note[]): Map<number, Note[]> {
    const beatGroups = new Map<number, Note[]>();

    for (const note of notes) {
      const beat = Math.floor(note.start / this.ticksPerBeat);
      if (!beatGroups.has(beat)) {
        beatGroups.set(beat, []);
      }
      beatGroups.get(beat)!.push(note);
    }

    return beatGroups;
  }

  private identifyChord(notes: Note[]): string {
    const pitches = notes.map(n => n.pitch % 12);
    const uniquePitches = [...new Set(pitches)].sort((a, b) => a - b);
    const lowestPitch = Math.min(...notes.map(n => n.pitch)) % 12;

    if (uniquePitches.length < 3) {
      return '?';
    }

    const matches: { root: number; pattern: ChordPattern }[] = [];

    for (const root of uniquePitches) {
      const relativePitches = uniquePitches
        .map(p => (p - root + 12) % 12)
        .sort((a, b) => a - b);

      for (const pattern of CHORD_PATTERNS) {
        if (this.matchPattern(relativePitches, pattern.intervals)) {
          matches.push({ root, pattern });
        }
      }
    }

    if (matches.length === 0) {
      return '?';
    }

    matches.sort((a, b) => {
      if (a.pattern.intervals.length !== b.pattern.intervals.length) {
        return b.pattern.intervals.length - a.pattern.intervals.length;
      }
      const aIsLowest = a.root === lowestPitch ? 0 : 1;
      const bIsLowest = b.root === lowestPitch ? 0 : 1;
      return aIsLowest - bIsLowest;
    });

    const bestMatch = matches[0];
    const rootName = NOTE_NAMES[bestMatch.root];
    return `${rootName}${bestMatch.pattern.suffix}`;
  }

  private matchPattern(relativePitches: number[], pattern: number[]): boolean {
    if (relativePitches.length < pattern.length) {
      return false;
    }

    for (const interval of pattern) {
      if (!relativePitches.includes(interval)) {
        return false;
      }
    }

    return true;
  }
}
