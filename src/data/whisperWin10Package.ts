import JSZip from 'jszip';

export const APP_VERSION = 'v.1.0';

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
    role: 'Model Registry & Checkpoint Loader (v20250625 → App v.1.0)',
    keySymbols: 'load_model(name, device), _MODELS, _ALIGNMENT_HEADS, available_models()',
    win10ExePackagingNote: 'Loads model weights onto "cuda" (NVIDIA GPU with FP16 Tensor Cores) when available, or "cpu" (FP32) fallback on Windows 10 & Windows 11.',
    summary: 'Defines SHA-256 verified URLs and alignment heads for tiny, base, small, medium, large-v1/v2/v3, and turbo (large-v3-turbo) models.'
  },
  {
    file: 'whisper/audio.py',
    role: '16kHz Audio Resampling & Log-Mel Spectrogram',
    keySymbols: 'load_audio(), pad_or_trim(), log_mel_spectrogram(), SAMPLE_RATE=16000, N_FFT=400, HOP_LENGTH=160',
    win10ExePackagingNote: 'Invokes ffmpeg subprocess for decoding audio/video streams and computes STFT on GPU/CPU using whisper/assets/mel_filters.npz.',
    summary: 'Spawns ffmpeg to decode any video (.mp4, .mkv, .mov) or audio (.flac, .mp3, .wav) into 16kHz mono float32 waveform, then computes 80-channel or 128-channel log-Mel spectrograms.'
  },
  {
    file: 'whisper/model.py',
    role: 'Transformer Encoder-Decoder Architecture (CUDA / CPU)',
    keySymbols: 'Whisper, AudioEncoder, TextDecoder, ResidualAttentionBlock, MultiHeadAttention',
    win10ExePackagingNote: 'On NVIDIA GPUs, build_win10_11_exe.bat installs PyTorch with CUDA (cu121) so scaled_dot_product_attention & FP16 run on GPU hardware.',
    summary: 'Implements sinusoidal positional embeddings on 30-second audio windows (1500 frames) and causal cross-attention decoding over BPE tokens.'
  },
  {
    file: 'whisper/transcribe.py',
    role: 'Sliding-Window Transcription & Segment Generator',
    keySymbols: 'transcribe(model, audio, fp16=...), cli(), seek loop',
    win10ExePackagingNote: 'Automatically sets fp16=True when running on NVIDIA CUDA for up to 4x faster transcription, and fp16=False on CPU to avoid warnings.',
    summary: 'Processes long video/audio files in 30-second sliding windows, applying temperature fallback (0.0 to 1.0), voice activity heuristics, and timestamp token parsing.'
  },
  {
    file: 'whisper/tokenizer.py & assets/*.tiktoken',
    role: 'Multilingual BPE Tokenizer (tiktoken)',
    keySymbols: 'get_tokenizer(), Tokenizer, LANGUAGES, gpt2.tiktoken, multilingual.tiktoken',
    win10ExePackagingNote: 'Reads base64 vocabulary files directly from whisper/assets/gpt2.tiktoken and multilingual.tiktoken bundled via PyInstaller.',
    summary: 'Maps 99+ language codes and special timestamp tokens (<|0.00|> through <|30.00|>) without requiring external HuggingFace tokenizers.'
  },
  {
    file: 'whisper/timing.py & triton_ops.py',
    role: 'Dynamic Time Warping (DTW) Word Timestamps',
    keySymbols: 'add_word_timestamps(), find_alignment(), median_filter()',
    win10ExePackagingNote: 'triton_ops.py is excluded on Windows; timing.py uses fast Numba/PyTorch tensor operations on CUDA or CPU.',
    summary: 'Extracts cross-attention weights across alignment heads to compute sub-second word-level timestamps and punctuation boundaries.'
  }
];

