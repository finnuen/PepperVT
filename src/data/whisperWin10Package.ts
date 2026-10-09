import JSZip from 'jszip';

export interface SourceModuleAnalysis {
  file: string;
  role: string;
  keySymbols: string;
  win10ExePackagingNote: string;
  summary: string;
}

export const WHISPER_SOURCE_ANALYSIS: SourceModuleAnalysis[] = [
  {
    file: 'whisper/__init__.py & version.py',
    role: 'Model Registry & Checkpoint Loader (v20250625)',
    keySymbols: 'load_model(), _MODELS, _ALIGNMENT_HEADS, available_models()',
    win10ExePackagingNote: 'Downloads .pt weights to %USERPROFILE%\\.cache\\whisper or loads from local bundle directory using download_root on both Windows 10 & Windows 11.',
    summary: 'Defines SHA-256 verified URLs and alignment heads for tiny, base, small, medium, large-v1/v2/v3, and turbo (large-v3-turbo) models.'
  },
  {
    file: 'whisper/audio.py',
    role: '16kHz Audio Resampling & Log-Mel Spectrogram',
    keySymbols: 'load_audio(), pad_or_trim(), log_mel_spectrogram(), SAMPLE_RATE=16000, N_FFT=400, HOP_LENGTH=160',
    win10ExePackagingNote: 'Invokes ffmpeg subprocess for decoding audio/video streams and loads whisper/assets/mel_filters.npz via np.load(). Must bundle mel_filters.npz & CREATE_NO_WINDOW flag on Windows 10/11.',
    summary: 'Spawns ffmpeg to decode any video (.mp4, .mkv, .mov) or audio (.flac, .mp3, .wav) into 16kHz mono float32 waveform, then computes 80-channel or 128-channel log-Mel spectrograms.'
  },
  {
    file: 'whisper/model.py',
    role: 'Transformer Encoder-Decoder Architecture',
    keySymbols: 'Whisper, AudioEncoder, TextDecoder, ResidualAttentionBlock, MultiHeadAttention',
    win10ExePackagingNote: 'Uses PyTorch SDPA (scaled_dot_product_attention) when available; falls back cleanly to CPU float32 on Windows 10 & 11 machines without CUDA GPUs.',
    summary: 'Implements sinusoidal positional embeddings on 30-second audio windows (1500 frames) and causal cross-attention decoding over BPE tokens.'
  },
  {
    file: 'whisper/transcribe.py',
    role: 'Sliding-Window Transcription & Segment Generator',
    keySymbols: 'transcribe(), cli(), seek loop, compression_ratio_threshold, logprob_threshold',
    win10ExePackagingNote: 'CLI uses tqdm progress bars which crash PyInstaller --windowed builds when sys.stderr is None; GUI wrapper redirects stdout/stderr and sets verbose=False.',
    summary: 'Processes long video/audio files in 30-second sliding windows, applying temperature fallback (0.0 to 1.0), voice activity heuristics, and timestamp token parsing.'
  },
  {
    file: 'whisper/tokenizer.py & assets/*.tiktoken',
    role: 'Multilingual BPE Tokenizer (tiktoken)',
    keySymbols: 'get_tokenizer(), Tokenizer, LANGUAGES, gpt2.tiktoken, multilingual.tiktoken',
    win10ExePackagingNote: 'Reads base64 vocabulary files directly from whisper/assets/gpt2.tiktoken and multilingual.tiktoken. PyInstaller must include --add-data "whisper/assets;whisper/assets".',
    summary: 'Maps 99+ language codes and special timestamp tokens (<|0.00|> through <|30.00|>) without requiring external HuggingFace tokenizers.'
  },
  {
    file: 'whisper/timing.py & triton_ops.py',
    role: 'Dynamic Time Warping (DTW) Word Timestamps',
    keySymbols: 'add_word_timestamps(), find_alignment(), median_filter()',
    win10ExePackagingNote: 'triton_ops.py is optional (Linux CUDA only); timing.py automatically falls back to Numba/NumPy CPU DTW on Windows 10 & Windows 11.',
    summary: 'Extracts cross-attention weights across alignment heads to compute sub-second word-level timestamps and punctuation boundaries.'
  }
];

