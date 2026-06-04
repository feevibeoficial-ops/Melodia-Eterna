import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Copy, Check, QrCode, CreditCard, RefreshCw, AlertCircle, Volume2, MessageCircle } from 'lucide-react';
import { PedidoMusica } from '../types';

interface PlayerPagamentoProps {
  pedido: PedidoMusica;
  onPaymentSuccess: (updatedPedido: PedidoMusica) => void;
  onReload: () => void | Promise<void>;
}

export default function PlayerPagamento({ pedido, onPaymentSuccess, onReload }: PlayerPagamentoProps) {
  const hasV1 = Boolean(pedido.url_local_servidor);
  const hasV2 = Boolean(pedido.url_local_servidor_2);
  const hasPreviews = hasV1 || hasV2;
  const [copied, setCopied] = useState(false);
  const [activeVersion, setActiveVersion] = useState<'v1' | 'v2'>(hasV1 ? 'v1' : 'v2');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(60);
  const [whatsAppLink, setWhatsAppLink] = useState<string | null>(null);
  const [whatsAppNumber, setWhatsAppNumber] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofMessage, setProofMessage] = useState<string | null>(null);
  const [selectedProofFile, setSelectedProofFile] = useState<File | null>(null);
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
    if (!hasPreviews) return;
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
  }, [activeVersion, pedido.url_local_servidor, pedido.url_local_servidor_2, hasPreviews]);

  useEffect(() => {
    let cancelled = false;
    if (!hasPreviews) {
      setWhatsAppLink(null);
      setWhatsAppNumber(null);
      setWhatsAppError(null);
      return () => {
        cancelled = true;
      };
    }

    const whatsAppKind = 'payment';

    async function loadWhatsAppLink() {
      try {
        const response = await fetch(`/api/orders/${pedido.id}/whatsapp-link?kind=${whatsAppKind}`);
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
  }, [pedido.id, hasPreviews]);

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

  function handleCopyPix() {
    if (!pedido.pix_copia_e_cola) return;
    navigator.clipboard.writeText(pedido.pix_copia_e_cola);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  async function uploadProof(file: File) {
    setProofUploading(true);
    setProofMessage(null);
    try {
      const response = await fetch(`/api/orders/${pedido.id}/upload-proof`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao enviar comprovante.');
      }

      setProofMessage(data.telegramSent
        ? 'Comprovante enviado. Nossa equipe recebeu a notificacao no Telegram.'
        : 'Comprovante salvo com sucesso.');
      await onReload();
    } catch (err: any) {
      setProofMessage(err.message || 'Falha ao enviar comprovante.');
    } finally {
      setProofUploading(false);
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
          <Volume2 className="w-3.5 h-3.5" /> {hasPreviews ? 'Previa Disponivel' : 'Producao Manual em Andamento'}
        </motion.span>
        <h2 className="text-3xl font-bold font-display text-natural-dark tracking-tight">
          {hasPreviews ? 'Ouça uma Previa da Sua Cancao' : 'Sua Letra ja Foi Enviada para Producao'}
        </h2>
        <p className="text-sm text-natural-subtext max-w-md mx-auto font-light mt-1 pl-1">
          {hasPreviews
            ? 'As duas previas ja estao prontas. Se gostar, envie o comprovante no WhatsApp e aguarde a liberacao manual do download.'
            : 'Sua letra aprovada ja pode ser produzida manualmente. Assim que as faixas forem anexadas, as previas aparecerao aqui automaticamente.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
          {hasPreviews ? (
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
                  <p className="text-sm font-semibold text-natural-dark">Aguardando anexar as duas faixas</p>
                  <p className="text-sm text-natural-subtext mt-1">
                    Sua letra aprovada ja esta pronta. Nossa equipe vai produzir a musica manualmente e anexar as faixas neste pedido.
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
              <strong>Nota:</strong> As previas tem no maximo 1 minuto. O download completo so e liberado apos confirmacao manual do pagamento.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-natural-subtext mb-4 border-b border-natural-border pb-3">
              <CreditCard className="w-4 h-4 text-natural-sage" /> Pagamento e Liberacao Manual
            </div>
            <div className="mb-6">
              <span className="text-natural-subtext font-light text-xs uppercase block tracking-wider">Adesao Promocional</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-extrabold font-display text-natural-dark tracking-tight">R$ 97,90</span>
                <span className="text-xs text-natural-subtext font-light line-through">R$ 180,00</span>
              </div>
            </div>

            <div className="flex flex-col items-center p-4 border border-natural-border bg-natural-sage-light rounded-2xl mb-5 space-y-4">
              {pedido.pix_qr_code_url ? (
                <img src={pedido.pix_qr_code_url} alt="PIX QR Code" className="w-40 h-40 border border-natural-border bg-white p-1 rounded-xl shadow-3xs" />
              ) : (
                <div className="w-40 h-40 rounded-xl bg-neutral-200 animate-pulse flex items-center justify-center">
                  <QrCode className="w-10 h-10 text-neutral-400" />
                </div>
              )}
              <div className="text-center">
                <h4 className="text-xs font-bold text-natural-dark uppercase tracking-widest">Envie o comprovante pelo WhatsApp</h4>
                <p className="text-[10px] text-natural-subtext font-light mt-1">
                  O pagamento e a liberacao das faixas completas sao confirmados manualmente.
                </p>
              </div>
            </div>

            <button type="button" onClick={handleCopyPix} className="w-full py-3 px-4 bg-natural-sage-light text-natural-dark text-xs font-semibold rounded-xl flex items-center justify-center gap-2 border border-natural-border cursor-pointer">
              {copied ? <><Check className="w-4 h-4 text-natural-sage" /> Codigo Copiado!</> : <><Copy className="w-4 h-4 text-natural-subtext" /> Copiar Codigo PIX</>}
            </button>

            <label className="block mt-3">
              <span className="text-[11px] text-natural-subtext font-semibold block mb-2">Anexar comprovante</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                disabled={proofUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedProofFile(file);
                  setProofMessage(null);
                }}
                className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-xs"
              />
            </label>

            {selectedProofFile && (
              <p className="mt-2 text-[11px] text-natural-subtext">
                Arquivo selecionado: {selectedProofFile.name}
              </p>
            )}

            {pedido.comprovante_nome_arquivo && (
              <p className="mt-2 text-[11px] text-natural-subtext">
                Ultimo comprovante enviado: {pedido.comprovante_nome_arquivo}
              </p>
            )}

            <button
              type="button"
              disabled={proofUploading || !selectedProofFile}
              onClick={() => {
                if (!selectedProofFile) return;
                uploadProof(selectedProofFile)
                  .then(() => setSelectedProofFile(null))
                  .catch(() => undefined);
              }}
              className="w-full mt-3 py-3 px-4 bg-natural-sage text-white text-xs font-semibold rounded-xl disabled:opacity-60 cursor-pointer"
            >
              {proofUploading ? 'Enviando comprovante...' : 'Enviar comprovante'}
            </button>

            {proofMessage && (
              <div className="mt-3 rounded-2xl border border-natural-border bg-[#FAF8F5] px-4 py-3 text-[11px] text-natural-subtext">
                {proofMessage}
              </div>
            )}

            {hasPreviews && whatsAppLink && (
              <button type="button" onClick={openWhatsApp} className="w-full mt-3 py-3 px-4 bg-[#1F7A4D] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer">
                <MessageCircle className="w-4 h-4" /> Enviar comprovante no WhatsApp
              </button>
            )}

            {hasPreviews && (whatsAppLink || whatsAppNumber || whatsAppError) && (
              <div className="mt-3 rounded-2xl border border-natural-border bg-[#FAF8F5] px-4 py-3 text-[11px] text-natural-subtext leading-relaxed">
                {whatsAppLink && <p>Se a aba do WhatsApp nao abrir ou for fechada, toque no botao novamente ou use o link manual abaixo para enviar o comprovante.</p>}
                {whatsAppLink && (
                  <a href={whatsAppLink} target="_blank" rel="noreferrer" className="inline-flex mt-2 text-natural-sage underline font-semibold">
                    Abrir conversa no WhatsApp
                  </a>
                )}
                {whatsAppNumber && <p className="mt-2">Numero do estudio: {formatWhatsAppNumber(whatsAppNumber)}</p>}
                {whatsAppError && <p>{whatsAppError}</p>}
              </div>
            )}
          </div>

          <div className="border-t border-natural-border pt-5 mt-6 space-y-3">
            <button type="button" onClick={() => onReload()} className="w-full py-3.5 px-4 bg-natural-sage text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer">
              <RefreshCw className="w-4 h-4" /> Verificar se ja foi liberado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
