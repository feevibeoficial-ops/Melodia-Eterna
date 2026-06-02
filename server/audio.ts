import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

const DATA_DIR = path.join(process.cwd(), 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PREVIEW_DURATION_SECONDS = 60;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
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

  return {
    previewUrl: `/audio/previa/${pedidoId}_${version}${ext}`,
    referenceUrl: referenceUrl || null,
  };
}

export function getAudioFilePath(fileName: string): string | null {
  const parsed = path.parse(fileName);
  const name = parsed.name;

  const previaMatch = /^previa_(MEL-[A-Z0-9]+)_(v[12])$/i.exec(name);
  if (previaMatch) {
    return resolvePedidoFilePath(previaMatch[1], 'previa', previaMatch[2] as 'v1' | 'v2');
  }

  const fullMatch = /^music_(MEL-[A-Z0-9]+)_full_(v[12])$/i.exec(name);
  if (fullMatch) {
    return resolvePedidoFilePath(fullMatch[1], 'music_full', fullMatch[2] as 'v1' | 'v2');
  }

  const directPath = path.join(AUDIO_DIR, fileName);
  return fs.existsSync(directPath) ? directPath : null;
}

export function clearPedidoAudio(pedidoId: string) {
  const pedidoDir = path.join(AUDIO_DIR, pedidoId);
  if (fs.existsSync(pedidoDir)) {
    fs.rmSync(pedidoDir, { recursive: true, force: true });
  }
}

export function saveUploadedTempFile(fileName: string, bytes: Buffer) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tempPath = path.join(UPLOADS_DIR, `${Date.now()}_${safeName}`);
  fs.writeFileSync(tempPath, bytes);
  return tempPath;
}
