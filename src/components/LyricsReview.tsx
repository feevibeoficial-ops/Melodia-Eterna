import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Edit3, ArrowLeftRight, ChevronRight, PenTool, AlertCircle } from 'lucide-react';

interface LyricsReviewProps {
  lyrics: string;
  isRefining: boolean;
  onApprove: () => void;
  onRefine: (feedback: string) => void;
  onBackToAnswers: () => void;
}

export default function LyricsReview({ lyrics, isRefining, onApprove, onRefine, onBackToAnswers }: LyricsReviewProps) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedback, setFeedback] = useState('');

  const submitFeedback = () => {
    if (!feedback.trim()) {
      alert('Por favor, digite os detalhes do que você deseja ajustar na música.');
      return;
    }
    onRefine(feedback);
    setFeedback('');
    setShowFeedbackForm(false);
  };

  return (
    <div id="lyrics-review-root" className="max-w-xl mx-auto px-4 py-8">
      
      {/* Title */}
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-natural-sage/10 text-natural-sage rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
          <Sparkles className="w-3.5 h-3.5 text-natural-sage animate-spin" /> Sua Letra Exclusiva está Pronta!
        </span>
        <h2 className="text-2xl md:text-3xl font-bold font-display text-natural-dark tracking-tight">
          A Poesia da Sua História
        </h2>
        <p className="text-sm text-natural-subtext mt-1 max-w-sm mx-auto font-light leading-relaxed">
          Nossa equipe de composição escreveu cada palavra com muito sentimento. Leia com carinho antes de aprovar.
        </p>
      </div>

      {/* Lyrics Box */}
      <div className="relative bg-white border border-natural-border rounded-2xl shadow-xs px-6 py-8 md:px-10 md:py-12 mb-6 select-text overflow-hidden">
        {/* Corner paper fold guidelines */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-natural-border pointer-events-none rounded-tl-xl opacity-60 ml-4 mt-4" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-natural-border pointer-events-none rounded-tr-xl opacity-60 mr-4 mt-4" />
        
        <AnimatePresence mode="wait">
          {isRefining ? (
            <motion.div
              key="refining-loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 space-y-4"
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-natural-sage/20 border-t-natural-sage animate-spin" />
                <PenTool className="w-5 h-5 text-natural-sage absolute inset-0 m-auto animate-bounce" />
              </div>
              <p className="text-sm font-semibold text-natural-subtext">Re-escrevendo sentimentos...</p>
              <p className="text-xs text-natural-subtext max-w-xxs text-center font-light leading-normal">
                Sua história está sendo lapidada com base em seu feedback. Por favor, aguarde.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              {/* Actual lyrics list */}
              <div className="text-center font-light text-natural-dark leading-relaxed text-sm md:text-base whitespace-pre-line tracking-wide">
                {lyrics}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Interactive feedback panel */}
      <AnimatePresence>
        {showFeedbackForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-[#FAF8F5] px-5 py-4 border border-natural-border rounded-xl mb-6 space-y-3"
          >
            <label className="text-xs font-bold uppercase tracking-wider text-natural-dark block">
              O que você deseja mudar ou enriquecer na letra?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Ex: Deixe o refrão mais feliz / Inclua o detalhe do gato de estimação que faltou / Ficou um pouco formal demais."
              rows={3}
              className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage transition-all font-light text-natural-dark"
            />
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowFeedbackForm(false)}
                className="flex-1 py-2 px-4 border border-natural-border bg-white hover:bg-natural-sage-light text-xs font-semibold text-natural-subtext rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={submitFeedback}
                className="flex-1 py-2 px-4 bg-natural-sage hover:bg-natural-sage/90 text-xs font-semibold text-white rounded-lg cursor-pointer"
              >
                Aplicar Mudanças
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button controls */}
      <div className="space-y-3">
        <button
          onClick={onApprove}
          disabled={isRefining}
          className="w-full py-4.5 px-6 bg-natural-sage hover:bg-natural-sage/90 font-bold text-white text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-55"
        >
          Achei Linda, Quero Essa! <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => setShowFeedbackForm(!showFeedbackForm)}
            disabled={isRefining}
            className="flex-1 py-3 px-4 bg-white hover:bg-natural-sage-light text-natural-dark font-semibold text-xs rounded-xl border border-natural-border flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-55"
          >
            <Edit3 className="w-3.5 h-3.5 text-natural-sage" /> Ajustar Detalhes
          </button>
          
          <button
            onClick={onBackToAnswers}
            disabled={isRefining}
            className="flex-1 py-3 px-4 bg-white hover:bg-natural-sage-light text-natural-subtext font-semibold text-xs rounded-xl border border-natural-border flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-55"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-natural-border" /> Corrigir Respostas
          </button>
        </div>
      </div>
      
      <div className="flex items-start gap-2 bg-natural-sage-light p-3 rounded-lg border border-natural-border mt-6 select-none">
        <AlertCircle className="w-4 h-4 text-natural-subtext shrink-0 mt-0.5" />
        <p className="text-[10px] text-natural-subtext leading-normal font-light">
          <strong>Aviso:</strong> Ajustes de composição adicionais usam a mesma trilha de memórias. Após aprovar, você será direcionado para o termo de aceite técnico e a geração musical exclusiva.
        </p>
      </div>

    </div>
  );
}