export const WIN10_GUI_PYTHON_CODE = `"""
Whisper Studio — Modern Windows 10 & Windows 11 Standalone Video/Voice-to-Text GUI
Built for whisper-20250625 source tree
Compatible with Windows 10 (1809+) and Windows 11 (21H2 / 22H2 / 23H2 / 24H2)
Supports:
  - Native Per-Monitor V2 HiDPI Scaling (Windows 10 & 11) + DWM Rounded Corners & Dark/Light Caption Styling
  - Add Video/Audio (multi-file dialog: .mp4, .mkv, .mov, .avi, .webm, .mp3, .wav, .flac, .m4a, .ogg)
  - Add Folder (recursive batch scan of all video & audio files in a directory)
  - Automatic Video Frame Thumbnail Extraction (via ffmpeg) + Music Extension Icon fallback for audio
  - Scrollable modern card list with 3-bullet preview limit & Chevron dropdown ("Show more / Show less")
  - Background threaded Whisper inference (prevents Windows 10/11 "Not Responding" window freeze)
"""

import os
import sys
import ctypes
import queue
import threading
import subprocess
import tempfile
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
from PIL import Image, ImageDraw

# ---------------------------------------------------------------------------
# CRITICAL WINDOWS 10 & WINDOWS 11 COMPATIBILITY & PYINSTALLER FIXES
# 1. In --windowed / --noconsole mode, sys.stdout and sys.stderr are None,
#    which causes whisper/transcribe.py tqdm & print calls to raise AttributeError.
# 2. Subprocess calls to ffmpeg must use CREATE_NO_WINDOW (0x08000000) so black
#    cmd.exe / conhost.exe / Windows Terminal windows do not flash on screen.
# 3. Enable Per-Monitor V2 DPI Awareness on Windows 10 & 11 for crisp text.
# 4. Apply Windows 10/11 DWM Dark/Light Caption & Windows 11 Rounded Corners.
# ---------------------------------------------------------------------------
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

if sys.platform == "win32":
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass

    _orig_popen = subprocess.Popen
    class _NoWindowPopen(_orig_popen):
        def __init__(self, *args, **kwargs):
            if "creationflags" not in kwargs:
                kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
            super().__init__(*args, **kwargs)
    subprocess.Popen = _NoWindowPopen


def apply_win10_win11_dwm_styling(hwnd: int, is_dark: bool = False):
    """
    Applies native DWM window attributes on Windows 10 and Windows 11.
    Supports Windows 10 (1809+) & Windows 11 Immersive Dark Mode titlebar (DWMWA_USE_IMMERSIVE_DARK_MODE = 20)
    and Windows 11 (Build >= 22000) native DWM rounded corners (DWMWCP_ROUND = 2).
    """
    if sys.platform != "win32":
        return
    try:
        win_build = sys.getwindowsversion().build
        DWMWA_USE_IMMERSIVE_DARK_MODE = 20
        dark_val = ctypes.c_int(1 if is_dark else 0)
        ctypes.windll.dwmapi.DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            ctypes.byref(dark_val),
            ctypes.sizeof(dark_val)
        )
        if win_build >= 22000:
            DWMWA_WINDOW_CORNER_PREFERENCE = 33
            preference = ctypes.c_int(2)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                ctypes.byref(preference),
                ctypes.sizeof(preference)
            )
            DWMWA_CAPTION_COLOR = 35
            caption_color = ctypes.c_int(0x001E140F if is_dark else 0x00FFFFFF)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd,
                DWMWA_CAPTION_COLOR,
                ctypes.byref(caption_color),
                ctypes.sizeof(caption_color)
            )
    except Exception:
        pass


# Ensure bundled ffmpeg & local whisper-20250625 source tree are discoverable
if getattr(sys, "frozen", False):
    BUNDLE_DIR = Path(sys._MEIPASS)
    os.environ["PATH"] = str(BUNDLE_DIR) + os.pathsep + os.environ.get("PATH", "")
else:
    BUNDLE_DIR = Path(__file__).resolve().parent
    # If placed next to whisper-20250625 subfolder, add it to sys.path automatically
    subfolder = BUNDLE_DIR / "whisper-20250625"
    if (subfolder / "whisper" / "__init__.py").exists():
        sys.path.insert(0, str(subfolder))
    elif (BUNDLE_DIR / "whisper" / "__init__.py").exists():
        sys.path.insert(0, str(BUNDLE_DIR))

import torch
import whisper

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".wmv", ".m4v"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".wma", ".opus"}
ALL_MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

INITIAL_BULLET_LIMIT = 3


def create_audio_extension_icon(ext_text: str, size=(96, 112), dark=False) -> Image.Image:
    """
    If not video, generates a crisp modern Music Extension Icon card (.MP3, .FLAC, .WAV)
    matching the wireframe specification ("if not video, use music ext. icon").
    """
    w, h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    bg_fill = (30, 41, 59, 255) if dark else (241, 245, 249, 255)
    border_col = (51, 65, 85, 255) if dark else (203, 213, 225, 255)
    note_col = (96, 165, 250, 255) if dark else (37, 99, 235, 255)
    pill_fill = (15, 23, 42, 255) if dark else (226, 232, 240, 255)
    txt_col = (241, 245, 249, 255) if dark else (30, 41, 59, 255)

    draw.rounded_rectangle((1, 1, w - 2, h - 2), radius=14, fill=bg_fill, outline=border_col, width=2)

    cx, cy = w // 2, h // 2 - 12
    draw.ellipse((cx - 16, cy + 4, cx - 4, cy + 14), fill=note_col)
    draw.ellipse((cx + 4, cy + 1, cx + 16, cy + 11), fill=note_col)
    draw.line((cx - 5, cy + 8, cx - 5, cy - 14), fill=note_col, width=3)
    draw.line((cx + 15, cy + 5, cx + 15, cy - 17), fill=note_col, width=3)
    draw.line((cx - 5, cy - 14, cx + 15, cy - 17), fill=note_col, width=4)

    clean_ext = ext_text.upper().lstrip(".")[:5] or "AUDIO"
    draw.rounded_rectangle((14, h - 32, w - 14, h - 12), radius=6, fill=pill_fill)
    draw.text((w // 2 - (len(clean_ext) * 3), h - 27), clean_ext, fill=txt_col)
    return img


def extract_video_thumbnail(video_path: Path, size=(96, 112)) -> Image.Image:
    """
    Extracts a real frame from a video file using ffmpeg and crops it into a rounded thumbnail.
    Falls back to an icon if ffmpeg cannot extract a frame.
    """
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_jpg = tmp.name
        cmd = [
            "ffmpeg", "-y", "-ss", "00:00:01.00",
            "-i", str(video_path),
            "-frames:v", "1", "-q:v", "2",
            tmp_jpg
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
        if os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 0:
            raw = Image.open(tmp_jpg).convert("RGBA")
            w, h = size
            raw.thumbnail((w * 2, h * 2), Image.Resampling.LANCZOS)
            rw, rh = raw.size
            left = max(0, (rw - w) // 2)
            top = max(0, (rh - h) // 2)
            cropped = raw.crop((left, top, left + w, top + h)).resize(size, Image.Resampling.LANCZOS)
            os.remove(tmp_jpg)
            return cropped
    except Exception:
        pass
    return create_audio_extension_icon(video_path.suffix, size=size)


class MediaRowCard(ctk.CTkFrame):
    """
    Individual row in the scrollable list:
    Left: Rounded Thumbnail (Video frame or Music Extension Icon)
    Right: "filename.extension" + horizontal divider + bulleted transcript results +
           dropdown chevron button ("v") when segments > INITIAL_BULLET_LIMIT.
    """
    def __init__(self, master, file_path: Path, **kwargs):
        super().__init__(
            master,
            fg_color=("#FFFFFF", "#0F172A"),
            corner_radius=12,
            border_width=1,
            border_color=("#E2E8F0", "#1E293B"),
            **kwargs
        )
        self.file_path = file_path
        self.segments = []
        self.expanded = False

        self.grid_columnconfigure(1, weight=1)

        ext = file_path.suffix.lower()
        is_video = ext in VIDEO_EXTENSIONS
        if is_video:
            vid_img = extract_video_thumbnail(file_path)
            self.ctk_thumb = ctk.CTkImage(light_image=vid_img, dark_image=vid_img, size=(96, 112))
        else:
            light_img = create_audio_extension_icon(ext, dark=False)
            dark_img = create_audio_extension_icon(ext, dark=True)
            self.ctk_thumb = ctk.CTkImage(light_image=light_img, dark_image=dark_img, size=(96, 112))

        self.thumb_label = ctk.CTkLabel(self, image=self.ctk_thumb, text="")
        self.thumb_label.grid(row=0, column=0, rowspan=4, padx=(18, 18), pady=18, sticky="nw")

        header_frame = ctk.CTkFrame(self, fg_color="transparent")
        header_frame.grid(row=0, column=1, padx=(0, 18), pady=(16, 4), sticky="ew")
        header_frame.grid_columnconfigure(0, weight=1)

        self.title_label = ctk.CTkLabel(
            header_frame,
            text=f'"{file_path.name}"',
            font=ctk.CTkFont(family="Segoe UI", size=15, weight="bold"),
            text_color=("#0F172A", "#F8FAFC"),
            anchor="w"
        )
        self.title_label.grid(row=0, column=0, sticky="w")

        self.status_label = ctk.CTkLabel(
            header_frame,
            text="Queued...",
            font=ctk.CTkFont(family="Consolas", size=12),
            text_color=("#64748B", "#94A3B8")
        )
        self.status_label.grid(row=0, column=1, padx=(8, 8))

        self.copy_btn = ctk.CTkButton(
            header_frame,
            text="Copy Text",
            width=84,
            height=28,
            fg_color=("#F1F5F9", "#1E293B"),
            hover_color=("#E2E8F0", "#334155"),
            text_color=("#334155", "#E2E8F0"),
            font=ctk.CTkFont(size=12, weight="bold"),
            command=self.copy_transcript
        )
        self.copy_btn.grid(row=0, column=2)

        divider = ctk.CTkFrame(self, height=1, fg_color=("#CBD5E1", "#334155"))
        divider.grid(row=1, column=1, padx=(0, 18), pady=(2, 8), sticky="ew")

        self.bullets_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.bullets_frame.grid(row=2, column=1, padx=(0, 18), pady=(0, 8), sticky="ew")
        self.bullets_frame.grid_columnconfigure(0, weight=1)

        self.placeholder_label = ctk.CTkLabel(
            self.bullets_frame,
            text="- Waiting for Whisper transcription engine...",
            font=ctk.CTkFont(family="Segoe UI", size=13),
            text_color=("#64748B", "#94A3B8"),
            anchor="w",
            justify="left"
        )
        self.placeholder_label.grid(row=0, column=0, sticky="w")

        self.dropdown_btn = ctk.CTkButton(
            self,
            text="▼  Show more",
            height=28,
            fg_color="transparent",
            hover_color=("#F1F5F9", "#1E293B"),
            text_color=("#2563EB", "#60A5FA"),
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            command=self.toggle_expand
        )

    def set_status(self, status_text: str):
        self.status_label.configure(text=status_text)

    def set_segments(self, segments: list, language: str = "en"):
        self.segments = segments
        self.status_label.configure(text=f"{language.upper()} · {len(segments)} segments")
        self.render_bullets()

    def render_bullets(self):
        for child in self.bullets_frame.winfo_children():
            child.destroy()

        if not self.segments:
            lbl = ctk.CTkLabel(
                self.bullets_frame,
                text="- (No speech segments detected in file)",
                font=ctk.CTkFont(family="Segoe UI", size=13),
                text_color=("#64748B", "#94A3B8"),
                anchor="w"
            )
            lbl.grid(row=0, column=0, sticky="w")
            self.dropdown_btn.grid_forget()
            return

        visible = self.segments if self.expanded else self.segments[:INITIAL_BULLET_LIMIT]
        for idx, seg in enumerate(visible):
            start_mm = int(seg.get("start", 0) // 60)
            start_ss = int(seg.get("start", 0) % 60)
            text_line = seg.get("text", "").strip()
            bullet_str = f"- [{start_mm:02d}:{start_ss:02d}]  {text_line}"
            lbl = ctk.CTkLabel(
                self.bullets_frame,
                text=bullet_str,
                font=ctk.CTkFont(family="Segoe UI", size=13),
                text_color=("#1E293B", "#E2E8F0"),
                anchor="w",
                justify="left",
                wraplength=680
            )
            lbl.grid(row=idx, column=0, pady=2, sticky="w")

        hidden_count = len(self.segments) - INITIAL_BULLET_LIMIT
        if hidden_count > 0:
            btn_text = "▲  Show less" if self.expanded else f"▼  Show {hidden_count} more segment{'s' if hidden_count > 1 else ''}"
            self.dropdown_btn.configure(text=btn_text)
            self.dropdown_btn.grid(row=3, column=1, padx=(0, 18), pady=(0, 12), sticky="ew")
        else:
            self.dropdown_btn.grid_forget()

    def toggle_expand(self):
        self.expanded = not self.expanded
        self.render_bullets()

    def copy_transcript(self):
        if not self.segments:
            return
        full_text = "\\n".join(f"- {s.get('text', '').strip()}" for s in self.segments)
        self.clipboard_clear()
        self.clipboard_append(full_text)
        self.copy_btn.configure(text="Copied!")
        self.after(1500, lambda: self.copy_btn.configure(text="Copy Text"))


class WhisperWindowsApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        os_tag = "Windows 11" if sys.platform == "win32" and sys.getwindowsversion().build >= 22000 else "Windows 10"
        self.title(f"Whisper Studio — Video & Voice to Text ({os_tag})")
        self.geometry("980x700")
        self.minsize(760, 520)
        self.is_dark_mode = False
        ctk.set_appearance_mode("light")
        self.configure(fg_color=("#F8FAFC", "#0B0F19"))

        self.after(100, lambda: apply_win10_win11_dwm_styling(self.winfo_id(), self.is_dark_mode))

        self.task_queue = queue.Queue()
        self.cards = []
        self.model = None
        self.current_model_name = tk.StringVar(value="base")

        top_bar = ctk.CTkFrame(
            self,
            fg_color=("#FFFFFF", "#0F172A"),
            corner_radius=0,
            height=68,
            border_width=1,
            border_color=("#E2E8F0", "#1E293B")
        )
        top_bar.pack(fill="x", side="top")

        btn_container = ctk.CTkFrame(top_bar, fg_color="transparent")
        btn_container.pack(pady=14, padx=24, fill="x")

        self.add_files_btn = ctk.CTkButton(
            btn_container,
            text="+ Add Video / Audio",
            width=180,
            height=40,
            corner_radius=8,
            fg_color=("#2563EB", "#2563EB"),
            hover_color=("#1D4ED8", "#3B82F6"),
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold"),
            command=self.add_video_audio_files
        )
        self.add_files_btn.pack(side="left", padx=(0, 12))

        self.add_folder_btn = ctk.CTkButton(
            btn_container,
            text="+ Add Folder",
            width=160,
            height=40,
            corner_radius=8,
            fg_color=("#FFFFFF", "#1E293B"),
            hover_color=("#F1F5F9", "#334155"),
            text_color=("#0F172A", "#F8FAFC"),
            border_width=1,
            border_color=("#CBD5E1", "#334155"),
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold"),
            command=self.add_folder
        )
        self.add_folder_btn.pack(side="left", padx=(0, 16))

        self.theme_btn = ctk.CTkButton(
            btn_container,
            text="Dark Mode",
            width=104,
            height=36,
            corner_radius=8,
            fg_color=("#F1F5F9", "#1E293B"),
            hover_color=("#E2E8F0", "#334155"),
            text_color=("#0F172A", "#F8FAFC"),
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            command=self.toggle_theme
        )
        self.theme_btn.pack(side="right", padx=(10, 0))

        self.model_menu = ctk.CTkOptionMenu(
            btn_container,
            variable=self.current_model_name,
            values=["tiny", "base", "small", "medium", "large-v3", "turbo"],
            width=130,
            height=36,
            fg_color=("#F1F5F9", "#1E293B"),
            button_color=("#E2E8F0", "#334155"),
            text_color=("#0F172A", "#F8FAFC")
        )
        self.model_menu.pack(side="right")

        ctk.CTkLabel(
            btn_container,
            text="Whisper Model:",
            font=ctk.CTkFont(family="Segoe UI", size=13),
            text_color=("#475569", "#94A3B8")
        ).pack(side="right", padx=(0, 8))

        self.scroll_frame = ctk.CTkScrollableFrame(
            self,
            fg_color=("#F8FAFC", "#0B0F19"),
            scrollbar_button_color=("#CBD5E1", "#334155"),
            scrollbar_button_hover_color=("#94A3B8", "#475569")
        )
        self.scroll_frame.pack(fill="both", expand=True, padx=24, pady=18)
        self.scroll_frame.grid_columnconfigure(0, weight=1)

        self.worker_thread = threading.Thread(target=self.transcription_worker, daemon=True)
        self.worker_thread.start()

    def toggle_theme(self):
        self.is_dark_mode = not self.is_dark_mode
        ctk.set_appearance_mode("dark" if self.is_dark_mode else "light")
        self.theme_btn.configure(text="Light Mode" if self.is_dark_mode else "Dark Mode")
        apply_win10_win11_dwm_styling(self.winfo_id(), self.is_dark_mode)

    def add_video_audio_files(self):
        exts = " ".join(f"*{e}" for e in sorted(ALL_MEDIA_EXTENSIONS))
        paths = filedialog.askopenfilenames(
            title="Select Video or Audio Files",
            filetypes=[("Media Files (Video & Audio)", exts), ("All Files", "*.*")]
        )
        for p in paths:
            self.enqueue_media_file(Path(p))

    def add_folder(self):
        folder = filedialog.askdirectory(title="Select Folder Containing Video/Audio Files")
        if not folder:
            return
        folder_path = Path(folder)
        found = [
            p for p in sorted(folder_path.rglob("*"))
            if p.is_file() and p.suffix.lower() in ALL_MEDIA_EXTENSIONS
        ]
        if not found:
            messagebox.showinfo("No Media Found", "No supported video or audio files were found in that folder.")
            return
        for p in found:
            self.enqueue_media_file(p)

    def enqueue_media_file(self, file_path: Path):
        card = MediaRowCard(self.scroll_frame, file_path)
        card.grid(row=len(self.cards), column=0, pady=(0, 14), sticky="ew")
        self.cards.append(card)
        self.task_queue.put(card)

    def transcription_worker(self):
        loaded_name = None
        while True:
            card: MediaRowCard = self.task_queue.get()
            try:
                target_model = self.current_model_name.get()
                if self.model is None or loaded_name != target_model:
                    self.after(0, lambda c=card, m=target_model: c.set_status(f"Loading {m} model..."))
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    self.model = whisper.load_model(target_model, device=device)
                    loaded_name = target_model

                self.after(0, lambda c=card: c.set_status("Transcribing..."))
                result = self.model.transcribe(str(card.file_path), verbose=False)
                segments = result.get("segments", [])
                lang = result.get("language", "en")
                self.after(0, lambda c=card, s=segments, l=lang: c.set_segments(s, l))
            except Exception as exc:
                err_msg = str(exc)
                self.after(0, lambda c=card, e=err_msg: c.set_status(f"Error: {e[:40]}"))
            finally:
                self.task_queue.task_done()


if __name__ == "__main__":
    app = WhisperWindowsApp()
    app.mainloop()
`;

