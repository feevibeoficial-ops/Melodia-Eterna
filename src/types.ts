/**
 * Types and interfaces for Melodia Eterna
 */

export type TemaId = string;
export type StatusPagamento = 'PENDENTE' | 'PAGO';
export type StatusProducao = 'AGUARDANDO_APROVACAO' | 'LETRA_APROVADA' | 'AGUARDANDO_FAIXAS' | 'PREVIAS_PRONTAS' | 'LIBERADO';

export interface TemaPergunta {
  id: string;
  label: string;
  p_placeholder: string;
  description?: string;
  sortOrder?: number;
  isRequired?: boolean;
  isActive?: boolean;
}

export interface TemaConfig {
  id: TemaId;
  titulo: string;
  descricao: string;
  emoji: string;
  bgColor: string;
  color: string;
  sortOrder?: number;
  isActive?: boolean;
  perguntas: TemaPergunta[];
}

export interface PesquisaRequisito {
  email: string;
  whatsapp: string;
}

export interface RespostasFormulario {
  temaId: TemaId;
  respostas: Record<string, string>;
  estiloMusical: string;
  provVoice: string;
  descricaoMusical?: string;
  clienteEmail: string;
  clienteWhatsapp: string;
}

export interface PedidoAiInteraction {
  id: string;
  kind: 'compose' | 'refine';
  createdAt: string;
  model: string;
  temperature: number;
  prompt: string;
  output: string;
  feedbackUsuario?: string | null;
  selectedGenderForRevelacao?: 'menino' | 'menina' | null;
}

export interface PromptTemplate {
  temaId: TemaId;
  composeTemplate: string;
  refineTemplate: string;
  updatedAt: string;
}

export interface PedidoMusica {
  id: string;
  createdAt: string;
  updatedAt: string;
  cliente_email: string;
  cliente_whatsapp: string;
  respostas: RespostasFormulario;
  letra_gerada: string;
  letra_aprovada: string | null;
  termo_aceite_assinado: boolean;
  termo_aceite_timestamp: string | null;
  status_pagamento: StatusPagamento;
  status_producao: StatusProducao;
  pix_copia_e_cola: string | null;
  pix_qr_code_url: string | null;
  url_original_suno: string | null;
  url_original_suno_2: string | null;
  url_referencia_externa_1: string | null;
  url_referencia_externa_2: string | null;
  url_local_servidor: string | null;
  url_local_servidor_2: string | null;
  comprovante_url_local: string | null;
  comprovante_nome_arquivo: string | null;
  data_expiracao_local: string | null;
  ai_interactions: PedidoAiInteraction[];
}

