import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

dotenv.config({ path: '.env.local' });
dotenv.config();

import type { RespostasFormulario, PedidoMusica, PromptTemplate, TemaConfig } from '../src/types.js';
import { savePedido, getPedido, listPedidosByContact, listAllPedidos, deletePedido } from '../server/db.js';
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
  const pixKey = 'e863ad88-7ae6-43a6-8778-a8505dcd80be';
  const merchantName = 'MELODIA ETERNA';
  const merchantCity = 'RIO BRANCO';
  const amount = '19.99';
  const txid = id.replace(/[^A-Z0-9]/gi, '').slice(0, 25) || 'MELODIAETERNA';

  const formatField = (fieldId: string, value: string) => `${fieldId}${value.length.toString().padStart(2, '0')}${value}`;
  const merchantAccountInfo = formatField('00', 'br.gov.bcb.pix') + formatField('01', pixKey);
  const additionalData = formatField('05', txid);
  const payloadWithoutCrc = [
    formatField('00', '01'),
    formatField('01', '12'),
    formatField('26', merchantAccountInfo),
    formatField('52', '0000'),
    formatField('53', '986'),
    formatField('54', amount),
    formatField('58', 'BR'),
    formatField('59', merchantName.slice(0, 25)),
    formatField('60', merchantCity.slice(0, 15)),
    formatField('62', additionalData),
    '6304',
  ].join('');

  let crc = 0xFFFF;
  for (let i = 0; i < payloadWithoutCrc.length; i += 1) {
    crc ^= payloadWithoutCrc.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }

  return `${payloadWithoutCrc}${crc.toString(16).toUpperCase().padStart(4, '0')}`;
}

const PREVIEW_UNLOCK_AMOUNT_CENTS = 200;
const FINAL_PAYMENT_AMOUNT_CENTS = 1799;
const TOTAL_ORDER_AMOUNT_CENTS = 1999;

type InfinitePayStage = 'preview' | 'final';

function getBaseUrl(req: express.Request) {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const host = forwardedHost || req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

function getInfinitePayHandle() {
  return (process.env.INFINITEPAY_HANDLE || '').trim().replace(/^\$/, '');
}

function hasAnyPreview(pedido: PedidoMusica) {
  return Boolean(pedido.url_local_servidor || pedido.url_local_servidor_2);
}

function hasBothPreviews(pedido: PedidoMusica) {
  return Boolean(pedido.url_local_servidor && pedido.url_local_servidor_2);
}

function isPreviewUnlocked(pedido: PedidoMusica) {
  return pedido.status_producao !== 'LETRA_APROVADA' && pedido.status_producao !== 'AGUARDANDO_APROVACAO';
}

function resolvePendingPaymentStage(pedido: PedidoMusica): InfinitePayStage | null {
  if (pedido.status_pagamento === 'PAGO') return null;
  if (!pedido.termo_aceite_assinado) return null;
  if (!isPreviewUnlocked(pedido)) return 'preview';
  return 'final';
}

function getChargeAmount(stage: InfinitePayStage) {
  return stage === 'preview' ? PREVIEW_UNLOCK_AMOUNT_CENTS : FINAL_PAYMENT_AMOUNT_CENTS;
}

function buildInfinitePayOrderNsu(pedidoId: string, stage: InfinitePayStage) {
  return `${pedidoId}:${stage}:${Date.now()}`;
}

function parseInfinitePayOrderNsu(orderNsu: string | undefined) {
  if (!orderNsu) return null;
  const [pedidoId, stage] = orderNsu.split(':');
  if (!pedidoId || (stage !== 'preview' && stage !== 'final')) return null;
  return {
    pedidoId,
    stage: stage as InfinitePayStage,
  };
}

function refreshProductionStatusAfterAudioUpdate(pedido: PedidoMusica) {
  if (pedido.status_pagamento === 'PAGO') {
    pedido.status_producao = 'LIBERADO';
    return;
  }

  if (!isPreviewUnlocked(pedido)) {
    pedido.status_producao = 'LETRA_APROVADA';
    return;
  }

  pedido.status_producao = hasAnyPreview(pedido) ? 'PREVIAS_PRONTAS' : 'AGUARDANDO_FAIXAS';
}

async function markPreviewPaymentAsConfirmed(pedido: PedidoMusica) {
  if (pedido.status_pagamento === 'PAGO') return pedido;
  pedido.status_producao = hasAnyPreview(pedido) ? 'PREVIAS_PRONTAS' : 'AGUARDANDO_FAIXAS';
  pedido.updatedAt = new Date().toISOString();
  await savePedido(pedido);
  return pedido;
}

async function markFinalPaymentAsConfirmed(pedido: PedidoMusica) {
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 10);
  pedido.status_pagamento = 'PAGO';
  pedido.status_producao = 'LIBERADO';
  pedido.data_expiracao_local = expDate.toISOString();
  pedido.updatedAt = new Date().toISOString();
  await savePedido(pedido);
  return pedido;
}

