# Planejamento técnico — evolução da transmissão de tela do VoiceRoom

> Fonte analisada: `voiceroom_prd_e_melhorias_transmissao.txt`  
> Data da análise: 22/08/2026  
> Status: implementação inicial executada; checks e testes automatizados passaram; validação de mídia em computadores/redes reais ainda pendente.  
> Premissas: aplicativo Windows/Electron, WebRTC P2P Mesh, sala pequena, custo operacional alvo de R$ 0 e servidor Render usado apenas para sinalização.

## 1. Decisão executiva

A evolução recomendada é manter a arquitetura P2P atual e melhorar o cliente em camadas:

1. conservar `720p/30 FPS` como padrão seguro;
2. criar perfis amigáveis de qualidade, incluindo `1080p/30 FPS` e `720p/60 FPS`;
3. medir a qualidade real antes de tentar controlá-la;
4. aplicar codec e limites RTP compatíveis com cada perfil;
5. implementar adaptação automática separada para cada espectador;
6. reduzir primeiro a qualidade da tela quando houver congestionamento, protegendo a voz;
7. validar em computadores e redes reais antes de tornar os novos perfis padrão.

Não é necessário migrar para SFU nem alterar o serviço do Render nesta fase. O servidor continuará encaminhando apenas mensagens de sinalização; vídeo e áudio de tela continuarão trafegando diretamente entre os participantes.

Estimativa de referência para uma pessoa desenvolvedora: **9 a 15 dias úteis**, incluindo testes reais em dois computadores. A geração de um novo instalador deve ocorrer somente no marco de release, não a cada etapa.

## 2. Correções e atualizações em relação ao TXT

O arquivo de origem mistura o escopo inicial do MVP com funcionalidades que já foram implementadas. O planejamento precisa partir do estado real do repositório.

| Tema | Texto de referência | Estado atual validado | Decisão deste plano |
|---|---|---|---|
| Transmissões simultâneas | Recomenda uma única transmissão | O servidor permite até duas pessoas transmitindo | Preservar duas transmissões; cada usuário continua assistindo somente uma por vez |
| Áudio da tela | Aparece como fora do MVP em uma seção | Já existe captura opcional do áudio do sistema no Windows | Preservar; não faz parte da melhoria visual de qualidade |
| Qualidades | 480p e 720p | Já existem `480p/30` e `720p/30` | Adicionar Nitidez e Fluido sem remover os modos atuais |
| Captura | Recomenda captura nativa | Já é nativa, com `resizeMode: "none"` | Manter; reduzir no `RTCRtpSender` |
| Proporção | Recomenda não cortar | Já é preservada e exibida com `object-fit: contain` | Manter |
| Adaptação | Proposta futura | Ainda não existe; há apenas limite estático por perfil | Implementar após instrumentação |
| Codec | Sugere VP9 e fallback VP8 | O codec fica a cargo da negociação padrão do Chromium | Adicionar preferência com detecção de capacidade e fallback |
| Diagnóstico | Proposta futura | Há RTT geral da conexão, mas não métricas específicas da tela | Criar diagnóstico local específico por espectador |
| Push-to-talk, volume e ruído | Listados como futuros | Já estão implementados | Fora deste plano |
| TURN | Sugerido como fallback futuro | Há somente STUN | Continuar sem TURN enquanto o P2P do grupo funcionar; TURN melhora conectividade, não nitidez |
| ADR de compartilhamento | ADR antigo fixa uma transmissão e sem áudio | O código atual já divergiu dessa decisão | Substituir ou atualizar o ADR durante a documentação da entrega |

## 3. Funcionamento atual

```text
Fonte escolhida no Electron
        ↓
desktopCapturer + getDisplayMedia
        ↓
MediaStream nativo (vídeo e áudio opcional)
        ↓
uma track de captura compartilhada
        ↓
RTCRtpSender independente para cada espectador inscrito
        ↓
WebRTC P2P direto
        ↓
vídeo remoto com object-fit: contain

Render / Socket.IO: somente sala, inscrição e SDP/ICE
```

### Configuração vigente

