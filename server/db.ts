import fs from 'fs';
import path from 'path';
import { PedidoMusica } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PEDIDOS_DIR = path.join(DATA_DIR, 'pedidos');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(PEDIDOS_DIR)) {
  fs.mkdirSync(PEDIDOS_DIR);
}

export function savePedido(pedido: PedidoMusica): void {
  const filePath = path.join(PEDIDOS_DIR, `${pedido.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(pedido, null, 2), 'utf-8');
}

export function getPedido(id: string): PedidoMusica | null {
  const filePath = path.join(PEDIDOS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PedidoMusica>;
    return {
      ...parsed,
      comprovante_url_local: parsed.comprovante_url_local ?? null,
      comprovante_nome_arquivo: parsed.comprovante_nome_arquivo ?? null,
    } as PedidoMusica;
  } catch (err) {
    console.error(`Erro ao ler pedido ${id}:`, err);
    return null;
  }
}

export function listPedidosByContact(email: string, phone: string): PedidoMusica[] {
  const files = fs.readdirSync(PEDIDOS_DIR);
  const pedidos: PedidoMusica[] = [];
  
  const normEmail = email.trim().toLowerCase();
  const normPhone = phone.replace(/[^\d]/g, '');

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const p = getPedido(file.replace('.json', ''));
    if (p) {
      const dbEmail = p.cliente_email.trim().toLowerCase();
      const dbPhone = p.cliente_whatsapp.replace(/[^\d]/g, '');
      
      const emailMatches = normEmail && dbEmail === normEmail;
      const phoneMatches = normPhone && dbPhone.includes(normPhone) || normPhone.includes(dbPhone);
      
      if (emailMatches || phoneMatches) {
        pedidos.push(p);
      }
    }
  }
  
  // Sort by newest first
  return pedidos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function listAllPedidos(): PedidoMusica[] {
  const files = fs.readdirSync(PEDIDOS_DIR);
  const pedidos: PedidoMusica[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const pedido = getPedido(file.replace('.json', ''));
    if (pedido) {
      pedidos.push(pedido);
    }
  }

  return pedidos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
