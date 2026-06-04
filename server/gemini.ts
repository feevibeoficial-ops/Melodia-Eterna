import { GoogleGenAI } from '@google/genai';
import type { PedidoAiInteraction, RespostasFormulario } from '../src/types.js';
import { buildComposePrompt, buildRefinePrompt } from './prompt-config.js';

const GEMINI_MODEL = 'gemini-2.5-flash';

class GeminiServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'GeminiServiceError';
    this.statusCode = statusCode;
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiServiceError('GEMINI_API_KEY nao configurada no servidor.', 500);
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'melodia-eterna',
      },
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusCode(error: any): number | undefined {
  return error?.status ?? error?.code ?? error?.error?.code;
}

function isRetryableGeminiError(error: any): boolean {
  const statusCode = getStatusCode(error);
  return statusCode === 429 || statusCode === 500 || statusCode === 503;
}

function normalizeGeminiError(error: any, fallbackMessage: string): GeminiServiceError {
  const statusCode = getStatusCode(error);

  if (statusCode === 503) {
    return new GeminiServiceError(
      'Nosso estudio esta com alta demanda no momento. Tente novamente em alguns instantes.',
      503,
    );
  }

  if (statusCode === 429) {
    return new GeminiServiceError(
      'Recebemos muitas solicitacoes ao mesmo tempo. Aguarde alguns segundos e tente novamente.',
      429,
    );
  }

  return new GeminiServiceError(fallbackMessage, typeof statusCode === 'number' ? statusCode : 500);
}

async function generateLyricsContent(prompt: string, temperature: number): Promise<string> {
  const client = getGeminiClient();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { temperature },
      });

      const lyrics = response.text;
      if (!lyrics) {
        throw new GeminiServiceError('A composicao retornou vazia. Tente novamente.', 502);
      }

      return cleanLyrics(lyrics);
    } catch (error: any) {
      const shouldRetry = attempt < maxAttempts && isRetryableGeminiError(error);
      if (!shouldRetry) {
        throw error;
      }

      await sleep(800 * attempt);
    }
  }

  throw new GeminiServiceError('Falha temporaria ao gerar a composicao.', 503);
}

function buildAiInteractionBase(kind: 'compose' | 'refine', prompt: string, output: string, temperature: number): Omit<PedidoAiInteraction, 'id' | 'createdAt'> {
  return {
    kind,
    model: GEMINI_MODEL,
    temperature,
    prompt,
    output,
  };
}

export async function composeLyricsWithMetadata(
  respostas: RespostasFormulario,
  selectedGenderForRevelacao?: 'menino' | 'menina',
): Promise<{ lyrics: string; interaction: Omit<PedidoAiInteraction, 'id' | 'createdAt'> }> {
  const prompt = await buildComposePrompt(respostas, selectedGenderForRevelacao);
  const temperature = 0.8;

  try {
    const lyrics = await generateLyricsContent(prompt, temperature);
    return {
      lyrics,
      interaction: {
        ...buildAiInteractionBase('compose', prompt, lyrics, temperature),
        feedbackUsuario: null,
        selectedGenderForRevelacao: selectedGenderForRevelacao ?? null,
      },
    };
  } catch (error: any) {
    throw normalizeGeminiError(error, 'Falha ao compor a letra neste momento.');
  }
}

export async function composeLyrics(
  respostas: RespostasFormulario,
  selectedGenderForRevelacao?: 'menino' | 'menina',
): Promise<string> {
  const result = await composeLyricsWithMetadata(respostas, selectedGenderForRevelacao);
  return result.lyrics;
}

export async function refineLyricsWithMetadata(
  respostas: RespostasFormulario,
  letraAnterior: string,
  feedbackUsuario: string,
  selectedGenderForRevelacao?: 'menino' | 'menina',
): Promise<{ lyrics: string; interaction: Omit<PedidoAiInteraction, 'id' | 'createdAt'> }> {
  const prompt = await buildRefinePrompt(
    respostas,
    letraAnterior,
    feedbackUsuario,
    selectedGenderForRevelacao,
  );
  const temperature = 0.7;

  try {
    const lyrics = await generateLyricsContent(prompt, temperature);
    return {
      lyrics,
      interaction: {
        ...buildAiInteractionBase('refine', prompt, lyrics, temperature),
        feedbackUsuario,
        selectedGenderForRevelacao: selectedGenderForRevelacao ?? null,
      },
    };
  } catch (error: any) {
    throw normalizeGeminiError(error, 'Falha ao refinar a composicao neste momento.');
  }
}

export async function refineLyrics(
  respostas: RespostasFormulario,
  letraAnterior: string,
  feedbackUsuario: string,
  selectedGenderForRevelacao?: 'menino' | 'menina',
): Promise<string> {
  const result = await refineLyricsWithMetadata(respostas, letraAnterior, feedbackUsuario, selectedGenderForRevelacao);
  return result.lyrics;
}

function cleanLyrics(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\([^)]+\)/g, (match) => {
      const lower = match.toLowerCase();
      if (lower.includes('refrao') || lower.includes('verso') || lower.includes('ponte') || lower.includes('intro') || lower.includes('outro')) {
        return '';
      }
      return match;
    })
    .replace(/(Verso \d+|Refrao|Ponte|Introducao|Letra:)/gi, '')
    .trim();
}
