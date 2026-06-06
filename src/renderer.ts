import type { Note, ViewConfig, Chord } from './types';
import { pitchToName, isBlackKey } from './types';

export class PianoRollRenderer {
  private keysCanvas: HTMLCanvasElement;
  private headerCanvas: HTMLCanvasElement;
  private chordBarCanvas: HTMLCanvasElement;
  private gridCanvas: HTMLCanvasElement;
  private velocityCanvas: HTMLCanvasElement;
  private keysCtx: CanvasRenderingContext2D;
  private headerCtx: CanvasRenderingContext2D;
  private chordBarCtx: CanvasRenderingContext2D;
  private gridCtx: CanvasRenderingContext2D;
  private velocityCtx: CanvasRenderingContext2D;
  private config: ViewConfig;
  private devicePixelRatio: number;

  constructor(
    keysCanvas: HTMLCanvasElement,
    headerCanvas: HTMLCanvasElement,
    chordBarCanvas: HTMLCanvasElement,
    gridCanvas: HTMLCanvasElement,
    velocityCanvas: HTMLCanvasElement,
    config: ViewConfig
  ) {
    this.keysCanvas = keysCanvas;
    this.headerCanvas = headerCanvas;
    this.chordBarCanvas = chordBarCanvas;
    this.gridCanvas = gridCanvas;
    this.velocityCanvas = velocityCanvas;
    this.config = config;
    this.devicePixelRatio = window.devicePixelRatio || 1;

    const keysCtx = keysCanvas.getContext('2d');
    const headerCtx = headerCanvas.getContext('2d');
    const chordBarCtx = chordBarCanvas.getContext('2d');
    const gridCtx = gridCanvas.getContext('2d');
    const velocityCtx = velocityCanvas.getContext('2d');

    if (!keysCtx || !headerCtx || !chordBarCtx || !gridCtx || !velocityCtx) {
      throw new Error('Failed to get canvas contexts');
    }

    this.keysCtx = keysCtx;
    this.headerCtx = headerCtx;
    this.chordBarCtx = chordBarCtx;
    this.gridCtx = gridCtx;
    this.velocityCtx = velocityCtx;
  }