export const WIN10_GUI_PYTHON_CODE = `"""
Whisper Studio v.1.0 — Modern Windows 10 & Windows 11 Standalone Video/Voice-to-Text GUI
Built for whisper-20250625 source tree
Features:
  - Version: v.1.0
  - Custom Red Voice-to-Text Application Icon (app_icon.ico + runtime window & taskbar icon)
  - NVIDIA CUDA Hardware Acceleration (auto-detects NVIDIA GPU, enables FP16 + TF32/cuDNN benchmark, with CPU fallback)
  - Native Per-Monitor V2 HiDPI Scaling (Windows 10 & 11) + DWM Rounded Corners & Dark/Light Caption Styling
  - Add Video/Audio & Add Folder batch transcription with 3-bullet limit + Chevron dropdown ("Show more / Show less")
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

APP_VERSION = "v.1.0"

# ---------------------------------------------------------------------------
# CRITICAL WINDOWS 10 & WINDOWS 11 COMPATIBILITY & PYINSTALLER FIXES
# ---------------------------------------------------------------------------
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

if sys.platform == "win32":
    # Set unique AppUserModelID so Windows 10/11 Taskbar displays our custom Red Voice-to-Text icon
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("whisperstudio.voice2text.v1_0")
    except Exception:
        pass

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
    subfolder = BUNDLE_DIR / "whisper-20250625"
    if (subfolder / "whisper" / "__init__.py").exists():
        sys.path.insert(0, str(subfolder))
    elif (BUNDLE_DIR / "whisper" / "__init__.py").exists():
        sys.path.insert(0, str(BUNDLE_DIR))

import torch
import whisper

# Enable NVIDIA CUDA hardware optimizations when an NVIDIA GPU is available
if torch.cuda.is_available():
    try:
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    except Exception:
        pass

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".wmv", ".m4v"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".wma", ".opus"}
ALL_MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

INITIAL_BULLET_LIMIT = 3


def create_voice_to_text_red_icon(size: int = 256) -> Image.Image:
    """
    Generates a crisp 'Voice-to-Text' icon on a Red background (#DC2626):
    - Rounded red square badge
    - White studio microphone capsule + stand on the left/center
    - White speech/text lines on the right representing voice-to-text conversion
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 256.0

    # Red rounded background (#DC2626) with subtle inner border (#EF4444)
    pad = int(8 * s)
    radius = int(56 * s)
    draw.rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=radius,
        fill=(220, 38, 38, 255),
        outline=(248, 113, 113, 255),
        width=max(1, int(4 * s))
    )

    white = (255, 255, 255, 255)
    soft_white = (254, 226, 226, 255)

    # Microphone capsule (left-center)
    mx1, my1, mx2, my2 = int(54 * s), int(52 * s), int(110 * s), int(136 * s)
    draw.rounded_rectangle((mx1, my1, mx2, my2), radius=int(28 * s), fill=white)

    # Microphone U-cradle arc
    arc_pad = int(14 * s)
    stroke_w = max(2, int(10 * s))
    draw.arc(
        (mx1 - arc_pad, int(76 * s), mx2 + arc_pad, int(156 * s)),
        start=0,
        end=180,
        fill=white,
        width=stroke_w
    )

    # Microphone stem & base
    cx = (mx1 + mx2) // 2
    draw.line((cx, int(156 * s), cx, int(196 * s)), fill=white, width=stroke_w)
    draw.rounded_rectangle(
        (cx - int(28 * s), int(192 * s), cx + int(28 * s), int(204 * s)),
        radius=int(6 * s),
        fill=white
    )

    # Voice-to-Text document/transcript lines on the right side
    lx1 = int(138 * s)
    line_h = max(2, int(12 * s))
    for idx, (ly, lx2) in enumerate([
        (int(68 * s), int(206 * s)),
        (int(98 * s), int(194 * s)),
        (int(128 * s), int(208 * s)),
        (int(158 * s), int(182 * s)),
    ]):
        draw.rounded_rectangle(
            (lx1, ly, lx2, ly + line_h),
            radius=int(6 * s),
            fill=white if idx % 2 == 0 else soft_white
        )

    return img


def save_ico_file(ico_path: Path):
    """Saves the multi-size Windows .ico file used by PyInstaller and the window frame."""
    base_img = create_voice_to_text_red_icon(256)
    base_img.save(
        str(ico_path),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )


def create_audio_extension_icon(ext_text: str, size=(96, 112), dark=False) -> Image.Image:
    """
    If not video, generates a crisp modern Audio / Voice Extension Icon card (.MP3, .FLAC, .WAV)
    with a red badge accent.
    """
    w, h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    bg_fill = (30, 41, 59, 255) if dark else (241, 245, 249, 255)
    border_col = (51, 65, 85, 255) if dark else (203, 213, 225, 255)
    note_col = (248, 113, 113, 255) if dark else (220, 38, 38, 255)
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


def get_hardware_summary() -> tuple[str, str]:
    """
    Returns (default_device, human_label) based on whether NVIDIA CUDA is available.
    """
    if torch.cuda.is_available():
        try:
            gpu_name = torch.cuda.get_device_name(0)
            return "cuda", f"CUDA ({gpu_name})"
        except Exception:
            return "cuda", "CUDA (NVIDIA GPU)"
    return "cpu", "CPU Runtime"


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
            text_color=("#DC2626", "#F87171"),
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            command=self.toggle_expand
        )

    def set_status(self, status_text: str):
        self.status_label.configure(text=status_text)

    def set_segments(self, segments: list, language: str = "en", device_used: str = "cpu"):
        self.segments = segments
        accel_tag = "CUDA" if device_used == "cuda" else "CPU"
        self.status_label.configure(text=f"{language.upper()} · {len(segments)} segments · {accel_tag}")
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
        self.default_device, self.hw_label = get_hardware_summary()
        self.title(f"Whisper Studio {APP_VERSION} — Video & Voice to Text ({os_tag} · {self.hw_label})")
        self.geometry("1020x720")
        self.minsize(780, 520)
        self.is_dark_mode = False
        ctk.set_appearance_mode("light")
        self.configure(fg_color=("#F8FAFC", "#0B0F19"))

        # Set Red Voice-to-Text Window & Taskbar Icon
        self._apply_window_icon()
        self.after(100, lambda: apply_win10_win11_dwm_styling(self.winfo_id(), self.is_dark_mode))

        self.task_queue = queue.Queue()
        self.cards = []
        self.model = None
        self.loaded_model_key = None
        self.current_model_name = tk.StringVar(value="base")
        self.current_device_mode = tk.StringVar(
            value="CUDA (NVIDIA GPU)" if self.default_device == "cuda" else "CPU Runtime"
        )

        # Top Action Bar: Brand Icon + [ Add Video/Audio ] + [ Add Folder ] + CUDA/CPU + Model + Dark Mode
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

        # Red Voice-to-Text Brand Icon badge inside header
        brand_pil = create_voice_to_text_red_icon(64)
        self.brand_ctk_icon = ctk.CTkImage(light_image=brand_pil, dark_image=brand_pil, size=(34, 34))
        self.brand_badge = ctk.CTkLabel(
            btn_container,
            image=self.brand_ctk_icon,
            text=f"  Whisper Studio {APP_VERSION}",
            compound="left",
            font=ctk.CTkFont(family="Segoe UI", size=15, weight="bold"),
            text_color=("#0F172A", "#F8FAFC")
        )
        self.brand_badge.pack(side="left", padx=(0, 18))

        self.add_files_btn = ctk.CTkButton(
            btn_container,
            text="+ Add Video / Audio",
            width=172,
            height=40,
            corner_radius=8,
            fg_color=("#DC2626", "#DC2626"),
            hover_color=("#B91C1C", "#EF4444"),
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            command=self.add_video_audio_files
        )
        self.add_files_btn.pack(side="left", padx=(0, 10))

        self.add_folder_btn = ctk.CTkButton(
            btn_container,
            text="+ Add Folder",
            width=144,
            height=40,
            corner_radius=8,
            fg_color=("#FFFFFF", "#1E293B"),
            hover_color=("#F1F5F9", "#334155"),
            text_color=("#0F172A", "#F8FAFC"),
            border_width=1,
            border_color=("#CBD5E1", "#334155"),
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            command=self.add_folder
        )
        self.add_folder_btn.pack(side="left", padx=(0, 12))

        self.theme_btn = ctk.CTkButton(
            btn_container,
            text="Dark Mode",
            width=96,
            height=36,
            corner_radius=8,
            fg_color=("#F1F5F9", "#1E293B"),
            hover_color=("#E2E8F0", "#334155"),
            text_color=("#0F172A", "#F8FAFC"),
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            command=self.toggle_theme
        )
        self.theme_btn.pack(side="right", padx=(8, 0))

        self.model_menu = ctk.CTkOptionMenu(
            btn_container,
            variable=self.current_model_name,
            values=["tiny", "base", "small", "medium", "large-v3", "turbo"],
            width=116,
            height=36,
            fg_color=("#F1F5F9", "#1E293B"),
            button_color=("#E2E8F0", "#334155"),
            text_color=("#0F172A", "#F8FAFC")
        )
        self.model_menu.pack(side="right", padx=(6, 0))

        # Hardware Acceleration Selector (NVIDIA CUDA vs CPU)
        device_options = ["CUDA (NVIDIA GPU)", "CPU Runtime"] if torch.cuda.is_available() else ["CPU Runtime"]
        self.device_menu = ctk.CTkOptionMenu(
            btn_container,
            variable=self.current_device_mode,
            values=device_options,
            width=155,
            height=36,
            fg_color=("#FEF2F2", "#1E293B") if torch.cuda.is_available() else ("#F1F5F9", "#1E293B"),
            button_color=("#FECACA", "#334155") if torch.cuda.is_available() else ("#E2E8F0", "#334155"),
            text_color=("#991B1B", "#F8FAFC") if torch.cuda.is_available() else ("#0F172A", "#F8FAFC")
        )
        self.device_menu.pack(side="right", padx=(6, 0))

        # Scrollable Main List Container
        self.scroll_frame = ctk.CTkScrollableFrame(
            self,
            fg_color=("#F8FAFC", "#0B0F19"),
            scrollbar_button_color=("#CBD5E1", "#334155"),
            scrollbar_button_hover_color=("#94A3B8", "#475569")
        )
        self.scroll_frame.pack(fill="both", expand=True, padx=24, pady=(16, 8))
        self.scroll_frame.grid_columnconfigure(0, weight=1)

        # Bottom Status Bar showing Version & Hardware Acceleration
        status_bar = ctk.CTkFrame(
            self,
            fg_color=("#FFFFFF", "#0F172A"),
            corner_radius=0,
            height=32,
            border_width=1,
            border_color=("#E2E8F0", "#1E293B")
        )
        status_bar.pack(fill="x", side="bottom")
        hw_status_text = (
            f"Whisper Studio {APP_VERSION}  ·  Hardware Acceleration: {self.hw_label}  ·  "
            f"{'FP16 Tensor Core Accelerated' if self.default_device == 'cuda' else 'FP32 Multi-Thread CPU'}"
        )
        ctk.CTkLabel(
            status_bar,
            text=hw_status_text,
            font=ctk.CTkFont(family="Consolas", size=11),
            text_color=("#64748B", "#94A3B8")
        ).pack(side="left", padx=24, pady=4)

        self.worker_thread = threading.Thread(target=self.transcription_worker, daemon=True)
        self.worker_thread.start()

    def _apply_window_icon(self):
        try:
            ico_path = BUNDLE_DIR / "app_icon.ico"
            if not ico_path.exists():
                ico_path = Path(tempfile.gettempdir()) / "whisper_studio_v1_0.ico"
                save_ico_file(ico_path)
            if sys.platform == "win32" and ico_path.exists():
                self.iconbitmap(default=str(ico_path))
        except Exception:
            pass

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
        while True:
            card: MediaRowCard = self.task_queue.get()
            try:
                target_model = self.current_model_name.get()
                wants_cuda = "CUDA" in self.current_device_mode.get() and torch.cuda.is_available()
                device = "cuda" if wants_cuda else "cpu"
                model_key = f"{target_model}:{device}"

                if self.model is None or self.loaded_model_key != model_key:
                    accel_str = "NVIDIA CUDA" if device == "cuda" else "CPU"
                    self.after(0, lambda c=card, m=target_model, a=accel_str: c.set_status(f"Loading {m} on {a}..."))
                    self.model = whisper.load_model(target_model, device=device)
                    self.loaded_model_key = model_key

                self.after(0, lambda c=card, d=device: c.set_status(f"Transcribing ({d.upper()})..."))
                result = self.model.transcribe(
                    str(card.file_path),
                    verbose=False,
                    fp16=(device == "cuda")
                )
                segments = result.get("segments", [])
                lang = result.get("language", "en")
                self.after(0, lambda c=card, s=segments, l=lang, d=device: c.set_segments(s, l, d))
            except Exception as exc:
                err_msg = str(exc)
                self.after(0, lambda c=card, e=err_msg: c.set_status(f"Error: {e[:40]}"))
            finally:
                self.task_queue.task_done()


if __name__ == "__main__":
    # Support "--generate-icon" CLI flag called by build_win10_11_exe.bat before PyInstaller runs
    if "--generate-icon" in sys.argv:
        save_ico_file(Path("app_icon.ico"))
        sys.exit(0)
    app = WhisperWindowsApp()
    app.mainloop()
`;

