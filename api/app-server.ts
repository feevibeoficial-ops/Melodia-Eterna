import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import type { RespostasFormulario, PedidoMusica, PromptTemplate, TemaConfig } from '../src/types.js';
import { savePedido, getPedido, listPedidosByContact, listAllPedidos } from '../server/db.js';
import { composeLyricsWithMetadata, refineLyricsWithMetadata } from '../server/gemini.js';
import { attachAudioSlotToPedido, attachManualAudioToPedido, clearPedidoAudio, getAudioFile, saveUploadedTempFile } from '../server/audio.js';
import { getSupabaseClient, isSupabaseConfigured } from '../server/supabase.js';
import { listPromptTemplates, savePromptTemplate } from '../server/prompt-config.js';
import { deleteTheme, listThemes, upsertTheme } from '../server/theme-config.js';

const DATA_DIR = isSupabaseConfigured() ? path.join(os.tmpdir(), 'melodia-eterna') : path.join(process.cwd(), 'data');
const TELEGRAM_STATE_PATH = path.join(DATA_DIR, 'telegram-state.json');
const COMPROVANTES_DIR = path.join(DATA_DIR, 'comprovantes');
const PROOFS_BUCKET = process.env.SUPABASE_PROOFS_BUCKET || 'comprovantes';

if (!process.env.VERCEL && !shouldUseSupabaseStorage() && !fs.existsSync(COMPROVANTES_DIR)) {
  fs.mkdirSync(COMPROVANTES_DIR, { recursive: true });
}

function shouldUseSupabaseStorage() {
  return isSupabaseConfigured() && process.env.STORAGE_PROVIDER === 'supabase';
}

function getGenericContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

async function saveProofFile(pedidoId: string, fileName: string, bytes: Buffer) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedFileName = `${Date.now()}_${safeName}`;

  if (shouldUseSupabaseStorage()) {
    const objectPath = `${pedidoId}/${storedFileName}`;
    const { error } = await getSupabaseClient()
      .storage
      .from(PROOFS_BUCKET)
      .upload(objectPath, bytes, {
        upsert: true,
        contentType: getGenericContentType(fileName),
      });

    if (error) {
      throw new Error(`Erro ao salvar comprovante no Supabase Storage: ${error.message}`);
    }

    return {
      fileName: storedFileName,
      url: `/api/orders/${pedidoId}/proof/${storedFileName}`,
      filePath: null as string | null,
    };
  }

  const pedidoDir = path.join(COMPROVANTES_DIR, pedidoId);
  if (!fs.existsSync(pedidoDir)) {
    fs.mkdirSync(pedidoDir, { recursive: true });
  }

  const filePath = path.join(pedidoDir, storedFileName);
  fs.writeFileSync(filePath, bytes);
  return {
    fileName: storedFileName,
    url: `/api/orders/${pedidoId}/proof/${storedFileName}`,
    filePath,
  };
}

async function getProofFile(pedidoId: string, fileName: string) {
  if (shouldUseSupabaseStorage()) {
    const { data, error } = await getSupabaseClient()
      .storage
      .from(PROOFS_BUCKET)
      .download(`${pedidoId}/${fileName}`);

    if (error || !data) return null;

    return {
      bytes: Buffer.from(await data.arrayBuffer()),
      contentType: getGenericContentType(fileName),
      filePath: null as string | null,
    };
  }

  const filePath = path.join(COMPROVANTES_DIR, pedidoId, fileName);
  if (!fs.existsSync(filePath)) return null;

  return {
    bytes: null as Buffer | null,
    contentType: getGenericContentType(fileName),
    filePath,
  };
}