export const PYINSTALLER_SPEC_CODE = `# -*- mode: python ; coding: utf-8 -*-
# WhisperStudio.spec — PyInstaller Configuration for Windows 10 & Windows 11 Standalone .exe
# Automatically locates whisper/assets whether extracted inside whisper-20250625/
# or alongside whisper-20250625/, or from installed openai-whisper package.

import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, copy_metadata

block_cipher = None

# 1. Auto-detect whisper source tree and assets directory
pathex = ['.']
whisper_assets = []

if os.path.exists('whisper/assets/mel_filters.npz'):
    whisper_assets = [
        ('whisper/assets/mel_filters.npz', 'whisper/assets'),
        ('whisper/assets/gpt2.tiktoken', 'whisper/assets'),
        ('whisper/assets/multilingual.tiktoken', 'whisper/assets'),
    ]
elif os.path.exists('whisper-20250625/whisper/assets/mel_filters.npz'):
    pathex.append('whisper-20250625')
    whisper_assets = [
        ('whisper-20250625/whisper/assets/mel_filters.npz', 'whisper/assets'),
        ('whisper-20250625/whisper/assets/gpt2.tiktoken', 'whisper/assets'),
        ('whisper-20250625/whisper/assets/multilingual.tiktoken', 'whisper/assets'),
    ]
else:
    whisper_assets = collect_data_files('whisper')

# 2. Optional: if ffmpeg.exe is placed in the project root, bundle it inside the .exe
binaries = []
if os.path.exists('ffmpeg.exe'):
    binaries.append(('ffmpeg.exe', '.'))

datas = whisper_assets + collect_data_files('customtkinter')
for pkg in ('tqdm', 'regex', 'tiktoken'):
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

a = Analysis(
    ['whisper_gui_win10_11.py'],
    pathex=pathex,
    binaries=binaries,
    datas=datas,
    hiddenimports=[
        'whisper',
        'whisper.audio',
        'whisper.decoding',
        'whisper.model',
        'whisper.timing',
        'whisper.tokenizer',
        'whisper.transcribe',
        'whisper.normalizers',
        'whisper.normalizers.english',
        'whisper.normalizers.basic',
        'tiktoken',
        'tiktoken_ext',
        'tiktoken_ext.openai_public',
        'PIL._tkinter_finder',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['triton', 'matplotlib', 'notebook', 'pytest'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='WhisperStudio_Win10_Win11',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Windowed GUI mode (no black command prompt window on Win 10 or Win 11)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
`;