export const PYINSTALLER_SPEC_CODE = `# -*- mode: python ; coding: utf-8 -*-
# WhisperStudio.spec — PyInstaller Configuration for Whisper Studio v.1.0 (Windows 10 & Windows 11)
# Bundles Red Voice-to-Text app_icon.ico and whisper-20250625/whisper/assets

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

# Bundle generated Red Voice-to-Text app_icon.ico inside _MEIPASS as well
if os.path.exists('app_icon.ico'):
    whisper_assets.append(('app_icon.ico', '.'))

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
    name='WhisperStudio_v1.0',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Windowed GUI mode
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='app_icon.ico' if os.path.exists('app_icon.ico') else None,
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
TITLE Whisper Studio v.1.0 - Windows 10 and Windows 11 Standalone EXE Builder

echo ============================================================================
echo   Whisper Studio v.1.0 - Windows 10 and Windows 11 Standalone EXE Compiler
echo   Working Folder: %CD%
echo ============================================================================
echo.

REM ----------------------------------------------------------------------------
REM STEP 0: CHECK USER HARDWARE SPECS BEFORE RUNNING ANYTHING
REM Detects CPU, RAM, and GPU. If an NVIDIA GPU is detected, automatically
REM selects the NVIDIA CUDA runtime; otherwise selects the CPU runtime.
REM ----------------------------------------------------------------------------
echo [Pre-Flight] Checking system hardware specifications...
set "USE_CUDA=0"
set "GPU_NAME=Standard Display Adapter"

REM Method 1: Check nvidia-smi directly
where nvidia-smi >nul 2>&1
if not errorlevel 1 (
    for /f "usebackq tokens=*" %%G in (\`nvidia-smi --query-gpu=name --format=csv,noheader 2^>nul\`) do (
        set "GPU_NAME=%%G"
        set "USE_CUDA=1"
    )
)

if "%USE_CUDA%"=="1" goto :SPECS_DETECTED

REM Method 2: Query Windows CIM / WMI VideoController for NVIDIA GPU
for /f "usebackq tokens=*" %%G in (\`powershell -NoProfile -Command "$g = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' } | Select-Object -First 1 -ExpandProperty Name; if ($g) { Write-Output $g }" 2^>nul\`) do (
    set "GPU_NAME=%%G"
    set "USE_CUDA=1"
)

if "%USE_CUDA%"=="1" goto :SPECS_DETECTED

for /f "usebackq tokens=*" %%G in (\`powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name" 2^>nul\`) do (
    set "GPU_NAME=%%G"
)

:SPECS_DETECTED
echo   Detected GPU : %GPU_NAME%
if "%USE_CUDA%"=="1" goto :SHOW_CUDA_MODE
echo   Runtime Mode : CPU Runtime [No NVIDIA GPU detected - using optimized CPU build]
goto :FIND_PYTHON_STEP

:SHOW_CUDA_MODE
echo   Runtime Mode : NVIDIA CUDA Hardware Acceleration [Auto-enabled for NVIDIA GPU]

:FIND_PYTHON_STEP
echo.
REM ----------------------------------------------------------------------------
REM STEP 1: Detect Python 3.11 (64-bit) FIRST
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

echo [ERROR] Could not find Python 3.11 in PATH or %LOCALAPPDATA%\\Programs\\Python.
echo.
pause
exit /b 1

:FOUND_PYTHON
echo [OK] Using Python interpreter: %PY_CMD%
%PY_CMD% --version
echo.

REM ----------------------------------------------------------------------------
REM STEP 2: Create isolated virtual environment & install CUDA or CPU Runtime
REM ----------------------------------------------------------------------------
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

"%VENV_PY%" -m pip install --upgrade pip setuptools wheel

if "%USE_CUDA%"=="1" goto :INSTALL_CUDA_TORCH
echo [Step 2/4] Installing CPU-optimized PyTorch runtime...
"%VENV_PIP%" install torch --index-url https://download.pytorch.org/whl/cpu
goto :INSTALL_WHISPER_SOURCE

:INSTALL_CUDA_TORCH
echo [Step 2/4] NVIDIA GPU detected! Installing PyTorch with NVIDIA CUDA 12.1 runtime...
"%VENV_PIP%" install torch --index-url https://download.pytorch.org/whl/cu121

:INSTALL_WHISPER_SOURCE
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

REM Generate the Red Voice-to-Text app_icon.ico before compiling
echo [OK] Generating Red Voice-to-Text icon: app_icon.ico ...
"%VENV_PY%" whisper_gui_win10_11.py --generate-icon

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
echo [Step 3/4] Compiling standalone dist\\WhisperStudio_v1.0.exe ...
if exist "WhisperStudio.spec" (
    "%VENV_PYINSTALLER%" --clean --noconfirm WhisperStudio.spec
) else (
    "%VENV_PYINSTALLER%" --clean --noconfirm --onefile --windowed --name WhisperStudio_v1.0 --icon app_icon.ico --collect-all whisper --collect-all customtkinter --hidden-import tiktoken_ext.openai_public whisper_gui_win10_11.py
)

echo.
if exist "dist\\WhisperStudio_v1.0.exe" goto :BUILD_SUCCESS
echo [ERROR] Build did not produce dist\\WhisperStudio_v1.0.exe.
echo Review the log messages above for details.
pause
exit /b 1

:BUILD_SUCCESS
echo ============================================================================
echo [Step 4/4] BUILD SUCCESSFUL! (Whisper Studio v.1.0)
echo Standalone Windows 10 and 11 EXE created at:
echo   %~dp0dist\\WhisperStudio_v1.0.exe
echo ============================================================================
explorer.exe /select,"%~dp0dist\\WhisperStudio_v1.0.exe"
pause
`;