function makePixCode(id: string) {
  return `00020101021226850014br.gov.bcb.pix2563pix.melodiaeterna.com.br/qr/v2/${id}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

function createInteractionId() {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getWhatsAppNumber() {
  return (process.env.APP_WHATSAPP_NUMBER || '').replace(/\D/g, '');
}

function getTelegramBotToken() {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function getTelegramChatId() {
  return (process.env.TELEGRAM_CHAT_ID || '').trim();
}

function getTelegramWebhookSecret() {
  return (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

function buildApprovalWhatsAppLink(pedido: PedidoMusica) {
  const number = getWhatsAppNumber();
  if (!number) return null;

  const letra = pedido.letra_aprovada || pedido.letra_gerada;
  const message = [
    `Novo pedido aprovado: ${pedido.id}`,
    `Cliente: ${pedido.cliente_email} | ${pedido.cliente_whatsapp}`,
    `Tema: ${pedido.respostas.temaId}`,
    `Estilo: ${pedido.respostas.estiloMusical}`,
    `Voz: ${pedido.respostas.provVoice}`,
    '',
    'Letra aprovada:',
    letra,
  ].join('\n');

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function buildClientSupportWhatsAppLink(pedido: PedidoMusica) {
  const number = getWhatsAppNumber();
  if (!number) return null;

  const message = [
    `Olá, quero dar seguimento ao pedido ${pedido.id}.`,
    `Cliente: ${pedido.cliente_email} | ${pedido.cliente_whatsapp}`,
    pedido.status_pagamento === 'PAGO'
      ? 'O pagamento ja foi realizado. Pode confirmar a liberacao das faixas completas?'
      : 'Estou enviando o comprovante de pagamento para liberar as faixas completas.',
  ].join('\n');

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function buildTelegramApprovalMessage(pedido: PedidoMusica) {
  const letra = pedido.letra_aprovada || pedido.letra_gerada;
  return [
    `Novo pedido aprovado: ${pedido.id}`,
    `Cliente: ${pedido.cliente_email}`,
    `WhatsApp: ${pedido.cliente_whatsapp}`,
    `Tema: ${pedido.respostas.temaId}`,
    `Estilo: ${pedido.respostas.estiloMusical}`,
    `Voz: ${pedido.respostas.provVoice}`,
    '',
    'Letra aprovada:',
    letra,
  ].join('\n');
}

function buildTelegramProofMessage(pedido: PedidoMusica) {
  return [
    `Comprovante recebido: ${pedido.id}`,
    `Cliente: ${pedido.cliente_email}`,
    `WhatsApp: ${pedido.cliente_whatsapp}`,
    `Tema: ${pedido.respostas.temaId}`,
    `Estilo: ${pedido.respostas.estiloMusical}`,
  ].join('\n');
}

async function sendTelegramMessage(text: string) {
  const botToken = getTelegramBotToken();
  const chatId = getTelegramChatId();
  if (!botToken || !chatId) {
    return { sent: false, reason: 'Telegram nao configurado.' };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  const data = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.description || 'Falha ao enviar notificacao para o Telegram.');
  }

  return { sent: true };
}

async function sendTelegramDocument(filePath: string, caption: string) {
  const botToken = getTelegramBotToken();
  const chatId = getTelegramChatId();
  if (!botToken || !chatId) {
    return { sent: false, reason: 'Telegram nao configurado.' };
  }

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('document', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.description || 'Falha ao enviar documento para o Telegram.');
  }

  return { sent: true };
}

async function sendTelegramDocumentBytes(bytes: Buffer, fileName: string, caption: string) {
  const botToken = getTelegramBotToken();
  const chatId = getTelegramChatId();
  if (!botToken || !chatId) {
    return { sent: false, reason: 'Telegram nao configurado.' };
  }

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('document', new Blob([bytes]), fileName);

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.description || 'Falha ao enviar documento para o Telegram.');
  }

  return { sent: true };
}

async function sendTelegramApprovalNotification(pedido: PedidoMusica) {
  return sendTelegramMessage(buildTelegramApprovalMessage(pedido));
}

async function notifyTelegramError(title: string, details: string) {
  try {
    await sendTelegramMessage([`[ERRO] ${title}`, details].join('\n'));
  } catch (error) {
    console.error('Falha secundaria ao notificar erro no Telegram:', error);
  }
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    chat?: { id: number | string };
    document?: { file_id: string; file_name?: string };
    audio?: { file_id: string; file_name?: string };
  };
};

function loadTelegramOffset() {
  if (!fs.existsSync(TELEGRAM_STATE_PATH)) {
    return 0;
  }

  try {
    const raw = fs.readFileSync(TELEGRAM_STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { lastUpdateId?: number };
    return parsed.lastUpdateId || 0;
  } catch {
    return 0;
  }
}

function saveTelegramOffset(lastUpdateId: number) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(TELEGRAM_STATE_PATH, JSON.stringify({ lastUpdateId }, null, 2), 'utf-8');
}

function parseTelegramAudioCommand(text: string | undefined) {
  if (!text) return null;
  const match = /(MEL-[A-Z0-9]+)\s+(v[12])/i.exec(text);
  if (!match) return null;
  return {
    pedidoId: match[1].toUpperCase(),
    version: match[2].toLowerCase() as 'v1' | 'v2',
  };
}

function isTelegramStatsCommand(text: string | undefined) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return normalized === '/stats' || normalized === '/resumo';
}

function isTelegramHelpCommand(text: string | undefined) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return normalized === '/start' || normalized === '/help' || normalized === '/ajuda';
}

function parseTelegramMarkPaidCommand(text: string | undefined) {
  if (!text) return null;
  const match = /^\/(pago|aprovar_pagamento)\s+(MEL-[A-Z0-9]+)$/i.exec(text.trim());
  if (!match) return null;
  return {
    pedidoId: match[2].toUpperCase(),
  };
}

function formatRanking(items: Record<string, number>, emptyLabel: string) {
  const entries = Object.entries(items)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10);

  if (!entries.length) {
    return emptyLabel;
  }

  return entries.map(([label, count]) => `- ${label}: ${count}`).join('\n');
}

async function buildTelegramStatsMessage() {
  const pedidos = await listAllPedidos();
  const total = pedidos.length;
  const pagos = pedidos.filter((pedido) => pedido.status_pagamento === 'PAGO').length;
  const pendentes = total - pagos;
  const aprovados = pedidos.filter((pedido) => Boolean(pedido.letra_aprovada)).length;
  const comPrevias = pedidos.filter((pedido) => Boolean(pedido.url_local_servidor && pedido.url_local_servidor_2)).length;

  const porTema: Record<string, number> = {};
  const porEstilo: Record<string, number> = {};
  const porStatus: Record<string, number> = {};

  for (const pedido of pedidos) {
    porTema[pedido.respostas.temaId] = (porTema[pedido.respostas.temaId] || 0) + 1;
    porEstilo[pedido.respostas.estiloMusical] = (porEstilo[pedido.respostas.estiloMusical] || 0) + 1;
    porStatus[pedido.status_producao] = (porStatus[pedido.status_producao] || 0) + 1;
  }

  return [
    'Resumo do sistema Melodia Eterna',
    '',
    `Total de pedidos: ${total}`,
    `Pagos: ${pagos}`,
    `Pendentes: ${pendentes}`,
    `Letras aprovadas: ${aprovados}`,
    `Pedidos com previas prontas: ${comPrevias}`,
    '',
    'Por status de producao:',
    formatRanking(porStatus, '- Nenhum pedido'),
    '',
    'Por tema:',
    formatRanking(porTema, '- Nenhum tema registrado'),
    '',
    'Por estilo musical:',
    formatRanking(porEstilo, '- Nenhum estilo registrado'),
  ].join('\n');
}

function buildTelegramHelpMessage() {
  return [
    'Comandos do bot Melodia Eterna',
    '',
    '/stats - resumo do sistema',
    '/resumo - mesmo resumo do sistema',
    '/help - mostra esta ajuda',
    '/pago MEL-XXXX - aprova o pagamento do pedido',
    '',
    'Para anexar musicas em pedidos:',
    '- envie a faixa com legenda: MEL-XXXXXXX v1',
    '- envie a outra faixa com legenda: MEL-XXXXXXX v2',
    '',
    'Exemplo:',
    'MEL-LJSGQ0DTN v1',
  ].join('\n');
}

async function telegramApiRequest<T>(method: string, body?: Record<string, unknown>) {
  const botToken = getTelegramBotToken();
  if (!botToken) {
    throw new Error('Telegram nao configurado.');
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Falha na chamada ${method} do Telegram.`);
  }

  return data.result as T;
}

