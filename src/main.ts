import type { Note, ViewConfig, MouseState, Chord, GridSubdivision, RhythmPattern, ScaleType, Track, WaveformType, Segment, ArrangementItem } from './types';
import { generateId, pitchToName, isBlackKey, SCALES, snapToScale, analyzeIntervals, isInScale, DEFAULT_TRACKS, WAVEFORM_NAMES, TRACK_COLORS } from './types';
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
let gridSubdivision: GridSubdivision = 4;
let currentScale: ScaleType = 'none';
let snapToScaleEnabled: boolean = true;
let intervalPanelContent: HTMLElement;
let tracks: Track[] = JSON.parse(JSON.stringify(DEFAULT_TRACKS));
let currentTrackId: number = 0;
let trackList: HTMLElement;

let segments: Segment[] = [];
let arrangement: ArrangementItem[] = [];
let segmentList: HTMLElement | null = null;
let arrangementTimeline: HTMLElement | null = null;
let arrangementTimelineContent: HTMLElement | null = null;
let draggedSegment: Segment | null = null;
let draggedArrangementItem: ArrangementItem | null = null;
let dragInsertIndex: number = -1;

const SEGMENT_COLORS = [
  '#ffd93d',
  '#4ecdc4',
  '#e94560',
  '#6c5ce7',
  '#a29bfe',
  '#00b894',
  '#fd79a8',
  '#fdcb6e',
];

