import type { Note, ViewConfig, MouseState, Chord } from './types';
import { generateId, pitchToName, isBlackKey } from './types';
import { PianoRollRenderer } from './renderer';
import { ChordDetector } from './chordDetector';
import { player } from './player';
import { synth } from './synth';
import { history } from './history';
import { parseMidi, downloadMidi } from './midi';
import './style.css';

const TOTAL_MEASURES = 32;
const BEATS_PER_MEASURE = 4;
const TICKS_PER_BEAT = 480;

const viewConfig: ViewConfig = {
  keysWidth: 80,
  headerHeight: 40,
  chordBarHeight: 32,
  rowHeight: 20,
  beatWidth: 80,
  ticksPerBeat: TICKS_PER_BEAT,
  minPitch: 36,
  maxPitch: 84,
  totalKeys: 49,
  resizeHandleWidth: 8,
  velocityEditorHeight: 80,
};

let notes: Note[] = [];
let bpm = 120;
let scrollX = 0;
let scrollY = 0;
let hoverPitch: number | null = null;
let activePitches: Set<number> = new Set();
let renderer: PianoRollRenderer | null = null;
let chordDetector: ChordDetector | null = null;
let chords: Chord[] = [];

const mouseState: MouseState = {
  mode: 'idle',
  startX: 0,
  startY: 0,
  startScrollX: 0,
  startScrollY: 0,
  targetNoteId: null,
  originalNotes: [],
  selectionBox: null,
};

let keysCanvas: HTMLCanvasElement;
let headerCanvas: HTMLCanvasElement;
let chordBarCanvas: HTMLCanvasElement;
let gridCanvas: HTMLCanvasElement;
let velocityCanvas: HTMLCanvasElement;
let scrollWrapper: HTMLDivElement;
let statusText: HTMLElement;
let selectionInfo: HTMLElement;

function init(): void {
  keysCanvas = document.getElementById('keysCanvas') as HTMLCanvasElement;
  headerCanvas = document.getElementById('headerCanvas') as HTMLCanvasElement;
  chordBarCanvas = document.getElementById('chordBarCanvas') as HTMLCanvasElement;
  gridCanvas = document.getElementById('gridCanvas') as HTMLCanvasElement;
  velocityCanvas = document.getElementById('velocityCanvas') as HTMLCanvasElement;
  scrollWrapper = document.querySelector('.scroll-wrapper') as HTMLDivElement;
  statusText = document.getElementById('statusText') as HTMLElement;
  selectionInfo = document.getElementById('selectionInfo') as HTMLElement;

  renderer = new PianoRollRenderer(keysCanvas, headerCanvas, chordBarCanvas, gridCanvas, velocityCanvas, viewConfig);
  chordDetector = new ChordDetector(TICKS_PER_BEAT);

  notes = [
    { id: generateId(), pitch: 60, start: 0, duration: TICKS_PER_BEAT, velocity: 80, selected: false },
    { id: generateId(), pitch: 64, start: 0, duration: TICKS_PER_BEAT, velocity: 80, selected: false },
    { id: generateId(), pitch: 67, start: 0, duration: TICKS_PER_BEAT, velocity: 80, selected: false },
    { id: generateId(), pitch: 57, start: TICKS_PER_BEAT, duration: TICKS_PER_BEAT, velocity: 100, selected: false },
    { id: generateId(), pitch: 60, start: TICKS_PER_BEAT, duration: TICKS_PER_BEAT, velocity: 100, selected: false },
    { id: generateId(), pitch: 64, start: TICKS_PER_BEAT, duration: TICKS_PER_BEAT, velocity: 100, selected: false },
    { id: generateId(), pitch: 62, start: TICKS_PER_BEAT * 2, duration: TICKS_PER_BEAT, velocity: 60, selected: false },
    { id: generateId(), pitch: 65, start: TICKS_PER_BEAT * 2, duration: TICKS_PER_BEAT, velocity: 60, selected: false },
    { id: generateId(), pitch: 69, start: TICKS_PER_BEAT * 2, duration: TICKS_PER_BEAT, velocity: 60, selected: false },
    { id: generateId(), pitch: 67, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false },
    { id: generateId(), pitch: 71, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false },
    { id: generateId(), pitch: 74, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false },
    { id: generateId(), pitch: 77, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false },
    { id: generateId(), pitch: 57, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false },
    { id: generateId(), pitch: 60, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false },
    { id: generateId(), pitch: 64, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false },
    { id: generateId(), pitch: 67, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false },
  ];

  updateChords();

  setupEventListeners();
  resizeCanvases();
  updateUI();
  render();

  player.setNotes(notes);
  player.setOnPlayheadChange(() => {
    render();
  });
  player.setOnStop(() => {
    updatePlayButton();
    render();
  });

  updateStatus('就绪');
}

