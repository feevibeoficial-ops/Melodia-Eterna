import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Mail, Phone, ArrowLeft, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { DEFAULT_TEMAS, PedidoMusica, TemaConfig } from '../types';

interface MinhasMusicasProps {
  onBack: () => void;
  onSelectPedido: (pedido: PedidoMusica) => void;
}

export default function MinhasMusicas({ onBack, onSelectPedido }: MinhasMusicasProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PedidoMusica[]>([]);
  const [searched, setSearched] = useState(false);
  const [themes, setThemes] = useState<TemaConfig[]>(DEFAULT_TEMAS);

  useEffect(() => {
    fetch('/api/config/themes')
      .then(async (response) => {
        if (!response.ok) return [];
        return response.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length) {
          setThemes(data as TemaConfig[]);
        }
      })
      .catch(() => undefined);
  }, []);

  const getThemeTitle = (id: string) => themes.find((theme) => theme.id === id)?.titulo || 'Musica Personalizada';
  const getThemeEmoji = (id: string) => themes.find((theme) => theme.id === id)?.emoji || '🎵';

  async function handleSearch() {
    if (!email.trim() && !phone.trim()) {
      alert('Informe seu e-mail ou WhatsApp para localizar o pedido.');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await fetch('/api/orders/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, whatsapp: phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao buscar pedidos.');
      setOrders(data);
    } catch (err: any) {
      alert(err.message || 'Erro de conexao com o servidor.');
    } finally {
      setLoading(false);
    }
  }

  function getStatus(order: PedidoMusica) {
    if (order.status_pagamento === 'PAGO') return 'Pronto / Baixar';
    if (order.url_local_servidor || order.url_local_servidor_2) return 'Previa Disponivel';
    if (order.letra_aprovada) return 'Em Producao';
    return 'Aguardando Aprovacao';
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 bg-white border border-natural-border rounded-3xl shadow-xs">
      <div className="flex justify-between items-center mb-8 border-b border-natural-border pb-4">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-natural-subtext hover:text-natural-dark transition-colors uppercase tracking-wider cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Inicio
        </button>
        <span className="text-xs font-semibold text-natural-subtext uppercase tracking-widest pl-1">Localizar Minhas Musicas</span>
      </div>

      <div className="space-y-6">
        <div>
          <Search className="w-8 h-8 text-natural-sage mb-2" />
          <h2 className="text-2xl font-bold font-display text-natural-dark leading-tight">Consultar Historico</h2>
          <p className="text-sm text-natural-subtext font-light mt-1 pl-0.5">
            Insira os dados informados no pedido para localizar sua letra, suas previas e a liberacao final.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-natural-subtext flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> E-mail Informado
            </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ex: thales@email.com" className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-natural-subtext flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> WhatsApp Informado
            </label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ex: 11 99999-8888" className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
          </div>
        </div>

        <button type="button" onClick={handleSearch} disabled={loading} className="w-full py-3.5 px-5 bg-natural-sage hover:bg-natural-sage/90 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer">
          {loading ? 'Pesquisando...' : 'Localizar Minhas Musicas'}
        </button>
      </div>

      {searched && (
        <div className="mt-10 border-t border-natural-border pt-8 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-natural-subtext border-b border-natural-border pb-2 mb-4">
            Resultados da busca ({orders.length})
          </h3>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 rounded-full border-4 border-natural-sage/20 border-t-natural-sage animate-spin" />
              <p className="text-xs text-natural-subtext font-light">Buscando registros...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10 bg-natural-sage-light rounded-2xl border border-natural-border p-6 space-y-2">
              <AlertCircle className="w-8 h-8 text-natural-subtext mx-auto" />
              <h4 className="font-semibold text-sm text-natural-dark">Nenhum pedido localizado</h4>
              <p className="text-xs text-natural-subtext font-light">Verifique os dados informados ou crie um novo pedido.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order, idx) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                  onClick={() => onSelectPedido(order)}
                  className="p-5 border border-natural-border rounded-2xl hover:border-natural-sage shadow-3xs hover:shadow-xs bg-white cursor-pointer group flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="text-3xl shrink-0 mt-0.5 select-none">{getThemeEmoji(order.respostas.temaId)}</span>
                    <div className="space-y-1">
                      <h4 className="text-md font-bold text-natural-dark font-display">{getThemeTitle(order.respostas.temaId)}</h4>
                      <p className="text-xs text-natural-subtext font-light flex items-center gap-1.5 leading-none">
                        <Calendar className="w-3.5 h-3.5 text-natural-subtext" />
                        {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                      <p className="text-[10px] text-natural-subtext font-light font-mono">{order.cliente_email} | {order.cliente_whatsapp}</p>
                    </div>
                  </div>
                  <div className="flex sm:flex-col justify-between items-end gap-2 text-right">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-sm select-none border ${order.status_pagamento === 'PAGO' ? 'bg-[#EBF5EE] text-[#1B5E20] border-[#C8E6C9]' : 'bg-natural-sage-light text-natural-caramel border-natural-border'}`}>
                      {getStatus(order)}
                    </span>
                    <span className="text-xs font-semibold text-natural-dark group-hover:text-natural-sage transition-colors flex items-center gap-1">
                      Ver pedido <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