| Perfil atual | Limite de saída | FPS máximo | Bitrate máximo por espectador | Estratégia |
|---|---:|---:|---:|---|
| 480p | aproximadamente 854×480 | 30 | 1,2 Mbps | preservar resolução |
| 720p | aproximadamente 1280×720 | 30 | 2,5 Mbps | preservar resolução |

Detalhes importantes:

- A resolução indicada é um teto de envio, não uma alteração da proporção da fonte.
- Uma tela ultrawide é reduzida para caber no teto, sem corte.
- `maxBitrate` é um limite; o controle de congestionamento do WebRTC pode enviar menos.
- `contentHint = "detail"` favorece texto e interfaces.
- Cada espectador recebe uma codificação própria porque existe uma conexão P2P por participante.
- Alterar o tamanho do player ou abrir a visualização ampliada não aumenta a resolução recebida.
- O ajuste atual de `setParameters()` possui fallback silencioso. Se o runtime rejeitar algum parâmetro, a transmissão continua, mas a interface não informa que o perfil não foi aplicado integralmente.

### Custo de upload no Mesh

O consumo do apresentador cresce com o número de espectadores:

```text
upload aproximado = bitrate efetivo por espectador × número de espectadores
```

Exemplos no limite máximo, sem contar overhead:

| Cenário | Upload aproximado do apresentador |
|---|---:|
| 720p/30 para 1 espectador | 2,5 Mbps |
| 720p/30 para 2 espectadores | 5 Mbps |
| 720p/30 para 4 espectadores | 10 Mbps |
| 1080p/30 a 5 Mbps para 2 espectadores | 10 Mbps |
| 1080p/30 a 5 Mbps para 4 espectadores | 20 Mbps |

Por isso, `1080p` deve ser uma opção e não o padrão automático para todas as salas.

## 4. Objetivos e não objetivos

### Objetivos

- Melhorar a legibilidade de texto, código, navegador e documentos.
- Oferecer maior fluidez para vídeos e jogos quando a máquina e a rede suportarem.
- Impedir que um espectador com rede ruim reduza a qualidade dos demais.
- Manter a voz compreensível quando o upload estiver congestionado.
- Permitir diagnóstico local de resolução, FPS, bitrate, RTT, perda e codec.
- Preservar proporção, áudio opcional, duas transmissões possíveis e apenas uma transmissão assistida por usuário.
- Continuar sem banco, SFU ou custo obrigatório de mídia.

### Não objetivos desta entrega

- Migrar a mídia para Render, SFU, LiveKit, mediasoup ou Janus.
- Adicionar TURN gratuito ou pago.
- Aumentar o limite de participantes ou de transmissores.
- Permitir assistir duas telas ao mesmo tempo.
- Gravar, retransmitir publicamente ou armazenar conteúdo.
- Isolar perfeitamente o áudio de um único aplicativo no Windows; o loopback atual pode capturar a saída geral do sistema.
- Garantir `1080p/60` em qualquer hardware ou rede.

## 5. Perfis de qualidade propostos

Os nomes apresentados ao usuário devem explicar a intenção, enquanto os detalhes técnicos ficam em texto auxiliar.

| Perfil | Teto de saída | FPS | Bitrate inicial máximo | `contentHint` | Degradação preferida | Uso recomendado |
|---|---:|---:|---:|---|---|---|
| Econômico | 854×480 | 30 | 1,0–1,2 Mbps | `detail` | `balanced` | conexão limitada |
| Equilibrado | 1280×720 | 30 | 2,5 Mbps | `detail` | `maintain-resolution` | padrão geral |
| Nitidez | 1920×1080 | 30 | 5 Mbps | `detail` | `maintain-resolution` | texto, código e trabalho |
| Fluido | 1280×720 | 60 | 5 Mbps | `motion` | `maintain-framerate` | vídeo, animação e jogos |

Regras:

- `Equilibrado` permanece como padrão e substitui apenas o rótulo técnico de 720p.
- A preferência escolhida continua salva localmente.
- A captura permanece na proporção nativa; o teto é aplicado no encoder de cada conexão.
- O perfil selecionado define o máximo desejado. A adaptação pode reduzir temporariamente, mas nunca superar esse máximo sem escolha do usuário.
- `contentHint` pertence à track compartilhada e, portanto, é global para aquela captura. Ele não pode variar por espectador sem criar tracks diferentes, o que não é recomendado aqui.
- Se uma captura começou limitada a 30 FPS, mudar para 60 FPS pode exigir `track.applyConstraints()` ou reinício da captura caso o runtime não consiga elevar o FPS. Mudanças de resolução e bitrate dentro do mesmo teto de captura não devem recriar o `MediaStream`.