export const WIN10_BUILD_BAT_CODE = `@echo off
REM ============================================================================
REM Keep window permanently open when double-clicked in Windows 10 / 11 Explorer
REM ============================================================================
if "%~1"=="" (
    cmd /k "%~f0" RUN
    exit /b
)

cd /d "%~dp0"
TITLE Whisper Studio - Windows 10 and Windows 11 Standalone EXE Builder

echo ============================================================================
echo   Whisper Studio - Windows 10 and Windows 11 Standalone EXE Compiler
echo   Working Folder: %CD%
echo ============================================================================
echo.

REM ----------------------------------------------------------------------------
REM 1. Detect Python 3.11 (64-bit) FIRST!
REM    Why: Python 3.14 does not yet have prebuilt wheels for numba/PyTorch,
REM    whereas Python 3.11 (64-bit) has official prebuilt wheels for every
REM    package in whisper-20250625. Also checks %LOCALAPPDATA% paths in case
REM    "Add Python to PATH" was not ticked in the installer.
REM ----------------------------------------------------------------------------
set "PY_CMD="

py -3.11 -c "import sys; print(sys.executable)" >nul 2>&1
if not errorlevel 1 set "PY_CMD=py -3.11"
if defined PY_CMD goto :FOUND_PYTHON

if exist "%LOCALAPPDATA%\\Programs\\Python\\Python311\\python.exe" (
    set "PY_CMD="%LOCALAPPDATA%\\Programs\\Python\\Python311\\python.exe""
    goto :FOUND_PYTHON
)

if exist "%ProgramFiles%\\Python311\\python.exe" (
    set "PY_CMD="%ProgramFiles%\\Python311\\python.exe""
    goto :FOUND_PYTHON
)

if exist "C:\\Python311\\python.exe" (
    set "PY_CMD="C:\\Python311\\python.exe""
    goto :FOUND_PYTHON
)

py -3.12 -c "import sys; print(sys.executable)" >nul 2>&1
if not errorlevel 1 set "PY_CMD=py -3.12"
if defined PY_CMD goto :FOUND_PYTHON

python -c "import sys; assert sys.version_info >= (3, 8)" >nul 2>&1
if not errorlevel 1 set "PY_CMD=python"
if defined PY_CMD goto :FOUND_PYTHON

py -3 -c "import sys; assert sys.version_info >= (3, 8)" >nul 2>&1
if not errorlevel 1 set "PY_CMD=py -3"
if defined PY_CMD goto :FOUND_PYTHON

if exist "%LOCALAPPDATA%\\Programs\\Python\\Python314\\python.exe" (
    set "PY_CMD="%LOCALAPPDATA%\\Programs\\Python\\Python314\\python.exe""
    goto :FOUND_PYTHON
)

echo [ERROR] Could not find Python 3.11 in PATH or %LOCALAPPDATA%\\Programs\\Python.
echo.
pause
exit /b 1

:FOUND_PYTHON
echo [OK] Using Python interpreter: %PY_CMD%
%PY_CMD% --version
echo.

REM 2. Create isolated Python 3.11 virtual environment (.venv_py311)
if exist ".venv_py311\\Scripts\\python.exe" goto :VENV_READY
echo [Step 1/4] Creating Python 3.11 virtual environment in .venv_py311 ...
%PY_CMD% -m venv .venv_py311
if not exist ".venv_py311\\Scripts\\python.exe" (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)

:VENV_READY
set "VENV_PY=%~dp0.venv_py311\\Scripts\\python.exe"
set "VENV_PIP=%~dp0.venv_py311\\Scripts\\pip.exe"
set "VENV_PYINSTALLER=%~dp0.venv_py311\\Scripts\\pyinstaller.exe"

echo [Step 2/4] Installing Whisper, CustomTkinter, Pillow, and PyInstaller into .venv_py311 ...
"%VENV_PY%" -m pip install --upgrade pip setuptools wheel

REM Auto-detect whether script is inside whisper-20250625, next to it, or standalone
if exist "whisper\\__init__.py" goto :INSTALL_LOCAL_CURRENT
if exist "whisper-20250625\\whisper\\__init__.py" goto :INSTALL_LOCAL_SUBDIR
goto :INSTALL_PYPI_WHISPER

:INSTALL_LOCAL_CURRENT
echo [OK] Found whisper source tree in current directory.
if exist "requirements.txt" "%VENV_PIP%" install -r requirements.txt
"%VENV_PIP%" install --no-build-isolation -e .
goto :INSTALL_GUI_DEPS

:INSTALL_LOCAL_SUBDIR
echo [OK] Found whisper-20250625 source tree in subfolder.
if exist "whisper-20250625\\requirements.txt" "%VENV_PIP%" install -r "whisper-20250625\\requirements.txt"
"%VENV_PIP%" install --no-build-isolation -e "whisper-20250625"
goto :INSTALL_GUI_DEPS

:INSTALL_PYPI_WHISPER
echo [OK] Installing openai-whisper package...
"%VENV_PIP%" install openai-whisper

:INSTALL_GUI_DEPS
"%VENV_PIP%" install customtkinter pillow pyinstaller
if errorlevel 1 (
    echo [ERROR] Package installation failed. Check the messages above.
    pause
    exit /b 1
)

REM 3. Check for ffmpeg.exe
where ffmpeg >nul 2>&1
if not errorlevel 1 goto :FFMPEG_OK
if exist "ffmpeg.exe" goto :FFMPEG_OK
echo.
echo [NOTE] ffmpeg.exe was not detected in PATH or current folder.
echo Attempting to install FFmpeg via Windows Package Manager...
winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements >nul 2>&1

:FFMPEG_OK
echo.
echo [Step 3/4] Compiling standalone dist\\WhisperStudio_Win10_Win11.exe ...
if exist "WhisperStudio.spec" (
    "%VENV_PYINSTALLER%" --clean --noconfirm WhisperStudio.spec
) else (
    "%VENV_PYINSTALLER%" --clean --noconfirm --onefile --windowed --name WhisperStudio_Win10_Win11 --collect-all whisper --collect-all customtkinter --hidden-import tiktoken_ext.openai_public whisper_gui_win10_11.py
)

echo.
if exist "dist\\WhisperStudio_Win10_Win11.exe" goto :BUILD_SUCCESS
echo [ERROR] Build did not produce dist\\WhisperStudio_Win10_Win11.exe.
echo Review the log messages above for details.
pause
exit /b 1

:BUILD_SUCCESS
echo ============================================================================
echo [Step 4/4] BUILD SUCCESSFUL!
echo Standalone Windows 10 and 11 EXE created at:
echo   %~dp0dist\\WhisperStudio_Win10_Win11.exe
echo ============================================================================
explorer.exe /select,"%~dp0dist\\WhisperStudio_Win10_Win11.exe"
pause
`;

