import type { Note } from './types';

export class HistoryManager {
  private past: Note[][] = [];
  private future: Note[][] = [];
  private maxHistory = 1000;

  pushState(notes: Note[]): void {
    const snapshot = JSON.parse(JSON.stringify(notes));
    this.past.push(snapshot);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.future = [];
  }

  undo(currentNotes: Note[]): Note[] | null {
    if (this.past.length === 0) return null;

    const currentSnapshot = JSON.parse(JSON.stringify(currentNotes));
    this.future.push(currentSnapshot);

    const previous = this.past.pop()!;
    return JSON.parse(JSON.stringify(previous));
  }

  redo(currentNotes: Note[]): Note[] | null {
    if (this.future.length === 0) return null;

    const currentSnapshot = JSON.parse(JSON.stringify(currentNotes));
    this.past.push(currentSnapshot);

    const next = this.future.pop()!;
    return JSON.parse(JSON.stringify(next));
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

export const history = new HistoryManager();