function resizeCanvases(): void {
  if (!renderer) return;

  const container = document.querySelector('.grid-wrapper') as HTMLElement;
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight - viewConfig.headerHeight - viewConfig.chordBarHeight;

  const totalWidth = viewConfig.beatWidth * BEATS_PER_MEASURE * TOTAL_MEASURES;
  const pianoRollHeight = viewConfig.rowHeight * viewConfig.totalKeys;

  renderer.resize(containerWidth, containerHeight + viewConfig.headerHeight + viewConfig.chordBarHeight, totalWidth, pianoRollHeight);
}

function updateChords(): void {
  if (!chordDetector) return;
  chords = chordDetector.detectChords(notes);
}

function setupEventListeners(): void {
  window.addEventListener('resize', () => {
    resizeCanvases();
    render();
  });

  scrollWrapper.addEventListener('scroll', () => {
    scrollX = scrollWrapper.scrollLeft;
    scrollY = scrollWrapper.scrollTop;
    render();
  });

  gridCanvas.addEventListener('mousedown', handleGridMouseDown);
  gridCanvas.addEventListener('mousemove', handleGridMouseMove);
  gridCanvas.addEventListener('mouseleave', handleGridMouseLeave);

  velocityCanvas.addEventListener('mousedown', handleVelocityMouseDown);
  velocityCanvas.addEventListener('mousemove', handleVelocityMouseMove);
  velocityCanvas.addEventListener('mouseleave', handleVelocityMouseLeave);

  window.addEventListener('mouseup', handleMouseUp);

  keysCanvas.addEventListener('mousedown', handleKeysMouseDown);
  keysCanvas.addEventListener('mousemove', handleKeysMouseMove);
  keysCanvas.addEventListener('mouseleave', () => {
    hoverPitch = null;
    render();
  });

  gridCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  chordBarCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', handleKeyDown);

  chordBarCanvas.addEventListener('mousedown', handleChordBarMouseDown);

  document.getElementById('playBtn')?.addEventListener('click', togglePlay);
  document.getElementById('stopBtn')?.addEventListener('click', stopPlayback);
  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);
  document.getElementById('exportBtn')?.addEventListener('click', exportMidi);
  document.getElementById('clearBtn')?.addEventListener('click', clearAll);
  document.getElementById('importMidi')?.addEventListener('change', handleImportMidi);

  const bpmSlider = document.getElementById('bpmSlider') as HTMLInputElement;
  const bpmValue = document.getElementById('bpmValue') as HTMLElement;

  bpmSlider.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
    bpm = value;
    bpmValue.textContent = value.toString();
    player.setBpm(bpm);
    updateStatus(`BPM: ${bpm}`);
  });
}

function handleGridMouseDown(e: MouseEvent): void {
  e.preventDefault();
  synth.ensureContext();

  const rect = gridCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left + scrollX;
  const y = e.clientY - rect.top + scrollY;

  mouseState.startX = x;
  mouseState.startY = y;
  mouseState.startScrollX = scrollX;
  mouseState.startScrollY = scrollY;
  mouseState.originalNotes = JSON.parse(JSON.stringify(notes));

  const clickedNote = findNoteAtPosition(x, y);

  if (e.button === 0) {
    if (clickedNote) {
      if (!e.shiftKey && !clickedNote.selected) {
        clearSelection();
        clickedNote.selected = true;
      } else if (e.shiftKey) {
        clickedNote.selected = !clickedNote.selected;
      }

      if (isOnResizeHandle(clickedNote, x)) {
        mouseState.mode = 'resizing';
        mouseState.targetNoteId = clickedNote.id;
      } else {
        mouseState.mode = 'moving';
        mouseState.targetNoteId = clickedNote.id;
        if (!clickedNote.selected) {
          clearSelection();
          clickedNote.selected = true;
        }
      }
    } else if (e.shiftKey) {
      mouseState.mode = 'selecting';
      mouseState.selectionBox = { x: x - scrollX, y: y - scrollY, width: 0, height: 0 };
    } else {
      clearSelection();
      mouseState.mode = 'creating';
      createNoteAtPosition(x, y);
    }
  } else if (e.button === 2) {
    mouseState.mode = 'panning';
  }

  updateUI();
  render();
}

