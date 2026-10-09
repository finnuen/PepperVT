import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support up to 50MB base64 audio/video payloads for local file transcription
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { base64Data, mimeType, fileName, modelSize, language } = req.body;

      if (!base64Data || !mimeType) {
        res.status(400).json({ error: 'Missing audio or video payload data.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: 'Server GEMINI_API_KEY is not configured.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const langHint = language && language !== 'auto'
        ? `Target language hint: ${language}.`
        : 'Automatically detect the spoken language.';

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: `Transcribe the spoken audio from "${fileName || 'media'}" accurately into clean timestamped segments (Whisper ${modelSize || 'base'} style). ${langHint} Break the transcript into natural sentence or phrase segments so each bullet point is concise and easy to read. If there is no speech, describe the audible sound in a single segment.`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguage: {
                type: Type.STRING,
                description: 'Detected language name, e.g., English, Spanish, Japanese',
              },
              segments: {
                type: Type.ARRAY,
                description: 'Ordered list of transcribed speech segments',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: {
                      type: Type.STRING,
                      description: 'Start timestamp in MM:SS format, e.g. 00:00',
                    },
                    end: {
                      type: Type.STRING,
                      description: 'End timestamp in MM:SS format, e.g. 00:05',
                    },
                    text: {
                      type: Type.STRING,
                      description: 'Transcribed sentence or clause',
                    },
                  },
                  required: ['start', 'end', 'text'],
                },
              },
            },
            required: ['detectedLanguage', 'segments'],
          },
        },
      });

      const rawText = response.text?.trim() || '{}';
      let parsed: { detectedLanguage?: string; segments?: Array<{ start: string; end: string; text: string }> } = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = {
          detectedLanguage: 'English',
          segments: [{ start: '00:00', end: '00:05', text: rawText }],
        };
      }

      res.json({
        detectedLanguage: parsed.detectedLanguage || 'English',
        segments: Array.isArray(parsed.segments) && parsed.segments.length > 0
          ? parsed.segments
          : [{ start: '00:00', end: '00:04', text: 'No speech detected in media track.' }],
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Transcription failed';
      console.error('Transcription error:', message);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