const rhythmPatterns: RhythmPattern[] = [
  {
    name: '四分音符均分',
    description: '每拍一个四分音符',
    pattern: [
      { start: 0, duration: 1 },
      { start: 1, duration: 1 },
      { start: 2, duration: 1 },
      { start: 3, duration: 1 },
    ],
  },
  {
    name: '八分音符律动',
    description: '每拍两个八分音符',
    pattern: [
      { start: 0, duration: 0.5 },
      { start: 0.5, duration: 0.5 },
      { start: 1, duration: 0.5 },
      { start: 1.5, duration: 0.5 },
      { start: 2, duration: 0.5 },
      { start: 2.5, duration: 0.5 },
      { start: 3, duration: 0.5 },
      { start: 3.5, duration: 0.5 },
    ],
  },
  {
    name: '切分节奏',
    description: '经典切分音型',
    pattern: [
      { start: 0, duration: 0.5 },
      { start: 0.5, duration: 1 },
      { start: 1.5, duration: 0.5 },
      { start: 2, duration: 0.5 },
      { start: 2.5, duration: 1 },
      { start: 3.5, duration: 0.5 },
    ],
  },
  {
    name: '三连音',
    description: '每拍三个八分三连音',
    pattern: [
      { start: 0, duration: 1 / 3 },
      { start: 1 / 3, duration: 1 / 3 },
      { start: 2 / 3, duration: 1 / 3 },
      { start: 1, duration: 1 / 3 },
      { start: 1 + 1 / 3, duration: 1 / 3 },
      { start: 1 + 2 / 3, duration: 1 / 3 },
      { start: 2, duration: 1 / 3 },
      { start: 2 + 1 / 3, duration: 1 / 3 },
      { start: 2 + 2 / 3, duration: 1 / 3 },
      { start: 3, duration: 1 / 3 },
      { start: 3 + 1 / 3, duration: 1 / 3 },
      { start: 3 + 2 / 3, duration: 1 / 3 },
    ],
  },
];

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
  intervalPanelContent = document.getElementById('intervalPanelContent') as HTMLElement;
  trackList = document.getElementById('trackList') as HTMLElement;
  segmentList = document.getElementById('segmentList') as HTMLElement | null;
  arrangementTimeline = document.getElementById('arrangementTimeline') as HTMLElement | null;
  arrangementTimelineContent = document.getElementById('arrangementTimelineContent') as HTMLElement | null;

  renderer = new PianoRollRenderer(keysCanvas, headerCanvas, chordBarCanvas, gridCanvas, velocityCanvas, viewConfig);
  chordDetector = new ChordDetector(TICKS_PER_BEAT);

  notes = [
    { id: generateId(), pitch: 60, start: 0, duration: TICKS_PER_BEAT, velocity: 80, selected: false, trackId: 0 },
    { id: generateId(), pitch: 64, start: 0, duration: TICKS_PER_BEAT, velocity: 80, selected: false, trackId: 0 },
    { id: generateId(), pitch: 67, start: 0, duration: TICKS_PER_BEAT, velocity: 80, selected: false, trackId: 0 },
    { id: generateId(), pitch: 57, start: TICKS_PER_BEAT, duration: TICKS_PER_BEAT, velocity: 100, selected: false, trackId: 1 },
    { id: generateId(), pitch: 60, start: TICKS_PER_BEAT, duration: TICKS_PER_BEAT, velocity: 100, selected: false, trackId: 1 },
    { id: generateId(), pitch: 64, start: TICKS_PER_BEAT, duration: TICKS_PER_BEAT, velocity: 100, selected: false, trackId: 1 },
    { id: generateId(), pitch: 62, start: TICKS_PER_BEAT * 2, duration: TICKS_PER_BEAT, velocity: 60, selected: false, trackId: 2 },
    { id: generateId(), pitch: 65, start: TICKS_PER_BEAT * 2, duration: TICKS_PER_BEAT, velocity: 60, selected: false, trackId: 2 },
    { id: generateId(), pitch: 69, start: TICKS_PER_BEAT * 2, duration: TICKS_PER_BEAT, velocity: 60, selected: false, trackId: 2 },
    { id: generateId(), pitch: 67, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false, trackId: 3 },
    { id: generateId(), pitch: 71, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false, trackId: 3 },
    { id: generateId(), pitch: 74, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false, trackId: 3 },
    { id: generateId(), pitch: 77, start: TICKS_PER_BEAT * 3, duration: TICKS_PER_BEAT, velocity: 120, selected: false, trackId: 3 },
    { id: generateId(), pitch: 57, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false, trackId: 0 },
    { id: generateId(), pitch: 60, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false, trackId: 0 },
    { id: generateId(), pitch: 64, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false, trackId: 0 },
    { id: generateId(), pitch: 67, start: TICKS_PER_BEAT * 4, duration: TICKS_PER_BEAT, velocity: 90, selected: false, trackId: 0 },
  ];

  synth.setTracks(tracks);
  renderTrackPanel();

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
  document.getElementById('quantizeBtn')?.addEventListener('click', quantizeNotes);

  const gridSubdivisionSelect = document.getElementById('gridSubdivisionSelect') as HTMLSelectElement;
  gridSubdivisionSelect.addEventListener('change', (e) => {
    const value = parseInt((e.target as HTMLSelectElement).value);
    gridSubdivision = value as GridSubdivision;
    updateStatus(`网格精度: 1/${gridSubdivision}`);
  });

  const rhythmPatternSelect = document.getElementById('rhythmPatternSelect') as HTMLSelectElement;
  rhythmPatternSelect.addEventListener('change', (e) => {
    const value = parseInt((e.target as HTMLSelectElement).value);
    if (value >= 0) {
      applyRhythmPattern(value);
    }
    rhythmPatternSelect.value = '-1';
  });

  const bpmSlider = document.getElementById('bpmSlider') as HTMLInputElement;
  const bpmValue = document.getElementById('bpmValue') as HTMLElement;

  bpmSlider.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
    bpm = value;
    bpmValue.textContent = value.toString();
    player.setBpm(bpm);
    updateStatus(`BPM: ${bpm}`);
  });

  const scaleSelect = document.getElementById('scaleSelect') as HTMLSelectElement;
  scaleSelect.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value as ScaleType;
    currentScale = value;
    updateStatus(currentScale === 'none' ? '音阶约束: 无约束' : `音阶约束: ${SCALES[currentScale].name}`);
    render();
  });

  const snapToScaleToggle = document.getElementById('snapToScaleToggle') as HTMLInputElement;
  snapToScaleToggle.addEventListener('change', (e) => {
    snapToScaleEnabled = (e.target as HTMLInputElement).checked;
    updateStatus(snapToScaleEnabled ? '自动吸附: 开启' : '自动吸附: 关闭');
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
        let newPitch = orig.pitch + dyPitches;
        
        if (snapToScaleEnabled && currentScale !== 'none') {
          newPitch = snapToScale(newPitch, currentScale);
        }
        
        selectedNotes[i].pitch = Math.max(
          viewConfig.minPitch,
          Math.min(viewConfig.maxPitch, newPitch)
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
    synth.playNote(pitch, 0.5, 100, currentTrackId);
    activePitches.add(pitch);
    render();

    setTimeout(() => {
      activePitches.delete(pitch);
      render();
    }, 500);

    updateStatus(`点击: ${pitchToName(pitch)} (${tracks[currentTrackId].name})`);
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

function getGridSize(): number {
  return TICKS_PER_BEAT / gridSubdivision;
}

function snapToGrid(x: number): number {
  const tickWidth = viewConfig.beatWidth / TICKS_PER_BEAT;
  const gridSize = getGridSize();
  const ticks = Math.round(x / tickWidth);
  return Math.round(ticks / gridSize) * gridSize;
}

function snapTicksToGrid(ticks: number): number {
  const gridSize = getGridSize();
  return Math.round(ticks / gridSize) * gridSize;
}

function quantizeNotes(): void {
  const selectedNotes = notes.filter(n => n.selected);
  if (selectedNotes.length === 0) {
    updateStatus('请先选择要量化的音符');
    return;
  }

  history.pushState(notes);

  const gridSize = getGridSize();
  for (const note of selectedNotes) {
    const newStart = snapTicksToGrid(note.start);
    const newEnd = snapTicksToGrid(note.start + note.duration);
    note.start = Math.max(0, newStart);
    note.duration = Math.max(gridSize, newEnd - newStart);
  }

  player.setNotes(notes);
  updateChords();
  updateStatus(`已量化 ${selectedNotes.length} 个音符 (1/${gridSubdivision} 精度)`);
  updateUI();
  render();
}

function getSelectedTimeRange(): { start: number; end: number } | null {
  const selectedNotes = notes.filter(n => n.selected);
  if (selectedNotes.length === 0) {
    return null;
  }

  let minStart = Infinity;
  let maxEnd = 0;
  for (const note of selectedNotes) {
    minStart = Math.min(minStart, note.start);
    maxEnd = Math.max(maxEnd, note.start + note.duration);
  }

  return { start: minStart, end: maxEnd };
}

function getMostFrequentPitch(selectedNotes: Note[]): number {
  const pitchCount = new Map<number, number>();
  for (const note of selectedNotes) {
    pitchCount.set(note.pitch, (pitchCount.get(note.pitch) || 0) + 1);
  }

  let maxCount = 0;
  let mostFrequent = 60;
  for (const [pitch, count] of pitchCount) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = pitch;
    }
  }
  return mostFrequent;
}

function applyRhythmPattern(patternIndex: number): void {
  if (patternIndex < 0 || patternIndex >= rhythmPatterns.length) {
    return;
  }

  const pattern = rhythmPatterns[patternIndex];
  const selectedNotes = notes.filter(n => n.selected);
  const timeRange = getSelectedTimeRange();

  if (!timeRange) {
    updateStatus('请先选择时间范围（选择该区域内的音符）');
    return;
  }

  history.pushState(notes);

  const pitch = selectedNotes.length > 0 ? getMostFrequentPitch(selectedNotes) : 60;
  const rangeStart = timeRange.start;
  const rangeEnd = timeRange.end;
  const rangeDuration = rangeEnd - rangeStart;
  const beatsInRange = rangeDuration / TICKS_PER_BEAT;

  const patternTotalBeats = 4;
  const repetitions = Math.max(1, Math.floor(beatsInRange / patternTotalBeats));
  const remainingBeats = beatsInRange - repetitions * patternTotalBeats;

  notes = notes.filter(n => {
    const noteEnd = n.start + n.duration;
    return !(n.start >= rangeStart && noteEnd <= rangeEnd);
  });

  for (let rep = 0; rep < repetitions; rep++) {
    for (const event of pattern.pattern) {
      const start = rangeStart + (rep * patternTotalBeats + event.start) * TICKS_PER_BEAT;
      const duration = event.duration * TICKS_PER_BEAT;

      if (start + duration <= rangeEnd) {
        notes.push({
          id: generateId(),
          pitch,
          start: snapTicksToGrid(start),
          duration: snapTicksToGrid(duration),
          velocity: 100,
          selected: true,
          trackId: currentTrackId,
        });
      }
    }
  }

  if (remainingBeats > 0) {
    for (const event of pattern.pattern) {
      if (event.start < remainingBeats) {
        const start = rangeStart + (repetitions * patternTotalBeats + event.start) * TICKS_PER_BEAT;
        const duration = Math.min(event.duration, remainingBeats - event.start) * TICKS_PER_BEAT;

        if (start + duration <= rangeEnd) {
        notes.push({
          id: generateId(),
          pitch,
          start: snapTicksToGrid(start),
          duration: snapTicksToGrid(duration),
          velocity: 100,
          selected: true,
          trackId: currentTrackId,
        });
      }
      }
    }
  }

  player.setNotes(notes);
  updateChords();
  updateStatus(`已应用节奏模板: ${pattern.name} (${pitchToName(pitch)})`);
  updateUI();
  render();
}

function createNoteAtPosition(x: number, y: number): void {
  let pitch = viewConfig.maxPitch - Math.floor(y / viewConfig.rowHeight);
  const start = snapToGrid(x);
  const duration = TICKS_PER_BEAT;

  if (snapToScaleEnabled && currentScale !== 'none') {
    const originalPitch = pitch;
    pitch = snapToScale(pitch, currentScale);
    if (pitch !== originalPitch) {
      updateStatus(`吸附到音阶: ${pitchToName(originalPitch)} → ${pitchToName(pitch)}`);
    }
  }

  if (pitch >= viewConfig.minPitch && pitch <= viewConfig.maxPitch) {
    const newNote: Note = {
      id: generateId(),
      pitch,
      start,
      duration,
      velocity: 100,
      selected: true,
      trackId: currentTrackId,
    };

    notes.push(newNote);
    mouseState.targetNoteId = newNote.id;
    player.setNotes(notes);

    synth.playNote(pitch, 0.1, 80, currentTrackId);
    activePitches.add(pitch);
    setTimeout(() => {
      activePitches.delete(pitch);
      render();
    }, 100);

    if (!snapToScaleEnabled || currentScale === 'none') {
      updateStatus(`创建音符: ${pitchToName(pitch)} (${tracks[currentTrackId].name})`);
    }
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

  const playNotes = getArrangementNotes();
  player.setNotes(playNotes);
  player.setBpm(bpm);
  try {
    await player.play();
    updatePlayButton();
    updateStatus(arrangement.length > 0 ? '播放中... (排列视图)' : '播放中...');
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

function updateIntervalPanel(): void {
  if (!intervalPanelContent) return;

  const selectedNotes = notes.filter(n => n.selected);

  if (selectedNotes.length === 0) {
    intervalPanelContent.innerHTML = `
      <div class="interval-empty">
        选择音符查看音程关系
      </div>
    `;
    return;
  }

  const analysis = analyzeIntervals(selectedNotes);

  let html = `
    <div class="interval-note-list">
      <div class="interval-note-list-title">选中音符 (${selectedNotes.length}个)</div>
      <div class="interval-note-tags">
        ${analysis.notes.map(name => `<span class="interval-note-tag">${name}</span>`).join('')}
      </div>
    </div>
  `;

  if (analysis.single && selectedNotes.length === 2) {
    html += `
      <div class="interval-result">
        <div class="interval-result-title">音程关系</div>
        <div class="interval-result-value">${analysis.single}</div>
      </div>
    `;
  } else if (analysis.sequence && selectedNotes.length >= 3) {
    html += `
      <div class="interval-result">
        <div class="interval-result-title">相邻音程序列</div>
        <div class="interval-sequence" style="margin-top: 8px;">
          ${analysis.sequence.map((name, i) => `
            <div class="interval-sequence-item">
              <span class="interval-sequence-notes">${analysis.notes[i]} → ${analysis.notes[i + 1]}</span>
              <span class="interval-sequence-name">${name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (selectedNotes.length === 1) {
    html += `
      <div class="interval-empty">
        请选择2个或更多音符<br>以查看音程关系
      </div>
    `;
  }

  intervalPanelContent.innerHTML = html;
}

function renderTrackPanel(): void {
  if (!trackList) return;

  trackList.innerHTML = '';

  for (const track of tracks) {
    const trackItem = document.createElement('div');
    trackItem.className = `track-item${track.id === currentTrackId ? ' active' : ''}`;
    trackItem.dataset.trackId = track.id.toString();

    trackItem.innerHTML = `
      <div class="track-header">
        <div class="track-color-indicator" style="background-color: ${track.color}; color: ${track.color};"></div>
        <span class="track-name">${track.name}</span>
        <div class="track-buttons">
          <button class="track-btn mute-btn${track.muted ? ' active' : ''}" data-action="mute" data-track-id="${track.id}" title="静音">M</button>
          <button class="track-btn solo-btn${track.solo ? ' active' : ''}" data-action="solo" data-track-id="${track.id}" title="独奏">S</button>
        </div>
      </div>
      <div class="track-controls">
        <select class="track-waveform-select" data-action="waveform" data-track-id="${track.id}">
          <option value="sine" ${track.waveform === 'sine' ? 'selected' : ''}>${WAVEFORM_NAMES['sine']}</option>
          <option value="square" ${track.waveform === 'square' ? 'selected' : ''}>${WAVEFORM_NAMES['square']}</option>
          <option value="sawtooth" ${track.waveform === 'sawtooth' ? 'selected' : ''}>${WAVEFORM_NAMES['sawtooth']}</option>
          <option value="triangle" ${track.waveform === 'triangle' ? 'selected' : ''}>${WAVEFORM_NAMES['triangle']}</option>
        </select>
        <div class="track-volume-control">
          <span class="track-volume-icon">🔊</span>
          <input type="range" class="track-volume-slider" data-action="volume" data-track-id="${track.id}" 
                 min="0" max="100" value="${Math.round(track.volume * 100)}">
          <span class="track-volume-value">${Math.round(track.volume * 100)}</span>
        </div>
      </div>
    `;

    trackItem.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.track-buttons') || 
          (e.target as HTMLElement).closest('.track-controls')) {
        return;
      }
      currentTrackId = track.id;
      updateStatus(`切换到 ${track.name}`);
      renderTrackPanel();
      render();
    });

    trackList.appendChild(trackItem);
  }

  trackList.querySelectorAll('[data-action]').forEach(el => {
    const action = el.getAttribute('data-action');
    const trackId = parseInt(el.getAttribute('data-track-id') || '0');

    if (action === 'mute') {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        tracks[trackId].muted = !tracks[trackId].muted;
        synth.setTracks(tracks);
        updateStatus(`${tracks[trackId].name} ${tracks[trackId].muted ? '已静音' : '取消静音'}`);
        renderTrackPanel();
      });
    } else if (action === 'solo') {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        tracks[trackId].solo = !tracks[trackId].solo;
        synth.setTracks(tracks);
        updateStatus(`${tracks[trackId].name} ${tracks[trackId].solo ? '独奏' : '取消独奏'}`);
        renderTrackPanel();
      });
    } else if (action === 'waveform') {
      el.addEventListener('change', (e) => {
        e.stopPropagation();
        const waveform = (e.target as HTMLSelectElement).value as WaveformType;
        tracks[trackId].waveform = waveform;
        synth.setTracks(tracks);
        updateStatus(`${tracks[trackId].name} 音色: ${WAVEFORM_NAMES[waveform]}`);
      });
    } else if (action === 'volume') {
      el.addEventListener('input', (e) => {
        e.stopPropagation();
        const volume = parseInt((e.target as HTMLInputElement).value) / 100;
        tracks[trackId].volume = volume;
        synth.setTracks(tracks);
        const valueEl = (el as HTMLElement).parentElement?.querySelector('.track-volume-value');
        if (valueEl) {
          valueEl.textContent = Math.round(volume * 100).toString();
        }
      });
    }
  });
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

  updateIntervalPanel();
}