function handleGridMouseMove(e: MouseEvent): void {
  const rect = gridCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left + scrollX;
  const y = e.clientY - rect.top + scrollY;

  const noteUnderCursor = findNoteAtPosition(x, y);

  if (mouseState.mode === 'idle') {
    if (noteUnderCursor) {
      if (isOnResizeHandle(noteUnderCursor, x)) {
        gridCanvas.style.cursor = 'ew-resize';
      } else {
        gridCanvas.style.cursor = 'move';
      }
    } else {
      gridCanvas.style.cursor = 'crosshair';
    }
    return;
  }

  if (mouseState.mode === 'panning') {
    const dx = mouseState.startX - x + scrollX - mouseState.startScrollX;
    const dy = mouseState.startY - y + scrollY - mouseState.startScrollY;
    scrollWrapper.scrollLeft = mouseState.startScrollX + dx;
    scrollWrapper.scrollTop = mouseState.startScrollY + dy;
    return;
  }

  if (mouseState.mode === 'creating' && mouseState.targetNoteId) {
    const note = notes.find(n => n.id === mouseState.targetNoteId);
    if (note) {
      const startTick = snapToGrid(mouseState.startX);
      const endTick = snapToGrid(x);
      note.start = Math.min(startTick, endTick);
      note.duration = Math.max(Math.abs(endTick - startTick), TICKS_PER_BEAT / 4);
      player.setNotes(notes);
      updateChords();
    }
  }

  if (mouseState.mode === 'moving') {
    const dxTicks = snapToGrid(x) - snapToGrid(mouseState.startX);
    const dyPitches = Math.round((mouseState.startY - y) / viewConfig.rowHeight);

    const selectedNotes = notes.filter(n => n.selected);
    for (let i = 0; i < selectedNotes.length; i++) {
      const orig = mouseState.originalNotes.find(n => n.id === selectedNotes[i].id);
      if (orig) {
        selectedNotes[i].start = Math.max(0, orig.start + dxTicks);
        selectedNotes[i].pitch = Math.max(
          viewConfig.minPitch,
          Math.min(viewConfig.maxPitch, orig.pitch + dyPitches)
        );
      }
    }
    player.setNotes(notes);
    updateChords();
  }

  if (mouseState.mode === 'resizing' && mouseState.targetNoteId) {
    const note = notes.find(n => n.id === mouseState.targetNoteId);
    if (note) {
      const orig = mouseState.originalNotes.find(n => n.id === note.id);
      if (orig) {
        const newEnd = snapToGrid(x);
        const newDuration = newEnd - orig.start;
        note.duration = Math.max(newDuration, TICKS_PER_BEAT / 4);
      }
    }
    player.setNotes(notes);
    updateChords();
  }

  if (mouseState.mode === 'selecting') {
    mouseState.selectionBox = {
      x: mouseState.startX - scrollX,
      y: mouseState.startY - scrollY,
      width: x - mouseState.startX,
      height: y - mouseState.startY,
    };

    const box = mouseState.selectionBox;
    const x1 = Math.min(box.x, box.x + box.width) + scrollX;
    const y1 = Math.min(box.y, box.y + box.height) + scrollY;
    const x2 = Math.max(box.x, box.x + box.width) + scrollX;
    const y2 = Math.max(box.y, box.y + box.height) + scrollY;

    for (const note of notes) {
      const noteX = (note.start / TICKS_PER_BEAT) * viewConfig.beatWidth;
      const noteY = (viewConfig.maxPitch - note.pitch) * viewConfig.rowHeight;
      const noteW = (note.duration / TICKS_PER_BEAT) * viewConfig.beatWidth;
      const noteH = viewConfig.rowHeight;

      note.selected =
        noteX < x2 && noteX + noteW > x1 && noteY < y2 && noteY + noteH > y1;
    }
    updateUI();
  }

  render();
}

