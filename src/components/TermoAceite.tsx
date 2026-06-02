import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, CheckSquare, Square, ArrowRight, ClipboardCheck } from 'lucide-react';

interface TermoAceiteProps {
  estiloMusical: string;
  onAgree: () => void;
  onBack: () => void;
}

export default function TermoAceite({ estiloMusical, onAgree, onBack }: TermoAceiteProps) {
  const [checked, setChecked] = useState(false);

  return (
    <div id="termo-aceite-root" className="max-w-xl mx-auto px-4 py-8">
      
      {/* Visual Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-natural-sage/10 mb-3">
          <ClipboardCheck className="w-6 h-6 text-natural-sage" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold font-display text-natural-dark tracking-tight">
          Aceite de Composição Técnica
        </h2>
        <p className="text-sm text-natural-subtext mt-1 max-w-sm mx-auto font-light leading-relaxed">
          Para prosseguirmos com a produção musical e a interpretação vocal, por favor revise e concorde com o termo abaixo.
        </p>
      </div>

      {/* Contract paper container */}
      <div className="bg-white border border-natural-border rounded-2xl shadow-xs overflow-hidden mb-6">
        <div className="bg-natural-sage-light px-5 py-3 border-b border-natural-border flex items-center justify-between">
          <span className="text-xs font-bold text-natural-dark uppercase tracking-widest flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-natural-caramel" /> Declaração de Aceite Técnico
          </span>
          <span className="text-[10px] bg-natural-sage/15 text-natural-sage rounded px-1.5 py-0.5 font-bold uppercase tracking-wider">
            MÚSICA ATRIBUÍDA
          </span>
        </div>

        <div className="p-6 md:p-8 space-y-4 text-natural-text leading-relaxed font-light text-sm md:text-md text-justify">
          <p>
            <strong>CONTRATO DE COMPOSIÇÃO E DECLARAÇÃO DE ACEITE INTEGRAL:</strong>
          </p>
          
          <p>
            Ao assinar o presente termo digital, declaro expressamente que aprovo integralmente a letra apresentada no ciclo de revisão anterior.
          </p>
          
          <p className="bg-natural-sage-light p-4 border-l-2 border-natural-sage text-natural-dark italic">
            "Estou ciente de que a melodia, o ritmo e a interpretação vocal serão produzidos de forma exclusiva com base no estilo escolhido (<strong className="text-natural-dark uppercase text-xs">{estiloMusical}</strong>). Após o início da produção musical, a letra e o áudio <strong>NÃO PODERÃO SER EDITADOS, CORRIGIDOS OU ALTERADOS</strong> em hipótese alguma. O arquivo final de áudio entregue pertence integralmente ao cliente para uso pessoal, livre de direitos autorais."
          </p>
          
          <p>
            Dessa forma, dou o meu consentimento para que o motor de síntese vocal e renderização de fita Suno e o pós-processamento de engenharia FFmpeg sejam iniciados na nuvem.
          </p>
        </div>
      </div>

      {/* Checkbox Trigger */}
      <button
        type="button"
        onClick={() => setChecked(!checked)}
        className={`w-full p-4 border rounded-xl flex items-start gap-3 transition-all cursor-pointer text-left mb-8 ${
          checked 
            ? 'bg-natural-sage/5 border-natural-sage' 
            : 'bg-white hover:bg-natural-sage-light/50 border-natural-border'
        }`}
      >
        <span className="mt-0.5 shrink-0 transition-transform active:scale-95">
          {checked ? (
            <CheckSquare className="w-5 h-5 text-natural-sage fill-natural-sage/25" />
          ) : (
            <Square className="w-5 h-5 text-neutral-400" />
          )}
        </span>
        <div>
          <span className="text-xs font-bold text-natural-dark block uppercase tracking-wider">
            Li, concordo e aprovo a letra
          </span>
          <span className="text-xs text-natural-subtext font-light mt-1 block leading-normal">
            Declaro a letra perfeita e autorizo o disparo da equipe técnica de renderização acústica.
          </span>
        </div>
      </button>

      {/* Buttons */}
      <div className="space-y-3">
        <button
          onClick={onAgree}
          disabled={!checked}
          className="w-full py-4.5 px-6 font-bold text-white text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer bg-natural-sage hover:bg-natural-sage/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Avançar para Geração Musical <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onBack}
          className="w-full py-3 px-4 bg-white hover:bg-natural-sage-light text-natural-subtext hover:text-natural-dark font-semibold text-xs rounded-xl border border-natural-border flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          Voltar e Reler a Letra
        </button>
      </div>

    </div>
  );
}
