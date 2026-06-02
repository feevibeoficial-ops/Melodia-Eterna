import { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Mail, Phone, ArrowLeft, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { PedidoMusica } from '../types';

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

  const getThemeTitle = (id: string) => {
    switch (id) {
      case 'romantica': return 'Música Romântica';
      case 'mae': return 'Homenagem à Mãe';
      case 'pai': return 'Homenagem ao Pai';
      case 'debutante': return 'Aniversário 15 Anos';
      case 'amizade': return 'Amizade de Ouro';
      case 'revelacao': return 'Chá Revelação';
      default: return 'Música Personalizada';
    }
  };

  const getThemeEmoji = (id: string) => {
    switch (id) {
      case 'romantica': return '💖';
      case 'mae': return '🌸';
      case 'pai': return '👔';
      case 'debutante': return '👑';
      case 'amizade': return '🍻';
      case 'revelacao': return '🍼';
      default: return '🎵';
    }
  };

  const handleSearch = async () => {
    if (!email.trim() && !phone.trim()) {
      alert('Por favor, informe seu e-mail ou WhatsApp cadastrados para podermos buscar sua composição.');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await fetch('/api/orders/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, whatsapp: phone }),
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        const errorData = await response.json();
        console.error('Erro na pesquisa:', errorData.error);
        alert(errorData.error || 'Erro ao realizar a busca.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="minhas-musicas-root" className="max-w-2xl mx-auto px-4 py-8 bg-white border border-natural-border rounded-3xl shadow-xs">
      
      {/* Return header */}
      <div className="flex justify-between items-center mb-8 border-b border-natural-border pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-natural-subtext hover:text-natural-dark transition-colors uppercase tracking-wider cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Início
        </button>

        <span className="text-xs font-semibold text-natural-subtext uppercase tracking-widest pl-1">
          Localizar Minhas Músicas
        </span>
      </div>

      {/* Main Form */}
      <div className="space-y-6">
        <div>
          <Search className="w-8 h-8 text-natural-sage mb-2" />
          <h2 className="text-2xl font-bold font-display text-natural-dark leading-tight">
            Consultar Histórico
          </h2>
          <p className="text-sm text-natural-subtext font-light mt-1 pl-0.5">
            Insira os dados informados no momento da criação para localizarmos as suas letras e áudios.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-natural-subtext flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> E-mail Informado
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: thales@email.com"
              className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark font-light"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-natural-subtext flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> WhatsApp Informado
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 11 99999-8888"
              className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark font-light"
            />
          </div>
        </div>

        <button
          onClick={handleSearch}
          disabled={loading}
          className="w-full py-3.5 px-5 bg-natural-sage hover:bg-natural-sage/90 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
        >
          {loading ? 'Pesquisando Banco de Dados...' : 'Localizar Minhas Músicas'}
        </button>
      </div>

      {/* Results panel */}
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
              <h4 className="font-semibold text-sm text-natural-dark">Nenhuma composição localizada</h4>
              <p className="text-xs text-natural-subtext font-light">
                Verifique se digitou o e-mail ou WhatsApp corretamente, ou crie uma nova música do zero!
              </p>
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
                    <span className="text-3xl shrink-0 mt-0.5 select-none filter drop-shadow-sm group-hover:scale-105 transition-transform duration-200">
                      {getThemeEmoji(order.respostas.temaId)}
                    </span>
                    <div className="space-y-1">
                      <h4 className="text-md font-bold text-natural-dark font-display">
                        {getThemeTitle(order.respostas.temaId)}
                      </h4>
                      <p className="text-xs text-natural-subtext font-light flex items-center gap-1.5 leading-none">
                        <Calendar className="w-3.5 h-3.5 text-natural-subtext" />
                        {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                      
                      {/* Contacts small */}
                      <p className="text-[10px] text-natural-subtext font-light font-mono">
                        {order.cliente_email} | {order.cliente_whatsapp}
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col justify-between items-end gap-2 text-right">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-sm select-none border ${
                      order.status_pagamento === 'PAGO'
                        ? 'bg-[#EBF5EE] text-[#1B5E20] border-[#C8E6C9]'
                        : 'bg-natural-sage-light text-natural-caramel border-natural-border'
                    }`}>
                      {order.status_pagamento === 'PAGO' ? 'Pronto / Baixar' : 'Pendente de Pix'}
                    </span>
                    
                    <span className="text-xs font-semibold text-natural-dark group-hover:text-natural-sage transition-colors flex items-center gap-1">
                      Ver música <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
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
