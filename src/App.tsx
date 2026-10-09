/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  FileVideo,
  FolderPlus,
  Mic,
  Square,
  Search,
  Download,
  Clock,
  FolderArchive,
  Code2,
  RotateCcw,
  Upload,
  Moon,
  Sun,
  Cpu
} from 'lucide-react';
import {
  MediaTranscriptItem,
  detectMediaType,
  extractAudioDuration,
  extractVideoMetadataAndThumbnail,
  fileToBase64,
  formatBytes,
  formatSeconds,
  getFileExtension,
  isSupportedMediaFile,
  exportAllTranscriptsTxt
} from './utils/mediaHelpers';
import { getInitialMediaItems } from './data/initialSamples';
import { TranscriptRowCard } from './components/TranscriptRowCard';
import { Win10ExeBuilderModal } from './components/Win10ExeBuilderModal';
import { APP_NAME, APP_VERSION, downloadWin10BuildKitZip } from './data/whisperWin10Package';

/**
 * Typical "Voice-to-Text" Icon on a Red Background (#DC2626):
 * Microphone on the left converting speech into text lines on the right.
 */
const VoiceToTextRedIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg
    viewBox="0 0 64 64"
    className={`${className} rounded-lg shrink-0 select-none shadow-2xs`}
    aria-hidden="true"
  >
    <rect width="64" height="64" rx="14" fill="#DC2626" />
    <rect x="14" y="13" width="14" height="22" rx="7" fill="#FFFFFF" />
    <path
      d="M10 24a11 11 0 0 0 22 0"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <line
      x1="21"
      y1="35"
      x2="21"
      y2="47"
      stroke="#FFFFFF"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <line
      x1="15"
      y1="47"
      x2="27"
      y2="47"
      stroke="#FFFFFF"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <rect x="36" y="17" width="16" height="3.5" rx="1.75" fill="#FFFFFF" />
    <rect x="36" y="25" width="13" height="3.5" rx="1.75" fill="#FEE2E2" />
    <rect x="36" y="33" width="17" height="3.5" rx="1.75" fill="#FFFFFF" />
    <rect x="36" y="41" width="11" height="3.5" rx="1.75" fill="#FEE2E2" />
  </svg>
);