function saveSelectedAsSegment(): void {
  const timeRange = getSelectedTimeRange();
  if (!timeRange) {
    updateStatus('请先框选时间区域（按住Shift拖动选择）');
    return;
  }

  const name = prompt('请输入片段名称:', `片段 ${segments.length + 1}`);
  if (!name || name.trim() === '') {
    return;
  }

  const segment: Segment = {
    id: generateId(),
    name: name.trim(),
    startTick: snapTicksToGrid(timeRange.start),
    endTick: snapTicksToGrid(timeRange.end),
    color: SEGMENT_COLORS[segments.length % SEGMENT_COLORS.length],
  };

  segments.push(segment);
  player.setSegments(segments, arrangement);
  renderSegmentList();
  render();
  updateStatus(`已保存片段: ${name}`);
}

function formatDuration(ticks: number): string {
  const beats = ticks / TICKS_PER_BEAT;
  const measures = Math.floor(beats / BEATS_PER_MEASURE);
  const remainingBeats = beats % BEATS_PER_MEASURE;
  
  if (measures > 0 && remainingBeats > 0) {
    return `${measures}小节 ${remainingBeats}拍`;
  } else if (measures > 0) {
    return `${measures}小节`;
  } else {
    return `${remainingBeats}拍`;
  }
}

