import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  FileCode,
  Terminal,
  Cpu,
  X,
  FolderArchive
} from 'lucide-react';
import {
  WHISPER_SOURCE_ANALYSIS,
  WIN10_GUI_PYTHON_CODE,
  PYINSTALLER_SPEC_CODE,
  WIN10_BUILD_BAT_CODE,
  WIN10_README_GUIDE,
  downloadWin10BuildKitZip,
  downloadBatFileOnly
} from '../data/whisperWin10Package';

interface Win10ExeBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CodeTab = 'analysis' | 'gui_py' | 'spec' | 'bat' | 'readme';

export const Win10ExeBuilderModal: React.FC<Win10ExeBuilderModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<CodeTab>('analysis');
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  const getTabContent = (tab: CodeTab): string => {
    switch (tab) {
      case 'gui_py':
        return WIN10_GUI_PYTHON_CODE;
      case 'spec':
        return PYINSTALLER_SPEC_CODE;
      case 'bat':
        return WIN10_BUILD_BAT_CODE;
      case 'readme':
        return WIN10_README_GUIDE;
      default:
        return '';
    }
  };

  const handleCopyCode = (tab: CodeTab) => {
    const content = getTabContent(tab);
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 1800);
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      await downloadWin10BuildKitZip();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Windows 10 & Windows 11 Standalone .EXE Builder & Source Analysis
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Analyzed from uploaded <span className="font-mono text-slate-700 dark:text-slate-300">whisper-20250625</span> source tree · PyInstaller single-file <span className="font-mono text-slate-700 dark:text-slate-300">WhisperStudio_Win10_Win11.exe</span> kit
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => downloadBatFileOnly()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Download only the fixed build_win10_11_exe.bat file (targets Python 3.11 64-bit)"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Download Fixed .BAT Only</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderArchive className="w-4 h-4" />
              <span>
                {downloading
                  ? 'Packaging ZIP...'
                  : 'Download Full Win 10/11 Kit (.zip)'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close window"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('analysis')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'analysis'
                ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>01. Source Code Analysis (whisper-20250625)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gui_py')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'gui_py'
                ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>02. whisper_gui_win10_11.py (Desktop GUI)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('spec')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'spec'
                ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>03. WhisperStudio.spec (PyInstaller)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bat')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'bat'
                ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>04. build_win10_11_exe.bat (1-Click Compiler)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('readme')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'readme'
                ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>05. Build Instructions</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white dark:bg-slate-900">
          {activeTab === 'analysis' ? (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Executive Summary of Uploaded Repository (<span className="font-mono">whisper-20250625</span>)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  The uploaded archive is OpenAI’s <span className="font-mono text-slate-800 dark:text-slate-200">openai-whisper</span> Python library (<span className="font-mono text-slate-800 dark:text-slate-200">__version__ = "20250625"</span>), which provides a command-line entry point (<span className="font-mono text-slate-800 dark:text-slate-200">whisper/__main__.py → transcribe.cli()</span>) but has <strong>no graphical user interface</strong> and <strong>cannot be compiled into a working Windows 10 or Windows 11 <span className="font-mono">.exe</span> out-of-the-box</strong> without packaging its <span className="font-mono">mel_filters.npz</span> / <span className="font-mono">.tiktoken</span> data files and patching windowed <span className="font-mono">stderr</span> & <span className="font-mono">ffmpeg</span> subprocess flags.
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <th className="py-3 px-4">Source Module</th>
                      <th className="py-3 px-4">Core Responsibility</th>
                      <th className="py-3 px-4">Windows 10 & Windows 11 .EXE Packaging Requirement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {WHISPER_SOURCE_ANALYSIS.map((mod, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3.5 px-4 align-top font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {mod.file}
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-sans mt-0.5">
                            {mod.role}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-top text-slate-600 dark:text-slate-300 leading-relaxed">
                          <div>{mod.summary}</div>
                          <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            Symbols: {mod.keySymbols}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-top text-slate-700 dark:text-slate-300 leading-relaxed">
                          {mod.win10ExePackagingNote}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {activeTab === 'gui_py' && 'whisper_gui_win10_11.py — Put in whisper-20250625/ root'}
                  {activeTab === 'spec' && 'WhisperStudio.spec — PyInstaller asset & hiddenimport manifest'}
                  {activeTab === 'bat' && 'build_win10_11_exe.bat — Double-click on Windows 10 or Windows 11 to compile .exe'}
                  {activeTab === 'readme' && 'BUILD_WINDOWS10_11_EXE.md — Step-by-step instructions'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(activeTab)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedTab === activeTab ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-400">Copied to Clipboard</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy File Contents</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto custom-scrollbar">
                <code>{getTabContent(activeTab)}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