export default function App() {
  const [items, setItems] = useState<MediaTranscriptItem[]>(() => getInitialMediaItems());
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'audio'>('all');
  const [selectedModel, setSelectedModel] = useState('turbo');
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isExeModalOpen, setIsExeModalOpen] = useState(false);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('peppervt_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {
      // ignore storage errors
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('peppervt_theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  // Live Voice Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Hidden inputs for "Add Video/Audio" and "Add Folder"
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const processAndTranscribeFile = async (file: File) => {
    const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mediaType = detectMediaType(file);
    const ext = getFileExtension(file.name) || (mediaType === 'video' ? 'mp4' : 'mp3');
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const folderPath = relPath.includes('/')
      ? relPath.slice(0, relPath.lastIndexOf('/'))
      : undefined;

    const objectUrl = URL.createObjectURL(file);

    const initialItem: MediaTranscriptItem = {
      id,
      fileName: file.name,
      extension: ext,
      folderPath,
      mediaType,
      fileSizeFormatted: formatBytes(file.size),
      durationFormatted: '00:00',
      mediaObjectUrl: objectUrl,
      status: 'transcribing',
      detectedLanguage: 'Detecting...',
      modelUsed: `${selectedModel} · CPU`,
      segments: [],
    };

    setItems((prev) => [initialItem, ...prev]);

    if (mediaType === 'video') {
      const { thumbnailDataUrl, durationFormatted } =
        await extractVideoMetadataAndThumbnail(file);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, thumbnailDataUrl, durationFormatted }
            : it
        )
      );
    } else {
      const durationFormatted = await extractAudioDuration(file);
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, durationFormatted } : it))
      );
    }

    try {
      const base64Data = await fileToBase64(file);
      const mimeType =
        file.type || (mediaType === 'video' ? 'video/mp4' : 'audio/mp3');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data,
          mimeType,
          fileName: file.name,
          modelSize: selectedModel,
          language: 'auto',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Transcription request failed');
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                status: 'completed',
                detectedLanguage: data.detectedLanguage || 'English',
                segments: data.segments || [],
              }
            : it
        )
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to transcribe media file.';
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                status: 'error',
                errorMessage: message,
              }
            : it
        )
      );
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const validFiles = Array.from(fileList).filter(isSupportedMediaFile);
    for (const file of validFiles) {
      await processAndTranscribeFile(file);
    }
  };

  const startOrStopRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      const startTime = Date.now();
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const timestamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
        const voiceFile = new File([blob], `voice_note_${timestamp}.webm`, {
          type: 'audio/webm',
        });
        await processAndTranscribeFile(voiceFile);
        setItems((prev) =>
          prev.map((it) =>
            it.fileName === voiceFile.name
              ? { ...it, durationFormatted: formatSeconds(elapsedSec), extension: 'wav' }
              : it
          )
        );
      };

      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setIsRecording(false);
    }
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (mediaFilter !== 'all' && item.mediaType !== mediaFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = item.fileName.toLowerCase().includes(q);
      const matchSegments = item.segments.some((s) =>
        s.text.toLowerCase().includes(q)
      );
      return matchName || matchSegments;
    });
  }, [items, mediaFilter, searchQuery]);

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 transition-colors"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        handleFilesSelected(e.dataTransfer.files);
      }}
    >
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          {APP_NAME} {APP_VERSION}
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#workspace"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Transcriber
          </a>
          <button
            type="button"
            onClick={() => setIsExeModalOpen(true)}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Source Analysis
          </button>
          <button
            type="button"
            onClick={() => setIsExeModalOpen(true)}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Win 10 & 11 .EXE Code
          </button>
          <button
            type="button"
            onClick={() => setItems(getInitialMediaItems())}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reset Demo Files
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => downloadWin10BuildKitZip()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>Download {APP_VERSION} Win 10/11 Kit</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main id="workspace" className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-7">
        {/* Hidden File & Folder Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,.mp4,.mkv,.mov,.avi,.webm,.mp3,.wav,.flac,.m4a,.ogg,.opus"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error webkitdirectory is standard across desktop browsers for folder selection
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Standalone Desktop Window Container (Modernized Reference Layout) */}
        <div
          className={`bg-white dark:bg-slate-900 border rounded-2xl transition-colors ${
            isDraggingOver
              ? 'border-red-600 ring-2 ring-red-500/20'
              : 'border-slate-200/90 dark:border-slate-800 shadow-xs'
          }`}
        >
          {/* Top Action Bar — Modernized from [ add video/audio ] [ add folder ] in Reference Image */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              {/* Typical Voice-to-Text Red Icon Badge */}
              <div className="flex items-center gap-2.5 pr-2">
                <VoiceToTextRedIcon className="w-9 h-9" />
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-none">
                    {APP_NAME}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1 leading-none">
                    {APP_VERSION}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileVideo className="w-4 h-4" />
                <span>Add Video / Audio</span>
              </button>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <span>Add Folder</span>
              </button>

              <button
                type="button"
                onClick={startOrStopRecording}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isRecording
                    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span className="font-mono tabular-nums">
                      Stop ({formatSeconds(recordingSeconds)})
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span>Record Voice</span>
                  </>
                )}
              </button>
            </div>

            {/* Right CPU Runtime Badge, Model, Dark Mode Toggle & Builder Quick Access */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                title="Universal CPU Runtime — saves ~2.5 GB and works on all Windows 10 & 11 PCs"
              >
                <Cpu className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                <span>CPU Runtime</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <select
                  id="whisper-model-select"
                  aria-label="Whisper Model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-red-600"
                >
                  <option value="turbo">Model: turbo</option>
                  <option value="large-v3">Model: large-v3</option>
                  <option value="medium">Model: medium</option>
                  <option value="small">Model: small</option>
                  <option value="base">Model: base</option>
                  <option value="tiny">Model: tiny</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsExeModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="View whisper-20250625 analysis and Windows 10/11 .exe builder code"
              >
                <Code2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                <span>.EXE Builder ({APP_VERSION})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDark((prev) => !prev)}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDark ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-600" />
                    <span>Dark</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Secondary Filter, Search & Export Toolbar */}
          <div className="px-6 py-3 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {/* Search input */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by filename or transcript text..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-red-600 dark:focus:border-red-500"
              />
            </div>

            {/* Interactive Segmented Filter + Timestamp Toggle + Batch Export */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
                {(['all', 'video', 'audio'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMediaFilter(type)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      mediaFilter === type
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {type === 'all' ? `All (${items.length})` : type}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowTimestamps((t) => !t)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showTimestamps
                    ? 'bg-red-50/80 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/80'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Timestamps</span>
              </button>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => exportAllTranscriptsTxt(items)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Export All (.TXT)</span>
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Results List ("add scroll" in reference image) */}
          <div className="px-6 py-4 max-h-[580px] overflow-y-auto custom-scrollbar">
            {filteredItems.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto mb-3 text-slate-500 dark:text-slate-400">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  No video or audio transcriptions in this view
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Click <strong>Add Video / Audio</strong>, select an entire directory with{' '}
                  <strong>Add Folder</strong>, or drag and drop media files anywhere into this window.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <FileVideo className="w-3.5 h-3.5" />
                    <span>Select Media Files</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems(getInitialMediaItems())}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Load Sample Files</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {filteredItems.map((item) => (
                  <TranscriptRowCard
                    key={item.id}
                    item={item}
                    showTimestamps={showTimestamps}
                    initialBulletLimit={3}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Quiet Bottom Bar with Version v.1.0 & Hardware Spec Status */}
          <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
              <span>{APP_NAME} {APP_VERSION}</span>
              <span aria-hidden="true">·</span>
              <span>Runtime: Universal CPU (Space-Optimized)</span>
              <span aria-hidden="true">·</span>
              <span>{filteredItems.length} files</span>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsExeModalOpen(true)}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium hover:underline whitespace-nowrap cursor-pointer"
              >
                Inspect {APP_VERSION} Windows 10 & 11 .EXE Source & Spec →
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Windows 10 & Windows 11 Standalone .EXE Builder & Source Code Analysis Modal */}
      <Win10ExeBuilderModal
        isOpen={isExeModalOpen}
        onClose={() => setIsExeModalOpen(false)}
      />
    </div>
  );
}
