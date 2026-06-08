import fs from 'fs';
import path from 'path';
import type { PedidoMusica } from '../src/types.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { normalizeTextDeep } from './text-normalize.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const PEDIDOS_DIR = path.join(DATA_DIR, 'pedidos');
const ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || 'pedidos';

if (!isSupabaseConfigured()) {
  ensureLocalPedidosDir();
}

function ensureLocalPedidosDir() {
  if (process.env.VERCEL) return;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PEDIDOS_DIR)) {
    fs.mkdirSync(PEDIDOS_DIR, { recursive: true });
  }
}

function listLocalPedidoFiles() {
  if (!fs.existsSync(PEDIDOS_DIR)) {
    return [];
  }

  return fs.readdirSync(PEDIDOS_DIR);
}

function normalizePedido(parsed: Partial<PedidoMusica>): PedidoMusica {
  return normalizeTextDeep({
    ...parsed,
    respostas: parsed.respostas || {
      temaId: '',
      respostas: {},
      estiloMusical: '',
      provVoice: '',
      descricaoMusical: '',
      clienteEmail: parsed.cliente_email || '',
      clienteWhatsapp: parsed.cliente_whatsapp || '',
    },
    comprovante_url_local: parsed.comprovante_url_local ?? null,
    comprovante_nome_arquivo: parsed.comprovante_nome_arquivo ?? null,
    ai_interactions: parsed.ai_interactions ?? [],
  } as PedidoMusica);
}