function renderSegmentList(): void {
  if (!segmentList) return;

  if (segments.length === 0) {
    segmentList.innerHTML = `
      <div class="segment-empty">暂无片段<br>选择时间区域后点击"保存片段"</div>
    `;
    return;
  }

  segmentList.innerHTML = '';

  for (const segment of segments) {
    const duration = segment.endTick - segment.startTick;
    const segmentItem = document.createElement('div');
    segmentItem.className = 'segment-item';
    segmentItem.draggable = true;
    segmentItem.dataset.segmentId = segment.id;

    segmentItem.innerHTML = `
      <div class="segment-color" style="background-color: ${segment.color}; color: ${segment.color};"></div>
      <div class="segment-info">
        <div class="segment-name">${segment.name}</div>
        <div class="segment-duration">${formatDuration(duration)}</div>
      </div>
      <button class="segment-delete" data-action="delete-segment" data-segment-id="${segment.id}" title="删除片段">×</button>
    `;

    segmentItem.addEventListener('dragstart', (e) => {
      draggedSegment = segment;
      segmentItem.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', segment.id);
      }
    });

    segmentItem.addEventListener('dragend', () => {
      draggedSegment = null;
      segmentItem.classList.remove('dragging');
    });

    segmentItem.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="delete-segment"]')) return;
      jumpToSegment(segment);
    });

    segmentItem.querySelector('[data-action="delete-segment"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`确定要删除片段"${segment.name}"吗？这将同时移除排列视图中所有引用该片段的项。`)) {
        deleteSegment(segment.id);
      }
    });

    segmentList.appendChild(segmentItem);
  }
}