## 6. Desenho técnico recomendado

### 6.1 Separar configuração e decisões de qualidade

Criar um módulo puro, por exemplo `client/src/renderer/screen-quality.js`, contendo:

- catálogo e validação dos perfis;
- migração das preferências antigas `480p`/`720p` para os novos identificadores;
- cálculo de `scaleResolutionDownBy` preservando proporção;
- classificação das amostras de rede;
- máquina de estados de adaptação;
- funções de cálculo de bitrate e perda;
- política de preferência de codec.

Isso permite testes automatizados sem iniciar Electron ou WebRTC real.

### 6.2 Aplicação do perfil por espectador

Manter uma única captura e configurar cada sender de vídeo separadamente:

```text
screenStream
  ├─ sender para João  → 1080p / 5 Mbps
  ├─ sender para Pedro → 720p / 2,5 Mbps
  └─ sender para Ana   → 480p / 1 Mbps
```

Para cada `RTCRtpSender` de tela:

1. ler dimensões reais com `track.getSettings()`;
2. calcular a escala necessária para caber no perfil efetivo;
3. ajustar `maxBitrate`, `maxFramerate` e `scaleResolutionDownBy`;
4. aplicar `degradationPreference` adequada;
5. registrar somente erro técnico quando `setParameters()` falhar;
6. manter a transmissão usando um fallback seguro em vez de interrompê-la.

Não recriar o stream para alternar entre 1080p, 720p e 480p. Uma exceção possível é a subida de uma captura iniciada em 30 FPS para um perfil de 60 FPS.

### 6.3 Política de codec

Implementar a preferência antes de criar a oferta da track de tela:

1. consultar `RTCRtpSender.getCapabilities("video")`;
2. localizar a transceiver associada ao sender de tela;
3. preferir VP9 quando disponível;
4. manter VP8 como fallback obrigatório;
5. preservar codecs auxiliares de retransmissão necessários pela negociação;
6. se `setCodecPreferences()` não existir ou falhar, continuar com a ordem padrão do Chromium;
7. registrar no painel o codec efetivamente negociado, não apenas o solicitado.

AV1 deve permanecer experimental até existir evidência de ganho no hardware real do grupo. Ele pode reduzir bitrate, mas também elevar muito o uso de CPU quando não houver encoder por hardware.

### 6.4 Coleta de estatísticas

Coletar uma amostra a cada 2 segundos somente enquanto houver compartilhamento e espectador inscrito.

| Métrica | Origem preferida | Uso |
|---|---|---|
| Bitrate real | diferença de `bytesSent` e `timestamp` em `outbound-rtp` | confirmar vazão enviada |
| Resolução/FPS | `frameWidth`, `frameHeight`, `framesPerSecond` | confirmar perfil efetivo |
| Limitação | `qualityLimitationReason` | distinguir banda, CPU e outros fatores |
| RTT | `remote-inbound-rtp.roundTripTime`; fallback no candidate pair selecionado | medir retorno daquele peer |
| Perda | relatório `remote-inbound-rtp`, quando disponível | detectar degradação no receptor |
| NACK/PLI | deltas de `nackCount` e `pliCount` | detectar recuperação e pedidos de quadro-chave |
| Codec | relação `codecId` → `codec.mimeType` | mostrar o codec efetivo |
| Encoder | `encoderImplementation`, quando exposto | diagnóstico de software/hardware |

O código deve tolerar métricas ausentes, pois a disponibilidade varia entre versões do Chromium. Não utilizar um valor ausente como zero.

### 6.5 Adaptação automática com histerese

Cada espectador terá estado independente:

```text
perfilDesejado   = limite escolhido pelo apresentador
perfilEfetivo    = nível atual daquele espectador
amostrasRuins    = contador consecutivo
amostrasBoas     = contador consecutivo
ultimaMudanca    = evita oscilações
amostraAnterior  = usada para calcular deltas
```

Escadas sugeridas:

```text
Nitidez: 1080p/30 → 720p/30 → 480p/30
Fluido:  720p/60  → 720p/30 → 480p/30
Equilibrado:       720p/30 → 480p/30
Econômico:                     480p/30
```

Uma amostra pode ser classificada como ruim quando houver pelo menos um sinal confiável:

- perda igual ou superior a 5%;
- RTT igual ou superior a 350 ms;
- `qualityLimitationReason = "bandwidth"` de forma persistente;
- FPS real abaixo de 70% do alvo junto com limitação de banda ou CPU;
- crescimento contínuo de NACK/PLI e queda de bitrate.

Uma amostra pode ser considerada boa quando:

- perda abaixo de 2%;
- RTT abaixo de 180 ms;
- não há limitação por banda/CPU;
- FPS e resolução estão próximos do perfil efetivo quando existe movimento suficiente para medi-los.

Regras iniciais de histerese:

- reduzir após 3 amostras ruins consecutivas, aproximadamente 6 segundos;
- aumentar após 10 amostras boas consecutivas, aproximadamente 20 segundos;
- aguardar pelo menos 15 segundos após cada mudança;
- reiniciar contadores quando a amostra for inconclusiva;
- nunca aumentar acima do perfil escolhido pelo usuário;
- permitir no máximo uma mudança por ciclo.

Os limiares são valores iniciais e devem ser calibrados com testes reais. Bitrate baixo, sozinho, não significa rede ruim: uma tela estática naturalmente utiliza poucos bits.

### 6.6 Proteção da voz

A voz deve permanecer prioritária. O mecanismo principal será reduzir a tela antes que a conexão fique saturada:

- reservar margem de aproximadamente 15% a 20% do upload estimado;
- não usar todo o `availableOutgoingBitrate` como teto da tela;
- reduzir imediatamente um nível se áudio e vídeo apresentarem perda simultânea;
- aplicar `priority`/`networkPriority` somente com detecção de suporte, sem depender dessas propriedades não uniformes;
- nunca aumentar bitrate de tela durante uma condição de áudio instável.

Essa proteção precisa ser validada ouvindo chamadas reais; métricas isoladas não substituem o teste auditivo.

### 6.7 Painel de diagnóstico local

Adicionar um painel avançado opcional, fechado por padrão, com uma linha por espectador:

- perfil escolhido e perfil efetivo;
- resolução e FPS reais;
- bitrate;
- RTT e perda;
- codec e encoder;
- `qualityLimitationReason`;
- contadores NACK/PLI;
- motivo e horário da última adaptação.

O painel não deve enviar analytics nem conteúdo ao servidor. Ele existe para teste e suporte local.

## 7. Etapas de implementação

### Fase 0 — linha de base e documentação

Estimativa: 0,5 a 1 dia.

- [ ] Medir 720p/30 atual em 1, 2 e 4 espectadores.
- [ ] Registrar resolução, FPS, bitrate, RTT, perda, CPU, GPU e upload.
- [ ] Testar uma tela estática e um vídeo com movimento.
- [x] Documentar que o ADR antigo de compartilhamento único está obsoleto.
- [ ] Definir duas máquinas de referência e duas topologias de rede.

Gate de saída: uma tabela de baseline reproduzível, sem alterar o comportamento atual.

### Fase 1 — perfis e aplicação segura

Estimativa: 1 a 2 dias.

- [x] Extrair os perfis para `screen-quality.js`.
- [x] Migrar preferências salvas de `480p`/`720p`.
- [x] Adicionar Econômico, Equilibrado, Nitidez e Fluido ao seletor.
- [x] Aplicar resolução, bitrate, FPS, `contentHint` e degradação correspondentes.
- [x] Tratar a passagem 30 → 60 FPS com `applyConstraints()` ou orientação para reiniciar a transmissão.
- [x] Remover o fallback totalmente silencioso de `setParameters()`.
- [x] Manter Equilibrado como padrão.

Gate de saída: todos os perfis iniciam e encerram sem tela preta, renegociação presa ou alteração de proporção.

### Fase 2 — diagnóstico por espectador

Estimativa: 1,5 a 2,5 dias.