export const DEFAULT_TEMAS: TemaConfig[] = [
  {
    id: 'romantica',
    titulo: 'Romantica',
    descricao: 'Para o amor da sua vida (esposa, esposo, namorados).',
    emoji: '💖',
    bgColor: 'from-rose-500/10 to-pink-500/10',
    color: 'rose',
    perguntas: [
      { id: 'p1', label: 'Qual o nome do casal (seu nome e o nome dela/dele)?', p_placeholder: 'Ex: Arthur e Sofia' },
      { id: 'p2', label: 'Qual a data de inicio do relacionamento e a data do casamento (se houver)?', p_placeholder: 'Ex: Comecamos a namorar em 12/04/2018 e nos casamos em 20/11/2022' },
      { id: 'p3', label: 'Como e onde voces se conheceram? Deixe um detalhe marcante ou engracado desse dia.', p_placeholder: 'Ex: Nos conhecemos num dia chuvoso na parada de onibus da faculdade, dividi o guarda-chuva.' },
      { id: 'p4', label: 'Quais sao as principais qualidades dele(a) que te fazem se apaixonar todos os dias?', p_placeholder: 'Ex: O sorriso contagiante, a paciencia dela e o jeito que ela cuida de todo mundo.' },
      { id: 'p5', label: 'Cite 2 ou 3 momentos inesqueciveis que viveram juntos (viagens, superacoes, conquistas).', p_placeholder: 'Ex: Nossa viagem para Gramado, quando adotamos nosso cachorrinho e quando compramos nosso apartamento.' },
      { id: 'p6', label: 'Voces tem apelidos carinhosos, piadas internas ou manias que so voces entendem? Quais?', p_placeholder: 'Ex: Eu a chamo de Pipoca e ela me chama de Urso. Ela morde o copo quando bebe refrigerante.' },
    ],
  },
  {
    id: 'mae',
    titulo: 'Mae Corujinha',
    descricao: 'Homenagem cheia de afeto e gratidao para sua mae.',
    emoji: '🌸',
    bgColor: 'from-fuchsia-500/10 to-purple-500/10',
    color: 'fuchsia',
    perguntas: [
      { id: 'p1', label: 'Qual o nome da sua mae e qual o apelido carinhoso que voce a chama?', p_placeholder: 'Ex: Maria Helena, tambem chamada de Rainha ou Mainha' },
      { id: 'p2', label: 'Quais sao as frases, ensinamentos ou conselhos que ela sempre te diz e que voce leva para a vida?', p_placeholder: 'Ex: "Deus ajuda quem cedo madruga" e "Nunca se esqueca de onde voce veio".' },
      { id: 'p3', label: 'Qual a maior licao de resiliencia, amor ou sacrificio que voce viu ela fazer pela familia?', p_placeholder: 'Ex: Ela trabalhava em dois empregos para garantir que nunca faltassem livros e estudos para nos.' },
      { id: 'p4', label: 'Qual lembranca da infancia ou cheiro/comida te faz lembrar imediatamente do lar que ela construiu?', p_placeholder: 'Ex: O cheirinho de bolo de cenoura com cobertura de chocolate saindo do forno nas tardes de domingo.' },
      { id: 'p5', label: 'O que voce mais deseja agradecer e declarar para ela atraves dessa musica?', p_placeholder: 'Ex: Quero agradecer por ser meu porto seguro e dizer que tudo o que sou hoje devo a ela.' },
    ],
  },
  {
    id: 'pai',
    titulo: 'Heroi Pai',
    descricao: 'Uma homenagem emocionante para o seu pai, parceiro e heroi.',
    emoji: '👔',
    bgColor: 'from-blue-500/10 to-cyan-500/10',
    color: 'blue',
    perguntas: [
      { id: 'p1', label: 'Qual o nome do seu pai e como a familia o chama?', p_placeholder: 'Ex: Francisco Carlos, mas todos chamam de Chico ou Painho' },
      { id: 'p2', label: 'Qual o passatempo favorito dele ou aquela mania engracada que ele tem?', p_placeholder: 'Ex: Ele ama fazer churrasco ouvindo sertanejo raiz e conserta tudo em casa com fita isolante.' },
      { id: 'p3', label: 'Qual foi o conselho mais valioso ou a conversa mais marcante que voce teve com ele?', p_placeholder: 'Ex: Ele me disse na garagem que o carater de um homem e medido pela honestidade na dificuldade.' },
      { id: 'p4', label: 'Conte uma historia de protecao, parceria ou um momento em que voce sentiu muito orgulho dele.', p_placeholder: 'Ex: Quando ele passou a noite inteira em claro me ajudando a pintar meu primeiro carro antigo.' },
      { id: 'p5', label: 'Se pudesse definir a personalidade dele em 3 palavras, quais seriam?', p_placeholder: 'Ex: Batalhador, brincalhao e firme' },
    ],
  },
  {
    id: 'filho',
    titulo: 'Filho(a) Amado(a)',
    descricao: 'Uma homenagem profunda para celebrar o amor, o orgulho e a presenca de um filho ou filha.',
    emoji: '🧸',
    bgColor: 'from-emerald-500/10 to-lime-500/10',
    color: 'emerald',
    perguntas: [
      { id: 'p1', label: 'Qual o nome do seu filho ou filha e como voce costuma chama-lo(a) com carinho?', p_placeholder: 'Ex: Davi, meu campeao / Maria Clara, minha princesinha' },
      { id: 'p2', label: 'Como foi a chegada dele(a) na sua vida ou qual momento marcou o inicio dessa historia entre voces?', p_placeholder: 'Ex: O nascimento dele mudou completamente meu mundo e me ensinou um amor que eu nunca tinha sentido.' },
      { id: 'p3', label: 'Quais qualidades, jeitos ou atitudes dele(a) mais enchem seu coracao de orgulho?', p_placeholder: 'Ex: O sorriso doce, a coragem para aprender e o jeito carinhoso com toda a familia.' },
      { id: 'p4', label: 'Conte um momento inesquecivel ou emocionante que voce viveu com ele(a).', p_placeholder: 'Ex: Os primeiros passos, o primeiro dia na escola, um abraco num dia dificil ou uma oracao que me marcou.' },
      { id: 'p5', label: 'Quais sonhos, desejos ou mensagens do seu coracao voce quer declarar para o futuro dele(a)?', p_placeholder: 'Ex: Quero que ele saiba que sempre tera meu apoio, que seja forte, feliz e nunca esqueca o quanto e amado.' },
      { id: 'p6', label: 'Voces tem apelidos, brincadeiras, manias ou pequenos detalhes que so voces entendem?', p_placeholder: 'Ex: Chamo ela de estrelinha, dancamos juntos na sala e sempre rimos quando ela inventa palavras.' },
    ],
  },
  {
    id: 'debutante',
    titulo: '15 Anos (Debutante)',
    descricao: 'A transicao especial de menina para mulher em formato de musica.',
    emoji: '👑',
    bgColor: 'from-amber-500/10 to-orange-500/10',
    color: 'amber',
    perguntas: [
      { id: 'p1', label: 'Qual o nome da debutante e a data da festa/nascimento?', p_placeholder: 'Ex: Isabella, festa no dia 15/08/2026' },
      { id: 'p2', label: 'Como os pais descrevem a transicao dela de menina para jovem mulher? Quais os maiores orgulhos?', p_placeholder: 'Ex: Dedicada, inteligente, companheira, que ilumina todo lugar por onde passa.' },
      { id: 'p3', label: 'Quais sao os principais hobbies dela (danca, maquiagem, leitura, esportes, redes sociais)?', p_placeholder: 'Ex: Ela ama dancar ballet, ler romances de fantasia e gravar videos de maquiagem.' },
      { id: 'p4', label: 'Quais sao os maiores sonhos e planos que ela tem para o futuro?', p_placeholder: 'Ex: Ela sonha em estudar medicina veterinaria para cuidar de cavalos e fazer intercambio.' },
      { id: 'p5', label: 'Lembre um fato engracado ou fofo da infancia dela que a familia guarda com carinho.', p_placeholder: 'Ex: Quando ela usava os sapatos de salto alto da mae para dar "aula" para os ursinhos de pelucia.' },
    ],
  },
  {
    id: 'amizade',
    titulo: 'Amizade de Ouro',
    descricao: 'Para celebrar conexoes verdadeiras, viagens, risadas e cumplicidade.',
    emoji: '🍻',
    bgColor: 'from-teal-500/10 to-emerald-500/10',
    color: 'teal',
    perguntas: [
      { id: 'p1', label: 'Qual o nome dos amigos ou do grupo de amigos envolvidos nessa historia?', p_placeholder: 'Ex: Rodrigo, Gustavo e Gabriel (o Trio Relampago)' },
      { id: 'p2', label: 'Como e ha quanto tempo essa amizade comecou? Onde se conheceram?', p_placeholder: 'Ex: Comecou ha 10 anos, nos conhecemos na escola jogando futebol na hora do recreio.' },
      { id: 'p3', label: 'Quais sao os principais roles, viagens, aventuras ou loucuras que voces ja dividiram?', p_placeholder: 'Ex: Nossa viagem de mochilao para o Rio de Janeiro e quando ficamos sem gasolina na serra.' },
      { id: 'p4', label: 'Conte uma situacao marcante em que a presenca desse amigo fez toda a diferenca.', p_placeholder: 'Ex: Quando o Gustavo me ajudou na mudanca de estado de surpresa, sem eu pedir.' },
      { id: 'p5', label: 'Quais sao as manias internas, piadas de grupo, apelidos ou expressoes engracadas que so voces entendem?', p_placeholder: 'Ex: Falamos "e os guri" para tudo, apelido de "Prego" do Gabriel, e a mania de rir alto.' },
    ],
  },
  {
    id: 'revelacao',
    titulo: 'Chá Revelação',
    descricao: 'A doce espera de uma nova vida: revelação do nome e muito amor.',
    emoji: '🍼',
    bgColor: 'from-violet-500/10 to-indigo-500/10',
    color: 'violet',
    perguntas: [
      { id: 'p1', label: 'Qual é o nome do pai e da mãe do bebê?', p_placeholder: 'Ex: Pai: Renato / Mãe: Juliana' },
      { id: 'p2', label: 'Como foi a descoberta da gravidez e como está a ansiedade pela espera?', p_placeholder: 'Ex: Descobrimos no teste de farmácia numa terça de manhã. A ansiedade está mil por hora.' },
      { id: 'p3', label: 'Quais são os palpites da família? Há alguma brincadeira sobre isso?', p_placeholder: 'Ex: A avó jura que é menina por causa do formato da barriga, mas o pai acha que é o capitão do time.' },
      { id: 'p4', label: 'Deixe uma mensagem de amor sobre como esse bebê já é amado antes mesmo de nascer.', p_placeholder: 'Ex: Você é nossa maior promessa, nossa casa e nossos corações já estão prontos para você.' },
      { id: 'p5', label: 'Qual é o nome do bebê caso seja menino e qual o nome caso seja menina?', p_placeholder: 'Ex: Se for menino se chamará Teo, se for menina se chamará Lívia.' },
    ],
  },
];