function deleteSegment(segmentId: string): void {
  const segment = segments.find(s => s.id === segmentId);
  if (!segment) return;

  segments = segments.filter(s => s.id !== segmentId);
  arrangement = arrangement.filter(a => a.segmentId !== segmentId);
  player.setSegments(segments, arrangement);
  renderSegmentList();
  renderArrangement();
  render();
  updateStatus(`已删除片段: ${segment.name}`);
}

function jumpToSegment(segment: Segment): void {
  const startX = (segment.startTick / TICKS_PER_BEAT) * viewConfig.beatWidth;
  scrollWrapper.scrollLeft = Math.max(0, startX - 100);
  clearSelection();
  
  for (const note of notes) {
    if (note.start >= segment.startTick && note.start + note.duration <= segment.endTick) {
      note.selected = true;
    }
  }
  
  updateUI();
  render();
  updateStatus(`跳转到片段: ${segment.name}`);
}

function getArrangementNotes(): Note[] {
  if (arrangement.length === 0) {
    return notes;
  }

  const arrangedNotes: Note[] = [];
  let currentOffset = 0;

  for (const item of arrangement) {
    const segment = segments.find(s => s.id === item.segmentId);
    if (!segment) continue;

    const segmentDuration = segment.endTick - segment.startTick;
    const segmentNotes = notes.filter(n => 
      n.start >= segment.startTick && n.start + n.duration <= segment.endTick
    );

    for (const note of segmentNotes) {
      arrangedNotes.push({
        ...note,
        id: generateId(),
        start: note.start - segment.startTick + currentOffset,
      });
    }

    currentOffset += segmentDuration;
  }

  return arrangedNotes;
}

