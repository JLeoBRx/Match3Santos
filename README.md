# MATCH DOS SANTOS

**Combine. Descubra. Inspire-se.**

Jogo Match-3 em HTML, CSS e JavaScript puro (ES6+, sem frameworks e sem backend). As peças são os retratos de 30 santos. Cada combinação revela, num painel abaixo do tabuleiro, uma reflexão sobre a vida e as virtudes do santo combinado.

---

## Como executar

O jogo lê arquivos JSON, por isso precisa ser aberto por um **servidor HTTP local**. Abrir o `index.html` direto (`file://`) não funciona, porque o navegador bloqueia a leitura dos JSON.

- **VS Code + Live Server:** clique com o botão direito em `index.html` e escolha **Open with Live Server**.
- **Python:** na pasta do projeto, rode `python -m http.server 8000` e acesse <http://localhost:8000>.
- **Node:** rode `npx serve .` na pasta do projeto.

As fontes vêm do Google Fonts. Sem internet, o jogo funciona normalmente com as fontes do sistema.

---

## Estrutura

```
Match3Santos/
├── index.html                 Telas: carregamento, início, fases, partida, álbum, configurações
├── css/
│   ├── style.css              Identidade visual, botões, menus, mapa, álbum, configurações, janelas
│   ├── game.css               HUD, tabuleiro, peças, peças especiais, painel de reflexões, resultados
│   ├── animations.css         Keyframes e modo de animações reduzidas
│   └── responsive.css         Ajustes para celular, tablet, paisagem e telas grandes
├── js/
│   ├── main.js                Inicialização, carregamento, navegação, tela inicial, mapa, tutorial
│   ├── constants.js           Tamanho do tabuleiro, tempos de animação, cores, versão do save
│   ├── utils.js               Funções auxiliares (RNG, embaralhar, criação de DOM…)
│   ├── board.js               Modelo do tabuleiro: geração sem combinações, troca, queda, embaralhamento
│   ├── matching.js            Detecção de combinações, peças especiais, reações em cadeia, combos
│   ├── scoring.js             Pontos, multiplicador de cascata, estrelas, metas do modo infinito
│   ├── goals.js               Objetivos das fases (pontos, peças, santo específico, especiais)
│   ├── renderer.js            Desenho do tabuleiro e animações (Web Animations API)
│   ├── input.js               Mouse, toque, arrastar e teclado (Pointer Events)
│   ├── game.js                Controlador da partida: jogada, cascatas, dicas, embaralhamento
│   ├── gameScreen.js          Tela da partida: HUD, layout responsivo, pausa e resultados
│   ├── reflectionPanel.js     Painel permanente de reflexões (sem janelas modais)
│   ├── reflections.js         Banco de reflexões e regras de seleção sem repetição
│   ├── saints.js              Cadastro dos santos e pré-carregamento das imagens
│   ├── levels.js              Fases: catálogo, mapa, apresentação e sessão de fase
│   ├── endless.js             Modo Infinito
│   ├── collection.js          Álbum dos Santos e página de detalhes
│   ├── settings.js            Configurações e diagnóstico de conteúdo
│   ├── storage.js             Salvamento em LocalStorage com versionamento e migrações
│   ├── audio.js               Efeitos e música sintetizados (Web Audio), com suporte a arquivos
│   ├── effects.js             Partículas, confete e textos flutuantes
│   ├── ui.js                  Troca de telas, janelas e avisos
│   └── icons.js               Ícones SVG
├── data/
│   ├── saints.json            Cadastro dos 30 santos
│   ├── reflections.json       300 reflexões (10 por santo)
│   ├── levels.json            30 fases
│   └── audio.json             Arquivos de som opcionais
├── Santos/                    Os 30 retratos originais (não são modificados)
├── assets/
│   ├── saints/                Miniaturas quadradas 256×256 geradas a partir dos retratos
│   ├── icons/                 Logo e favicon
│   ├── backgrounds/           Padrão de fundo
│   └── sounds/                Seus arquivos de som (opcional)
├── tools/
│   ├── generate_thumbs.py     Gera as miniaturas a partir de data/saints.json
│   ├── simulate.mjs           Estima a pontuação média por jogada
│   └── simulate_levels.mjs    Simula cada fase e sugere as estrelas
└── tests/
    ├── index.html             Testes de lógica no navegador
    ├── unit.tests.js          Testes de lógica (tabuleiro, reflexões, save, fases…)
    ├── run-node.mjs           Roda os testes de lógica no Node
    └── e2e.mjs                Teste de ponta a ponta com Playwright
```

