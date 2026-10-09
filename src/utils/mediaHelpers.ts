export interface TranscriptSegment {
  start: string;
  end: string;
  text: string;
}

export interface MediaTranscriptItem {
  id: string;
  fileName: string;
  extension: string;
  folderPath?: string;
  mediaType: 'video' | 'audio';
  fileSizeFormatted: string;
  durationFormatted: string;
  thumbnailDataUrl?: string;
  mediaObjectUrl?: string;
  status: 'completed' | 'transcribing' | 'queued' | 'error';
  errorMessage?: string;
  detectedLanguage: string;
  modelUsed: string;
  segments: TranscriptSegment[];
}

const VIDEO_EXTS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'ogv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac', 'wma', 'opus', 'WeBM']);

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function isSupportedMediaFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  if (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext.toLowerCase())) return true;
  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return true;
  return false;
}

export function detectMediaType(file: File): 'video' | 'audio' {
  const ext = getFileExtension(file.name);
  if (VIDEO_EXTS.has(ext) || file.type.startsWith('video/')) {
    return 'video';
  }
  return 'audio';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 KB';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Extracts a real frame thumbnail & duration from a video file using an offscreen <video> + <canvas>.
 */
export function extractVideoMetadataAndThumbnail(
  file: File
): Promise<{ thumbnailDataUrl?: string; durationFormatted: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let resolved = false;
    const finish = (thumb?: string, dur = '00:00') => {
      if (resolved) return;
      resolved = true;
      URL.revokeObjectURL(url);
      resolve({ thumbnailDataUrl: thumb, durationFormatted: dur });
    };

    const timeout = window.setTimeout(() => {
      finish(undefined, '00:00');
    }, 6000);

    video.onloadedmetadata = () => {
      const dur = formatSeconds(video.duration);
      const targetTime = Math.min(1.2, Math.max(0.1, (video.duration || 2) * 0.25));
      video.currentTime = targetTime;

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = 240;
          const height = 280;
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const scale = Math.max(width / vw, height / vh);
            const sw = width / scale;
            const sh = height / scale;
            const sx = (vw - sw) / 2;
            const sy = (vh - sh) / 2;
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
            clearTimeout(timeout);
            finish(canvas.toDataURL('image/jpeg', 0.85), dur);
            return;
          }
        } catch {
          // ignore canvas error
        }
        clearTimeout(timeout);
        finish(undefined, dur);
      };
    };

    video.onerror = () => {
      clearTimeout(timeout);
      finish(undefined, '00:00');
    };

    video.src = url;
  });
}

export function extractAudioDuration(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const timeout = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve('00:00');
    }, 4000);

    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      const dur = formatSeconds(audio.duration);
      URL.revokeObjectURL(url);
      resolve(dur);
    };

    audio.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve('00:00');
    };

    audio.src = url;
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file into memory.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Generates a crisp procedural video frame thumbnail for pre-loaded sample video items
 */
export function createSampleVideoThumbnail(
  title: string,
  subtitle: string,
  accentHex: string
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Studio dark slate gradient background
  const grad = ctx.createLinearGradient(0, 0, 240, 280);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.6, '#1e293b');
  grad.addColorStop(1, accentHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 240, 280);

  // Subtle waveform / timeline bars inside the video frame
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  const heights = [28, 52, 38, 76, 60, 92, 44, 68, 84, 40, 56, 30];
  heights.forEach((h, i) => {
    const x = 26 + i * 16;
    const y = 135 - h / 2;
    ctx.fillRect(x, y, 8, h);
  });

  // Top timecode overlay
  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.fillRect(16, 16, 86, 24);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 11px "IBM Plex Mono", monospace';
  ctx.fillText('REC 1080P', 24, 32);

  // Bottom scrim + caption
  const scrim = ctx.createLinearGradient(0, 175, 0, 280);
  scrim.addColorStop(0, 'rgba(15, 23, 42, 0)');
  scrim.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 175, 240, 105);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(title, 18, 238);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillText(subtitle, 18, 258);

  return canvas.toDataURL('image/png');
}

export function exportItemAsSrt(item: MediaTranscriptItem): void {
  const lines: string[] = [];
  item.segments.forEach((seg, index) => {
    const startParts = seg.start.split(':');
    const endParts = seg.end.split(':');
    const sMin = startParts[0]?.padStart(2, '0') || '00';
    const sSec = startParts[1]?.padStart(2, '0') || '00';
    const eMin = endParts[0]?.padStart(2, '0') || '00';
    const eSec = endParts[1]?.padStart(2, '0') || '05';
    lines.push(`${index + 1}`);
    lines.push(`00:${sMin}:${sSec},000 --> 00:${eMin}:${eSec},000`);
    lines.push(seg.text.trim());
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const baseName = item.fileName.replace(/\.[^/.]+$/, '');
  a.href = url;
  a.download = `${baseName}.srt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAllTranscriptsTxt(items: MediaTranscriptItem[]): void {
  const blocks = items.map((item) => {
    const header = `"${item.fileName}" (${item.detectedLanguage} · ${item.durationFormatted})`;
    const sep = '-'.repeat(header.length);
    const body = item.segments.map((s) => `- [${s.start}] ${s.text}`).join('\n');
    return `${header}\n${sep}\n${body}`;
  });

  const blob = new Blob([blocks.join('\n\n\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'peppervt_v1.0_transcripts.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