function getArrangementTotalTicks(): number {
  if (arrangement.length === 0) {
    return Math.max(...notes.map(n => n.start + n.duration), 0) + TICKS_PER_BEAT * 4;
  }

  let total = 0;
  for (const item of arrangement) {
    const segment = segments.find(s => s.id === item.segmentId);
    if (segment) {
      total += segment.endTick - segment.startTick;
    }
  }
  return total + TICKS_PER_BEAT * 4;
}

function renderArrangement(): void {
  if (!arrangementTimelineContent) return;

  arrangementTimelineContent.innerHTML = '';

  if (arrangement.length === 0) {
    arrangementTimelineContent.innerHTML = `
      <div class="arrangement-empty">
        拖拽左侧片段到此处<br>进行编排
      </div>
    `;
    return;
  }

  for (let i = 0; i < arrangement.length; i++) {
    const item = arrangement[i];
    const segment = segments.find(s => s.id === item.segmentId);
    if (!segment) continue;

    const duration = segment.endTick - segment.startTick;
    const width = Math.max(80, (duration / TICKS_PER_BEAT) * viewConfig.beatWidth * 0.5);

    const itemEl = document.createElement('div');
    itemEl.className = 'arrangement-item';
    itemEl.draggable = true;
    itemEl.dataset.arrangementId = item.id;
    itemEl.dataset.index = i.toString();
    itemEl.style.width = `${width}px`;
    itemEl.style.borderColor = segment.color;
    itemEl.style.background = `linear-gradient(135deg, ${segment.color}33, ${segment.color}11)`;

    itemEl.innerHTML = `
      <div class="arrangement-item-name" style="color: ${segment.color};">${segment.name}</div>
      <div class="arrangement-item-duration">${formatDuration(duration)}</div>
      <button class="arrangement-item-delete" data-action="delete-arrangement" data-arrangement-id="${item.id}" title="删除">×</button>
    `;

    itemEl.addEventListener('dragstart', (e) => {
      draggedArrangementItem = item;
      itemEl.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      }
    });

    itemEl.addEventListener('dragend', () => {
      draggedArrangementItem = null;
      itemEl.classList.remove('dragging');
      hideDropIndicator();
    });

    itemEl.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="delete-arrangement"]')) return;
      jumpToSegment(segment);
    });

    itemEl.querySelector('[data-action="delete-arrangement"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteArrangementItem(item.id);
    });

    arrangementTimelineContent.appendChild(itemEl);
  }
}