async function createInfinitePayCheckoutLink(req: express.Request, pedido: PedidoMusica, stage: InfinitePayStage) {
  const handle = getInfinitePayHandle();
  if (!handle) {
    throw new Error('INFINITEPAY_HANDLE nao configurado no servidor.');
  }

  const baseUrl = getBaseUrl(req);
  const orderNsu = buildInfinitePayOrderNsu(pedido.id, stage);
  const response = await fetch('https://api.checkout.infinitepay.io/links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      handle,
      redirect_url: `${baseUrl}/?pedido=${encodeURIComponent(pedido.id)}&payment_return=1&stage=${stage}`,
      webhook_url: `${baseUrl}/api/payments/infinitepay/webhook`,
      order_nsu: orderNsu,
      customer: {
        name: pedido.cliente_email.split('@')[0] || pedido.cliente_email || pedido.id,
        email: pedido.cliente_email,
        phone_number: pedido.cliente_whatsapp.startsWith('+') ? pedido.cliente_whatsapp : `+${pedido.cliente_whatsapp.replace(/\D/g, '')}`,
      },
      items: [
        {
          quantity: 1,
          price: getChargeAmount(stage),
          description: stage === 'preview'
            ? 'Liberacao da previa - valor abatido do total'
            : 'Complemento final da musica personalizada',
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) {
    throw new Error(data?.message || data?.error || 'Falha ao criar checkout da InfinitePay.');
  }

  return {
    checkoutUrl: data.url as string,
    orderNsu,
  };
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
  return normalized === '/resumo';
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

async function buildTelegramRecentProofsMessage() {
  const pedidos = await listAllPedidos();
  const recentProofs = pedidos
    .filter((pedido) => Boolean(pedido.comprovante_nome_arquivo || pedido.comprovante_url_local))
    .sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt).getTime();
      return dateB - dateA;
    })
    .slice(0, 10);

  if (!recentProofs.length) {
    return '<i>Nenhum pedido com comprovante enviado ate agora.</i>';
  }

  return [
    '<b>Ultimos 10 pedidos com comprovante enviado:</b>',
    ...recentProofs.map((pedido) => {
      const tema = pedido.respostas.temaId || 'sem tema';
      return `• <code>${escapeHtml(pedido.id)}</code> - ${escapeHtml(tema)} - ${escapeHtml(formatPedidoDate(pedido.updatedAt || pedido.createdAt))}`;
    }),
  ].join('\n');
}

