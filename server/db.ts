import fs from 'fs';
import path from 'path';
import { PedidoMusica } from '../src/types';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';

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
  return {
    ...parsed,
    comprovante_url_local: parsed.comprovante_url_local ?? null,
    comprovante_nome_arquivo: parsed.comprovante_nome_arquivo ?? null,
  } as PedidoMusica;
}

export async function savePedido(pedido: PedidoMusica): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from(ORDERS_TABLE)
      .upsert({
        id: pedido.id,
        created_at: pedido.createdAt,
        updated_at: pedido.updatedAt,
        data: pedido,
      }, { onConflict: 'id' });

    if (error) {
      throw new Error(`Erro ao salvar pedido no Supabase: ${error.message}`);
    }
    return;
  }

  ensureLocalPedidosDir();
  const filePath = path.join(PEDIDOS_DIR, `${pedido.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(pedido, null, 2), 'utf-8');
}

export async function getPedido(id: string): Promise<PedidoMusica | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select('data')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar pedido no Supabase: ${error.message}`);
    }

    return data?.data ? normalizePedido(data.data as Partial<PedidoMusica>) : null;
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
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select('data')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao listar pedidos no Supabase: ${error.message}`);
    }

    return (data || []).map((row) => normalizePedido(row.data as Partial<PedidoMusica>));
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
