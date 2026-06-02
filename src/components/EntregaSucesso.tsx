import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, Download, FileText, Calendar, Play, Pause, ChevronDown, ChevronUp, Copy, Check, ExternalLink } from 'lucide-react';
import { PedidoMusica } from '../types';

interface EntregaSucessoProps {
  pedido: PedidoMusica;
  onRestart: () => void;
}

export default function EntregaSucesso({ pedido, onRestart }: EntregaSucessoProps) {
  const [activeVersion, setActiveVersion] = useState<'v1' | 'v2'>('v1');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(240); // Standard is approx 4 mins
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync player
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Direct stream link from our server
    const fullAudioUrl = activeVersion === 'v1' ? `/audio/full/${pedido.id}_v1.mp3` : `/audio/full/${pedido.id}_v2.mp3`;
    const audio = new Audio(fullAudioUrl);

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration || 210);
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
        console.error('Audio play failed:', e);
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

  const handleCopyLyrics = () => {
    if (pedido.letra_aprovada) {
      navigator.clipboard.writeText(pedido.letra_aprovada);
      setCopiedLyrics(true);
      setTimeout(() => setCopiedLyrics(false), 2000);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return 'Não definida';
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '7 dias após criação';
    }
  };

  return (
    <div id="success-delivery-root" className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      
      {/* Top Banner Success */}
      <div className="text-center bg-[#EBF5EE] border border-[#C8E6C9] p-6 rounded-3xl md:p-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center justify-center w-12 h-12 bg-[#C8E6C9] rounded-full text-[#1B5E20] mb-3"
        >
          <CheckCircle className="w-7 h-7" />
        </motion.div>
        
        <h2 className="text-2xl md:text-3xl font-extrabold font-display text-natural-dark tracking-tight">
          Pagamento Confirmado! Música Concluída!
        </h2>
        <p className="text-sm text-natural-subtext max-w-lg mx-auto font-light leading-relaxed mt-1">
          O Pix foi compensado instantaneamente. Seus dois arquivos musicais definitivos já foram compilados e estão prontos para tocar a alma e emocionar!
        </p>
        
        <div className="flex gap-4 justify-center items-center mt-5 text-[11px] text-natural-caramel bg-natural-sage-light border border-natural-border py-2.5 px-4 rounded-xl max-w-sm mx-auto select-none font-mono">
          <Calendar className="w-3.5 h-3.5" />
          <span>EXPIRAÇÃO INTERNA: {formatDate(pedido.data_expiracao_local)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left column: Vinyl Disc and Full Player controls */}
        <div className="lg:col-span-6 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex justify-between items-center border-b border-natural-border pb-3">
            <h4 className="text-sm font-semibold tracking-wide text-natural-dark uppercase font-display select-none">
              Mídia Completa Player
            </h4>
            <span className="text-[10px] font-mono bg-natural-sage-light border border-natural-border px-2 py-0.5 rounded text-natural-subtext">
              ID: {pedido.id}
            </span>
          </div>

          {/* Toggle between V1 and V2 */}
          <div className="flex gap-2.5 bg-natural-sage-light p-1 border border-natural-border rounded-xl">
            <button
              onClick={() => {
                setActiveVersion('v1');
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                activeVersion === 'v1'
                  ? 'bg-white border border-natural-border text-natural-dark shadow-3xs'
                  : 'bg-transparent text-natural-subtext hover:text-natural-dark'
              }`}
            >
              Versão 01
            </button>
            <button
              onClick={() => {
                setActiveVersion('v2');
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                activeVersion === 'v2'
                  ? 'bg-white border border-natural-border text-natural-dark shadow-3xs'
                  : 'bg-transparent text-natural-subtext hover:text-natural-dark'
              }`}
            >
              Versão 02
            </button>
          </div>

          {/* Album visual disc cover */}
          <div className="flex flex-col items-center py-4">
            <motion.div
              animate={isPlaying ? { rotate: 360 } : {}}
              transition={{ repeat: Infinity, duration: 4.5, ease: 'linear' }}
              className="w-40 h-40 rounded-full border-12 border-natural-dark bg-natural-caramel p-1 shadow-lg relative flex items-center justify-center select-none"
            >
              {/* Grooves on vinyl */}
              <div className="absolute inset-1 rounded-full border border-black/10" />
              <div className="absolute inset-4 rounded-full border border-black/10" />
              <div className="absolute inset-8 rounded-full border border-black/10" />
              {/* Inner ring */}
              <div className="w-12 h-12 rounded-full bg-white shadow-inner flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-natural-dark" />
              </div>
            </motion.div>
            <p className="text-xs uppercase font-bold text-natural-subtext tracking-wider mt-5">
              Reproduzindo Faixa Completa ({activeVersion === 'v1' ? 'Versão 01' : 'Versão 02'})
            </p>
          </div>

          {/* Full Player seeker */}
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
              className="h-2 rounded-full bg-natural-sage-light hover:h-2.5 border border-natural-border/60 transition-all cursor-pointer relative"
            >
              <div
                className="absolute top-0 left-0 h-full bg-natural-sage rounded-full flex justify-end items-center"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              >
                <div className="w-3 h-3 rounded-full bg-natural-dark border border-white transform translate-x-1" />
              </div>
            </div>

            <div className="flex justify-center items-center gap-6 pt-2">
              <button
                type="button"
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-natural-sage hover:bg-natural-sage/90 text-white flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-white" />
                ) : (
                  <Play className="w-7 h-7 fill-white translate-x-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* Downloads Triggers */}
          <div className="border-t border-natural-border pt-5 space-y-3">
            <h5 className="text-xs font-bold text-natural-subtext uppercase tracking-widest pl-1 select-none font-sans">
              Baixar suas Faixas (MP3 de alta qualidade)
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={`/audio/full/${pedido.id}_v1.mp3`}
                download={`Melodia_Eterna_${pedido.id}_Versao1.mp3`}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-natural-sage-light hover:bg-[#FAF8F5] text-natural-dark font-semibold text-xs rounded-xl border border-natural-border shadow-3xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-natural-sage" />
                Versão Clássica 01
              </a>
              <a
                href={`/audio/full/${pedido.id}_v2.mp3`}
                download={`Melodia_Eterna_${pedido.id}_Versao2.mp3`}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-natural-sage-light hover:bg-[#FAF8F5] text-natural-dark font-semibold text-xs rounded-xl border border-natural-border shadow-3xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-natural-sage" />
                Versão Alternativa 02
              </a>
            </div>

            {/* Backups trigger */}
            {pedido.url_original_suno && (
              <div className="pt-3">
                <span className="text-[10px] text-natural-subtext block text-center">
                  Faixas originais do estúdio (backup permanente na nuvem):
                </span>
                <div className="flex gap-4 mt-2 justify-center font-mono">
                  <a
                    href={pedido.url_original_suno}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-natural-sage hover:underline flex items-center gap-1"
                  >
                    Nuvem V1 <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={pedido.url_original_suno_2 || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-natural-sage hover:underline flex items-center gap-1"
                  >
                    Nuvem V2 <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right column: Approved Lyrics detail */}
        <div className="lg:col-span-6 bg-white border border-natural-border rounded-3xl p-6 md:p-8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-natural-border pb-3 mb-4">
              <h4 className="text-sm font-semibold tracking-wide text-natural-dark uppercase font-display flex items-center gap-1.5 select-none">
                <FileText className="w-4 h-4 text-natural-sage" /> Letra Oficial Aprovada
              </h4>
              <button
                onClick={handleCopyLyrics}
                className="text-[10px] font-semibold border border-natural-border bg-white text-natural-subtext hover:bg-natural-sage-light hover:text-natural-dark rounded px-2.5 py-1 flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedLyrics ? (
                  <>
                    <Check className="w-3 h-3 text-[#2E7D32]" /> Copiada!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copiar Letra
                  </>
                )}
              </button>
            </div>

            {/* Collapse view button for mobile */}
            <button
              onClick={() => setShowLyrics(!showLyrics)}
              className="lg:hidden w-full py-2 bg-natural-sage-light text-natural-dark rounded border border-natural-border text-xs font-semibold flex items-center justify-center gap-1 mb-3"
            >
              {showLyrics ? (
                <>
                  Ocular Letra <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Ver Letra Composta <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>

            {showLyrics && (
              <div className="bg-[#FAF8F5] p-5 rounded-2xl max-h-96 overflow-y-auto border border-natural-border select-text">
                <p className="text-center font-light text-natural-dark leading-relaxed text-sm whitespace-pre-line tracking-wide">
                  {pedido.letra_aprovada}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-natural-border pt-6 mt-6">
            <button
              onClick={onRestart}
              className="w-full py-4 px-5 bg-natural-sage hover:bg-natural-sage/90 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              Criar Outra Música Personalizada 🌟
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
