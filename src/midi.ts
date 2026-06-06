import type { Note } from './types';
import { generateId } from './types';

const TICKS_PER_QUARTER_NOTE = 480;

function readVariableLength(data: Uint8Array, offset: number): { value: number; offset: number } {
  let value = 0;
  let byte: number;
  do {
    byte = data[offset++];
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return { value, offset };
}

function writeVariableLength(value: number): number[] {
  const bytes: number[] = [];
  let buffer = value & 0x7f;
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  return bytes;
}

function readInt16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function readInt32(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function writeInt16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function writeInt32(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

export interface MidiParseResult {
  notes: Note[];
  bpm: number;
}

export function parseMidi(data: ArrayBuffer): MidiParseResult {
  const array = new Uint8Array(data);
  let offset = 0;

  const headerChunkId = String.fromCharCode(...array.slice(offset, offset + 4));
  offset += 4;
  if (headerChunkId !== 'MThd') {
    throw new Error('Not a valid MIDI file');
  }

  const headerLength = readInt32(array, offset);
  offset += 4;
  const format = readInt16(array, offset);
  offset += 2;
  const numTracks = readInt16(array, offset);
  offset += 2;
  const ticksPerQuarter = readInt16(array, offset);
  offset += 2;

  let bpm = 120;
  const notes: Note[] = [];
  const activeNotes: Map<number, { pitch: number; start: number; velocity: number }> = new Map();

  for (let track = 0; track < numTracks; track++) {
    const trackChunkId = String.fromCharCode(...array.slice(offset, offset + 4));
    offset += 4;
    if (trackChunkId !== 'MTrk') {
      throw new Error('Invalid track chunk');
    }

    const trackLength = readInt32(array, offset);
    offset += 4;
    const trackEnd = offset + trackLength;

    let runningStatus: number | null = null;
    let currentTime = 0;
    const trackId = track % 4;

    while (offset < trackEnd) {
      const { value: deltaTime, offset: newOffset } = readVariableLength(array, offset);
      offset = newOffset;
      currentTime += deltaTime;

      let status = array[offset];
      if (status < 0x80 && runningStatus !== null) {
        status = runningStatus;
      } else {
        offset++;
        runningStatus = status;
      }

      const eventType = status >> 4;
      const channel = status & 0x0f;

      if (eventType === 0x9) {
        const pitch = array[offset++];
        const velocity = array[offset++];
        if (velocity === 0) {
          const active = activeNotes.get(pitch);
          if (active) {
            const duration = currentTime - active.start;
            if (duration > 0) {
              notes.push({
                id: generateId(),
                pitch,
                start: active.start,
                duration,
                velocity: active.velocity,
                selected: false,
                trackId,
              });
            }
            activeNotes.delete(pitch);
          }
        } else {
          activeNotes.set(pitch, { pitch, start: currentTime, velocity });
        }
      } else if (eventType === 0x8) {
        const pitch = array[offset++];
        const velocity = array[offset++];
        const active = activeNotes.get(pitch);
        if (active) {
          const duration = currentTime - active.start;
          if (duration > 0) {
            notes.push({
              id: generateId(),
              pitch,
              start: active.start,
              duration,
              velocity: active.velocity,
              selected: false,
              trackId,
            });
          }
          activeNotes.delete(pitch);
        }
      } else if (eventType === 0xf) {
        if (channel === 0x0f) {
          const metaType = array[offset++];
          const { value: metaLength, offset: metaOffset } = readVariableLength(array, offset);
          offset = metaOffset;

          if (metaType === 0x51 && metaLength === 3) {
            const microsecondsPerQuarter =
              (array[offset] << 16) | (array[offset + 1] << 8) | array[offset + 2];
            bpm = Math.round(60000000 / microsecondsPerQuarter);
          }
          offset += metaLength;
        } else if (channel === 0x00 || channel === 0x07) {
          const { value: sysexLength, offset: sysexOffset } = readVariableLength(array, offset);
          offset = sysexOffset + sysexLength;
        }
      } else if (eventType === 0xa || eventType === 0xb || eventType === 0xe) {
        offset += 2;
      } else if (eventType === 0xc || eventType === 0xd) {
        offset += 1;
      } else {
        offset++;
      }
    }
  }

  for (const active of activeNotes.values()) {
    notes.push({
      id: generateId(),
      pitch: active.pitch,
      start: active.start,
      duration: ticksPerQuarter,
      velocity: active.velocity,
      selected: false,
      trackId: 0,
    });
  }

  const scaleFactor = TICKS_PER_QUARTER_NOTE / ticksPerQuarter;
  for (const note of notes) {
    note.start = Math.round(note.start * scaleFactor);
    note.duration = Math.round(note.duration * scaleFactor);
  }

  return { notes, bpm };
}

export function generateMidi(notes: Note[], bpm: number): ArrayBuffer {
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);
  const noteOnEvents: { time: number; type: 'on' | 'off'; pitch: number; velocity: number }[] = [];

  for (const note of sortedNotes) {
    noteOnEvents.push({ time: note.start, type: 'on', pitch: note.pitch, velocity: note.velocity });
    noteOnEvents.push({ time: note.start + note.duration, type: 'off', pitch: note.pitch, velocity: 0 });
  }

  noteOnEvents.sort((a, b) => a.time - b.time || (a.type === 'off' ? -1 : 1));

  const trackData: number[] = [];
  let previousTime = 0;

  const microsecondsPerQuarter = Math.round(60000000 / bpm);
  trackData.push(0);
  trackData.push(0xff, 0x51, 0x03);
  trackData.push((microsecondsPerQuarter >> 16) & 0xff);
  trackData.push((microsecondsPerQuarter >> 8) & 0xff);
  trackData.push(microsecondsPerQuarter & 0xff);

  trackData.push(0);
  trackData.push(0xff, 0x03, 0x0d);
  for (const c of 'Piano Roll Track') {
    trackData.push(c.charCodeAt(0));
  }

  for (const event of noteOnEvents) {
    const deltaTime = event.time - previousTime;
    previousTime = event.time;

    trackData.push(...writeVariableLength(deltaTime));

    if (event.type === 'on') {
      trackData.push(0x90, event.pitch, event.velocity);
    } else {
      trackData.push(0x80, event.pitch, 0);
    }
  }

  trackData.push(0);
  trackData.push(0xff, 0x2f, 0x00);

  const headerData: number[] = [];
  headerData.push(...'MThd'.split('').map(c => c.charCodeAt(0)));
  headerData.push(...writeInt32(6));
  headerData.push(...writeInt16(1));
  headerData.push(...writeInt16(1));
  headerData.push(...writeInt16(TICKS_PER_QUARTER_NOTE));

  const trackHeader: number[] = [];
  trackHeader.push(...'MTrk'.split('').map(c => c.charCodeAt(0)));
  trackHeader.push(...writeInt32(trackData.length));

  const midiData = [...headerData, ...trackHeader, ...trackData];
  return new Uint8Array(midiData).buffer;
}

export function downloadMidi(notes: Note[], bpm: number, filename: string = 'piano-roll.mid'): void {
  const midiBuffer = generateMidi(notes, bpm);
  const blob = new Blob([midiBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