function buildTelegramHelpMessage() {
  return [
    'Comandos do bot Melodia Eterna',
    '',
    '/resumo - resumo do sistema',
    '/help - mostra esta ajuda',
    '/pago - lista os comprovantes recentes e pede o ID para aprovar',
    '/pago MEL-XXXX - aprova o pagamento do pedido diretamente',
    '/musica - adiciona musicas (V1 e V2) a um pedido',
    '/cancelar - cancela a operacao em andamento',
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

interface TelegramSession {
  step: 'awaiting_pedido_id' | 'awaiting_paid_order_id' | 'awaiting_v1_audio' | 'awaiting_v1_url' | 'awaiting_v2_audio' | 'awaiting_v2_url';
  pedidoId?: string;
  tempPathV1?: string;
  fileNameV1?: string;
  urlV1?: string | null;
  tempPathV2?: string;
  fileNameV2?: string;
}

const telegramSessions = new Map<string | number, TelegramSession>();

function isPedidoId(text: string | undefined) {
  return Boolean(text && /^MEL-[A-Z0-9]+$/i.test(text.trim()));
}

function formatPedidoDate(value: string | null | undefined) {
  if (!value) return 'sem data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'sem data';
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clearSessionFiles(session: TelegramSession) {
  if (session.tempPathV1 && fs.existsSync(session.tempPathV1)) {
    try {
      fs.rmSync(session.tempPathV1, { force: true });
    } catch (error) {
      console.error('Falha ao remover arquivo temporario V1 da sessao:', error);
    }
  }
  if (session.tempPathV2 && fs.existsSync(session.tempPathV2)) {
    try {
      fs.rmSync(session.tempPathV2, { force: true });
    } catch (error) {
      console.error('Falha ao remover arquivo temporario V2 da sessao:', error);
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramReply(chatId: number | string, text: string, parseMode?: string) {
  try {
    await telegramApiRequest('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    });
  } catch (error) {
    console.error('Falha ao responder no Telegram:', error);
  }
}

async function handleTelegramSession(
  chatId: number | string,
  session: TelegramSession,
  message: NonNullable<TelegramUpdate['message']>
) {
  try {
    const text = message.text?.trim();

    if (session.step === 'awaiting_paid_order_id') {
      if (!text) {
        await sendTelegramReply(chatId, 'Por favor, digite o ID do pedido (ex: MEL-XXXXX) ou envie /cancelar:');
        return;
      }

      const pedidoId = text.toUpperCase();
      if (!isPedidoId(pedidoId)) {
        await sendTelegramReply(chatId, 'ID do pedido invalido. Por favor, envie no formato MEL-XXXXX ou envie /cancelar:');
        return;
      }

      const pedido = await getPedido(pedidoId);
      if (!pedido) {
        await sendTelegramReply(chatId, `Pedido ${pedidoId} nao encontrado no sistema. Por favor, digite um ID valido ou envie /cancelar:`);
        return;
      }

      const expDate = new Date();
      expDate.setDate(expDate.getDate() + 10);
      pedido.status_pagamento = 'PAGO';
      refreshProductionStatusAfterAudioUpdate(pedido);
      pedido.data_expiracao_local = expDate.toISOString();
      pedido.updatedAt = new Date().toISOString();
      await savePedido(pedido);

      telegramSessions.delete(chatId);
      await sendTelegramReply(
        chatId,
        `Pagamento aprovado no pedido ${pedido.id}. O cliente ja pode acessar a liberacao conforme o status do pedido.`
      );
      return;
    }

    if (session.step === 'awaiting_pedido_id') {
      if (!text) {
        await sendTelegramReply(chatId, 'Por favor, digite o ID do pedido (ex: MEL-XXXXX) ou envie /cancelar:');
        return;
      }
      const pedidoId = text.toUpperCase();
      if (!isPedidoId(pedidoId)) {
        await sendTelegramReply(chatId, 'ID do pedido invalido. Por favor, envie no formato MEL-XXXXX ou envie /cancelar:');
        return;
      }

      const pedido = await getPedido(pedidoId);
      if (!pedido) {
        await sendTelegramReply(chatId, `Pedido ${pedidoId} nao encontrado no sistema. Por favor, digite um ID valido ou envie /cancelar:`);
        return;
      }

      session.pedidoId = pedidoId;
      session.step = 'awaiting_v1_audio';
      await sendTelegramReply(
        chatId,
        `Pedido ${pedidoId} localizado!\n\nAgora, por favor, envie o *arquivo de audio* (ou documento) para a previa da versao 1 (V1):`,
        'Markdown'
      );
      return;
    }

    if (session.step === 'awaiting_v1_audio') {
      const media = message.document || message.audio;
      if (!media?.file_id) {
        await sendTelegramReply(chatId, 'Por favor, envie o arquivo de audio para a previa V1 ou envie /cancelar:');
        return;
      }

      try {
        await sendTelegramReply(chatId, 'Baixando arquivo da faixa V1...');
        const tempPath = await downloadTelegramFile(media.file_id, media.file_name);
        session.tempPathV1 = tempPath;
        session.fileNameV1 = media.file_name;
        session.step = 'awaiting_v1_url';

        await sendTelegramReply(
          chatId,
          'Audio V1 recebido com sucesso!\n\nAgora, envie a *URL de referencia V1* (Suno, YouTube, etc) ou digite *pular*:',
          'Markdown'
        );
      } catch (error: any) {
        console.error('Erro ao baixar audio V1:', error);
        await sendTelegramReply(chatId, `Erro ao baixar o arquivo: ${error?.message || error}. Por favor, tente enviar novamente ou envie /cancelar:`);
      }
      return;
    }

    if (session.step === 'awaiting_v1_url') {
      if (!text) {
        await sendTelegramReply(chatId, 'Por favor, envie a URL de referencia V1 ou digite *pular*:', 'Markdown');
        return;
      }

      const lowerInput = text.toLowerCase();
      if (lowerInput === 'pular' || lowerInput === 'pula') {
        session.urlV1 = null;
      } else {
        if (!/^https?:\/\//i.test(text)) {
          await sendTelegramReply(chatId, 'URL invalida. Envie um link valido com http:// ou https://, ou digite *pular*:', 'Markdown');
          return;
        }
        session.urlV1 = text;
      }

      session.step = 'awaiting_v2_audio';
      await sendTelegramReply(
        chatId,
        'URL V1 configurada!\n\nAgora, envie o *arquivo de audio* para a previa da versao 2 (V2), ou digite *pular* para finalizar salvando apenas a V1:',
        'Markdown'
      );
      return;
    }

    if (session.step === 'awaiting_v2_audio') {
      const lowerInput = text?.toLowerCase();
      if (lowerInput === 'pular' || lowerInput === 'pula') {
        try {
          await sendTelegramReply(chatId, 'Salvando informacoes e gerando previa V1...');
          console.log(`[/musica] Iniciando attachAudioSlotToPedido V1 para ${session.pedidoId} com arquivo ${session.tempPathV1}`);
          const attachedV1 = await attachAudioSlotToPedido(
            session.pedidoId!,
            'v1',
            session.tempPathV1!,
            session.urlV1 || undefined
          );
          console.log(`[/musica] attachAudioSlotToPedido V1 concluido para ${session.pedidoId}:`, attachedV1);

          const pedido = await getPedido(session.pedidoId!);
          if (pedido) {
            pedido.url_local_servidor = attachedV1.previewUrl;
            pedido.url_referencia_externa_1 = attachedV1.referenceUrl;
            refreshProductionStatusAfterAudioUpdate(pedido);
            pedido.updatedAt = new Date().toISOString();
            await savePedido(pedido);
          }

          await sendTelegramReply(
            chatId,
            `\u2705 <b>Musica V1 adicionada com sucesso!</b>\n\nPedido: <code>${escapeHtml(session.pedidoId!)}</code>\nPrevia V1: <code>${escapeHtml(attachedV1.previewUrl)}</code>\nReferencia V1: ${attachedV1.referenceUrl ? `<a href="${escapeHtml(attachedV1.referenceUrl)}">${escapeHtml(attachedV1.referenceUrl)}</a>` : 'Nenhuma'}\nA versao V2 foi pulada.`,
            'HTML'
          );
        } catch (error: any) {
          console.error('Erro ao salvar V1:', error);
          await sendTelegramReply(chatId, `\u274c Erro ao salvar: ${escapeHtml(error.message || error)}`);
        } finally {
          clearSessionFiles(session);
          telegramSessions.delete(chatId);
        }
        return;
      }

      const media = message.document || message.audio;
      if (!media?.file_id) {
        await sendTelegramReply(chatId, 'Por favor, envie o arquivo de audio para a previa V2 ou digite <b>pular</b> para finalizar apenas com a V1:', 'HTML');
        return;
      }

      try {
        await sendTelegramReply(chatId, 'Baixando arquivo da faixa V2...');
        const tempPath = await downloadTelegramFile(media.file_id, media.file_name);
        session.tempPathV2 = tempPath;
        session.fileNameV2 = media.file_name;
        session.step = 'awaiting_v2_url';

        await sendTelegramReply(
          chatId,
          'Audio V2 recebido com sucesso!\n\nAgora, envie a <b>URL de referencia V2</b> (Suno, YouTube, etc) ou digite <b>pular</b>:',
          'HTML'
        );
      } catch (error: any) {
        console.error('Erro ao baixar audio V2:', error);
        await sendTelegramReply(chatId, `Erro ao baixar o arquivo V2: ${escapeHtml(error?.message || error)}. Tente novamente ou digite <b>pular</b>:`, 'HTML');
      }
      return;
    }

    if (session.step === 'awaiting_v2_url') {
      if (!text) {
        await sendTelegramReply(chatId, 'Por favor, envie a URL de referencia V2 ou digite <b>pular</b>:', 'HTML');
        return;
      }

      let urlV2: string | null = null;
      const lowerInput = text.toLowerCase();
      if (lowerInput === 'pular' || lowerInput === 'pula') {
        urlV2 = null;
      } else {
        if (!/^https?:\/\//i.test(text)) {
          await sendTelegramReply(chatId, 'URL invalida. Envie um link valido com http:// ou https://, ou digite <b>pular</b>:', 'HTML');
          return;
        }
        urlV2 = text;
      }

      try {
        await sendTelegramReply(chatId, 'Salvando informacoes e gerando previas V1 e V2...');
        console.log(`[/musica] Iniciando attachAudioSlotToPedido V1 para ${session.pedidoId} com arquivo ${session.tempPathV1}`);
        const attachedV1 = await attachAudioSlotToPedido(
          session.pedidoId!,
          'v1',
          session.tempPathV1!,
          session.urlV1 || undefined
        );
        console.log(`[/musica] attachAudioSlotToPedido V1 concluido para ${session.pedidoId}:`, attachedV1);

        console.log(`[/musica] Iniciando attachAudioSlotToPedido V2 para ${session.pedidoId} com arquivo ${session.tempPathV2}`);
        const attachedV2 = await attachAudioSlotToPedido(
          session.pedidoId!,
          'v2',
          session.tempPathV2!,
          urlV2 || undefined
        );
        console.log(`[/musica] attachAudioSlotToPedido V2 concluido para ${session.pedidoId}:`, attachedV2);

        const pedido = await getPedido(session.pedidoId!);
        if (pedido) {
          pedido.url_local_servidor = attachedV1.previewUrl;
          pedido.url_referencia_externa_1 = attachedV1.referenceUrl;
          pedido.url_local_servidor_2 = attachedV2.previewUrl;
          pedido.url_referencia_externa_2 = attachedV2.referenceUrl;
          const hasBothPreviews = Boolean(pedido.url_local_servidor && pedido.url_local_servidor_2);
          refreshProductionStatusAfterAudioUpdate(pedido);
          pedido.updatedAt = new Date().toISOString();
          await savePedido(pedido);
        }

        await sendTelegramReply(
          chatId,
          `\u2705 <b>Musicas V1 e V2 adicionadas com sucesso!</b>\n\nPedido: <code>${escapeHtml(session.pedidoId!)}</code>\nPrevia V1: <code>${escapeHtml(attachedV1.previewUrl)}</code>\nReferencia V1: ${attachedV1.referenceUrl ? `<a href="${escapeHtml(attachedV1.referenceUrl)}">${escapeHtml(attachedV1.referenceUrl)}</a>` : 'Nenhuma'}\nPrevia V2: <code>${escapeHtml(attachedV2.previewUrl)}</code>\nReferencia V2: ${attachedV2.referenceUrl ? `<a href="${escapeHtml(attachedV2.referenceUrl)}">${escapeHtml(attachedV2.referenceUrl)}</a>` : 'Nenhuma'}`,
          'HTML'
        );
      } catch (error: any) {
        console.error('Erro ao salvar V1 e V2:', error);
        await sendTelegramReply(chatId, `\u274c Erro ao salvar: ${escapeHtml(error.message || error)}`);
      } finally {
        clearSessionFiles(session);
        telegramSessions.delete(chatId);
      }
      return;
    }
  } catch (error: any) {
    console.error('Erro na sessao do Telegram:', error);
    try {
      await sendTelegramReply(chatId, `\u274c Erro ao processar a operacao: ${escapeHtml(error?.message || error)}. A sessao foi cancelada.`);
    } catch (replyError) {
      console.error('Erro ao notificar erro de sessao:', replyError);
    }
    clearSessionFiles(session);
    telegramSessions.delete(chatId);
  }
}

async function processTelegramMusicUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.chat) {
    return;
  }

  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (text === '/cancelar') {
    const session = telegramSessions.get(chatId);
    if (session) {
      clearSessionFiles(session);
      telegramSessions.delete(chatId);
      await sendTelegramReply(chatId, '\u274c Operacao cancelada. A sessao foi limpa.');
    } else {
      await sendTelegramReply(chatId, 'Nao ha nenhuma operacao ativa para cancelar.');
    }
    return;
  }

  const isHelp = isTelegramHelpCommand(text);
  const isStats = isTelegramStatsCommand(text);
  const markPaid = parseTelegramMarkPaidCommand(text);
  const audioCommand = parseTelegramAudioCommand(message.caption || message.text);

  if (isHelp || isStats || markPaid || audioCommand || text === '/musica') {
    const session = telegramSessions.get(chatId);
    if (session) {
      clearSessionFiles(session);
      telegramSessions.delete(chatId);
    }
  }

  if (isHelp) {
    await sendTelegramReply(chatId, buildTelegramHelpMessage());
    return;
  }

  if (isStats) {
    await sendTelegramReply(chatId, await buildTelegramStatsMessage());
    return;
  }

  if (markPaid) {
    const pedido = await getPedido(markPaid.pedidoId);
    if (!pedido) {
      await sendTelegramReply(chatId, `Pedido ${markPaid.pedidoId} nao encontrado.`);
      return;
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 10);
    pedido.status_pagamento = 'PAGO';
    pedido.data_expiracao_local = expDate.toISOString();
    refreshProductionStatusAfterAudioUpdate(pedido);
    pedido.updatedAt = new Date().toISOString();
    await savePedido(pedido);

    await sendTelegramReply(
      chatId,
      `Pagamento aprovado no pedido ${pedido.id}. O cliente ja pode acessar a liberacao conforme o status do pedido.`
    );
    return;
  }

  if (text === '/pago' || text === '/aprovar_pagamento') {
    telegramSessions.set(chatId, { step: 'awaiting_paid_order_id' });

    let recentProofsList = '';
    try {
      recentProofsList = await buildTelegramRecentProofsMessage();
    } catch (error) {
      console.error('Erro ao listar pedidos com comprovante para /pago:', error);
      recentProofsList = '<i>Nao foi possivel carregar a lista de comprovantes recentes.</i>';
    }

    await sendTelegramReply(
      chatId,
      `💸 <b>Aprovar Pagamento</b>\n\n${recentProofsList}\n\nDigite o ID do pedido para aprovar o pagamento (ex: <code>MEL-LJSGQ0DTN</code>):\n\n💡 <i>Voce pode enviar /cancelar a qualquer momento para sair.</i>`,
      'HTML'
    );
    return;
  }

  if (text === '/musica') {
    telegramSessions.set(chatId, { step: 'awaiting_pedido_id' });

    let pendingList = '';
    try {
      const allPedidos = await listAllPedidos();
      const pending = allPedidos.filter((p) => p.status_producao === 'AGUARDANDO_FAIXAS');
      if (pending.length > 0) {
        const lines = pending.slice(0, 15).map((p) => {
          const tema = p.respostas.temaId || 'sem tema';
          const estilo = p.respostas.estiloMusical || 'sem estilo';
          return `\u2022 <code>${escapeHtml(p.id)}</code> - ${escapeHtml(tema)} (${escapeHtml(estilo)})`;
        });
        pendingList = '\n\n\ud83d\udccb <b>Pedidos aguardando faixas:</b>\n' + lines.join('\n');
        if (pending.length > 15) {
          pendingList += `\n<i>...e mais ${pending.length - 15} pedidos</i>`;
        }
      } else {
        pendingList = '\n\n<i>Nenhum pedido aguardando faixas no momento.</i>';
      }
    } catch (error) {
      console.error('Erro ao listar pedidos pendentes para /musica:', error);
    }

    await sendTelegramReply(
      chatId,
      `\ud83c\udfb5 <b>Adicionar Musica ao Sistema</b>${pendingList}\n\nDigite o ID do pedido (ex: <code>MEL-LJSGQ0DTN</code>):\n\n\ud83d\udca1 <i>Voce pode enviar /cancelar a qualquer momento para sair.</i>`,
      'HTML'
    );
    return;
  }

  const session = telegramSessions.get(chatId);
  if (session) {
    await handleTelegramSession(chatId, session, message);
    return;
  }

  if (audioCommand) {
    const media = message.document || message.audio;
    if (!media?.file_id) {
      await sendTelegramReply(
        chatId,
        `Envie o arquivo com a legenda no formato "${audioCommand.pedidoId} ${audioCommand.version}".`
      );
      return;
    }

    const pedido = await getPedido(audioCommand.pedidoId);
    if (!pedido) {
      await sendTelegramReply(chatId, `Pedido ${audioCommand.pedidoId} nao encontrado.`);
      return;
    }

    let tempPath: string | null = null;
    try {
      tempPath = await downloadTelegramFile(media.file_id, media.file_name);
      const attached = await attachAudioSlotToPedido(
        pedido.id,
        audioCommand.version,
        tempPath,
        `telegram:${media.file_id}`
      );

      if (audioCommand.version === 'v1') {
        pedido.url_local_servidor = attached.previewUrl;
        pedido.url_referencia_externa_1 = attached.referenceUrl;
      } else {
        pedido.url_local_servidor_2 = attached.previewUrl;
        pedido.url_referencia_externa_2 = attached.referenceUrl;
      }

      const hasBothPreviews = Boolean(pedido.url_local_servidor && pedido.url_local_servidor_2);
      refreshProductionStatusAfterAudioUpdate(pedido);
      pedido.updatedAt = new Date().toISOString();
      await savePedido(pedido);

      await sendTelegramReply(
        chatId,
        hasBothPreviews
          ? `Faixa ${audioCommand.version.toUpperCase()} anexada ao pedido ${pedido.id}. As duas previas ja estao prontas.`
          : `Faixa ${audioCommand.version.toUpperCase()} anexada ao pedido ${pedido.id}. Agora envie a outra faixa.`
      );
    } catch (error: any) {
      console.error('Erro ao anexar faixa recebida no Telegram:', error);
      await notifyTelegramError(
        'Falha ao anexar faixa do Telegram',
        `Pedido: ${audioCommand.pedidoId}\nSlot: ${audioCommand.version}\n${error?.message || 'Erro desconhecido.'}`
      );
      await sendTelegramReply(
        chatId,
        `Nao foi possivel anexar a faixa ${audioCommand.version.toUpperCase()} no pedido ${audioCommand.pedidoId}.`
      );
    } finally {
      if (tempPath) {
        fs.rmSync(tempPath, { force: true });
      }
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
        { command: 'resumo', description: 'Resumo do sistema' },
        { command: 'help', description: 'Ajuda e formatos do bot' },
        { command: 'pago', description: 'Aprova pagamento de um pedido' },
        { command: 'musica', description: 'Adiciona musicas (previa e URL) ao pedido' },
        { command: 'cancelar', description: 'Cancela operacao em andamento' },
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

function getPublicSupabaseKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || 'sb_publishable_QJALiUj_8T_LD-0HqbsSRA_SlJoI2Cl';
}

async function getAdminUserFromRequest(req: express.Request) {
  const authHeader = req.header('authorization') || '';
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!tokenMatch) {
    return null;
  }

  const accessToken = tokenMatch[1];
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id || !userData.user.email) {
    return null;
  }

  const { data: adminRow, error: adminError } = await supabase
    .from('admin_users')
    .select('user_id, email, is_active')
    .eq('user_id', userData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (adminError || !adminRow) {
    return null;
  }

  return {
    id: userData.user.id,
    email: userData.user.email,
  };
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const adminUser = await getAdminUserFromRequest(req);
    if (!adminUser) {
      res.status(401).json({ error: 'Sessao da gestao invalida ou expirada.' });
      return;
    }

    (req as express.Request & { adminUser?: { id: string; email: string } }).adminUser = adminUser;
    next();
  } catch (error: any) {
    console.error('Erro ao validar sessao admin:', error);
    res.status(500).json({ error: error?.message || 'Falha ao validar sessao da gestao.' });
  }
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
        adminPassword: false,
        supabase: isSupabaseConfigured(),
        storageProvider: process.env.STORAGE_PROVIDER || 'local',
      },
    });
  });

  app.get('/api/config/public', (_req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabasePublishableKey: getPublicSupabaseKey(),
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

  app.get('/api/debug/env', (req, res) => {
    const handle = getInfinitePayHandle();
    res.json({
      infinitepayHandleConfigured: Boolean(handle),
      infinitepayHandlePreview: handle ? `${handle.slice(0, 4)}***${handle.slice(-4)}` : null,
      appUrlConfigured: Boolean(process.env.APP_URL),
      appUrl: process.env.APP_URL || null,
      host: req.get('host') || null,
      forwardedHost: req.headers['x-forwarded-host'] || null,
      forwardedProto: req.headers['x-forwarded-proto'] || null,
      nodeEnv: process.env.NODE_ENV || null,
      vercelEnv: process.env.VERCEL_ENV || null,
    });
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
      pedido.status_producao = 'LETRA_APROVADA';
      pedido.pix_copia_e_cola = null;
      pedido.pix_qr_code_url = null;
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

  app.post('/api/orders/:id/create-checkout', async (req, res) => {
    try {
      const pedido = await getPedido(req.params.id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
        return;
      }

      const stage = resolvePendingPaymentStage(pedido);
      if (!stage) {
        res.status(409).json({ error: 'Esse pedido nao possui cobranca pendente.' });
        return;
      }

      if (stage === 'final' && !hasAnyPreview(pedido)) {
        res.status(409).json({ error: 'A previa ainda nao esta disponivel para cobrar o valor final.' });
        return;
      }

      const checkout = await createInfinitePayCheckoutLink(req, pedido, stage);
      res.json({
        ...checkout,
        stage,
        amountCents: getChargeAmount(stage),
        totalAmountCents: TOTAL_ORDER_AMOUNT_CENTS,
        remainingAmountCents: stage === 'preview' ? FINAL_PAYMENT_AMOUNT_CENTS : 0,
      });
    } catch (error: any) {
      console.error('Erro ao criar checkout da InfinitePay:', error);
      res.status(500).json({ error: error?.message || 'Falha ao criar checkout da InfinitePay.' });
    }
  });

  app.post('/api/payments/infinitepay/webhook', async (req, res) => {
    try {
      const parsed = parseInfinitePayOrderNsu(req.body?.order_nsu);
      if (!parsed) {
        res.status(400).json({ success: false, message: 'order_nsu invalido.' });
        return;
      }

      const pedido = await getPedido(parsed.pedidoId);
      if (!pedido) {
        res.status(400).json({ success: false, message: 'Pedido nao encontrado.' });
        return;
      }

      if (parsed.stage === 'preview') {
        await markPreviewPaymentAsConfirmed(pedido);
      } else {
        await markFinalPaymentAsConfirmed(pedido);
      }

      res.json({ success: true, message: null });
    } catch (error: any) {
      console.error('Erro no webhook da InfinitePay:', error);
      res.status(400).json({ success: false, message: error?.message || 'Falha ao processar webhook.' });
    }
  });

  app.post('/api/payment/simulate-confirm', async (req, res) => {
    const { id } = req.body as { id: string };
    const pedido = await getPedido(id);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
      return;
    }

    await markFinalPaymentAsConfirmed(pedido);
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

  app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
    try {
      const pedido = await getPedido(req.params.id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido nao encontrado.' });
        return;
      }

      await deletePedido(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error('Erro ao excluir pedido na gestao:', error);
      res.status(500).json({ error: error?.message || 'Falha ao excluir pedido.' });
    }
  });

  app.get('/api/admin/session', requireAdmin, async (req, res) => {
    const adminUser = (req as express.Request & { adminUser?: { id: string; email: string } }).adminUser;
    res.json({
      user: adminUser,
    });
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
      refreshProductionStatusAfterAudioUpdate(pedido);
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
    pedido.data_expiracao_local = expDate.toISOString();
    refreshProductionStatusAfterAudioUpdate(pedido);
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
    refreshProductionStatusAfterAudioUpdate(pedido);
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
    pedido.status_producao = pedido.letra_aprovada ? 'LETRA_APROVADA' : 'AGUARDANDO_APROVACAO';
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

let vercelAppPromise: Promise<express.Express> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!vercelAppPromise) {
      vercelAppPromise = createApp({ serveFrontend: false });
    }

    const app = await vercelAppPromise;
    return app(req, res);
  } catch (error: any) {
    console.error('Falha ao inicializar API da Vercel:', error);
    res.status(500).json({
      error: 'Falha ao inicializar API da Vercel.',
      message: error?.message || 'Erro desconhecido.',
      stack: process.env.NODE_ENV !== 'production' ? error?.stack || null : null,
    });
  }
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
