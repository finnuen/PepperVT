import { MediaTranscriptItem, createSampleVideoThumbnail } from '../utils/mediaHelpers';

export function getInitialMediaItems(): MediaTranscriptItem[] {
  return [
    {
      id: 'sample-video-1',
      fileName: 'product_architecture_walkthrough.mp4',
      extension: 'mp4',
      folderPath: 'C:\\Users\\Public\\Videos\\Captures',
      mediaType: 'video',
      fileSizeFormatted: '24.8 MB',
      durationFormatted: '02:14',
      thumbnailDataUrl: createSampleVideoThumbnail('Architecture', '02:14 · 60fps', '#1d4ed8'),
      status: 'completed',
      detectedLanguage: 'English',
      modelUsed: 'turbo',
      segments: [
        {
          start: '00:00',
          end: '00:08',
          text: 'Welcome everyone to the Q4 desktop release walkthrough for our local video and voice transcription pipeline.'
        },
        {
          start: '00:08',
          end: '00:19',
          text: 'When you drop a video or select an entire project folder, the engine extracts 16 kilohertz mono audio and computes an 80-channel log-Mel spectrogram.'
        },
        {
          start: '00:19',
          end: '00:31',
          text: 'For non-video files like MP3, WAV, or FLAC recordings, the thumbnail slot automatically switches to a clean music extension icon.'
        },
        {
          start: '00:31',
          end: '00:45',
          text: 'Long transcripts are capped at three preview bullets by default so you can scan dozens of files quickly without losing your place.'
        },
        {
          start: '00:45',
          end: '01:02',
          text: 'Clicking the chevron dropdown at the bottom of any card reveals the remaining timestamped segments and lets you export directly to SRT subtitles.'
        },
        {
          start: '01:02',
          end: '01:18',
          text: 'The standalone Windows 10 and Windows 11 executable bundles mel_filters.npz and tiktoken vocabularies directly inside the PyInstaller archive.'
        }
      ]
    },
    {
      id: 'sample-audio-jfk',
      fileName: 'jfk.flac',
      extension: 'flac',
      folderPath: 'whisper-20250625\\tests',
      mediaType: 'audio',
      fileSizeFormatted: '398.2 KB',
      durationFormatted: '00:11',
      status: 'completed',
      detectedLanguage: 'English',
      modelUsed: 'base',
      segments: [
        {
          start: '00:00',
          end: '00:04',
          text: 'And so, my fellow Americans:'
        },
        {
          start: '00:04',
          end: '00:08',
          text: 'ask not what your country can do for you—'
        },
        {
          start: '00:08',
          end: '00:11',
          text: 'ask what you can do for your country.'
        }
      ]
    },
    {
      id: 'sample-audio-podcast',
      fileName: 'engineering_standup_notes.mp3',
      extension: 'mp3',
      folderPath: 'C:\\Users\\Audio\\VoiceMemos',
      mediaType: 'audio',
      fileSizeFormatted: '6.4 MB',
      durationFormatted: '04:36',
      status: 'completed',
      detectedLanguage: 'English',
      modelUsed: 'small',
      segments: [
        {
          start: '00:00',
          end: '00:12',
          text: 'First item on the agenda is verifying the standalone Windows 10 and Windows 11 executable build on machines without a dedicated GPU.'
        },
        {
          start: '00:12',
          end: '00:25',
          text: 'We patched subprocess Popen with the CREATE_NO_WINDOW flag so FFmpeg never flashes a black console window when extracting audio.'
        },
        {
          start: '00:25',
          end: '00:39',
          text: 'We also redirected null stdout and stderr handles in windowed mode so tqdm progress bars inside whisper/transcribe.py never throw an AttributeError.'
        },
        {
          start: '00:39',
          end: '00:54',
          text: 'On Windows 11 Build 22000 and higher, DwmSetWindowAttribute automatically applies native rounded window corners and Per-Monitor V2 HiDPI scaling.'
        },
        {
          start: '00:54',
          end: '01:10',
          text: 'Next step is running the batch folder test across forty mixed MP4 and WAV recordings.'
        }
      ]
    },
    {
      id: 'sample-video-2',
      fileName: 'user_research_session_07.mov',
      extension: 'mov',
      folderPath: 'C:\\Users\\Public\\Videos\\Interviews',
      mediaType: 'video',
      fileSizeFormatted: '41.2 MB',
      durationFormatted: '03:45',
      thumbnailDataUrl: createSampleVideoThumbnail('User Session #07', '03:45 · 1080p', '#0f766e'),
      status: 'completed',
      detectedLanguage: 'English',
      modelUsed: 'turbo',
      segments: [
        {
          start: '00:00',
          end: '00:10',
          text: 'I usually record fifteen to twenty short clips in a folder and just want to drop the whole directory into one window.'
        },
        {
          start: '00:10',
          end: '00:22',
          text: 'Seeing the video thumbnail on the left makes it much easier to remember which take had the whiteboard diagram.'
        },
        {
          start: '00:22',
          end: '00:35',
          text: 'Keeping each row compact with three bullet points and a dropdown arrow means I can scroll through the whole folder in seconds.'
        },
        {
          start: '00:35',
          end: '00:49',
          text: 'Once I find the right clip, I expand the dropdown and copy the full timestamped text straight into my notes.'
        }
      ]
    }
  ];
}