function handleGridMouseLeave(): void {
  gridCanvas.style.cursor = 'crosshair';
}

function handleVelocityMouseDown(e: MouseEvent): void {
  e.preventDefault();
  synth.ensureContext();

  const x = e.offsetX + scrollX;
  const y = e.offsetY;

  mouseState.startX = x;
  mouseState.startY = y;
  mouseState.startScrollX = scrollX;
  mouseState.startScrollY = scrollY;
  mouseState.originalNotes = JSON.parse(JSON.stringify(notes));

  if (e.button === 0) {
    const velocityNote = findNoteAtVelocityEditor(x);
    if (velocityNote) {
      if (!e.shiftKey && !velocityNote.selected) {
        clearSelection();
        velocityNote.selected = true;
      } else if (e.shiftKey) {
        velocityNote.selected = !velocityNote.selected;
      }
      mouseState.mode = 'editingVelocity';
      mouseState.targetNoteId = velocityNote.id;
      const editorHeight = velocityCanvas.clientHeight;
      const newVelocity = calculateVelocityFromVelocityY(y, editorHeight);
      const selectedNotes = notes.filter(n => n.selected);
      for (const note of selectedNotes) {
        note.velocity = newVelocity;
      }
      player.setNotes(notes);
      updateStatus(`力度: ${newVelocity}`);
    }
  } else if (e.button === 2) {
    mouseState.mode = 'panning';
  }

  updateUI();
  render();
}

function handleVelocityMouseMove(e: MouseEvent): void {
  const x = e.offsetX + scrollX;
  const y = e.offsetY;

  if (mouseState.mode === 'idle') {
    const velocityNote = findNoteAtVelocityEditor(x);
    if (velocityNote) {
      velocityCanvas.style.cursor = 'ns-resize';
    } else {
      velocityCanvas.style.cursor = 'default';
    }
    return;
  }

  if (mouseState.mode === 'panning') {
    const dx = mouseState.startX - x + scrollX - mouseState.startScrollX;
    scrollWrapper.scrollLeft = mouseState.startScrollX + dx;
    return;
  }

  if (mouseState.mode === 'editingVelocity') {
    const editorHeight = velocityCanvas.clientHeight;
    const newVelocity = calculateVelocityFromVelocityY(y, editorHeight);
    const selectedNotes = notes.filter(n => n.selected);
    for (const note of selectedNotes) {
      note.velocity = newVelocity;
    }
    player.setNotes(notes);
    updateStatus(`力度: ${newVelocity}`);
    render();
    return;
  }
}

function handleVelocityMouseLeave(): void {
  velocityCanvas.style.cursor = 'ns-resize';
}

function handleMouseUp(): void {
  if (mouseState.mode !== 'idle' && mouseState.mode !== 'panning' && mouseState.mode !== 'selecting') {
    history.pushState(mouseState.originalNotes);
  }

  if (mouseState.mode === 'selecting') {
    if (mouseState.originalNotes.length > 0 || notes.some(n => n.selected)) {
      history.pushState(mouseState.originalNotes);
    }
  }

  if (mouseState.mode === 'editingVelocity') {
    updateStatus('力度编辑完成');
  }

  mouseState.mode = 'idle';
  mouseState.targetNoteId = null;
  mouseState.selectionBox = null;
  mouseState.originalNotes = [];

  updateChords();
  updateUI();
  render();
}

function handleKeysMouseDown(e: MouseEvent): void {
  e.preventDefault();
  synth.ensureContext();

  const rect = keysCanvas.getBoundingClientRect();
  const y = e.clientY - rect.top + scrollY;
  const pitch = viewConfig.maxPitch - Math.floor(y / viewConfig.rowHeight);

  if (pitch >= viewConfig.minPitch && pitch <= viewConfig.maxPitch) {
    synth.playNote(pitch, 0.5, 100);
    activePitches.add(pitch);
    render();

    setTimeout(() => {
      activePitches.delete(pitch);
      render();
    }, 500);

    updateStatus(`点击: ${pitchToName(pitch)}`);
  }
}

