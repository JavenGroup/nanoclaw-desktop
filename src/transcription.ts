import path from 'path';

import OpenAI, { toFile } from 'openai';

import { OPENAI_API_KEY } from './config.js';
import { logger } from './logger.js';

let client: OpenAI | null = null;
let warnedMissingKey = false;

function getClient(): OpenAI | null {
  if (!OPENAI_API_KEY) {
    if (!warnedMissingKey) {
      logger.warn('OPENAI_API_KEY not set — voice transcription disabled');
      warnedMissingKey = true;
    }
    return null;
  }
  if (!client) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return client;
}

/**
 * Transcribe an audio buffer via OpenAI Whisper.
 * @param filePath - Original Telegram file path (used to infer extension/mime)
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filePath?: string,
): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;

  const ext = filePath ? path.extname(filePath) : '.ogg';
  const mimeTypes: Record<string, string> = {
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
  };
  const mime = mimeTypes[ext] || 'audio/ogg';

  try {
    const file = await toFile(audioBuffer, `audio${ext}`, { type: mime });
    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    return result.text || null;
  } catch (err) {
    logger.error({ err }, 'Whisper transcription failed');
    return null;
  }
}
