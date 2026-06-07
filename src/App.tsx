import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music, PenTool, RefreshCw, AlertCircle, Settings, CheckCircle2, Clock3 } from 'lucide-react';

import { TemaConfig, RespostasFormulario, PedidoMusica, DEFAULT_TEMAS } from './types';
import ThemeSelector from './components/ThemeSelector';
import QuestionsForm from './components/QuestionsForm';
import LyricsReview from './components/LyricsReview';
import TermoAceite from './components/TermoAceite';
import PlayerPagamento from './components/PlayerPagamento';
import EntregaSucesso from './components/EntregaSucesso';
import MinhasMusicas from './components/MinhasMusicas';
import GestaoPedidos from './components/GestaoPedidos';
import { BRANDING } from './branding';

type AppView = 'inicial' | 'search' | 'admin' | 'form' | 'loading-lyrics' | 'review' | 'termo' | 'player-pagamento' | 'sucesso' | 'payment-return';

export default function App() {
  const [view, setView] = useState<AppView>('inicial');
  const [selectedTheme, setSelectedTheme] = useState<TemaConfig | null>(null);
  const [themes, setThemes] = useState<TemaConfig[]>(DEFAULT_TEMAS);
  const [currentPedido, setCurrentPedido] = useState<PedidoMusica | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [loadingLogIndex, setLoadingLogIndex] = useState(0);
  const [paymentReturnStage, setPaymentReturnStage] = useState<'preview' | 'final' | null>(null);
  const [paymentReturnMessage, setPaymentReturnMessage] = useState<string>('Estamos confirmando seu pagamento.');
  const [lastFormData, setLastFormData] = useState<RespostasFormulario | null>(null);
  const [lastFormExtraOptions, setLastFormExtraOptions] = useState<{ selectedGenderForRevelacao?: 'menino' | 'menina' } | undefined>(undefined);

  const COMPOSITION_LOGS = [
    'Tecendo memorias afetivas...',
    'Alinhando acordes poeticos...',
    'Ajustando cadencias e rimas emocionais...',
    'Consultando inspiracoes literarias...',
    'Gerando estrofes exclusivas...',
  ];

  useEffect(() => {
    if (view === 'loading-lyrics') {
      const interval = setInterval(() => setLoadingLogIndex((prev) => prev + 1), 2000);
      return () => clearInterval(interval);
    }
    setLoadingLogIndex(0);
  }, [view]);

  useEffect(() => {
    fetch('/api/config/themes')
      .then(async (response) => {
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Falha ao carregar temas.');
        }
        return response.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length) {
          setThemes(data as TemaConfig[]);
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pedidoId = params.get('pedido');
    const isPaymentReturn = params.get('payment_return') === '1';
    const stage = params.get('stage') === 'final' ? 'final' : 'preview';
    if (!pedidoId) return;

    if (isPaymentReturn) {
      setPaymentReturnStage(stage);
      setPaymentReturnMessage(
        stage === 'final'
          ? 'Estamos confirmando o pagamento final da sua musica.'
          : 'Estamos confirmando o pagamento da previa.'
      );
      setView('payment-return');
    }

    handleRefreshPedido(pedidoId)
      .then((pedido) => {
        setUiError(null);
        if (isPaymentReturn) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        if (pedido.status_pagamento === 'PAGO') {
          setPaymentReturnMessage('Pagamento confirmado com sucesso. Sua musica completa foi liberada.');
          setView('sucesso');
          return;
        }
        if (stage === 'preview' && pedido.status_producao !== 'LETRA_APROVADA' && pedido.status_producao !== 'AGUARDANDO_APROVACAO') {
          setPaymentReturnMessage('Pagamento da previa confirmado. Agora voce pode acompanhar a preparacao da sua previa.');
        }
        setView('player-pagamento');
      })
      .catch((error: any) => {
        setUiError(error?.message || 'Nao foi possivel recuperar o pedido retornado do pagamento.');
        if (isPaymentReturn) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      });
  }, []);

  const handleSelectTheme = (theme: TemaConfig) => {
    setUiError(null);
    setSelectedTheme(theme);
    setView('form');
  };

  const handleFormSubmit = async (
    data: RespostasFormulario,
    extraOptions?: { selectedGenderForRevelacao?: 'menino' | 'menina' },
  ) => {
    setLastFormData(data);
    setLastFormExtraOptions(extraOptions);
    setUiError(null);
    setView('loading-lyrics');

    try {
      const response = await fetch('/api/lyrics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: data,
          selectedGenderForRevelacao: extraOptions?.selectedGenderForRevelacao,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao gerar composicao.');
      }

      setCurrentPedido((await response.json()) as PedidoMusica);
      setView('review');
    } catch (err: any) {
      setUiError(err.message || 'Nao foi possivel iniciar sua composicao agora.');
      setView('form');
    }
  };

  const handleLyricRefine = async (feedback: string) => {
    if (!currentPedido) return;

    setUiError(null);
    setIsRefining(true);

    try {
      const response = await fetch('/api/lyrics/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentPedido.id, feedback }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao refinar.');
      }

      setCurrentPedido((await response.json()) as PedidoMusica);
    } catch (err: any) {
      setUiError(err.message || 'Nao foi possivel ajustar a letra agora.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleAgreeAndProceedToPayment = async () => {
    if (!currentPedido) return;

    setUiError(null);

    try {
      const response = await fetch('/api/lyrics/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentPedido.id, termo_aceite_assinado: true }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao aprovar contrato.');
      }

      setCurrentPedido(data.pedido as PedidoMusica);
      if (data.whatsappLink) {
        window.open(data.whatsappLink, '_blank', 'noopener,noreferrer');
      }
      setView('player-pagamento');
    } catch (err: any) {
      setUiError(err.message || 'Houve um erro na confirmacao do termo.');
    }
  };

  const handleRefreshPedido = async (pedidoId: string, nextView?: AppView) => {
    const response = await fetch(`/api/orders/${pedidoId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error((data as any).error || 'Falha ao carregar o pedido.');
    }
    const pedido = data as PedidoMusica;
    setCurrentPedido(pedido);
    if (nextView) setView(nextView);
    return pedido;
  };

  const handleRestart = () => {
    setView('inicial');
    setSelectedTheme(null);
    setCurrentPedido(null);
    setUiError(null);
    setLastFormData(null);
    setLastFormExtraOptions(undefined);
  };

  const handleRetryFromError = () => {
    setUiError(null);
    if (lastFormData) {
      handleFormSubmit(lastFormData, lastFormExtraOptions).catch(() => undefined);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between bg-natural-light bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `linear-gradient(rgba(253, 251, 247, 0.94), rgba(253, 251, 247, 0.96)), url(${BRANDING.background})` }}
    >
      <header className="border-b border-natural-border bg-white/72 backdrop-blur-md sticky top-0 z-50 py-4.5 px-6 select-none shadow-3xs">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div onClick={handleRestart} className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity">
            <span className="font-extrabold text-lg tracking-tight text-natural-dark font-display">
              Melodia<span className="text-natural-sage">Eterna</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView('admin')}
              className="px-3 py-2 bg-white border border-natural-border rounded-xl text-xs font-semibold text-natural-dark flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" /> Gestao
            </button>
            <span className="text-xs font-mono font-bold text-natural-subtext tracking-wider">ESTUDIO DE COMPOSICAO</span>
          </div>
        </div>
      </header>

      <main className="flex-1 py-12 md:py-20">
        {uiError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto px-4 mb-6">
            <div className="bg-[#FFF7F2] border border-[#E7C7AF] rounded-2xl p-4 md:p-5 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F3D8C4] flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-[#9A5B33]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-natural-dark">Nao foi possivel concluir esta etapa</p>
                  <p className="text-sm text-natural-subtext mt-1 leading-relaxed">{uiError}</p>
                  <div className="flex gap-3 mt-4">
                    <button type="button" onClick={() => setUiError(null)} className="px-4 py-2 bg-white border border-natural-border rounded-xl text-xs font-semibold text-natural-subtext cursor-pointer">Fechar aviso</button>
                    <button type="button" onClick={handleRetryFromError} className="px-4 py-2 bg-natural-sage text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {view === 'inicial' && (
            <motion.div key="inicial" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <ThemeSelector themes={themes} onSelectTheme={handleSelectTheme} onGoToSearch={() => setView('search')} />
            </motion.div>
          )}

          {view === 'admin' && (
            <motion.div key="admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <GestaoPedidos onBack={handleRestart} />
            </motion.div>
          )}

          {view === 'search' && (
            <motion.div key="search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <MinhasMusicas
                onBack={handleRestart}
                onSelectPedido={(pedido) => {
                  setUiError(null);
                  setCurrentPedido(pedido);
                  setView(pedido.status_pagamento === 'PAGO' ? 'sucesso' : 'player-pagamento');
                }}
              />
            </motion.div>
          )}

          {view === 'form' && selectedTheme && (
            <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <QuestionsForm
                theme={selectedTheme}
                initialData={selectedTheme.id === lastFormData?.temaId ? lastFormData : null}
                initialSelectedGenderForRevelacao={lastFormExtraOptions?.selectedGenderForRevelacao}
                onBack={handleRestart}
                onSubmit={handleFormSubmit}
              />
            </motion.div>
          )}

          {view === 'loading-lyrics' && (
            <motion.div key="loading-lyrics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-md mx-auto px-6 text-center space-y-6 py-20 select-none">
              <div className="relative inline-block mb-3">
                <div className="w-16 h-16 rounded-full border-4 border-natural-sage/10 border-t-natural-sage animate-spin" />
                <PenTool className="w-6 h-6 text-natural-sage absolute inset-0 m-auto animate-bounce" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-display text-natural-dark tracking-tight">Escrevendo Sua Historia...</h3>
                <p className="text-xs text-natural-subtext mt-1 pl-1 max-w-xs mx-auto font-light leading-relaxed">
                  Nossa equipe criativa esta transformando suas respostas em uma letra original, sensivel e pronta para ganhar melodia.
                </p>
              </div>
              <div className="bg-[#FAF8F5] p-4 border rounded-2xl border-natural-border min-h-12 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.p key={loadingLogIndex} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-xs font-mono text-natural-dark font-semibold">
                    {COMPOSITION_LOGS[loadingLogIndex % COMPOSITION_LOGS.length]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {view === 'payment-return' && (
            <motion.div key="payment-return" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto px-6 text-center space-y-6 py-20 select-none">
              <div className="relative inline-block mb-3">
                <div className="w-16 h-16 rounded-full border-4 border-natural-sage/10 border-t-natural-sage animate-spin" />
                <Clock3 className="w-6 h-6 text-natural-sage absolute inset-0 m-auto" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-display text-natural-dark tracking-tight">
                  Retorno do Pagamento
                </h3>
                <p className="text-sm text-natural-subtext mt-2 leading-relaxed">
                  {paymentReturnMessage}
                </p>
              </div>
              <div className="bg-[#FAF8F5] p-5 border rounded-2xl border-natural-border text-left">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-natural-sage shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-natural-dark">
                      {paymentReturnStage === 'final'
                        ? 'Etapa final em verificacao'
                        : 'Pagamento da previa em verificacao'}
                    </p>
                    <p className="text-xs text-natural-subtext leading-relaxed">
                      A InfinitePay redireciona voce de volta para o site, mas a confirmacao oficial do pedido continua sendo feita pelo nosso sistema. Se o webhook ja tiver chegado, voce seguira automaticamente para a proxima etapa.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'review' && currentPedido && (
            <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <LyricsReview lyrics={currentPedido.letra_gerada} isRefining={isRefining} onApprove={() => setView('termo')} onRefine={handleLyricRefine} onBackToAnswers={() => setView('form')} />
            </motion.div>
          )}

          {view === 'termo' && currentPedido && (
            <motion.div key="termo" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <TermoAceite estiloMusical={currentPedido.respostas.estiloMusical} onAgree={handleAgreeAndProceedToPayment} onBack={() => setView('review')} />
            </motion.div>
          )}

          {view === 'player-pagamento' && currentPedido && (
            <motion.div key="player-pagamento" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <PlayerPagamento
                pedido={currentPedido}
                onReload={async () => {
                  const pedido = await handleRefreshPedido(currentPedido.id);
                  setView(pedido.status_pagamento === 'PAGO' ? 'sucesso' : 'player-pagamento');
                }}
                onPaymentSuccess={(updated) => {
                  setCurrentPedido(updated);
                  setView('sucesso');
                }}
              />
            </motion.div>
          )}

          {view === 'sucesso' && currentPedido && (
            <motion.div key="sucesso" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <EntregaSucesso pedido={currentPedido} onRestart={handleRestart} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-natural-border py-6 text-center text-[10px] text-natural-subtext font-light select-none bg-white">
        <p>© 2026 Melodia Eterna - Comissoes Musicais Emocionantes Independentes.</p>
        <p className="mt-1">Licenca exclusiva de uso pessoal sem royalties para os clientes.</p>
      </footer>
    </div>
  );
}