---

## Funcionalidades

### Tabuleiro Match-3 (8 × 8)
- O tabuleiro é gerado aleatoriamente, sem combinações prontas e com pelo menos uma jogada possível.
- Para trocar peças, toque ou clique em duas peças vizinhas, ou arraste uma delas. Também é possível jogar pelo teclado: as setas movem o cursor e Enter seleciona.
- Uma troca que não forma combinação é desfeita e não gasta movimento.
- Combinações horizontais e verticais de 3 ou mais peças são aceitas, inclusive várias ao mesmo tempo.
- Depois de cada combinação as peças caem, novas peças entram pelo topo e as cascatas são resolvidas.
- Se o tabuleiro ficar sem jogadas, as peças são embaralhadas automaticamente.
- Após 6 segundos parado, o jogo destaca uma jogada possível. A dica pode ser desligada.
- O jogador não consegue mexer nas peças enquanto há animações ou cascatas em andamento.

### Peças especiais
| Combinação | Peça | Efeito |
|---|---|---|
| 4 em linha | **Raio de Luz** | Elimina a linha (combinação horizontal) ou a coluna (combinação vertical) |
| L ou T | **Cruz** | Elimina a linha e a coluna |
| 5 em linha | **Auréola** | Elimina uma área de 5 × 5 |
| Duas especiais trocadas entre si | **Combo** | Cruz de Luz, Grande Cruz (3 linhas + 3 colunas) ou Explosão de Glória (7 × 7) |

Uma peça especial atingida por outra também é ativada, em reação em cadeia. As cascatas multiplicam os pontos: a 2ª etapa vale ×2, a 3ª ×3, e assim por diante até ×8.

### Sistema de reflexões
- O painel fica sempre visível: abaixo do tabuleiro em telas verticais e ao lado dele em telas largas. Ele nunca abre janelas.
- O painel mostra o retrato, o nome, o título, o tema, o texto, a pergunta pessoal, a virtude e o progresso do santo (ex.: 3/10).
- **Seleção:** as reflexões ainda não vistas têm prioridade e o 1º ciclo segue a ordem dos ids. Nenhuma reflexão se repete antes de as 10 aparecerem. Depois disso, um novo ciclo começa em ordem aleatória, sem repetir de imediato a última reflexão exibida.
- **Tempo de leitura:** cada reflexão fica no painel por um tempo mínimo (curto, normal ou longo). Combinações feitas nesse intervalo deixam uma única reflexão na fila, indicada pelo botão "Próxima". O alfinete fixa a reflexão atual.
- **Combinações simultâneas:** todas entram nas estatísticas. Para o painel é escolhida uma só: primeiro a combinação feita diretamente pelo jogador, depois a maior, depois o santo com mais reflexões ainda não descobertas.
- O histórico e as reflexões descobertas ficam salvos no navegador.

### Modos de jogo
- **Fases:** 30 fases em 3 capítulos, num mapa sinuoso. Cada fase destaca um santo diferente. Os objetivos variam: pontos, número de peças, peças de um santo específico, peças especiais ou objetivos combinados. Ao vencer, os movimentos que sobraram viram bônus e a fase rende até 3 estrelas; a fase seguinte é desbloqueada. Ao perder, o progresso já conquistado é mantido. A dificuldade foi calibrada com simulações (`tools/simulate_levels.mjs`).
- **Modo Infinito:** começa com 30 movimentos. Cada etapa tem uma meta de pontos crescente. Ao atingir a meta, o jogador ganha +15 movimentos e um novo tabuleiro com outro grupo de 6 santos; ao longo das etapas, todos os 30 aparecem. O recorde e a melhor etapa são salvos a cada jogada.