  updateConfig(config: Partial<ViewConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ViewConfig {
    return { ...this.config };
  }

  resize(containerWidth: number, containerHeight: number, totalWidth: number, totalHeight: number): void {
    const dpr = this.devicePixelRatio;
    const velocityHeight = this.config.velocityEditorHeight;
    const chordBarHeight = this.config.chordBarHeight;
    const visibleGridHeight = containerHeight - this.config.headerHeight - chordBarHeight - velocityHeight;

    this.keysCanvas.width = this.config.keysWidth * dpr;
    this.keysCanvas.height = visibleGridHeight * dpr;
    this.keysCanvas.style.width = `${this.config.keysWidth}px`;
    this.keysCanvas.style.height = `${visibleGridHeight}px`;
    this.keysCtx.scale(dpr, dpr);

    this.headerCanvas.width = containerWidth * dpr;
    this.headerCanvas.height = this.config.headerHeight * dpr;
    this.headerCanvas.style.width = `${containerWidth}px`;
    this.headerCanvas.style.height = `${this.config.headerHeight}px`;
    this.headerCtx.scale(dpr, dpr);

    this.chordBarCanvas.width = containerWidth * dpr;
    this.chordBarCanvas.height = chordBarHeight * dpr;
    this.chordBarCanvas.style.width = `${containerWidth}px`;
    this.chordBarCanvas.style.height = `${chordBarHeight}px`;
    this.chordBarCtx.scale(dpr, dpr);

    this.gridCanvas.width = totalWidth * dpr;
    this.gridCanvas.height = totalHeight * dpr;
    this.gridCanvas.style.width = `${totalWidth}px`;
    this.gridCanvas.style.height = `${totalHeight}px`;
    this.gridCtx.scale(dpr, dpr);

    this.velocityCanvas.width = containerWidth * dpr;
    this.velocityCanvas.height = velocityHeight * dpr;
    this.velocityCanvas.style.width = `${containerWidth}px`;
    this.velocityCanvas.style.height = `${velocityHeight}px`;
    this.velocityCtx.scale(dpr, dpr);
  }

  renderKeys(scrollY: number, hoverPitch: number | null, activePitches: Set<number>): void {
    const ctx = this.keysCtx;
    const { keysWidth, rowHeight, minPitch, maxPitch, totalKeys } = this.config;
    const height = this.keysCanvas.height / this.devicePixelRatio;

    ctx.clearRect(0, 0, keysWidth, height);

    const startPitch = maxPitch - Math.floor(scrollY / rowHeight);
    const endPitch = Math.max(minPitch, startPitch - Math.ceil(height / rowHeight) - 1);

    for (let pitch = startPitch; pitch >= endPitch; pitch--) {
      const y = (maxPitch - pitch) * rowHeight - scrollY;
      const isBlack = isBlackKey(pitch);
      const isHover = pitch === hoverPitch;
      const isActive = activePitches.has(pitch);

      if (isBlack) {
        ctx.fillStyle = isActive ? '#e94560' : isHover ? '#3a3a5c' : '#2a2a4a';
        ctx.fillRect(0, y, keysWidth * 0.75, rowHeight);
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, y, keysWidth * 0.75, rowHeight);

        ctx.fillStyle = '#a0a0a0';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(pitchToName(pitch), keysWidth - 5, y + rowHeight / 2);
      } else {
        ctx.fillStyle = isActive ? '#ff6b81' : isHover ? '#4a4a6c' : '#f0f0f0';
        ctx.fillRect(0, y, keysWidth, rowHeight);
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, y, keysWidth, rowHeight);

        ctx.fillStyle = isActive ? '#ffffff' : '#333333';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(pitchToName(pitch), keysWidth - 5, y + rowHeight / 2);
      }
    }
  }

  renderHeader(scrollX: number, bpm: number, beatsPerMeasure: number): void {
    const ctx = this.headerCtx;
    const { beatWidth, headerHeight } = this.config;
    const width = this.headerCanvas.width / this.devicePixelRatio;

    ctx.clearRect(0, 0, width, headerHeight);

    const totalBeats = Math.ceil((width + scrollX) / beatWidth);
    const startBeat = Math.floor(scrollX / beatWidth);

    ctx.fillStyle = '#a0a0a0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let beat = startBeat; beat <= startBeat + totalBeats + 1; beat++) {
      const x = beat * beatWidth - scrollX;
      const measure = Math.floor(beat / beatsPerMeasure) + 1;
      const beatInMeasure = beat % beatsPerMeasure;

      if (beatInMeasure === 0) {
        ctx.fillStyle = '#e94560';
        ctx.fillRect(x, 0, 2, headerHeight);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${measure}`, x + beatWidth / 2, headerHeight / 2);
      } else {
        ctx.fillStyle = '#0f3460';
        ctx.fillRect(x, 0, 1, headerHeight);
        ctx.fillStyle = '#707070';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${beatInMeasure + 1}`, x + beatWidth / 2, headerHeight / 2);
      }
    }
  }

  renderGrid(
    scrollX: number,
    scrollY: number,
    viewportWidth: number,
    viewportHeight: number,
    beatsPerMeasure: number
  ): void {
    const ctx = this.gridCtx;
    const { rowHeight, beatWidth, minPitch, maxPitch, totalKeys } = this.config;
    const totalHeight = totalKeys * rowHeight;

    ctx.clearRect(0, 0, this.gridCanvas.width / this.devicePixelRatio, this.gridCanvas.height / this.devicePixelRatio);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.gridCanvas.width, totalHeight);

    const startPitch = maxPitch;
    const endPitch = minPitch;

    for (let pitch = startPitch; pitch >= endPitch; pitch--) {
      const y = (maxPitch - pitch) * rowHeight;
      const isBlack = isBlackKey(pitch);

      if (isBlack) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(0, y, this.gridCanvas.width, rowHeight);
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.gridCanvas.width, y);
      ctx.stroke();
    }

    const totalBeats = Math.ceil(this.gridCanvas.width / beatWidth);

    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = beat * beatWidth;
      const beatInMeasure = beat % beatsPerMeasure;

      if (beatInMeasure === 0) {
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
      }

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalHeight);
      ctx.stroke();

      if (beatInMeasure === 1 || beatInMeasure === 2 || beatInMeasure === 3) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let sub = 1; sub < 4; sub++) {
          const subX = x + (sub * beatWidth) / 4;
          ctx.beginPath();
          ctx.moveTo(subX, 0);
          ctx.lineTo(subX, totalHeight);
          ctx.stroke();
        }
      }
    }
  }

  renderNotes(notes: Note[], scrollX: number, scrollY: number): void {
    const ctx = this.gridCtx;
    const { rowHeight, beatWidth, ticksPerBeat, maxPitch, resizeHandleWidth } = this.config;

    for (const note of notes) {
      const x = (note.start / ticksPerBeat) * beatWidth;
      const y = (maxPitch - note.pitch) * rowHeight + 1;
      const width = (note.duration / ticksPerBeat) * beatWidth - 2;
      const height = rowHeight - 2;

      const isBlack = isBlackKey(note.pitch);
      const baseColor = isBlack ? '#e94560' : '#ff6b81';
      const selectedColor = '#4ecdc4';

      const gradient = ctx.createLinearGradient(x, y, x, y + height);
      if (note.selected) {
        gradient.addColorStop(0, selectedColor);
        gradient.addColorStop(1, '#3db8b0');
      } else {
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, isBlack ? '#c73e54' : '#e05570');
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 3);
      ctx.fill();

      ctx.strokeStyle = note.selected ? '#6ee7de' : 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (width > resizeHandleWidth * 2) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(x + width - resizeHandleWidth, y + 2, 2, height - 4);
      }

      if (note.selected) {
        ctx.shadowColor = selectedColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 3);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      const barWidth = Math.max(4, width * 0.6);
      const barX = x + width / 2 - barWidth / 2;
      const barMaxHeight = rowHeight * 0.6;
      const barHeight = (note.velocity / 127) * barMaxHeight;
      const barY = y + height - barHeight + 1;

      const barGradient = ctx.createLinearGradient(barX, barY, barX, y + height);
      if (note.selected) {
        barGradient.addColorStop(0, '#6ee7de');
        barGradient.addColorStop(1, '#4ecdc4');
      } else {
        barGradient.addColorStop(0, '#ffd700');
        barGradient.addColorStop(1, '#ffaa00');
      }

      ctx.fillStyle = barGradient;
      ctx.fillRect(barX, barY, barWidth, barHeight);

      ctx.strokeStyle = note.selected ? '#6ee7de' : '#ffd700';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
  }

  renderPlayhead(playheadTicks: number, scrollX: number, viewportWidth: number): void {
    const ctx = this.gridCtx;
    const { beatWidth, ticksPerBeat, rowHeight, totalKeys } = this.config;
    const x = (playheadTicks / ticksPerBeat) * beatWidth;

    if (x < scrollX - 50 || x > scrollX + viewportWidth + 50) return;

    const totalHeight = totalKeys * rowHeight;

    ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
    ctx.fillRect(x - 1, 0, 2, totalHeight);

    ctx.beginPath();
    ctx.moveTo(x - 6, 0);
    ctx.lineTo(x + 6, 0);
    ctx.lineTo(x, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffd700';
    ctx.fill();
  }

  renderVelocityEditor(notes: Note[], scrollX: number): void {
    const ctx = this.velocityCtx;
    const { beatWidth, ticksPerBeat, velocityEditorHeight } = this.config;
    const width = this.velocityCanvas.width / this.devicePixelRatio;
    const height = this.velocityCanvas.height / this.devicePixelRatio;
    const padding = 4;
    const barMaxHeight = height - padding * 2;
    const barBaseY = height - padding;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#121225';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let level = 1; level <= 3; level++) {
      const y = (height * level) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const totalBeats = Math.ceil(width / beatWidth);
    const startBeat = Math.floor(scrollX / beatWidth);
    for (let beat = startBeat; beat <= startBeat + totalBeats + 1; beat++) {
      const x = beat * beatWidth - scrollX;
      const beatInMeasure = beat % 4;

      if (beatInMeasure === 0) {
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
      }

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('127', 4, 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('1', 4, height - 2);

    for (const note of notes) {
      const noteX = (note.start / ticksPerBeat) * beatWidth - scrollX;
      const noteW = (note.duration / ticksPerBeat) * beatWidth;

      const barWidth = Math.max(4, noteW * 0.7);
      const barX = noteX + noteW / 2 - barWidth / 2;
      const barHeight = (note.velocity / 127) * barMaxHeight;
      const barY = barBaseY - barHeight;

      if (barX + barWidth < 0 || barX > width) continue;

      const barGradient = ctx.createLinearGradient(barX, barY, barX, barBaseY);
      if (note.selected) {
        barGradient.addColorStop(0, '#6ee7de');
        barGradient.addColorStop(1, '#4ecdc4');
      } else {
        barGradient.addColorStop(0, '#707070');
        barGradient.addColorStop(1, '#505050');
      }

      ctx.fillStyle = barGradient;
      ctx.fillRect(barX, barY, barWidth, barHeight);

      ctx.strokeStyle = note.selected ? '#6ee7de' : '#808080';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
  }

  renderVelocityPlayhead(playheadTicks: number, scrollX: number): void {
    const ctx = this.velocityCtx;
    const { beatWidth, ticksPerBeat, velocityEditorHeight } = this.config;
    const x = (playheadTicks / ticksPerBeat) * beatWidth - scrollX;
    const height = this.velocityCanvas.height / this.devicePixelRatio;

    ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
    ctx.fillRect(x - 1, 0, 2, height);
  }

  renderSelectionBox(
    box: { x: number; y: number; width: number; height: number } | null,
    scrollX: number,
    scrollY: number
  ): void {
    if (!box) return;

    const ctx = this.gridCtx;
    const { rowHeight, beatWidth, ticksPerBeat, minPitch, maxPitch } = this.config;

    const x1 = Math.min(box.x, box.x + box.width);
    const y1 = Math.min(box.y, box.y + box.height);
    const x2 = Math.max(box.x, box.x + box.width);
    const y2 = Math.max(box.y, box.y + box.height);

    const startTick = Math.floor((x1 + scrollX) / beatWidth) * ticksPerBeat;
    const endTick = Math.ceil((x2 + scrollX) / beatWidth) * ticksPerBeat;
    const lowPitch = Math.max(minPitch, maxPitch - Math.floor((y2 + scrollY) / rowHeight));
    const highPitch = Math.min(maxPitch, maxPitch - Math.ceil((y1 + scrollY) / rowHeight) + 1);

    const rectX = (startTick / ticksPerBeat) * beatWidth - scrollX;
    const rectY = (maxPitch - highPitch) * rowHeight - scrollY;
    const rectW = ((endTick - startTick) / ticksPerBeat) * beatWidth;
    const rectH = (highPitch - lowPitch) * rowHeight;

    ctx.fillStyle = 'rgba(78, 205, 196, 0.15)';
    ctx.fillRect(rectX, rectY, rectW, rectH);

    ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rectX, rectY, rectW, rectH);
    ctx.setLineDash([]);
  }

  renderChordBar(chords: Chord[], scrollX: number, beatsPerMeasure: number): void {
    const ctx = this.chordBarCtx;
    const { beatWidth, chordBarHeight } = this.config;
    const width = this.chordBarCanvas.width / this.devicePixelRatio;

    ctx.clearRect(0, 0, width, chordBarHeight);

    ctx.fillStyle = '#121225';
    ctx.fillRect(0, 0, width, chordBarHeight);

    const totalBeats = Math.ceil((width + scrollX) / beatWidth);
    const startBeat = Math.floor(scrollX / beatWidth);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let beat = startBeat; beat <= startBeat + totalBeats + 1; beat++) {
      const x = beat * beatWidth - scrollX;
      const beatInMeasure = beat % beatsPerMeasure;

      if (beatInMeasure === 0) {
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
      }

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chordBarHeight);
      ctx.stroke();
    }

    for (const chord of chords) {
      const x = chord.beat * beatWidth - scrollX;
      const chordWidth = beatWidth;

      if (x + chordWidth < 0 || x > width) continue;

      const hasSelection = chord.name !== '?';

      ctx.fillStyle = hasSelection ? 'rgba(78, 205, 196, 0.15)' : 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(x + 2, 2, chordWidth - 4, chordBarHeight - 4);

      ctx.strokeStyle = hasSelection ? 'rgba(78, 205, 196, 0.6)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, 2, chordWidth - 4, chordBarHeight - 4);

      ctx.fillStyle = chord.name === '?' ? '#707070' : '#4ecdc4';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(chord.name, x + chordWidth / 2, chordBarHeight / 2);
    }
  }

  renderAll(
    notes: Note[],
    chords: Chord[],
    scrollX: number,
    scrollY: number,
    viewportWidth: number,
    viewportHeight: number,
    beatsPerMeasure: number,
    bpm: number,
    playheadTicks: number,
    hoverPitch: number | null,
    activePitches: Set<number>,
    selectionBox: { x: number; y: number; width: number; height: number } | null
  ): void {
    this.renderGrid(scrollX, scrollY, viewportWidth, viewportHeight, beatsPerMeasure);
    this.renderNotes(notes, scrollX, scrollY);
    this.renderPlayhead(playheadTicks, scrollX, viewportWidth);
    this.renderSelectionBox(selectionBox, scrollX, scrollY);
    this.renderKeys(scrollY, hoverPitch, activePitches);
    this.renderHeader(scrollX, bpm, beatsPerMeasure);
    this.renderChordBar(chords, scrollX, beatsPerMeasure);
    this.renderVelocityEditor(notes, scrollX);
    this.renderVelocityPlayhead(playheadTicks, scrollX);
  }
}