function handleKeysMouseMove(e: MouseEvent): void {
  const rect = keysCanvas.getBoundingClientRect();
  const y = e.clientY - rect.top + scrollY;
  const pitch = viewConfig.maxPitch - Math.floor(y / viewConfig.rowHeight);

  if (pitch >= viewConfig.minPitch && pitch <= viewConfig.maxPitch) {
    hoverPitch = pitch;
  } else {
    hoverPitch = null;
  }
  render();
}

function handleKeyDown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    selectAll();
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    clearSelection();
    render();
    return;
  }

  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
    return;
  }
}

function findNoteAtPosition(x: number, y: number): Note | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    const noteX = (note.start / TICKS_PER_BEAT) * viewConfig.beatWidth;
    const noteY = (viewConfig.maxPitch - note.pitch) * viewConfig.rowHeight;
    const noteW = (note.duration / TICKS_PER_BEAT) * viewConfig.beatWidth;
    const noteH = viewConfig.rowHeight;

    if (x >= noteX && x < noteX + noteW && y >= noteY && y < noteY + noteH) {
      return note;
    }
  }
  return null;
}

function findNoteAtVelocityEditor(x: number): Note | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    const noteX = (note.start / TICKS_PER_BEAT) * viewConfig.beatWidth;
    const noteW = (note.duration / TICKS_PER_BEAT) * viewConfig.beatWidth;
    const barWidth = Math.max(4, noteW * 0.7);
    const barX = noteX + noteW / 2 - barWidth / 2;

    if (x >= barX - 2 && x < barX + barWidth + 2) {
      return note;
    }
  }
  return null;
}

function calculateVelocityFromVelocityY(y: number, editorHeight: number): number {
  const padding = 4;
  const barTop = padding;
  const barBottom = editorHeight - padding;

  const clampedY = Math.max(barTop, Math.min(barBottom, y));
  const velocity = Math.round(127 - ((clampedY - barTop) / (barBottom - barTop)) * 126);
  return Math.max(1, Math.min(127, velocity));
}

function isOnResizeHandle(note: Note, x: number): boolean {
  const noteX = (note.start / TICKS_PER_BEAT) * viewConfig.beatWidth;
  const noteW = (note.duration / TICKS_PER_BEAT) * viewConfig.beatWidth;
  return x >= noteX + noteW - viewConfig.resizeHandleWidth * 2;
}

function snapToGrid(x: number): number {
  const tickWidth = viewConfig.beatWidth / TICKS_PER_BEAT;
  const gridSize = TICKS_PER_BEAT / 4;
  const ticks = Math.round(x / tickWidth);
  return Math.round(ticks / gridSize) * gridSize;
}

function createNoteAtPosition(x: number, y: number): void {
  const pitch = viewConfig.maxPitch - Math.floor(y / viewConfig.rowHeight);
  const start = snapToGrid(x);
  const duration = TICKS_PER_BEAT;

  if (pitch >= viewConfig.minPitch && pitch <= viewConfig.maxPitch) {
    const newNote: Note = {
      id: generateId(),
      pitch,
      start,
      duration,
      velocity: 100,
      selected: true,
    };

    notes.push(newNote);
    mouseState.targetNoteId = newNote.id;
    player.setNotes(notes);

    synth.playNote(pitch, 0.1, 80);
    activePitches.add(pitch);
    setTimeout(() => {
      activePitches.delete(pitch);
      render();
    }, 100);

    updateStatus(`创建音符: ${pitchToName(pitch)}`);
  }
}

function clearSelection(): void {
  for (const note of notes) {
    note.selected = false;
  }
  updateUI();
}

function selectAll(): void {
  for (const note of notes) {
    note.selected = true;
  }
  updateUI();
  render();
}

function deleteSelected(): void {
  const selectedCount = notes.filter(n => n.selected).length;
  if (selectedCount === 0) return;

  history.pushState(notes);
  notes = notes.filter(n => !n.selected);
  player.setNotes(notes);
  updateChords();

  updateStatus(`删除 ${selectedCount} 个音符`);
  updateUI();
  render();
}

function clearAll(): void {
  if (notes.length === 0) return;
  if (!confirm('确定要清空所有音符吗？')) return;

  history.pushState(notes);
  notes = [];
  player.setNotes(notes);
  updateChords();

  updateStatus('已清空所有音符');
  updateUI();
  render();
}