export async function savePedido(pedido: PedidoMusica): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const normalizedPedido = normalizePedido(pedido);
    const { error } = await supabase
      .from(ORDERS_TABLE)
      .upsert({
        id: normalizedPedido.id,
        created_at: normalizedPedido.createdAt,
        updated_at: normalizedPedido.updatedAt,
        cliente_email: normalizedPedido.cliente_email,
        cliente_whatsapp: normalizedPedido.cliente_whatsapp,
        tema_id: normalizedPedido.respostas.temaId,
        estilo_musical: normalizedPedido.respostas.estiloMusical,
        prov_voice: normalizedPedido.respostas.provVoice,
        letra_gerada: normalizedPedido.letra_gerada,
        letra_aprovada: normalizedPedido.letra_aprovada,
        termo_aceite_assinado: normalizedPedido.termo_aceite_assinado,
        termo_aceite_timestamp: normalizedPedido.termo_aceite_timestamp,
        status_pagamento: normalizedPedido.status_pagamento,
        status_producao: normalizedPedido.status_producao,
        pix_copia_e_cola: normalizedPedido.pix_copia_e_cola,
        pix_qr_code_url: normalizedPedido.pix_qr_code_url,
        url_original_suno: normalizedPedido.url_original_suno,
        url_original_suno_2: normalizedPedido.url_original_suno_2,
        url_referencia_externa_1: normalizedPedido.url_referencia_externa_1,
        url_referencia_externa_2: normalizedPedido.url_referencia_externa_2,
        url_local_servidor: normalizedPedido.url_local_servidor,
        url_local_servidor_2: normalizedPedido.url_local_servidor_2,
        comprovante_url_local: normalizedPedido.comprovante_url_local,
        comprovante_nome_arquivo: normalizedPedido.comprovante_nome_arquivo,
        data_expiracao_local: normalizedPedido.data_expiracao_local,
        ai_interactions: normalizedPedido.ai_interactions,
      }, { onConflict: 'id' });

    if (error) {
      throw new Error(`Erro ao salvar pedido no Supabase: ${error.message}`);
    }

    const { error: deleteAnswersError } = await supabase.from('pedido_respostas').delete().eq('pedido_id', normalizedPedido.id);
    if (deleteAnswersError) {
      throw new Error(`Erro ao substituir respostas do pedido no Supabase: ${deleteAnswersError.message}`);
    }

    const answerRows = Object.entries(normalizedPedido.respostas.respostas || {}).map(([questionId, answer]) => ({
      pedido_id: normalizedPedido.id,
      question_id: questionId,
      answer_text: answer,
    }));

    if (answerRows.length) {
      const { error: insertAnswersError } = await supabase.from('pedido_respostas').insert(answerRows);
      if (insertAnswersError) {
        throw new Error(`Erro ao salvar respostas do pedido no Supabase: ${insertAnswersError.message}`);
      }
    }
    return;
  }

  ensureLocalPedidosDir();
  const filePath = path.join(PEDIDOS_DIR, `${pedido.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(normalizePedido(pedido), null, 2), 'utf-8');
}

export async function getPedido(id: string): Promise<PedidoMusica | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const [{ data, error }, { data: answerRows, error: answersError }] = await Promise.all([
      supabase.from(ORDERS_TABLE).select('*').eq('id', id).maybeSingle(),
      supabase.from('pedido_respostas').select('question_id, answer_text').eq('pedido_id', id),
    ]);

    if (error) {
      throw new Error(`Erro ao buscar pedido no Supabase: ${error.message}`);
    }
    if (answersError) {
      throw new Error(`Erro ao buscar respostas do pedido no Supabase: ${answersError.message}`);
    }

    if (!data) return null;
    const respostas = Object.fromEntries((answerRows || []).map((row: any) => [row.question_id, row.answer_text || '']));
    return normalizePedido({
      id: data.id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      cliente_email: data.cliente_email,
      cliente_whatsapp: data.cliente_whatsapp,
      respostas: {
        temaId: data.tema_id,
        respostas,
        estiloMusical: data.estilo_musical || '',
        provVoice: data.prov_voice || '',
        descricaoMusical: respostas._descricao_musical || '',
        clienteEmail: data.cliente_email || '',
        clienteWhatsapp: data.cliente_whatsapp || '',
      },
      letra_gerada: data.letra_gerada,
      letra_aprovada: data.letra_aprovada,
      termo_aceite_assinado: data.termo_aceite_assinado,
      termo_aceite_timestamp: data.termo_aceite_timestamp,
      status_pagamento: data.status_pagamento,
      status_producao: data.status_producao,
      pix_copia_e_cola: data.pix_copia_e_cola,
      pix_qr_code_url: data.pix_qr_code_url,
      url_original_suno: data.url_original_suno,
      url_original_suno_2: data.url_original_suno_2,
      url_referencia_externa_1: data.url_referencia_externa_1,
      url_referencia_externa_2: data.url_referencia_externa_2,
      url_local_servidor: data.url_local_servidor,
      url_local_servidor_2: data.url_local_servidor_2,
      comprovante_url_local: data.comprovante_url_local,
      comprovante_nome_arquivo: data.comprovante_nome_arquivo,
      data_expiracao_local: data.data_expiracao_local,
      ai_interactions: data.ai_interactions || [],
    } as Partial<PedidoMusica>);
  }

  const filePath = path.join(PEDIDOS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PedidoMusica>;
    return normalizePedido(parsed);
  } catch (err) {
    console.error(`Erro ao ler pedido ${id}:`, err);
    return null;
  }
}

export async function listPedidosByContact(email: string, phone: string): Promise<PedidoMusica[]> {
  if (isSupabaseConfigured()) {
    const pedidos = await listAllPedidos();
    const normEmail = email.trim().toLowerCase();
    const normPhone = phone.replace(/[^\d]/g, '');

    return pedidos.filter((p) => {
      const dbEmail = p.cliente_email.trim().toLowerCase();
      const dbPhone = p.cliente_whatsapp.replace(/[^\d]/g, '');
      const emailMatches = Boolean(normEmail && dbEmail === normEmail);
      const phoneMatches = Boolean(normPhone && (dbPhone.includes(normPhone) || normPhone.includes(dbPhone)));
      return emailMatches || phoneMatches;
    });
  }

  const files = listLocalPedidoFiles();
  const pedidos: PedidoMusica[] = [];
  
  const normEmail = email.trim().toLowerCase();
  const normPhone = phone.replace(/[^\d]/g, '');

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const p = await getPedido(file.replace('.json', ''));
    if (p) {
      const dbEmail = p.cliente_email.trim().toLowerCase();
      const dbPhone = p.cliente_whatsapp.replace(/[^\d]/g, '');
      
      const emailMatches = normEmail && dbEmail === normEmail;
      const phoneMatches = Boolean(normPhone && (dbPhone.includes(normPhone) || normPhone.includes(dbPhone)));
      
      if (emailMatches || phoneMatches) {
        pedidos.push(p);
      }
    }
  }
  
  // Sort by newest first
  return pedidos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function listAllPedidos(): Promise<PedidoMusica[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const [{ data, error }, { data: answerRows, error: answersError }] = await Promise.all([
      supabase.from(ORDERS_TABLE).select('*').order('created_at', { ascending: false }),
      supabase.from('pedido_respostas').select('pedido_id, question_id, answer_text'),
    ]);

    if (error) {
      throw new Error(`Erro ao listar pedidos no Supabase: ${error.message}`);
    }
    if (answersError) {
      throw new Error(`Erro ao listar respostas dos pedidos no Supabase: ${answersError.message}`);
    }

    const answersByPedido = new Map<string, Record<string, string>>();
    for (const row of answerRows || []) {
      const current = answersByPedido.get((row as any).pedido_id) || {};
      current[(row as any).question_id] = (row as any).answer_text || '';
      answersByPedido.set((row as any).pedido_id, current);
    }

    return (data || []).map((row: any) => {
      const respostas = answersByPedido.get(row.id) || {};
      return normalizePedido({
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        cliente_email: row.cliente_email,
        cliente_whatsapp: row.cliente_whatsapp,
        respostas: {
          temaId: row.tema_id,
          respostas,
          estiloMusical: row.estilo_musical || '',
          provVoice: row.prov_voice || '',
          descricaoMusical: respostas._descricao_musical || '',
          clienteEmail: row.cliente_email || '',
          clienteWhatsapp: row.cliente_whatsapp || '',
        },
        letra_gerada: row.letra_gerada,
        letra_aprovada: row.letra_aprovada,
        termo_aceite_assinado: row.termo_aceite_assinado,
        termo_aceite_timestamp: row.termo_aceite_timestamp,
        status_pagamento: row.status_pagamento,
        status_producao: row.status_producao,
        pix_copia_e_cola: row.pix_copia_e_cola,
        pix_qr_code_url: row.pix_qr_code_url,
        url_original_suno: row.url_original_suno,
        url_original_suno_2: row.url_original_suno_2,
        url_referencia_externa_1: row.url_referencia_externa_1,
        url_referencia_externa_2: row.url_referencia_externa_2,
        url_local_servidor: row.url_local_servidor,
        url_local_servidor_2: row.url_local_servidor_2,
        comprovante_url_local: row.comprovante_url_local,
        comprovante_nome_arquivo: row.comprovante_nome_arquivo,
        data_expiracao_local: row.data_expiracao_local,
        ai_interactions: row.ai_interactions || [],
      } as Partial<PedidoMusica>);
    });
  }

  const files = listLocalPedidoFiles();
  const pedidos: PedidoMusica[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const pedido = await getPedido(file.replace('.json', ''));
    if (pedido) {
      pedidos.push(pedido);
    }
  }

  return pedidos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function deletePedido(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();

    const { error: deleteAnswersError } = await supabase.from('pedido_respostas').delete().eq('pedido_id', id);
    if (deleteAnswersError) {
      throw new Error(`Erro ao excluir respostas do pedido no Supabase: ${deleteAnswersError.message}`);
    }

    const { error: deleteOrderError } = await supabase.from(ORDERS_TABLE).delete().eq('id', id);
    if (deleteOrderError) {
      throw new Error(`Erro ao excluir pedido no Supabase: ${deleteOrderError.message}`);
    }

    return;
  }

  ensureLocalPedidosDir();
  const filePath = path.join(PEDIDOS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