function deleteArrangementItem(arrangementId: string): void {
  arrangement = arrangement.filter(a => a.id !== arrangementId);
  player.setSegments(segments, arrangement);
  renderArrangement();
  updateStatus('已从排列中移除');
}

function showDropIndicator(x: number): void {
  hideDropIndicator();
  
  const contentRect = arrangementTimelineContent!.getBoundingClientRect();
  const scrollLeft = arrangementTimeline!.scrollLeft;
  const relativeX = x - contentRect.left + scrollLeft;
  
  const items = arrangementTimelineContent!.querySelectorAll('.arrangement-item');
  let insertIndex = 0;
  
  for (let i = 0; i < items.length; i++) {
    const itemRect = items[i].getBoundingClientRect();
    const itemLeft = itemRect.left - contentRect.left + scrollLeft;
    const itemCenter = itemLeft + itemRect.width / 2;
    
    if (relativeX < itemCenter) {
      insertIndex = i;
      break;
    }
    insertIndex = i + 1;
  }
  
  dragInsertIndex = insertIndex;
  
  const indicator = document.createElement('div');
  indicator.className = 'arrangement-drop-indicator';
  indicator.id = 'dropIndicator';
  
  if (items.length === 0) {
    indicator.style.left = '16px';
  } else if (insertIndex === 0) {
    const firstItem = items[0];
    const firstRect = firstItem.getBoundingClientRect();
    const left = firstRect.left - contentRect.left + scrollLeft - 6;
    indicator.style.left = `${left}px`;
  } else if (insertIndex >= items.length) {
    const lastItem = items[items.length - 1];
    const lastRect = lastItem.getBoundingClientRect();
    const left = lastRect.right - contentRect.left + scrollLeft + 2;
    indicator.style.left = `${left}px`;
  } else {
    const prevItem = items[insertIndex - 1];
    const nextItem = items[insertIndex];
    const prevRect = prevItem.getBoundingClientRect();
    const nextRect = nextItem.getBoundingClientRect();
    const left = (prevRect.right + nextRect.left) / 2 - contentRect.left + scrollLeft - 1;
    indicator.style.left = `${left}px`;
  }
  
  arrangementTimelineContent!.appendChild(indicator);
}