export const WIN10_README_GUIDE = `# Whisper Studio v.1.0 — Windows 10 & Windows 11 Standalone \`.exe\` Build Kit

This package compiles your **\`whisper-20250625\`** repository into **\`WhisperStudio_v1.0.exe\`** for Windows 10 and Windows 11.

## What's New in \`v.1.0\`

1. **Pre-Flight Hardware Spec Check & Automatic NVIDIA CUDA Acceleration**:
   - Before \`build_win10_11_exe.bat\` installs anything, it inspects your machine's GPU via \`nvidia-smi\` and Windows \`Win32_VideoController\`.
   - **If an NVIDIA GPU is detected**: It automatically installs the **CUDA-enabled PyTorch runtime** (\`cu121\`) and enables FP16 Tensor Core + cuDNN benchmark acceleration inside the GUI.
   - **If no NVIDIA GPU is detected**: It automatically installs the lightweight **CPU runtime** (\`fp16=False\`).
2. **Red Voice-to-Text Icon (\`app_icon.ico\`)**:
   - Automatically generates a multi-resolution Windows \`.ico\` featuring a typical white Voice-to-Text microphone & transcript lines on a vibrant Red background (\`#DC2626\`) and embeds it into \`WhisperStudio_v1.0.exe\`, the window titlebar, and the Windows 10/11 taskbar.
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
  a.download = 'WhisperStudio_v1.0_Win10_Win11_Kit.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