- [x] Criar coletor de stats específico de tela.
- [x] Correlacionar outbound RTP, remote inbound RTP, candidate pair e codec.
- [x] Calcular deltas sem acumular timers ou objetos antigos.
- [x] Criar painel local opcional.
- [x] Encerrar coleta ao parar tela, remover viewer, sair da sala ou fechar peer.

Gate de saída: painel confere com o Gerenciador de Tarefas e não cresce em memória durante 30 minutos.

### Fase 3 — preferência de codec

Estimativa: 1 a 2 dias.

- [x] Implementar detecção de capacidades.
- [x] Preferir VP9 para tela, com VP8 como fallback.
- [x] Confirmar o codec efetivo via stats.
- [ ] Comparar qualidade, CPU e bitrate com o baseline.
- [ ] Desabilitar preferência automaticamente se causar incompatibilidade.

Gate de saída: dois clientes empacotados negociam vídeo com sucesso e o fallback VP8 é comprovado.

### Fase 4 — adaptação individual

Estimativa: 3 a 5 dias.

- [x] Implementar controlador por sender/espectador.
- [x] Implementar classificação boa/ruim/inconclusiva.
- [x] Aplicar contadores, cooldown e escadas de qualidade.
- [x] Preservar o perfil desejado como teto.
- [x] Proteger áudio reservando margem de banda para a tela.
- [x] Exibir no diagnóstico o motivo de cada mudança.
- [x] Garantir que um peer ruim não modifique os senders dos demais.

Gate de saída: degradar artificialmente a rede de um espectador reduz apenas aquele sender e a qualidade retorna sem efeito sanfona.

### Fase 5 — validação e release

Estimativa: 2 a 3 dias.

- [x] Executar os checks sintáticos e testes automatizados (`npm run check` e `npm test`).
- [ ] Executar a matriz manual em computadores/redes reais.
- [ ] Validar duas transmissões ativas com usuários assistindo apenas uma por vez.
- [ ] Executar chamada de 30 minutos com tela e áudio.
- [ ] Confirmar ausência de vazamentos de tracks, timers, peers e elementos de mídia.
- [x] Atualizar README e ADR.
- [ ] Gerar instalador apenas após aprovação dos gates.
- [ ] Guardar checksum e notas da versão.

Gate de saída: critérios de aceite aprovados e zero defeito crítico/alto aberto.

## 8. Arquivos previstos

| Arquivo | Alteração prevista |
|---|---|
| `client/src/renderer/screen-quality.js` | novo módulo de perfis, stats e adaptação pura |
| `client/src/renderer/webrtc.js` | aplicação por sender, codec, coleta e ciclo de vida |
| `client/src/renderer/app.js` | preferência local, ligação com o painel e estados visuais |
| `client/src/renderer/index.html` | nomes dos perfis e painel avançado opcional |
| `client/src/renderer/styles.css` | layout compacto do diagnóstico |
| `tests/screen-quality.test.js` | perfis, escala, deltas, histerese e migração |
| `tests/webrtc-screen.test.js` | mocks de sender, stats, falha e fallback |
| `README.md` | requisitos, consumo de banda e solução de problemas |
| `docs/adr/ADR-004-compartilhamento-unico.md` | marcar como substituído e registrar a decisão atual |
| `docs/adr/ADR-005-qualidade-adaptativa-p2p.md` | nova decisão, limites e trade-offs |

O servidor de sinalização e o deploy do Render não precisam mudar para implementar qualidade adaptativa local.

## 9. Estratégia de testes

### Automatizados

- Catálogo aceita somente perfis conhecidos e aplica Equilibrado como fallback.
- Migração transforma `480p` em Econômico e `720p` em Equilibrado.
- Escala preserva proporção em 16:9, 16:10, 4:3 e ultrawide.
- Cálculo de bitrate usa deltas e ignora timestamp inválido.
- Métrica ausente gera estado inconclusivo, não qualidade boa.
- Três amostras ruins reduzem exatamente um nível.
- Menos de dez boas não aumentam o nível.
- Cooldown impede oscilações.
- Perfil efetivo nunca supera o escolhido.
- Falha de `setParameters()` mantém a transmissão e registra fallback.
- Remover viewer cancela sampler e controlador correspondentes.

### Matriz manual mínima