function hideDropIndicator(): void {
  const indicator = document.getElementById('dropIndicator');
  if (indicator) {
    indicator.remove();
  }
  dragInsertIndex = -1;
}

function setupArrangementEventListeners(): void {
  if (!arrangementTimeline || !arrangementTimelineContent) return;

  const timeline = arrangementTimeline;

  timeline.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = draggedArrangementItem ? 'move' : 'copy';
    }
    timeline.classList.add('drag-over');
    showDropIndicator(e.clientX);
  });

  timeline.addEventListener('dragleave', (e) => {
    const rect = timeline.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || 
        e.clientY < rect.top || e.clientY > rect.bottom) {
      timeline.classList.remove('drag-over');
      hideDropIndicator();
    }
  });

  timeline.addEventListener('drop', (e) => {
    e.preventDefault();
    timeline.classList.remove('drag-over');
    
    const segmentId = e.dataTransfer?.getData('text/plain');
    
    if (draggedArrangementItem) {
      const oldIndex = arrangement.findIndex(a => a.id === draggedArrangementItem!.id);
      if (oldIndex !== -1 && dragInsertIndex !== -1) {
        const newIndex = dragInsertIndex > oldIndex ? dragInsertIndex - 1 : dragInsertIndex;
        const [item] = arrangement.splice(oldIndex, 1);
        arrangement.splice(newIndex, 0, item);
        player.setSegments(segments, arrangement);
        renderArrangement();
        updateStatus('已调整排列顺序');
      }
      draggedArrangementItem = null;
    } else if (draggedSegment && segmentId) {
      const insertIndex = dragInsertIndex >= 0 ? dragInsertIndex : arrangement.length;
      const newItem: ArrangementItem = {
        id: generateId(),
        segmentId: draggedSegment.id,
        startTick: 0,
      };
      arrangement.splice(insertIndex, 0, newItem);
      player.setSegments(segments, arrangement);
      renderArrangement();
      updateStatus(`已添加片段: ${draggedSegment.name}`);
      draggedSegment = null;
    }
    
    hideDropIndicator();
  });
}

function updatePlayerWithArrangement(): void {
  const playNotes = getArrangementNotes();
  player.setNotes(playNotes);
  player.setSegments(segments, arrangement);
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
    mouseState.selectionBox,
    currentScale,
    tracks,
    currentTrackId
  );

  renderSegmentHighlights();
}

function renderSegmentHighlights(): void {
  const existingHighlights = document.querySelectorAll('.segment-highlight');
  existingHighlights.forEach(h => h.remove());

  if (segments.length === 0) return;

  const gridWrapper = document.querySelector('.grid-wrapper') as HTMLElement;
  if (!gridWrapper) return;

  const { beatWidth, ticksPerBeat, headerHeight, chordBarHeight } = viewConfig;
  const scrollLeft = scrollWrapper.scrollLeft;

  for (const segment of segments) {
    const startX = (segment.startTick / ticksPerBeat) * beatWidth - scrollLeft;
    const endX = (segment.endTick / ticksPerBeat) * beatWidth - scrollLeft;
    const width = endX - startX;

    if (startX > gridWrapper.clientWidth || endX < 0) continue;

    const highlight = document.createElement('div');
    highlight.className = 'segment-highlight';
    highlight.style.left = `${startX}px`;
    highlight.style.width = `${width}px`;
    highlight.style.top = `${headerHeight + chordBarHeight}px`;
    highlight.style.height = `calc(100% - ${headerHeight + chordBarHeight + viewConfig.velocityEditorHeight}px)`;
    highlight.style.borderColor = segment.color;
    highlight.title = segment.name;

    gridWrapper.appendChild(highlight);
  }
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
