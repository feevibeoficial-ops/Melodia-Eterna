import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';

const DATA_DIR = isSupabaseConfigured() ? path.join(os.tmpdir(), 'melodia-eterna') : path.join(process.cwd(), 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PREVIEW_DURATION_SECONDS = 60;
const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET || 'audios';

if (!process.env.VERCEL && !isSupabaseConfigured()) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function ensurePedidoAudioDir(pedidoId: string) {
  const pedidoDir = path.join(AUDIO_DIR, pedidoId);
  if (!fs.existsSync(pedidoDir)) {
    fs.mkdirSync(pedidoDir, { recursive: true });
  }
  return pedidoDir;
}

function copyFile(sourcePath: string, destPath: string) {
  fs.copyFileSync(sourcePath, destPath);
}

async function downloadToFile(url: string, destPath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar audio externo. Status ${response.status}.`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

function trimWavFile(inputPath: string, outputPath: string, durationSeconds: number) {
  const source = fs.readFileSync(inputPath);
  if (source.length < 44) {
    throw new Error('Arquivo WAV invalido.');
  }

  const riff = source.toString('ascii', 0, 4);
  const wave = source.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Cabecalho WAV invalido.');
  }

  const byteRate = source.readUInt32LE(28);
  const dataSize = source.readUInt32LE(40);
  const maxDataBytes = Math.min(dataSize, byteRate * durationSeconds);
  const alignedDataBytes = maxDataBytes - (maxDataBytes % 2);
  const trimmed = Buffer.alloc(44 + alignedDataBytes);

  source.copy(trimmed, 0, 0, 44);
  source.copy(trimmed, 44, 44, 44 + alignedDataBytes);

  trimmed.writeUInt32LE(36 + alignedDataBytes, 4);
  trimmed.writeUInt32LE(alignedDataBytes, 40);

  fs.writeFileSync(outputPath, trimmed);
}

function sliceAudio(inputPath: string, outputPath: string, durationSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = ffmpegStatic || null;
    if (!ffmpegPath) {
      try {
        if (inputPath.toLowerCase().endsWith('.wav')) {
          trimWavFile(inputPath, outputPath, durationSeconds);
          resolve();
          return;
        }

        reject(new Error('FFmpeg empacotado nao encontrado. Para gerar previa de MP3, revise a instalacao do ffmpeg-static ou envie WAV.'));
      } catch (fallbackErr) {
        reject(fallbackErr);
        return;
      }
      return;
    }

    execFile(
      ffmpegPath,
      ['-y', '-i', inputPath, '-ss', '0', '-t', String(durationSeconds), outputPath],
      (execErr, _stdout, stderr) => {
        if (execErr) {
          console.error('Erro ao executar FFmpeg:', stderr);
          reject(new Error('Nao foi possivel gerar a previa do audio.'));
          return;
        }

        resolve();
      },
    );
  });
}

async function importSourceToPath(source: string, destPath: string) {
  if (/^https?:\/\//i.test(source)) {
    await downloadToFile(source, destPath);
    return;
  }

  if (!fs.existsSync(source)) {
    throw new Error(`Arquivo local nao encontrado: ${source}`);
  }

  copyFile(source, destPath);
}

function resolvePedidoFilePath(pedidoId: string, prefix: 'music_full' | 'previa', version: 'v1' | 'v2') {
  const pedidoDir = path.join(AUDIO_DIR, pedidoId);
  if (!fs.existsSync(pedidoDir)) {
    return null;
  }

  const match = fs.readdirSync(pedidoDir).find((entry) => {
    const parsed = path.parse(entry);
    return parsed.name === `${prefix}_${version}`;
  });

  return match ? path.join(pedidoDir, match) : null;
}

function shouldUseSupabaseStorage() {
  return isSupabaseConfigured() && process.env.STORAGE_PROVIDER === 'supabase';
}

function getContentType(filePath: string) {
  if (filePath.toLowerCase().endsWith('.wav')) return 'audio/wav';
  return 'audio/mpeg';
}

function audioObjectPath(pedidoId: string, fileName: string) {
  return `${pedidoId}/${fileName}`;
}

function parseRequestedAudioFile(fileName: string) {
  const parsed = path.parse(fileName);
  const previaMatch = /^previa_(MEL-[A-Z0-9]+)_(v[12])$/i.exec(parsed.name);
  if (previaMatch) {
    return {
      pedidoId: previaMatch[1].toUpperCase(),
      version: previaMatch[2].toLowerCase() as 'v1' | 'v2',
      prefix: 'previa' as const,
    };
  }

  const fullMatch = /^(?:music_)?(MEL-[A-Z0-9]+)(?:_full)?_(v[12])$/i.exec(parsed.name);
  if (fullMatch) {
    return {
      pedidoId: fullMatch[1].toUpperCase(),
      version: fullMatch[2].toLowerCase() as 'v1' | 'v2',
      prefix: 'music_full' as const,
    };
  }

  return null;
}

async function uploadAudioObject(pedidoId: string, localPath: string, fileName: string) {
  const supabase = getSupabaseClient();
  const bytes = fs.readFileSync(localPath);
  const objectPath = audioObjectPath(pedidoId, fileName);
  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(objectPath, bytes, {
      upsert: true,
      contentType: getContentType(localPath),
    });

  if (error) {
    throw new Error(`Erro ao salvar audio no Supabase Storage: ${error.message}`);
  }
}

async function downloadAudioObject(fileName: string) {
  const parsedRequest = parseRequestedAudioFile(fileName);
  if (!parsedRequest) return null;

  const parsed = path.parse(fileName);
  let storedName = `${parsedRequest.prefix}_${parsedRequest.version}${parsed.ext}`;

  if (!parsed.ext) {
    const { data: listedFiles, error: listError } = await getSupabaseClient()
      .storage
      .from(AUDIO_BUCKET)
      .list(parsedRequest.pedidoId);

    if (listError) return null;

    const matchedFile = (listedFiles || []).find((item) => {
      const itemParsed = path.parse(item.name);
      return itemParsed.name === `${parsedRequest.prefix}_${parsedRequest.version}`;
    });

    if (!matchedFile) return null;
    storedName = matchedFile.name;
  }

  const { data, error } = await getSupabaseClient()
    .storage
    .from(AUDIO_BUCKET)
    .download(audioObjectPath(parsedRequest.pedidoId, storedName));

  if (error || !data) return null;

  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: getContentType(storedName),
  };
}

function clearPedidoSlotFiles(pedidoId: string, version: 'v1' | 'v2') {
  const pedidoDir = path.join(AUDIO_DIR, pedidoId);
  if (!fs.existsSync(pedidoDir)) {
    return;
  }

  for (const entry of fs.readdirSync(pedidoDir)) {
    const parsed = path.parse(entry);
    if (parsed.name === `music_full_${version}` || parsed.name === `previa_${version}`) {
      fs.rmSync(path.join(pedidoDir, entry), { force: true });
    }
  }
}

export async function attachManualAudioToPedido(
  pedidoId: string,
  source1: string,
  source2: string,
  referenceUrl1?: string,
  referenceUrl2?: string,
): Promise<{
  url_local_servidor: string;
  url_local_servidor_2: string;
  url_referencia_externa_1: string | null;
  url_referencia_externa_2: string | null;
}> {
  const pedidoDir = ensurePedidoAudioDir(pedidoId);

  const ext1 = path.extname(source1.split('?')[0]) || '.mp3';
  const ext2 = path.extname(source2.split('?')[0]) || '.mp3';

  const full1 = path.join(pedidoDir, `music_full_v1${ext1}`);
  const full2 = path.join(pedidoDir, `music_full_v2${ext2}`);
  const prev1 = path.join(pedidoDir, `previa_v1${ext1}`);
  const prev2 = path.join(pedidoDir, `previa_v2${ext2}`);

  await importSourceToPath(source1, full1);
  await importSourceToPath(source2, full2);
  await sliceAudio(full1, prev1, PREVIEW_DURATION_SECONDS);
  await sliceAudio(full2, prev2, PREVIEW_DURATION_SECONDS);

  if (shouldUseSupabaseStorage()) {
    await uploadAudioObject(pedidoId, full1, path.basename(full1));
    await uploadAudioObject(pedidoId, full2, path.basename(full2));
    await uploadAudioObject(pedidoId, prev1, path.basename(prev1));
    await uploadAudioObject(pedidoId, prev2, path.basename(prev2));
  }

  return {
    url_local_servidor: `/audio/previa/${pedidoId}_v1${ext1}`,
    url_local_servidor_2: `/audio/previa/${pedidoId}_v2${ext2}`,
    url_referencia_externa_1: referenceUrl1 || null,
    url_referencia_externa_2: referenceUrl2 || null,
  };
}

export async function attachAudioSlotToPedido(
  pedidoId: string,
  version: 'v1' | 'v2',
  source: string,
  referenceUrl?: string,
): Promise<{
  previewUrl: string;
  referenceUrl: string | null;
}> {
  const pedidoDir = ensurePedidoAudioDir(pedidoId);
  clearPedidoSlotFiles(pedidoId, version);

  const ext = path.extname(source.split('?')[0]) || '.mp3';
  const fullPath = path.join(pedidoDir, `music_full_${version}${ext}`);
  const previewPath = path.join(pedidoDir, `previa_${version}${ext}`);

  await importSourceToPath(source, fullPath);
  await sliceAudio(fullPath, previewPath, PREVIEW_DURATION_SECONDS);

  if (shouldUseSupabaseStorage()) {
    await uploadAudioObject(pedidoId, fullPath, path.basename(fullPath));
    await uploadAudioObject(pedidoId, previewPath, path.basename(previewPath));
  }

  return {
    previewUrl: `/audio/previa/${pedidoId}_${version}${ext}`,
    referenceUrl: referenceUrl || null,
  };
}

export function getAudioFilePath(fileName: string): string | null {
  const parsedRequest = parseRequestedAudioFile(fileName);
  if (parsedRequest) {
    return resolvePedidoFilePath(parsedRequest.pedidoId, parsedRequest.prefix, parsedRequest.version);
  }

  const directPath = path.join(AUDIO_DIR, fileName);
  return fs.existsSync(directPath) ? directPath : null;
}

export async function getAudioFile(fileName: string): Promise<{ filePath?: string; bytes?: Buffer; contentType: string } | null> {
  if (shouldUseSupabaseStorage()) {
    return downloadAudioObject(fileName);
  }

  const filePath = getAudioFilePath(fileName);
  if (!filePath) return null;

  return {
    filePath,
    contentType: getContentType(filePath),
  };
}

export async function clearPedidoAudio(pedidoId: string) {
  if (shouldUseSupabaseStorage()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .list(pedidoId);

    if (error) {
      throw new Error(`Erro ao listar audios no Supabase Storage: ${error.message}`);
    }

    const files = (data || []).map((item) => audioObjectPath(pedidoId, item.name));
    if (files.length) {
      const { error: removeError } = await supabase.storage.from(AUDIO_BUCKET).remove(files);
      if (removeError) {
        throw new Error(`Erro ao limpar audios no Supabase Storage: ${removeError.message}`);
      }
    }
  }

  const pedidoDir = path.join(AUDIO_DIR, pedidoId);
  if (fs.existsSync(pedidoDir)) {
    fs.rmSync(pedidoDir, { recursive: true, force: true });
  }
}

export function saveUploadedTempFile(fileName: string, bytes: Buffer) {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tempPath = path.join(UPLOADS_DIR, `${Date.now()}_${safeName}`);
  fs.writeFileSync(tempPath, bytes);
  return tempPath;
}
