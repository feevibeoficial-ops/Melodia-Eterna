import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, CreditCard, RefreshCw, AlertCircle, Volume2, MessageCircle, CheckCircle2 } from 'lucide-react';
import { PedidoMusica } from '../types';

interface PlayerPagamentoProps {
  pedido: PedidoMusica;
  onPaymentSuccess: (updatedPedido: PedidoMusica) => void;
  onReload: () => void | Promise<void>;
}

function isPreviewUnlocked(pedido: PedidoMusica) {
  return pedido.status_producao !== 'LETRA_APROVADA' && pedido.status_producao !== 'AGUARDANDO_APROVACAO';
}

export default function PlayerPagamento({ pedido, onPaymentSuccess, onReload }: PlayerPagamentoProps) {
  const hasV1 = Boolean(pedido.url_local_servidor);
  const hasV2 = Boolean(pedido.url_local_servidor_2);
  const hasPreviews = hasV1 || hasV2;
  const hasBothPreviews = hasV1 && hasV2;
  const previewUnlocked = isPreviewUnlocked(pedido);
  const isFullyPaid = pedido.status_pagamento === 'PAGO';
  const awaitingPreviewPayment = !previewUnlocked;
  const awaitingPreviewProduction = previewUnlocked && !hasPreviews && !isFullyPaid;
  const awaitingFinalPayment = previewUnlocked && hasPreviews && !isFullyPaid;

  const [activeVersion, setActiveVersion] = useState<'v1' | 'v2'>(hasV1 ? 'v1' : 'v2');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(60);
  const [whatsAppLink, setWhatsAppLink] = useState<string | null>(null);
  const [whatsAppNumber, setWhatsAppNumber] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setActiveVersion(hasV1 ? 'v1' : 'v2');
  }, [pedido.id, hasV1, hasV2]);

  useEffect(() => {
    if (pedido.status_pagamento === 'PAGO') {
      onPaymentSuccess(pedido);
    }
  }, [pedido, onPaymentSuccess]);

  useEffect(() => {
    if (!previewUnlocked || !hasPreviews) return;
    if (audioRef.current) audioRef.current.pause();

    const previewUrl = activeVersion === 'v1' ? pedido.url_local_servidor! : pedido.url_local_servidor_2!;
    const audio = new Audio(previewUrl);

    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration || 60));
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    audioRef.current = audio;
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    }

    return () => audio.pause();
  }, [activeVersion, pedido.url_local_servidor, pedido.url_local_servidor_2, hasPreviews, previewUnlocked]);

  useEffect(() => {
    let cancelled = false;

    async function loadWhatsAppLink() {
      try {
        const response = await fetch(`/api/orders/${pedido.id}/whatsapp-link?kind=payment`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao preparar o WhatsApp.');
        if (cancelled) return;
        setWhatsAppLink(data.whatsappLink);
        setWhatsAppNumber(data.whatsappNumber || null);
        setWhatsAppError(null);
      } catch (err: any) {
        if (cancelled) return;
        setWhatsAppLink(null);
        setWhatsAppNumber(null);
        setWhatsAppError(err.message || 'Falha ao preparar o WhatsApp.');
      }
    }

    loadWhatsAppLink().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pedido.id]);

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }

  function seek(seconds: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }

  function openWhatsApp() {
    if (!whatsAppLink) return;
    window.open(whatsAppLink, '_blank', 'noopener,noreferrer');
  }

  function formatTime(secs: number) {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  }

  function formatWhatsAppNumber(value: string) {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12 && digits.startsWith('55')) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return value;
  }

  async function openInfinitePayCheckout() {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const response = await fetch(`/api/orders/${pedido.id}/create-checkout`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao criar checkout.');
      }
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setCheckoutError(err.message || 'Falha ao iniciar o pagamento.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div id="player-payment-root" className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <motion.span
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-natural-sage/10 text-natural-sage rounded-full text-xs font-semibold uppercase tracking-wider mb-2"
        >
          <Volume2 className="w-3.5 h-3.5" />
          {awaitingPreviewPayment ? 'Desbloqueio da previa' : hasPreviews ? 'Previa disponivel' : 'Producao em andamento'}
        </motion.span>
        <h2 className="text-3xl font-bold font-display text-natural-dark tracking-tight">
          {awaitingPreviewPayment
            ? 'Libere a Previa da Sua Cancao'
            : awaitingPreviewProduction
              ? 'Pagamento da Previa Confirmado'
              : 'Ouça uma Previa da Sua Cancao'}
        </h2>
        <p className="text-sm text-natural-subtext max-w-xl mx-auto font-light mt-1 pl-1">
          {awaitingPreviewPayment
            ? 'Apos aprovar a letra, voce paga R$ 2,00 para desbloquear a previa. Esse valor ja esta incluso no total de R$ 19,99.'
            : awaitingPreviewProduction
              ? 'Seu pagamento de R$ 2,00 ja foi confirmado. Agora nossa equipe esta preparando a previa para voce ouvir antes de pagar o restante.'
              : awaitingFinalPayment
                ? 'A previa ja esta pronta. Se gostar do resultado, pague os R$ 17,99 restantes para liberar a musica completa.'
                : 'Pagamento confirmado.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
          {previewUnlocked && hasPreviews ? (
            <>
              {hasV1 && hasV2 && (
                <div className="flex gap-3 bg-natural-sage-light p-1 border border-natural-border rounded-xl">
                  <button type="button" onClick={() => { setActiveVersion('v1'); setIsPlaying(false); setCurrentTime(0); }} className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs border uppercase tracking-wider transition-all cursor-pointer ${activeVersion === 'v1' ? 'bg-white border-natural-border text-natural-dark shadow-3xs' : 'bg-transparent border-transparent text-natural-subtext'}`}>Versao 01</button>
                  <button type="button" onClick={() => { setActiveVersion('v2'); setIsPlaying(false); setCurrentTime(0); }} className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs border uppercase tracking-wider transition-all cursor-pointer ${activeVersion === 'v2' ? 'bg-white border-natural-border text-natural-dark shadow-3xs' : 'bg-transparent border-transparent text-natural-subtext'}`}>Versao 02</button>
                </div>
              )}

              <div className="flex flex-col items-center py-6">
                <div className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-natural-dark flex items-center justify-center shadow-lg border-8 border-[#3A3A2F]">
                  <div className="w-16 h-16 rounded-full bg-natural-caramel flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-widest">
                    Melodia
                  </div>
                </div>
                <span className="text-xs uppercase tracking-widest text-natural-subtext font-bold mt-6">
                  REPRODUZINDO PREVIA {activeVersion === 'v1' ? 'V1' : 'V2'} (ATE 1 MINUTO)
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-natural-subtext">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = clickX / rect.width;
                    seek(percentage * duration);
                  }}
                  className="h-2 rounded-full bg-natural-sage-light transition-all cursor-pointer relative border border-natural-border/60"
                >
                  <div className="absolute top-0 left-0 h-full bg-natural-sage rounded-full" style={{ width: `${(currentTime / duration) * 100}%` }} />
                </div>
                <div className="flex justify-center pt-2">
                  <button type="button" onClick={togglePlay} className="w-16 h-16 rounded-full bg-natural-sage text-white flex items-center justify-center shadow-sm cursor-pointer">
                    {isPlaying ? <Pause className="w-7 h-7 fill-white" /> : <Play className="w-7 h-7 fill-white translate-x-0.5" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-natural-sage-light rounded-2xl border border-natural-border p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-natural-sage shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-natural-dark">
                    {awaitingPreviewPayment
                      ? 'Primeiro passo: desbloquear a previa'
                      : 'Aguardando a previa ficar pronta'}
                  </p>
                  <p className="text-sm text-natural-subtext mt-1">
                    {awaitingPreviewPayment
                      ? 'Assim que o pagamento de R$ 2,00 for confirmado, a previa sera liberada para voce ouvir. Esse valor sera abatido do total de R$ 19,99.'
                      : 'Sua previa esta sendo preparada. Assim que as faixas forem anexadas, voce podera ouvi-las aqui e decidir se quer pagar o restante.'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => onReload()} className="px-4 py-3 bg-white border border-natural-border rounded-xl text-xs font-semibold text-natural-dark flex items-center gap-2 cursor-pointer">
                <RefreshCw className="w-4 h-4" /> Atualizar status do pedido
              </button>
            </div>
          )}

          <div className="p-4 bg-natural-sage-light rounded-xl flex items-start gap-2 border border-natural-border">
            <AlertCircle className="w-4 h-4 text-natural-sage shrink-0 mt-0.5" />
            <p className="text-[11px] text-natural-text leading-normal font-light">
              <strong>Regra do pagamento:</strong> primeiro voce paga <strong>R$ 2,00</strong> para ouvir a previa. Se gostar, paga apenas os <strong>R$ 17,99</strong> restantes. O total continua sendo <strong>R$ 19,99</strong>.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-natural-subtext mb-4 border-b border-natural-border pb-3">
              <CreditCard className="w-4 h-4 text-natural-sage" /> Pagamento em duas etapas
            </div>

            <div className="space-y-4 mb-6">
              <div className="rounded-2xl border border-natural-border bg-[#FAF8F5] p-4">
                <p className="text-[11px] uppercase tracking-wider text-natural-subtext font-semibold">Etapa 1</p>
                <p className="text-xl font-extrabold font-display text-natural-dark mt-1">R$ 2,00</p>
                <p className="text-[11px] text-natural-subtext mt-1">Libera a previa. Esse valor ja esta incluso no total.</p>
                {previewUnlocked && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#EBF5EE] px-3 py-1 text-[11px] font-semibold text-[#1B5E20]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pago
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-natural-border bg-[#FAF8F5] p-4">
                <p className="text-[11px] uppercase tracking-wider text-natural-subtext font-semibold">Etapa 2</p>
                <p className="text-xl font-extrabold font-display text-natural-dark mt-1">R$ 17,99</p>
                <p className="text-[11px] text-natural-subtext mt-1">Complemento final para liberar a musica completa.</p>
                {isFullyPaid && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#EBF5EE] px-3 py-1 text-[11px] font-semibold text-[#1B5E20]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pago
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-natural-border bg-natural-sage-light px-4 py-4 mb-5">
              <h4 className="text-xs font-bold text-natural-dark uppercase tracking-widest">
                {awaitingPreviewPayment
                  ? 'Liberar previa'
                  : awaitingPreviewProduction
                    ? 'Pagamento confirmado'
                    : awaitingFinalPayment
                      ? 'Liberar versao completa'
                      : 'Pedido concluido'}
              </h4>
              <p className="text-[11px] text-natural-subtext font-light mt-2">
                {awaitingPreviewPayment
                  ? 'Clique abaixo para abrir o checkout da InfinitePay e pagar R$ 2,00.'
                  : awaitingPreviewProduction
                    ? 'Agora e so aguardar a previa ser anexada. Assim que ela estiver pronta, o botao do pagamento final aparecera.'
                    : awaitingFinalPayment
                      ? 'A previa esta disponivel. Se voce aprovar o resultado, pague R$ 17,99 para receber a musica completa.'
                      : 'Seu pedido ja foi pago integralmente.'}
              </p>
            </div>

            {!isFullyPaid && !awaitingPreviewProduction && (
              <button
                type="button"
                disabled={checkoutLoading}
                onClick={openInfinitePayCheckout}
                className="w-full py-3 px-4 bg-natural-sage text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                {checkoutLoading
                  ? 'Abrindo checkout...'
                  : awaitingPreviewPayment
                    ? 'Pagar R$ 2,00 para ouvir a previa'
                    : 'Pagar R$ 17,99 para liberar a musica'}
              </button>
            )}

            {checkoutError && (
              <div className="mt-3 rounded-2xl border border-[#E7C7AF] bg-[#FFF7F2] px-4 py-3 text-[11px] text-[#9A5B33]">
                {checkoutError}
              </div>
            )}

            <button
              type="button"
              onClick={() => onReload()}
              className="w-full mt-3 py-3 px-4 bg-white border border-natural-border rounded-xl text-xs font-semibold text-natural-dark flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Atualizar status do pedido
            </button>

            {(whatsAppLink || whatsAppError) && (
              <div className="mt-4 pt-4 border-t border-natural-border">
                <button
                  type="button"
                  onClick={openWhatsApp}
                  disabled={!whatsAppLink}
                  className="w-full py-3 px-4 bg-[#25D366] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" /> Falar com o atendimento
                </button>
                {whatsAppNumber && (
                  <p className="mt-2 text-[11px] text-natural-subtext text-center">
                    Atendimento: {formatWhatsAppNumber(whatsAppNumber)}
                  </p>
                )}
                {whatsAppError && (
                  <p className="mt-2 text-[11px] text-red-700 text-center">
                    {whatsAppError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
