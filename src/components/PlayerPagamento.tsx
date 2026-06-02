import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Copy, Check, QrCode, CreditCard, Music, Sparkles, RefreshCw, AlertCircle, Volume2 } from 'lucide-react';
import { PedidoMusica } from '../types';

interface PlayerPagamentoProps {
  pedido: PedidoMusica;
  onPaymentSuccess: (updatedPedido: PedidoMusica) => void;
  isSimulatingPay: boolean;
  onSimulatePayment: () => void;
  onReload: () => void;
}

export default function PlayerPagamento({
  pedido,
  onPaymentSuccess,
  isSimulatingPay,
  onSimulatePayment,
  onReload
}: PlayerPagamentoProps) {
  const [copied, setCopied] = useState(false);
  const [activeVersion, setActiveVersion] = useState<'v1' | 'v2'>('v1');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(35); // Pre-sliced is approx 35 secs
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Poll status from server to check if paid (in a real production app)
  useEffect(() => {
    if (pedido.status_pagamento === 'PAGO') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${pedido.id}`);
        if (res.ok) {
          const data = (await res.json()) as PedidoMusica;
          if (data.status_pagamento === 'PAGO') {
            onPaymentSuccess(data);
          }
        }
      } catch (e) {
        console.error('Erro de polling de pagamento:', e);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [pedido.id, pedido.status_pagamento, onPaymentSuccess]);

  // Audio player synchronizer
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const previaUrl = activeVersion === 'v1' ? `/audio/previa/${pedido.id}_v1.mp3` : `/audio/previa/${pedido.id}_v2.mp3`;
    const audio = new Audio(previaUrl);
    
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration || 35);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    audioRef.current = audio;

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    }

    return () => {
      audio.pause();
    };
  }, [activeVersion, pedido.id]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.error('Erro de áudio:', e);
        setIsPlaying(false);
      });
    }
  };

  const seek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handleCopyPix = () => {
    if (pedido.pix_copia_e_cola) {
      navigator.clipboard.writeText(pedido.pix_copia_e_cola);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div id="player-payment-root" className="max-w-4xl mx-auto px-4 py-8">
      
      <div className="text-center mb-8">
        <motion.span
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-natural-sage/10 text-natural-sage rounded-full text-xs font-semibold uppercase tracking-wider mb-2"
        >
          <Volume2 className="w-3.5 h-3.5" /> Prévia Acústica Disponível
        </motion.span>
        <h2 className="text-3xl font-bold font-display text-natural-dark tracking-tight">
          Ouça uma Prévia da Sua Canção
        </h2>
        <p className="text-sm text-natural-subtext max-w-md mx-auto font-light mt-1 pl-1">
          Nossa equipe gerou duas versões alternativas emocionantes baseadas em sua história. Escolha a sua antes de liberar a faixa completa!
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Audio Player */}
        <div className="lg:col-span-7 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
          
          {/* Version Toggles */}
          <div className="flex gap-3 bg-natural-sage-light p-1 border border-natural-border rounded-xl">
            <button
              onClick={() => {
                setActiveVersion('v1');
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs border uppercase tracking-wider transition-all cursor-pointer ${
                activeVersion === 'v1'
                  ? 'bg-white border-natural-border text-natural-dark shadow-3xs'
                  : 'bg-transparent border-transparent text-natural-subtext hover:text-natural-dark'
              }`}
            >
              🎉 Versão Clássica 01
            </button>
            <button
              onClick={() => {
                setActiveVersion('v2');
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs border uppercase tracking-wider transition-all cursor-pointer ${
                activeVersion === 'v2'
                  ? 'bg-white border-natural-border text-natural-dark shadow-3xs'
                  : 'bg-transparent border-transparent text-natural-subtext hover:text-natural-dark'
              }`}
            >
              🎹 Versão Alternativa 02
            </button>
          </div>

          {/* Aesthetic Vinyl/CD disc pulsing */}
          <div className="flex flex-col items-center py-6">
            <div className="relative">
              <motion.div
                animate={isPlaying ? { rotate: 360 } : {}}
                transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
                className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-natural-dark flex items-center justify-center shadow-lg border-8 border-[#3A3A2F]"
              >
                {/* Grooves on vinyl */}
                <div className="absolute inset-4 rounded-full border border-white/5" />
                <div className="absolute inset-8 rounded-full border border-white/5" />
                <div className="absolute inset-12 rounded-full border border-white/5" />
                
                {/* Center label */}
                <div className="w-16 h-16 rounded-full bg-natural-caramel flex items-center justify-center p-2 text-center text-[10px] text-white font-bold overflow-hidden uppercase tracking-widest">
                  Melodia
                </div>
              </motion.div>
              
              {/* Arm needle */}
              <div className="absolute top-2 right-[-20px] w-12 h-20 origin-top-left pointer-events-none transform rotate-12" />
            </div>

            <span className="text-xs uppercase tracking-widest text-natural-subtext font-bold mt-6">
              REPRODUZINDO PRÉVIA {activeVersion === 'v1' ? 'V1' : 'V2'} (35 Segundos)
            </span>
          </div>

          {/* Custom audio controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-natural-subtext">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Progress bar seek slider */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = clickX / rect.width;
                seek(percentage * duration);
              }}
              className="h-2 rounded-full bg-natural-sage-light hover:h-2.5 transition-all cursor-pointer relative border border-natural-border/60"
            >
              <div
                className="absolute top-0 left-0 h-full bg-natural-sage rounded-full flex justify-end items-center"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              >
                <div className="w-3 h-3 rounded-full bg-natural-dark border border-white transform translate-x-1" />
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-natural-sage hover:bg-natural-sage/90 text-white flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-white" />
                ) : (
                  <Play className="w-7 h-7 fill-white translate-x-0.5" />
                )}
              </button>
            </div>
          </div>
          
          <div className="p-4 bg-natural-sage-light rounded-xl flex items-start gap-2 border border-natural-border">
            <AlertCircle className="w-4 h-4 text-natural-sage shrink-0 mt-0.5" />
            <p className="text-[11px] text-natural-text leading-normal font-light">
              <strong>Nota:</strong> Esta é apenas uma prévia compactada de 40 segundos para preservar os direitos e recursos. Após aprovado o Pix, suas duas músicas completas e definitivas de 4 minutos serão liberadas no player com taxa de bits máxima para download!
            </p>
          </div>

        </div>

        {/* Right Side: Payment Details */}
        <div className="lg:col-span-5 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-natural-subtext mb-4 border-b border-natural-border pb-3">
              <CreditCard className="w-4 h-4 text-natural-sage" /> Cobrança única de Emissão
            </div>

            {/* Price values */}
            <div className="mb-6">
              <span className="text-natural-subtext font-light text-xs uppercase block tracking-wider">Adesão Promocional</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-extrabold font-display text-natural-dark tracking-tight">R$ 97,90</span>
                <span className="text-xs text-natural-subtext font-light line-through">R$ 180,00</span>
              </div>
              <span className="text-[10px] text-[#2E7D32] border border-[#C8E6C9] bg-[#EBF5EE] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider mt-2.5 inline-block">
                Economize 45% hoje
              </span>
            </div>

            {/* QR block */}
            <div className="flex flex-col items-center p-4 border border-natural-border bg-natural-sage-light rounded-2xl mb-5 space-y-4">
              {pedido.pix_qr_code_url ? (
                <img
                  src={pedido.pix_qr_code_url}
                  alt="PIX QR Code"
                  className="w-40 h-40 border border-natural-border bg-white p-1 rounded-xl shadow-3xs"
                />
              ) : (
                <div className="w-40 h-40 rounded-xl bg-neutral-200 animate-pulse flex items-center justify-center">
                  <QrCode className="w-10 h-10 text-neutral-400" />
                </div>
              )}
              
              <div className="text-center">
                <h4 className="text-xs font-bold text-natural-dark uppercase tracking-widest flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-natural-sage animate-ping" /> Aguardando Transferência Pix...
                </h4>
                <p className="text-[10px] text-natural-subtext font-light mt-1">
                  Verificando a transação a cada 4 segundos de forma automática.
                </p>
              </div>
            </div>

            {/* Copy PIX button */}
            <button
              onClick={handleCopyPix}
              className="w-full py-3 px-4 bg-natural-sage-light hover:bg-[#FAF8F5] text-natural-dark text-xs font-semibold rounded-xl flex items-center justify-center gap-2 border border-natural-border transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-natural-sage" /> Código Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-natural-subtext" /> Copiar Código PIX Copia e Cola
                </>
              )}
            </button>
          </div>

          {/* SIMULATION GATEWAY TRIGGER IN DEVELOPMENT */}
          <div className="border-t border-natural-border pt-5 mt-6 space-y-3">
            <div className="flex items-center gap-1 text-xs text-natural-dark bg-natural-sage-light rounded p-2 border border-natural-border select-none">
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-natural-sage" />
              <span className="font-medium text-[10px] leading-tight">MÓDULO DE TESTE: Libere as canções via simulação rápida</span>
            </div>
            
            <button
              onClick={onSimulatePayment}
              disabled={isSimulatingPay}
              className="w-full py-3.5 px-4 bg-natural-sage hover:bg-natural-sage/90 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-55"
            >
              {isSimulatingPay ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Processando Trilha e Cortando com FFmpeg...
                </>
              ) : (
                <>
                  Simular Confirmação de PIX (Aprovar)
                </>
              )}
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
