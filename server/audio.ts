import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const DATA_DIR = path.join(process.cwd(), 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}

function listSimulationSourceFiles(): string[] {
  return fs
    .readdirSync(AUDIO_DIR)
    .filter((file) => {
      const lower = file.toLowerCase();
      const isAudio = lower.endsWith('.mp3') || lower.endsWith('.wav');
      const isGenerated =
        lower.startsWith('music_') ||
        lower.startsWith('previa_');

      return isAudio && !isGenerated;
    })
    .map((file) => path.join(AUDIO_DIR, file));
}

function copyFile(sourcePath: string, destPath: string) {
  fs.copyFileSync(sourcePath, destPath);
}

function sliceAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('ffmpeg -version', (err) => {
      if (err) {
        try {
          copyFile(inputPath, outputPath);
          resolve();
        } catch (copyErr) {
          reject(copyErr);
        }
        return;
      }

      const command = `ffmpeg -y -i "${inputPath}" -ss 0 -t 35 "${outputPath}"`;
      exec(command, (execErr, _stdout, stderr) => {
        if (execErr) {
          console.error('Erro ao executar FFmpeg:', stderr);
          try {
            copyFile(inputPath, outputPath);
            resolve();
          } catch (copyErr) {
            reject(copyErr);
          }
          return;
        }

        resolve();
      });
    });
  });
}

export async function processAudioForPedido(
  pedidoId: string,
  _style: string,
  _lyrics: string,
): Promise<{
  url_original_suno: string;
  url_original_suno_2: string;
  url_local_servidor: string;
  url_local_servidor_2: string;
}> {
  const simulationFiles = listSimulationSourceFiles();
  if (simulationFiles.length < 2) {
    throw new Error('Coloque pelo menos 2 arquivos de audio em data/audio para simular as previas.');
  }

  const sourceV1 = simulationFiles[0];
  const sourceV2 = simulationFiles[1];

  const localOriginalV1 = path.join(AUDIO_DIR, `music_${pedidoId}_full_v1${path.extname(sourceV1)}`);
  const localOriginalV2 = path.join(AUDIO_DIR, `music_${pedidoId}_full_v2${path.extname(sourceV2)}`);
  const localPreviewV1 = path.join(AUDIO_DIR, `previa_${pedidoId}_v1.mp3`);
  const localPreviewV2 = path.join(AUDIO_DIR, `previa_${pedidoId}_v2.mp3`);

  copyFile(sourceV1, localOriginalV1);
  copyFile(sourceV2, localOriginalV2);

  await sliceAudio(localOriginalV1, localPreviewV1);
  await sliceAudio(localOriginalV2, localPreviewV2);

  return {
    url_original_suno: path.basename(sourceV1),
    url_original_suno_2: path.basename(sourceV2),
    url_local_servidor: `/audio/previa/${pedidoId}_v1.mp3`,
    url_local_servidor_2: `/audio/previa/${pedidoId}_v2.mp3`,
  };
}

export function getAudioFilePath(fileName: string): string | null {
  const filePath = path.join(AUDIO_DIR, fileName);
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const parsed = path.parse(fileName);
  const matchingFile = fs
    .readdirSync(AUDIO_DIR)
    .find((entry) => path.parse(entry).name === parsed.name);

  return matchingFile ? path.join(AUDIO_DIR, matchingFile) : null;
}
