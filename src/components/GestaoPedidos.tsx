import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, LoaderCircle, Lock, Music2, RefreshCw, Send } from 'lucide-react';
import { PedidoMusica } from '../types';

interface GestaoPedidosProps {
  onBack: () => void;
}

type Drafts = Record<string, {
  source1: string;
  source2: string;
  referenceUrl1: string;
  referenceUrl2: string;
  fileName1: string;
  fileName2: string;
}>;

export default function GestaoPedidos({ onBack }: GestaoPedidosProps) {
  const [password, setPassword] = useState(() => localStorage.getItem('melodia_admin_password') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PedidoMusica[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [pageError, setPageError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setAuthError(null);
    setPageError(null);

    try {
      const response = await fetch('/api/admin/orders', {
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setAuthenticated(false);
          localStorage.removeItem('melodia_admin_password');
        }
        throw new Error(data.error || 'Falha ao carregar os pedidos.');
      }

      setAuthenticated(true);
      localStorage.setItem('melodia_admin_password', password);
      setOrders(data);
      setDrafts((current) => {
        const next = { ...current };
        for (const order of data as PedidoMusica[]) {
          next[order.id] = next[order.id] || {
            source1: '',
            source2: '',
            referenceUrl1: order.url_referencia_externa_1 || '',
            referenceUrl2: order.url_referencia_externa_2 || '',
            fileName1: '',
            fileName2: '',
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!password) return;
    loadOrders().catch((err) => {
      setLoading(false);
      setAuthError(err.message);
    });
  }, []);

  function setDraft(orderId: string, patch: Partial<Drafts[string]>) {
    setDrafts((current) => ({
      ...current,
      [orderId]: {
        source1: current[orderId]?.source1 || '',
        source2: current[orderId]?.source2 || '',
        referenceUrl1: current[orderId]?.referenceUrl1 || '',
        referenceUrl2: current[orderId]?.referenceUrl2 || '',
        fileName1: current[orderId]?.fileName1 || '',
        fileName2: current[orderId]?.fileName2 || '',
        ...patch,
      },
    }));
  }

  async function login() {
    try {
      await loadOrders();
    } catch (err: any) {
      setAuthError(err.message || 'Senha invalida.');
    }
  }

  async function uploadFile(orderId: string, slot: 'v1' | 'v2', file: File) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/upload/${slot}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-admin-password': password,
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha no upload.');

      if (slot === 'v1') {
        setDraft(orderId, { source1: data.tempPath, fileName1: data.fileName });
      } else {
        setDraft(orderId, { source2: data.tempPath, fileName2: data.fileName });
      }
    } catch (err: any) {
      setPageError(err.message || 'Falha no upload.');
    } finally {
      setBusyId(null);
    }
  }

  async function attachAudio(orderId: string) {
    const draft = drafts[orderId];
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/attach-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao anexar audio.');
      await loadOrders();
      setDraft(orderId, { source1: '', source2: '', fileName1: '', fileName2: '' });
    } catch (err: any) {
      setPageError(err.message || 'Falha ao anexar audio.');
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao marcar como pago.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao marcar como pago.');
    } finally {
      setBusyId(null);
    }
  }

  async function markUnpaid(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/mark-unpaid`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao voltar para nao pago.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao voltar para nao pago.');
    } finally {
      setBusyId(null);
    }
  }

  async function resetAudio(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/reset-audio`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao limpar as faixas.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao limpar as faixas.');
    } finally {
      setBusyId(null);
    }
  }

  async function resendTelegram(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/resend-telegram`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao reenviar a letra no Telegram.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao reenviar a letra no Telegram.');
    } finally {
      setBusyId(null);
    }
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white border border-natural-border rounded-3xl shadow-xs p-6 space-y-5">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-natural-subtext uppercase tracking-wider cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </button>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-natural-sage/10 mx-auto flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-natural-sage" />
            </div>
            <h2 className="text-2xl font-bold font-display text-natural-dark">Acesso a Gestao</h2>
            <p className="text-sm text-natural-subtext mt-1">Informe a senha para abrir a area interna de pedidos.</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha da gestao"
            className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm"
          />
          {authError && <p className="text-sm text-[#9A5B33]">{authError}</p>}
          <button type="button" onClick={() => login().catch(console.error)} className="w-full py-3 bg-natural-sage text-white rounded-xl text-sm font-bold cursor-pointer">
            Entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-between items-center border-b border-natural-border pb-4">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-natural-subtext uppercase tracking-wider cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>
        <button type="button" onClick={() => loadOrders().catch(console.error)} className="flex items-center gap-2 px-4 py-2 bg-white border border-natural-border rounded-xl text-xs font-semibold text-natural-dark cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar pedidos
        </button>
      </div>

      <div>
        <h2 className="text-3xl font-bold font-display text-natural-dark">Gestao de Pedidos</h2>
        <p className="text-sm text-natural-subtext mt-1">
          Anexe as duas musicas, registre as URLs de referencia e marque o pagamento manualmente quando receber o comprovante.
        </p>
      </div>

      {pageError && (
        <div className="rounded-2xl border border-[#E7C7AF] bg-[#FFF7F2] px-4 py-3 text-sm text-[#9A5B33]">
          {pageError}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-natural-subtext">
          <LoaderCircle className="w-8 h-8 animate-spin mx-auto mb-3" />
          Carregando pedidos...
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const draft = drafts[order.id] || { source1: '', source2: '', referenceUrl1: '', referenceUrl2: '', fileName1: '', fileName2: '' };
            const busy = busyId === order.id;
            return (
              <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-natural-border rounded-3xl p-5 md:p-6 shadow-xs">
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="lg:w-1/3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-natural-dark">{order.id}</span>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded border bg-natural-sage-light text-natural-subtext">{order.status_producao}</span>
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded border ${order.status_pagamento === 'PAGO' ? 'bg-[#EBF5EE] text-[#1B5E20] border-[#C8E6C9]' : 'bg-[#FFF7F2] text-[#9A5B33] border-[#E7C7AF]'}`}>{order.status_pagamento}</span>
                    </div>
                    <p className="text-sm text-natural-dark">{order.cliente_email}</p>
                    <p className="text-sm text-natural-subtext">{order.cliente_whatsapp}</p>
                    <p className="text-xs text-natural-subtext">Tema: {order.respostas.temaId} | Estilo: {order.respostas.estiloMusical}</p>
                    <p className="text-xs text-natural-subtext">Previa 1: {order.url_local_servidor || 'nao anexada'}</p>
                    <p className="text-xs text-natural-subtext">Previa 2: {order.url_local_servidor_2 || 'nao anexada'}</p>
                    <p className="text-xs text-natural-subtext">Comprovante: {order.comprovante_nome_arquivo || 'nao enviado'}</p>
                  </div>

                  <div className="lg:flex-1 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-semibold text-natural-subtext block mb-2">Upload da faixa 1</span>
                        <input
                          type="file"
                          accept=".mp3,.wav,audio/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile(order.id, 'v1', file).catch(console.error);
                          }}
                          className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm"
                        />
                        {draft.fileName1 && <span className="text-[11px] text-natural-subtext mt-1 block">{draft.fileName1}</span>}
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-natural-subtext block mb-2">Upload da faixa 2</span>
                        <input
                          type="file"
                          accept=".mp3,.wav,audio/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile(order.id, 'v2', file).catch(console.error);
                          }}
                          className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm"
                        />
                        {draft.fileName2 && <span className="text-[11px] text-natural-subtext mt-1 block">{draft.fileName2}</span>}
                      </label>
                      <input value={draft.referenceUrl1} onChange={(e) => setDraft(order.id, { referenceUrl1: e.target.value })} placeholder="URL de referencia da faixa 1" className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
                      <input value={draft.referenceUrl2} onChange={(e) => setDraft(order.id, { referenceUrl2: e.target.value })} placeholder="URL de referencia da faixa 2" className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
                    </div>

                    <div className="rounded-2xl border border-[#E7C7AF] bg-[#FFF7F2] px-4 py-3 text-[12px] text-[#9A5B33] leading-relaxed">
                      Para gerar previa sem FFmpeg instalado no servidor, envie as faixas em <strong>WAV</strong>. Se enviar MP3, o servidor vai pedir FFmpeg.
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button type="button" disabled={busy || !order.letra_aprovada} onClick={() => resendTelegram(order.id)} className="px-4 py-3 bg-[#1F7A4D] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        <Send className="w-4 h-4" /> Reenviar letra no Telegram
                      </button>
                      <button type="button" disabled={busy || !draft.source1 || !draft.source2} onClick={() => attachAudio(order.id)} className="px-4 py-3 bg-natural-sage text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        <Music2 className="w-4 h-4" /> Anexar faixas e gerar previas
                      </button>
                      <button type="button" disabled={busy} onClick={() => markPaid(order.id)} className="px-4 py-3 bg-[#2E7D32] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        <CheckCircle2 className="w-4 h-4" /> Marcar como pago
                      </button>
                      <button type="button" disabled={busy} onClick={() => markUnpaid(order.id)} className="px-4 py-3 bg-[#9A5B33] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        Nao pago
                      </button>
                      <button type="button" disabled={busy} onClick={() => resetAudio(order.id)} className="px-4 py-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-subtext cursor-pointer disabled:opacity-60">
                        Limpar faixas
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