### Álbum dos Santos
- Grade com os 30 santos, mostrando a imagem, o nome, as reflexões descobertas, uma barra de progresso e o estado (a descobrir, descoberto ou completo), com filtros.
- A página de cada santo traz o retrato grande, o nome completo, o espaço da biografia (estruturado, aguardando conteúdo revisado) e a lista das 10 reflexões, com as já descobertas legíveis.

### Configurações
- Liga/desliga e volume da música e dos efeitos sonoros.
- Dicas, animações reduzidas, tempo de leitura e posição do painel (automático, abaixo ou ao lado).
- **Modo editorial:** mostra no álbum todas as reflexões e o status de revisão de cada uma, para facilitar a revisão do texto.
- **Verificar conteúdo:** confere os retratos, as miniaturas, as reflexões e as fases.
- Reiniciar o progresso, mantendo as configurações.

---

## Como editar o conteúdo

### Reflexões (`data/reflections.json`)
Cada santo tem 10 reflexões com `id`, `title`, `theme`, `reflection`, `question`, `virtue` e `status`.

- `status: "revisar"` indica um texto real aguardando revisão. Ele **é exibido** no jogo.
- O jogo **não exibe** as reflexões provisórias, que são identificadas automaticamente:
  - `status` igual a `placeholder`, `provisorio`, `pendente`, `vazio`, `rascunho`, `oculto` ou `desativado`;
  - campos vazios;
  - textos como `[TEXTO PROVISÓRIO]`, `[PERGUNTA PROVISÓRIA]` ou qualquer campo inteiro entre colchetes;
  - textos com `lorem ipsum`, `PREENCHER`, `A DEFINIR` ou `TODO`.
- Ao trocar o status para `"aprovado"`, nada muda no jogo: o campo serve só para o seu controle editorial.

### Santos (`data/saints.json`)
- `image` guarda a grafia exata do arquivo em `Santos/`.
- `bio`, `feastDay` e `patronage` estão `null`. Quando receberem texto revisado, aparecem automaticamente na página do santo.
- `crop` define o recorte da miniatura (centro do rosto). Depois de alterá-lo, rode `python3 tools/generate_thumbs.py --sheet` (requer Pillow).

### Fases (`data/levels.json`)
Para criar uma fase, basta acrescentar um objeto com `id` sequencial; não é preciso mexer no código. Os campos estão documentados no próprio arquivo. Para avaliar a dificuldade e receber uma sugestão de estrelas, rode:

```bash
node tools/simulate_levels.mjs 80 --sugerir
```

### Sons (`data/audio.json`)
Todos os sons são sintetizados, sem nenhum arquivo. Para usar sons próprios, coloque os arquivos em `assets/sounds/` e informe o caminho no JSON, por exemplo `"music": "assets/sounds/musica.mp3"`.

---

## Salvamento
O progresso fica no LocalStorage, na chave `matchDosSantos.save`, e inclui:
- fases liberadas e concluídas, estrelas e melhores pontuações;
- recorde e melhor etapa do Modo Infinito;
- reflexões descobertas, ciclo de cada santo e histórico;
- estatísticas;
- configurações de áudio e preferências.

O save é **versionado**: `SAVE_VERSION` fica em `constants.js` e as migrações em `storage.js`. Um save corrompido é guardado como backup e o jogo recomeça sem travar.

---

## Testes

```bash
node tests/run-node.mjs
```
Roda os 25 testes de lógica e de dados. Para rodar os mesmos testes no navegador, abra `tests/index.html` pelo servidor local.

```bash
node tests/e2e.mjs
```
Roda o teste de ponta a ponta com Playwright (`npm i -D playwright` e `npx playwright install chromium`). O teste joga de verdade em computador, celular (toque) e paisagem e faz 42 verificações, como:
- imagens que não carregaram;
- trocas válidas e inválidas;
- painel de reflexões;
- vitória e desbloqueio de fase;
- progresso salvo após recarregar a página;
- modo infinito;
- álbum e configurações;
- rolagem horizontal;
- erros no console.