| Cenário | Variações |
|---|---|
| Conteúdo | código/texto, navegador e vídeo 60 FPS |
| Fonte | janela, monitor 1080p, monitor 1440p/ultrawide |
| Perfil | Econômico, Equilibrado, Nitidez e Fluido |
| Rede | mesma LAN, Wi-Fi diferente, Wi-Fi ↔ 4G/5G |
| Espectadores | 1, 2 e 4 |
| Concorrência | uma e duas pessoas transmitindo |
| Áudio | sem áudio de tela, com áudio de tela e chamada de voz simultânea |
| Falha | perda/latência artificial, desconexão, stop pelo Windows e ICE restart |
| Hardware | máquina mais forte e máquina mais fraca disponível |

## 10. Critérios de aceite

- Equilibrado continua sendo o padrão após instalação ou migração.
- Nitidez entrega até 1920×1080/30 quando fonte, hardware e rede permitem.
- Fluido entrega pelo menos 50 FPS sustentados em cenário adequado; se não conseguir, reduz de forma explícita e estável.
- A proporção original nunca é cortada ou deformada.
- Um espectador degradado não reduz a qualidade de outro espectador saudável.
- A adaptação reduz em aproximadamente 6 segundos de condição ruim persistente.
- A adaptação só aumenta após pelo menos 20 segundos de estabilidade e respeita cooldown.
- A voz permanece compreensível durante saturação; a tela reduz antes de a chamada ficar inutilizável.
- Trocas entre níveis de resolução/bitrate não recriam o stream nem causam tela preta.
- A transição para 60 FPS possui fallback claro quando exige nova captura.
- Codec indisponível ou `setParameters()` rejeitado não encerra a transmissão.
- Parar de assistir remove sender, stats, timers, áudio e vídeo daquele viewer.
- Parar a transmissão ou fechar a fonte limpa todos os recursos.
- Duas pessoas ainda podem transmitir e cada usuário continua assistindo somente uma.
- O painel de diagnóstico permanece local e não envia mídia ou métricas ao Render.
- Sessão contínua de 30 minutos não apresenta crescimento progressivo evidente de memória ou CPU.

## 11. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---:|---|
| 1080p multiplica upload por viewer | Alto | manter 720p padrão, mostrar custo e adaptar individualmente |
| VP9 elevar CPU em máquina fraca | Alto | comparar com baseline, fallback VP8 e reduzir perfil por limitação de CPU |
| AV1 sem aceleração | Alto | manter experimental e fora da primeira entrega |
| Stats ausentes ou diferentes no Chromium | Médio | feature detection e estado inconclusivo |
| Controlador disputar com congestion control nativo | Alto | alterar apenas tetos, usar histerese e evitar ajustes contínuos |
| Efeito sanfona | Médio | 3 ruins, 10 boas e cooldown de 15 s |
| 60 FPS não surgir de captura iniciada em 30 FPS | Médio | solicitar FPS correto ao iniciar ou usar `applyConstraints()` com fallback |
| Áudio da tela causar eco | Alto | manter opção desmarcada por padrão e aviso existente |
| P2P falhar por NAT/CGNAT | Alto | erro/reconexão atuais; avaliar TURN separadamente se necessário |
| Documentação contradizer o código | Médio | substituir ADR antigo e atualizar README no release |

## 12. Definition of Done

Uma fase só estará concluída quando:

- código e tratamento de fallback estiverem completos;
- testes automatizados relevantes passarem;
- comportamento estiver validado em pelo menos dois computadores Windows;
- métricas antes/depois estiverem registradas;
- tracks, timers, stats e peers forem limpos corretamente;
- nenhuma regressão conhecida afetar voz, inscrição ou tela cheia;
- documentação e ADRs refletirem o comportamento entregue;
- zero defeito crítico ou alto permanecer aberto.

## 13. Ordem final recomendada

```text
baseline
  → perfis
  → diagnóstico
  → codec
  → adaptação por espectador
  → proteção da voz
  → testes reais
  → instalador
```

O maior ganho imediato virá de **Nitidez 1080p/30 opcional**, mas a melhoria mais importante para estabilidade será o **diagnóstico seguido da adaptação individual**. Implementar adaptação antes de medir stats tornaria os problemas difíceis de explicar e calibrar.