function undo(): void {
  const result = history.undo(notes);
  if (result) {
    notes = result;
    player.setNotes(notes);
    updateChords();
    updateStatus('撤销');
    updateUI();
    render();
  }
}

function redo(): void {
  const result = history.redo(notes);
  if (result) {
    notes = result;
    player.setNotes(notes);
    updateChords();
    updateStatus('重做');
    updateUI();
    render();
  }
}

async function togglePlay(): Promise<void> {
  if (player.isPlaying()) {
    stopPlayback();
  } else {
    await startPlayback();
  }
}

async function startPlayback(): Promise<void> {
  updatePlayButton();
  updateStatus('正在启动...');

  player.setBpm(bpm);
  try {
    await player.play();
    updatePlayButton();
    updateStatus('播放中...');
  } catch (e) {
    updatePlayButton();
    updateStatus('播放启动失败: ' + (e as Error).message);
  }
}

function stopPlayback(): void {
  player.stop();
  player.setPlayhead(0);
  updatePlayButton();
  updateStatus('已停止');
  render();
}

function updatePlayButton(): void {
  const btn = document.getElementById('playBtn');
  if (btn) {
    btn.textContent = player.isPlaying() ? '⏸ 暂停' : '▶ 播放';
  }
}

async function handleImportMidi(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = parseMidi(arrayBuffer);

    history.pushState(notes);
    notes = result.notes.filter(
      n => n.pitch >= viewConfig.minPitch && n.pitch <= viewConfig.maxPitch
    );
    bpm = Math.max(60, Math.min(200, result.bpm));

    const bpmSlider = document.getElementById('bpmSlider') as HTMLInputElement;
    const bpmValue = document.getElementById('bpmValue') as HTMLElement;
    bpmSlider.value = bpm.toString();
    bpmValue.textContent = bpm.toString();
    player.setBpm(bpm);
    player.setNotes(notes);
    updateChords();

    updateStatus(`导入成功: ${notes.length} 个音符, BPM ${bpm}`);
    updateUI();
    render();
  } catch (error) {
    updateStatus('导入失败: ' + (error as Error).message);
  }

  input.value = '';
}

function exportMidi(): void {
  if (notes.length === 0) {
    updateStatus('没有音符可导出');
    return;
  }
  downloadMidi(notes, bpm);
  updateStatus(`已导出 ${notes.length} 个音符`);
}

function updateStatus(text: string): void {
  if (statusText) {
    statusText.textContent = text;
  }
}

function updateUI(): void {
  const selectedCount = notes.filter(n => n.selected).length;
  if (selectionInfo) {
    selectionInfo.textContent = `选择: ${selectedCount} 个音符`;
  }

  const undoBtn = document.getElementById('undoBtn') as HTMLButtonElement;
  const redoBtn = document.getElementById('redoBtn') as HTMLButtonElement;
  if (undoBtn) undoBtn.disabled = !history.canUndo();
  if (redoBtn) redoBtn.disabled = !history.canRedo();
}

function render(): void {
  if (!renderer) return;

  const viewportWidth = scrollWrapper.clientWidth;
  const viewportHeight = scrollWrapper.clientHeight;

  renderer.renderAll(
    notes,
    chords,
    scrollX,
    scrollY,
    viewportWidth,
    viewportHeight,
    BEATS_PER_MEASURE,
    bpm,
    player.getPlayhead(),
    hoverPitch,
    activePitches,
    mouseState.selectionBox
  );
}

function handleChordBarMouseDown(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  synth.ensureContext();

  const rect = chordBarCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const canvasX = x + scrollX;
  const beat = Math.floor(canvasX / viewConfig.beatWidth);

  const clickedChord = chords.find(c => c.beat === beat);

  if (clickedChord) {
    clearSelection();
    for (const note of notes) {
      if (clickedChord.noteIds.includes(note.id)) {
        note.selected = true;
      }
    }
    updateStatus(`选中和弦: ${clickedChord.name}, ${clickedChord.noteIds.length} 个音符`);
    updateUI();
    render();
  }
}

window.addEventListener('DOMContentLoaded', init);
