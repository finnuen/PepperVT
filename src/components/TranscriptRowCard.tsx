import React, { useState, useRef } from 'react';
import {
  Music,
  Film,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Download,
  Trash2,
  Play,
  Pause,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { MediaTranscriptItem, exportItemAsSrt } from '../utils/mediaHelpers';

interface TranscriptRowCardProps {
  item: MediaTranscriptItem;
  showTimestamps: boolean;
  initialBulletLimit?: number;
  onRemove: (id: string) => void;
}

export const TranscriptRowCard: React.FC<TranscriptRowCardProps> = ({
  item,
  showTimestamps,
  initialBulletLimit = 3,
  onRemove,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  const visibleSegments = expanded
    ? item.segments
    : item.segments.slice(0, initialBulletLimit);
  const hiddenCount = Math.max(0, item.segments.length - initialBulletLimit);

  const handleCopy = () => {
    if (item.segments.length === 0) return;
    const text = item.segments
      .map((s) => (showTimestamps ? `- [${s.start}] ${s.text}` : `- ${s.text}`))
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const togglePlayPreview = () => {
    if (!item.mediaObjectUrl) return;
    if (!mediaRef.current) {
      const el = document.createElement(item.mediaType === 'video' ? 'video' : 'audio');
      el.src = item.mediaObjectUrl;
      el.onended = () => setIsPlaying(false);
      mediaRef.current = el;
    }
    if (isPlaying) {
      mediaRef.current.pause();
      setIsPlaying(false);
    } else {
      mediaRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  const extLabel = (item.extension || (item.mediaType === 'video' ? 'mp4' : 'mp3')).toUpperCase();

  return (
    <div className="group py-5 first:pt-2 last:pb-2 border-b border-slate-200/90 dark:border-slate-800 last:border-b-0 transition-colors">
      <div className="flex flex-col sm:flex-row items-start gap-5">
        {/* Left Column: Rounded Thumbnail (Video Frame OR Music Extension Icon) */}
        <div className="shrink-0">
          <div
            onClick={item.mediaObjectUrl ? togglePlayPreview : undefined}
            title={
              item.mediaObjectUrl
                ? 'Click to play/pause media preview'
                : item.mediaType === 'video'
                ? `Video thumbnail (${item.fileName})`
                : `Audio file (.${extLabel})`
            }
            className={`relative w-24 h-28 sm:w-28 sm:h-32 rounded-2xl border-2 border-slate-300/90 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden flex flex-col items-center justify-center select-none transition-transform duration-150 ${
              item.mediaObjectUrl ? 'cursor-pointer hover:border-blue-600 dark:hover:border-blue-500' : ''
            }`}
          >
            {item.mediaType === 'video' && item.thumbnailDataUrl ? (
              <>
                <img
                  src={item.thumbnailDataUrl}
                  alt={item.fileName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent flex items-end justify-between p-2">
                  <span className="font-mono text-[10px] font-semibold text-white tracking-wider">
                    .{extLabel}
                  </span>
                  <Film className="w-3.5 h-3.5 text-white/90" />
                </div>
              </>
            ) : (
              /* Music Extension Icon for Audio files ("if not video, use music ext. icon") */
              <div className="w-full h-full bg-gradient-to-b from-slate-50 to-slate-100/90 dark:from-slate-800/90 dark:to-slate-900 flex flex-col items-center justify-center p-3 text-center">
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200/80 dark:border-blue-800/70 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-2">
                  <Music className="w-5 h-5 stroke-[2.2]" />
                </div>
                <span className="font-mono text-xs font-semibold tracking-wider text-slate-800 dark:text-slate-100">
                  .{extLabel}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                  AUDIO
                </span>
              </div>
            )}

            {/* Optional Play/Pause Overlay if user uploaded local file */}
            {item.mediaObjectUrl && (
              <div className="absolute inset-0 bg-slate-900/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-9 h-9 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-sm">
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-slate-900" />
                  ) : (
                    <Play className="w-4 h-4 fill-slate-900 ml-0.5" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: "filename.extension" + Underline + Bulleted Results + Chevron Dropdown */}
        <div className="flex-1 min-w-0 w-full">
          {/* Header Row: Filename + Unboxed Metadata + Actions */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 border-b border-slate-300 dark:border-slate-700/90">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
              <h3
                className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate max-w-md"
                title={item.folderPath ? `${item.folderPath}\\${item.fileName}` : item.fileName}
              >
                "{item.fileName}"
              </h3>

              {/* Clean unboxed metadata with typographic separators */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <span>{item.mediaType === 'video' ? 'Video' : 'Audio'}</span>
                <span aria-hidden="true">·</span>
                <span>{item.durationFormatted}</span>
                <span aria-hidden="true">·</span>
                <span>{item.fileSizeFormatted}</span>
                {item.status === 'completed' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.detectedLanguage}</span>
                  </>
                )}
              </div>
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {item.status === 'completed' && item.segments.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    title="Copy transcript to clipboard"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-700 dark:text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => exportItemAsSrt(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    title="Download .SRT subtitle file"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>.SRT</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md transition-colors cursor-pointer"
                title="Remove from list"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Result List Area */}
          <div className="mt-3">
            {item.status === 'transcribing' || item.status === 'queued' ? (
              <div className="py-3 flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                <span>
                  {item.status === 'queued'
                    ? 'Queued in batch pipeline...'
                    : `Transcribing audio stream with Whisper (${item.modelUsed})...`}
                </span>
              </div>
            ) : item.status === 'error' ? (
              <div className="py-2.5 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{item.errorMessage || 'Failed to transcribe file.'}</span>
              </div>
            ) : (
              <>
                <ul className="space-y-1.5 text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {visibleSegments.map((seg, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-slate-400 dark:text-slate-500 select-none font-mono">-</span>
                      {showTimestamps && (
                        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums mt-0.5 shrink-0">
                          [{seg.start}]
                        </span>
                      )}
                      <span className="text-slate-800 dark:text-slate-200 tracking-[0.005em]">{seg.text}</span>
                    </li>
                  ))}
                </ul>

                {/* Limit List + Chevron Dropdown ("v") to Show More */}
                {hiddenCount > 0 && (
                  <div className="mt-3 pt-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => !prev)}
                      aria-expanded={expanded}
                      className="group/btn inline-flex items-center gap-1.5 px-4 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover/btn:text-slate-900 dark:group-hover/btn:text-white transition-transform" />
                          <span>Show less</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover/btn:text-slate-900 dark:group-hover/btn:text-white transition-transform" />
                          <span>
                            Show {hiddenCount} more {hiddenCount === 1 ? 'line' : 'lines'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