async function downloadTelegramFile(fileId: string, fileName?: string) {
  const botToken = getTelegramBotToken();
  if (!botToken) {
    throw new Error('Telegram nao configurado.');
  }

  const fileInfo = await telegramApiRequest<{ file_path: string }>('getFile', { file_id: fileId });
  if (!fileInfo.file_path) {
    throw new Error('Arquivo do Telegram sem file_path.');
  }

  const extension = path.extname(fileInfo.file_path) || path.extname(fileName || '') || '.mp3';
  const safeName = `${Date.now()}_${fileId}${extension}`;
  const uploadsDir = path.join(DATA_DIR, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const tempPath = path.join(uploadsDir, safeName);

  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`);
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo do Telegram. Status ${response.status}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
}

async function sendTelegramReply(chatId: number | string, text: string) {
  try {
    await telegramApiRequest('sendMessage', {
      chat_id: chatId,
      text,
    });
  } catch (error) {
    console.error('Falha ao responder no Telegram:', error);
  }
}

async function processTelegramMusicUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.chat) {
    return;
  }

  if (isTelegramHelpCommand(message.text)) {
    await sendTelegramReply(message.chat.id, buildTelegramHelpMessage());
    return;
  }

  if (isTelegramStatsCommand(message.text)) {
    await sendTelegramReply(message.chat.id, await buildTelegramStatsMessage());
    return;
  }

  const markPaidCommand = parseTelegramMarkPaidCommand(message.text);
  if (markPaidCommand) {
    const pedido = await getPedido(markPaidCommand.pedidoId);
    if (!pedido) {
      await sendTelegramReply(message.chat.id, `Pedido ${markPaidCommand.pedidoId} nao encontrado.`);
      return;
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 10);
    pedido.status_pagamento = 'PAGO';
    pedido.status_producao = pedido.url_local_servidor && pedido.url_local_servidor_2 ? 'LIBERADO' : pedido.status_producao;
    pedido.data_expiracao_local = expDate.toISOString();
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);

    await sendTelegramReply(
      message.chat.id,
      `Pagamento aprovado no pedido ${pedido.id}. O cliente ja pode acessar a liberacao conforme o status do pedido.`,
    );
    return;
  }

  const command = parseTelegramAudioCommand(message.caption || message.text);
  if (!command) {
    return;
  }

  const media = message.document || message.audio;
  if (!media?.file_id) {
    await sendTelegramReply(
      message.chat.id,
      `Envie o arquivo com a legenda no formato "${command.pedidoId} ${command.version}".`,
    );
    return;
  }

  const pedido = await getPedido(command.pedidoId);
  if (!pedido) {
    await sendTelegramReply(message.chat.id, `Pedido ${command.pedidoId} nao encontrado.`);
    return;
  }

  let tempPath: string | null = null;
  try {
    tempPath = await downloadTelegramFile(media.file_id, media.file_name);
    const attached = await attachAudioSlotToPedido(
      pedido.id,
      command.version,
      tempPath,
      `telegram:${media.file_id}`,
    );

    if (command.version === 'v1') {
      pedido.url_local_servidor = attached.previewUrl;
      pedido.url_referencia_externa_1 = attached.referenceUrl;
    } else {
      pedido.url_local_servidor_2 = attached.previewUrl;
      pedido.url_referencia_externa_2 = attached.referenceUrl;
    }

    const hasBothPreviews = Boolean(pedido.url_local_servidor && pedido.url_local_servidor_2);
    pedido.status_producao = hasBothPreviews
      ? (pedido.status_pagamento === 'PAGO' ? 'LIBERADO' : 'PREVIAS_PRONTAS')
      : 'AGUARDANDO_FAIXAS';
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);

    await sendTelegramReply(
      message.chat.id,
      hasBothPreviews
        ? `Faixa ${command.version.toUpperCase()} anexada ao pedido ${pedido.id}. As duas previas ja estao prontas.`
        : `Faixa ${command.version.toUpperCase()} anexada ao pedido ${pedido.id}. Agora envie a outra faixa.`,
    );
  } catch (error: any) {
    console.error('Erro ao anexar faixa recebida no Telegram:', error);
    await notifyTelegramError(
      'Falha ao anexar faixa do Telegram',
      `Pedido: ${command.pedidoId}\nSlot: ${command.version}\n${error?.message || 'Erro desconhecido.'}`,
    );
    await sendTelegramReply(
      message.chat.id,
      `Nao foi possivel anexar a faixa ${command.version.toUpperCase()} no pedido ${command.pedidoId}.`,
    );
  } finally {
    if (tempPath) {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

async function ensureTelegramCommands() {
  if (!getTelegramBotToken()) {
    return;
  }

  try {
    await telegramApiRequest('setMyCommands', {
      commands: [
        { command: 'stats', description: 'Resumo do sistema' },
        { command: 'resumo', description: 'Resumo do sistema' },
        { command: 'help', description: 'Ajuda e formatos do bot' },
        { command: 'pago', description: 'Aprova pagamento de um pedido' },
      ],
    });
  } catch (error) {
    console.error('Falha ao registrar comandos do Telegram:', error);
  }
}

function startTelegramPolling() {
  if (getTelegramWebhookSecret()) {
    ensureTelegramCommands().catch(() => undefined);
    return;
  }

  if (!getTelegramBotToken() || !getTelegramChatId()) {
    return;
  }

  let offset = loadTelegramOffset();
  let running = false;

  const poll = async () => {
    if (running) return;
    running = true;

    try {
      const updates = await telegramApiRequest<TelegramUpdate[]>('getUpdates', {
        offset: offset + 1,
        timeout: 10,
      });

      for (const update of updates) {
        await processTelegramMusicUpdate(update);
        offset = update.update_id;
        saveTelegramOffset(offset);
      }
    } catch (error) {
      console.error('Falha no polling do Telegram:', error);
    } finally {
      running = false;
    }
  };

  ensureTelegramCommands().catch(() => undefined);
  poll().catch(() => undefined);
  setInterval(() => {
    poll().catch(() => undefined);
  }, 5000);
}

function getAdminPassword(req: express.Request) {
  return req.header('x-admin-password') || '';
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const configuredPassword = process.env.ADMIN_PASSWORD || '';
  if (!configuredPassword) {
    res.status(500).json({ error: 'ADMIN_PASSWORD nao configurada no servidor.' });
    return;
  }

  if (getAdminPassword(req) !== configuredPassword) {
    res.status(401).json({ error: 'Senha da gestao invalida.' });
    return;
  }

  next();
}

export async function createApp(options: { serveFrontend?: boolean } = {}) {
  const { serveFrontend = true } = options;
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  startTelegramPolling();

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      config: {
        adminPassword: Boolean(process.env.ADMIN_PASSWORD),
        supabase: isSupabaseConfigured(),
        storageProvider: process.env.STORAGE_PROVIDER || 'local',
      },
    });
  });

  app.get('/api/config/themes', async (_req, res) => {
    try {
      res.json(await listThemes());
    } catch (error: any) {
      console.error('Erro ao listar temas:', error);
      res.status(500).json({ error: error?.message || 'Falha ao carregar temas.' });
    }
  });

  app.get('/api/telegram/webhook', (_req, res) => {
    res.status(400).json({
      error: 'Webhook do Telegram requer um segredo na URL e aceita apenas POST.',
      expectedPath: '/api/telegram/webhook/:secret',
      webhookConfigured: Boolean(getTelegramWebhookSecret()),
    });
  });

  app.get('/api/telegram/webhook/:secret', (req, res) => {
    const configuredSecret = getTelegramWebhookSecret();
    if (!configuredSecret || req.params.secret !== configuredSecret) {
      res.status(401).json({ error: 'Webhook do Telegram nao autorizado.' });
      return;
    }

    res.status(405).json({
      error: 'Webhook do Telegram aceita apenas POST.',
      expectedMethod: 'POST',
    });
  });

  app.post('/api/telegram/webhook/:secret', async (req, res) => {
    const configuredSecret = getTelegramWebhookSecret();
    if (!configuredSecret || req.params.secret !== configuredSecret) {
      res.status(401).json({ error: 'Webhook do Telegram nao autorizado.' });
      return;
    }

    try {
      await processTelegramMusicUpdate(req.body as TelegramUpdate);
      res.json({ ok: true });
    } catch (error: any) {
      console.error('Erro ao processar webhook do Telegram:', error);
      await notifyTelegramError(
        'Falha no webhook do Telegram',
        error?.message || 'Erro desconhecido ao processar update.',
      );
      res.status(500).json({ error: 'Falha ao processar update do Telegram.' });
    }
  });

  app.post('/api/lyrics/generate', async (req, res) => {
    try {
      const { responses, selectedGenderForRevelacao } = req.body as {
        responses: RespostasFormulario;
        selectedGenderForRevelacao?: 'menino' | 'menina';
      };

      if (!responses || !responses.respostas || !responses.temaId) {
        res.status(400).json({ error: 'Dados do formulario invalidos ou ausentes.' });
        return;
      }

      const generation = await composeLyricsWithMetadata(responses, selectedGenderForRevelacao);
      const pedidoId = `MEL-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

      const novoPedido: PedidoMusica = {
        id: pedidoId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cliente_email: responses.clienteEmail,
        cliente_whatsapp: responses.clienteWhatsapp,
        respostas: responses,
        letra_gerada: generation.lyrics,
        letra_aprovada: null,
        termo_aceite_assinado: false,
        termo_aceite_timestamp: null,
        status_pagamento: 'PENDENTE',
        status_producao: 'AGUARDANDO_APROVACAO',
        pix_copia_e_cola: null,
        pix_qr_code_url: null,
        url_original_suno: null,
        url_original_suno_2: null,
        url_referencia_externa_1: null,
        url_referencia_externa_2: null,
        url_local_servidor: null,
        url_local_servidor_2: null,
        comprovante_url_local: null,
        comprovante_nome_arquivo: null,
        data_expiracao_local: null,
        ai_interactions: [
          {
            id: createInteractionId(),
            createdAt: new Date().toISOString(),
            ...generation.interaction,
          },
        ],
      };

      await savePedido(novoPedido);
      res.json(novoPedido);
    } catch (error: any) {
      console.error('Erro ao compor letra:', error);
      await notifyTelegramError(
        'Falha ao gerar letra',
        error?.message || 'Erro desconhecido ao gerar composicao.',
      );
      res.status(error?.statusCode || 500).json({ error: error?.message || 'Erro ao gerar composicao.' });
    }
  });

  app.post('/api/lyrics/refine', async (req, res) => {
    try {
      const { id, feedback, selectedGenderForRevelacao } = req.body as {
        id: string;
        feedback: string;
        selectedGenderForRevelacao?: 'menino' | 'menina';
      };

      const pedido = await getPedido(id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
        return;
      }

      const refined = await refineLyricsWithMetadata(
        pedido.respostas,
        pedido.letra_gerada,
        feedback,
        selectedGenderForRevelacao,
      );

      pedido.letra_gerada = refined.lyrics;
      pedido.updatedAt = new Date().toISOString();
      pedido.ai_interactions = [
        ...(pedido.ai_interactions || []),
        {
          id: createInteractionId(),
          createdAt: new Date().toISOString(),
          ...refined.interaction,
        },
      ];
      await savePedido(pedido);
      res.json(pedido);
    } catch (error: any) {
      console.error('Erro ao refinar composicao:', error);
      await notifyTelegramError(
        'Falha ao refinar letra',
        error?.message || 'Erro desconhecido ao refinar composicao.',
      );
      res.status(error?.statusCode || 500).json({ error: error?.message || 'Erro ao refinar composicao.' });
    }
  });

  app.post('/api/lyrics/approve', async (req, res) => {
    try {
      const { id, termo_aceite_assinado } = req.body as { id: string; termo_aceite_assinado: boolean };
      if (!termo_aceite_assinado) {
        res.status(400).json({ error: 'E necessario aceitar os termos de responsabilidade tecnica.' });
        return;
      }

      const pedido = await getPedido(id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
        return;
      }

      pedido.letra_aprovada = pedido.letra_gerada;
      pedido.termo_aceite_assinado = true;
      pedido.termo_aceite_timestamp = new Date().toISOString();
      pedido.status_producao = 'AGUARDANDO_FAIXAS';
      pedido.pix_copia_e_cola = pedido.pix_copia_e_cola || makePixCode(id);
      pedido.pix_qr_code_url = pedido.pix_qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pedido.pix_copia_e_cola)}`;
      pedido.updatedAt = new Date().toISOString();

      await savePedido(pedido);
      let telegramSent = false;
      let telegramError: string | null = null;

      try {
        const telegramResult = await sendTelegramApprovalNotification(pedido);
        telegramSent = telegramResult.sent;
      } catch (telegramErr: any) {
        telegramError = telegramErr.message || 'Falha ao enviar para o Telegram.';
        console.error('Erro ao enviar notificacao para o Telegram:', telegramErr);
        await notifyTelegramError(
          'Falha ao enviar letra aprovada',
          `Pedido: ${pedido.id}\n${telegramError}`,
        );
      }

      res.json({
        pedido,
        whatsappLink: buildApprovalWhatsAppLink(pedido),
        telegramSent,
        telegramError,
      });
    } catch (error: any) {
      console.error('Erro ao aprovar letra:', error);
      await notifyTelegramError(
        'Falha ao aprovar letra',
        error?.message || 'Erro desconhecido ao aprovar letra.',
      );
      res.status(500).json({ error: error?.message || 'Erro ao aprovar letra.' });
    }
  });

  app.post('/api/payment/simulate-confirm', async (req, res) => {
    const { id } = req.body as { id: string };
    const pedido = await getPedido(id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
      return;
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 10);
    pedido.status_pagamento = 'PAGO';
    pedido.status_producao = 'LIBERADO';
    pedido.data_expiracao_local = expDate.toISOString();
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);
    res.json(pedido);
  });

  app.get('/api/orders/:id', async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Musica/Pedido nao encontrado.' });
      return;
    }
    res.json(pedido);
  });

  app.get('/api/orders/:id/whatsapp-link', async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
      return;
    }

    const kind = req.query.kind === 'lyrics' ? 'lyrics' : 'payment';
    const whatsappLink = kind === 'lyrics'
      ? buildApprovalWhatsAppLink(pedido)
      : buildClientSupportWhatsAppLink(pedido);
    if (!whatsappLink) {
      res.status(503).json({ error: 'WhatsApp do estudio nao configurado no servidor.' });
      return;
    }

    res.json({
      whatsappLink,
      whatsappNumber: getWhatsAppNumber(),
    });
  });

  app.post('/api/orders/search', async (req, res) => {
    try {
      const { email, whatsapp } = req.body as { email: string; whatsapp: string };
      if (!email && !whatsapp) {
        res.status(400).json({ error: 'Forneca e-mail ou WhatsApp para buscar.' });
        return;
      }
      res.json(await listPedidosByContact(email || '', whatsapp || ''));
    } catch (error: any) {
      console.error('Erro ao buscar pedidos por contato:', error);
      res.status(500).json({ error: error?.message || 'Falha ao buscar pedidos.' });
    }
  });

  app.post('/api/orders/:id/upload-proof', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido nao encontrado.' });
      return;
    }

    const fileName = decodeURIComponent(req.header('x-file-name') || 'comprovante');
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!bytes.length) {
      res.status(400).json({ error: 'Arquivo de comprovante vazio.' });
      return;
    }

    const savedProof = await saveProofFile(pedido.id, fileName, bytes);

    pedido.comprovante_url_local = savedProof.url;
    pedido.comprovante_nome_arquivo = fileName;
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);

    let telegramSent = false;
    let telegramError: string | null = null;
    try {
      const result = savedProof.filePath
        ? await sendTelegramDocument(savedProof.filePath, buildTelegramProofMessage(pedido))
        : await sendTelegramDocumentBytes(bytes, fileName, buildTelegramProofMessage(pedido));
      telegramSent = result.sent;
    } catch (error: any) {
      telegramError = error?.message || 'Falha ao enviar comprovante para o Telegram.';
      console.error('Erro ao enviar comprovante para o Telegram:', error);
      await notifyTelegramError(
        'Falha ao enviar comprovante',
        `Pedido: ${pedido.id}\n${telegramError}`,
      );
    }

    res.json({
      pedido,
      telegramSent,
      telegramError,
    });
  });

  app.get('/api/orders/:id/proof/:file', async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido || !pedido.comprovante_url_local) {
      res.status(404).send('Comprovante nao encontrado.');
      return;
    }

    const proof = await getProofFile(pedido.id, req.params.file);
    if (!proof) {
      res.status(404).send('Comprovante nao encontrado.');
      return;
    }

    res.setHeader('Content-Type', proof.contentType);
    if (proof.filePath) {
      res.sendFile(proof.filePath);
      return;
    }
    res.send(proof.bytes);
  });

  app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
    try {
      res.json(await listAllPedidos());
    } catch (error: any) {
      console.error('Erro ao listar pedidos na gestao:', error);
      res.status(500).json({ error: error?.message || 'Falha ao listar pedidos.' });
    }
  });

  app.get('/api/admin/themes', requireAdmin, async (_req, res) => {
    try {
      res.json(await listThemes());
    } catch (error: any) {
      console.error('Erro ao listar temas na gestao:', error);
      res.status(500).json({ error: error?.message || 'Falha ao listar temas.' });
    }
  });

  app.post('/api/admin/themes', requireAdmin, async (req, res) => {
    try {
      const theme = req.body as TemaConfig;
      res.json(await upsertTheme(theme));
    } catch (error: any) {
      console.error('Erro ao criar tema:', error);
      res.status(500).json({ error: error?.message || 'Falha ao criar tema.' });
    }
  });

  app.put('/api/admin/themes/:id', requireAdmin, async (req, res) => {
    try {
      const theme = req.body as TemaConfig;
      res.json(await upsertTheme({ ...theme, id: req.params.id }));
    } catch (error: any) {
      console.error('Erro ao salvar tema:', error);
      res.status(500).json({ error: error?.message || 'Falha ao salvar tema.' });
    }
  });

  app.delete('/api/admin/themes/:id', requireAdmin, async (req, res) => {
    try {
      await deleteTheme(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error('Erro ao excluir tema:', error);
      res.status(500).json({ error: error?.message || 'Falha ao excluir tema.' });
    }
  });

  app.get('/api/admin/prompt-templates', requireAdmin, async (_req, res) => {
    try {
      res.json(await listPromptTemplates());
    } catch (error: any) {
      console.error('Erro ao listar templates de prompt:', error);
      res.status(500).json({ error: error?.message || 'Falha ao listar templates de prompt.' });
    }
  });

  app.put('/api/admin/prompt-templates/:temaId', requireAdmin, async (req, res) => {
    try {
      const payload = req.body as Partial<PromptTemplate>;
      if (!payload.composeTemplate || !payload.refineTemplate) {
        res.status(400).json({ error: 'ComposeTemplate e refineTemplate sao obrigatorios.' });
        return;
      }

      const saved = await savePromptTemplate({
        temaId: req.params.temaId as PromptTemplate['temaId'],
        composeTemplate: payload.composeTemplate,
        refineTemplate: payload.refineTemplate,
        updatedAt: new Date().toISOString(),
      });

      res.json(saved);
    } catch (error: any) {
      console.error('Erro ao salvar template de prompt:', error);
      res.status(500).json({ error: error?.message || 'Falha ao salvar template de prompt.' });
    }
  });

  app.get('/api/admin/orders/:id/whatsapp-link', requireAdmin, async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido nao encontrado.' });
      return;
    }

    const whatsappLink = buildApprovalWhatsAppLink(pedido);
    if (!whatsappLink) {
      res.status(503).json({ error: 'WhatsApp do estudio nao configurado no servidor.' });
      return;
    }

    res.json({
      whatsappLink,
      whatsappNumber: getWhatsAppNumber(),
    });
  });

  app.post('/api/admin/orders/:id/resend-telegram', requireAdmin, async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido nao encontrado.' });
      return;
    }

    if (!pedido.letra_aprovada) {
      res.status(400).json({ error: 'Esse pedido ainda nao tem letra aprovada para reenviar.' });
      return;
    }

    try {
      const result = await sendTelegramApprovalNotification(pedido);
      res.json(result);
    } catch (error: any) {
      console.error('Erro ao reenviar letra para o Telegram:', error);
      await notifyTelegramError(
        'Falha ao reenviar letra aprovada',
        `Pedido: ${pedido.id}\n${error?.message || 'Erro desconhecido.'}`,
      );
      res.status(500).json({ error: error?.message || 'Falha ao reenviar letra para o Telegram.' });
    }
  });

  app.post('/api/admin/orders/:id/upload/:slot', requireAdmin, express.raw({ type: 'application/octet-stream', limit: '300mb' }), (req, res) => {
    const slot = req.params.slot;
    if (slot !== 'v1' && slot !== 'v2') {
      res.status(400).json({ error: 'Slot de upload invalido.' });
      return;
    }

    const fileName = decodeURIComponent(req.header('x-file-name') || `${slot}.wav`);
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!bytes.length) {
      res.status(400).json({ error: 'Arquivo vazio no upload.' });
      return;
    }

    const tempPath = saveUploadedTempFile(fileName, bytes);
    res.json({ tempPath, fileName });
  });

  app.post('/api/admin/orders/:id/attach-audio', requireAdmin, async (req, res) => {
    try {
      const { source1, source2, referenceUrl1, referenceUrl2 } = req.body as {
        source1: string;
        source2: string;
        referenceUrl1?: string;
        referenceUrl2?: string;
      };

      const pedido = await getPedido(req.params.id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido nao encontrado.' });
        return;
      }

      if (!source1 || !source2) {
        res.status(400).json({ error: 'Informe as duas fontes de audio para anexar.' });
        return;
      }

      const attached = await attachManualAudioToPedido(pedido.id, source1, source2, referenceUrl1, referenceUrl2);
      pedido.url_local_servidor = attached.url_local_servidor;
      pedido.url_local_servidor_2 = attached.url_local_servidor_2;
      pedido.url_referencia_externa_1 = attached.url_referencia_externa_1;
      pedido.url_referencia_externa_2 = attached.url_referencia_externa_2;
      pedido.status_producao = pedido.status_pagamento === 'PAGO' ? 'LIBERADO' : 'PREVIAS_PRONTAS';
      pedido.updatedAt = new Date().toISOString();

      await savePedido(pedido);
      res.json(pedido);
    } catch (error: any) {
      console.error('Erro ao anexar audio manual:', error);
      res.status(500).json({ error: error?.message || 'Erro ao anexar as faixas.' });
    }
  });

  app.post('/api/admin/orders/:id/mark-paid', requireAdmin, async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido nao encontrado.' });
      return;
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 10);
    pedido.status_pagamento = 'PAGO';
    pedido.status_producao = pedido.url_local_servidor && pedido.url_local_servidor_2 ? 'LIBERADO' : pedido.status_producao;
    pedido.data_expiracao_local = expDate.toISOString();
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);
    res.json(pedido);
  });

  app.post('/api/admin/orders/:id/mark-unpaid', requireAdmin, async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido nao encontrado.' });
      return;
    }

    pedido.status_pagamento = 'PENDENTE';
    pedido.data_expiracao_local = null;
    pedido.status_producao = pedido.url_local_servidor && pedido.url_local_servidor_2 ? 'PREVIAS_PRONTAS' : 'AGUARDANDO_FAIXAS';
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);
    res.json(pedido);
  });

  app.post('/api/admin/orders/:id/reset-audio', requireAdmin, async (req, res) => {
    const pedido = await getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido nao encontrado.' });
      return;
    }

    await clearPedidoAudio(pedido.id);
    pedido.url_original_suno = null;
    pedido.url_original_suno_2 = null;
    pedido.url_referencia_externa_1 = null;
    pedido.url_referencia_externa_2 = null;
    pedido.url_local_servidor = null;
    pedido.url_local_servidor_2 = null;
    pedido.status_producao = pedido.letra_aprovada ? 'AGUARDANDO_FAIXAS' : 'AGUARDANDO_APROVACAO';
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);
    res.json(pedido);
  });

  app.get('/audio/previa/:file', async (req, res) => {
    const audio = await getAudioFile(`previa_${req.params.file}`);
    if (!audio) {
      res.status(404).send('Arquivo de previa nao encontrado.');
      return;
    }

    res.setHeader('Content-Type', audio.contentType);
    if (audio.filePath) {
      res.sendFile(audio.filePath);
      return;
    }
    res.send(audio.bytes);
  });

  app.get('/audio/full/:file', async (req, res) => {
    const fileParam = req.params.file;
    const orderId = fileParam.split('_')[0];
    const pedido = await getPedido(orderId);
    if (!pedido || pedido.status_pagamento !== 'PAGO') {
      res.status(403).send('Acesso negado. Essa musica precisa de confirmacao manual do pagamento.');
      return;
    }

    const audio = await getAudioFile(fileParam);
    if (!audio) {
      res.status(404).send('Arquivo completo de audio nao encontrado.');
      return;
    }

    res.setHeader('Content-Type', audio.contentType);
    if (audio.filePath) {
      res.sendFile(audio.filePath);
      return;
    }
    res.send(audio.bytes);
  });

  if (!serveFrontend) {
    return app;
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

async function startServer() {
  const port = Number(process.env.PORT || 3000);
  const app = await createApp();

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Melodia Eterna Backend] Rodando com sucesso na porta: http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Falha critica ao iniciar o servidor express full-stack:', err);
  });
}