export const WIN10_README_GUIDE = `# Whisper Studio — Windows 10 & Windows 11 Standalone \`.exe\` Build Kit

This package turns your **\`whisper-20250625\`** repository into a modern, standalone Windows 10 and Windows 11 desktop application (\`WhisperStudio_Win10_Win11.exe\`) modelled on your reference UI layout.

## Why \`build_win10_11_exe.bat\` Was Closing Immediately (And How It Is Fixed)

1. **Windows \`cmd.exe\` Parenthesis Parsing & CRLF Line Endings**:
   - In Windows Batch (\`.bat\`), any \`echo\` statement containing parentheses \`( )\` inside an \`if ( ... )\` block prematurely terminates the \`if\` block with a fatal syntax error before \`pause\` is ever reached.
   - Additionally, \`.bat\` files must use Windows \`CRLF\` (\`\\r\\n\`) line endings.
   - **Fix Applied**: \`build_win10_11_exe.bat\` now starts with a self-relaunching \`cmd /k "%~f0" RUN\` wrapper (guaranteeing the console window stays open no matter what), uses \`goto\` labels instead of nested parenthesis blocks, and is packaged with strict \`CRLF\` (\`\\r\\n\`) line endings.
2. **Works From Any Folder Layout**:
   - Whether you extract the kit **inside** \`whisper-20250625\\\`, **next to** \`whisper-20250625\\\`, or in an empty folder, the builder automatically locates the \`whisper\` source tree and \`whisper/assets/\` files.

## How to Build \`WhisperStudio_Win10_Win11.exe\` (1-Click)

1. Extract \`WhisperStudio_Win10_Win11_Standalone_Kit.zip\` into your \`whisper-20250625\` folder.
2. Double-click **\`build_win10_11_exe.bat\`**.
3. The command window will stay open, create \`.venv_win\`, install dependencies, and open Windows Explorer highlighting **\`dist\\WhisperStudio_Win10_Win11.exe\`** when finished.
`;

function toWindowsCrLf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

export function downloadBatFileOnly(): void {
  const crlfBat = toWindowsCrLf(WIN10_BUILD_BAT_CODE);
  const blob = new Blob([crlfBat], { type: 'application/x-bat;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'build_win10_11_exe.bat';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadWin10BuildKitZip(): Promise<void> {
  const zip = new JSZip();
  zip.file('whisper_gui_win10_11.py', toWindowsCrLf(WIN10_GUI_PYTHON_CODE));
  zip.file('WhisperStudio.spec', toWindowsCrLf(PYINSTALLER_SPEC_CODE));
  zip.file('build_win10_11_exe.bat', toWindowsCrLf(WIN10_BUILD_BAT_CODE));
  zip.file('BUILD_WINDOWS10_11_EXE.md', toWindowsCrLf(WIN10_README_GUIDE));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'WhisperStudio_Win10_Win11_Standalone_Kit.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
