# Planejamento de Implementação — VoiceRoom MVP (arquitetura anterior)

> **Aviso:** este documento descreve o MVP originalmente baseado em signaling hospedado. A execução atual da migração VPN local está em [docs/PLANO_MIGRACAO_VPN_LOCAL.md](docs/PLANO_MIGRACAO_VPN_LOCAL.md); itens deste arquivo que mencionam Render, WSS obrigatório, códigos de sala ou atualização manual são históricos e não devem orientar o modo local.

> Documento derivado do PRD fornecido em 21/08/2026.  
> Status: em execução — fundação `0.1.0` implementada; Gate 0 de rede externa ainda pendente.  
> Base de estimativa: 1 pessoa desenvolvedora em tempo integral, com acesso a pelo menos 2 computadores Windows para validação.

### Status desta execução

Já executado no workspace: estrutura cliente/servidor/shared, salas efêmeras, validação, rate limiting inicial, health/readiness, shell Electron endurecido, interface de entrada/sala, base de áudio/tela WebRTC, testes unitários e de integração, smoke test local, build `release/win-unpacked/VoiceRoom.exe` e instalador `release/VoiceRoom Setup 0.1.0.exe`.

Ainda bloqueia a conclusão do Gate 0: validação em 20 tentativas entre redes reais, escolha de hospedagem WSS gratuita e teste de mídia em dois computadores. O instalador NSIS local já foi gerado; assinatura e teste em Windows limpo continuam pendentes.

## 1. Resultado esperado

Entregar um aplicativo desktop para Windows que permita a grupos de até 5 pessoas:

1. escolher um apelido temporário;
2. criar uma sala efêmera ou entrar nela por um código de 6 caracteres;
3. conversar por voz em uma topologia WebRTC Mesh;
4. mutar o próprio microfone e selecionar o dispositivo de entrada;
5. compartilhar uma janela ou monitor, com apenas um compartilhamento ativo por sala;
6. sair, desconectar e reconectar sem deixar o aplicativo em estado inconsistente.

O produto não terá cadastro, banco de dados, câmera, chat, gravação, atualização automática, TURN ou SFU no MVP. O servidor Node.js + Socket.IO será apenas o plano de controle; áudio e vídeo da tela trafegarão diretamente entre os participantes sempre que a rede permitir.

## 2. Premissas, limites e decisões adotadas

### 2.1 Premissas de planejamento

- Equipe-base: 1 pessoa desenvolvedora; revisão e testes podem ser feitos por outra pessoa quando disponível.
- Cadência: ciclos semanais, com uma demonstração executável ao final de cada marco.
- Plataforma-alvo inicial: Windows 10/11, x64. ARM64 fica fora do primeiro pacote até validação de demanda.
- Interface: HTML, CSS e JavaScript modular, sem React no MVP.
- Aplicativo: Electron; backend: Node.js + Socket.IO; mídia: WebRTC.
- Estado do servidor: memória do processo, sem persistência e sem múltiplas instâncias.
- Tela: vídeo em até 1280×720 e 30 FPS; áudio do sistema não faz parte do MVP.
- Código de sala: 6 caracteres gerados com fonte criptograficamente segura e alfabeto sem `0`, `O`, `1`, `I` e `L`.
- Reconexão: desconexões inesperadas terão tolerância sugerida de 30 segundos; uma saída explícita remove o participante imediatamente.
- Identidade: `participantId` e token de retomada serão aleatórios, efêmeros e separados do `socketId`, que muda a cada conexão.
- Compatibilidade: cliente e servidor enviarão uma versão de protocolo; versões incompatíveis serão recusadas com mensagem acionável.
- Distribuição: instalador NSIS gerado com `electron-builder`; novas versões serão instaladas manualmente.
- Versionamento sugerido: entregas internas `0.1.0` a `0.4.0` e primeira versão estável `1.0.0`.

### 2.2 Restrições que moldam o MVP

- O limite oficial é de 5 participantes por sala devido ao crescimento quadrático das conexões Mesh.
- Sem TURN, algumas combinações de NAT, CGNAT ou firewall não conectarão. O produto deve detectar a falha e explicá-la; não deve prometer funcionamento em todas as redes.
- A meta de R$ 0/mês depende da disponibilidade e das regras do serviço gratuito escolhido para sinalização e do STUN público. Isso precisa ser validado antes do desenvolvimento completo.
- Um instalador sem assinatura de código pode acionar o Windows SmartScreen. A assinatura paga não será requisito do MVP, mas o comportamento deve ser documentado.
- Reiniciar ou publicar uma nova versão do servidor encerra as salas, pois todo o estado é efêmero.

### 2.3 Resolução de ambiguidades do PRD

| Tema | Decisão usada neste plano |
|---|---|
| Primeiro MVP: `0.1.0` ou `1.0.0` | `0.x` representa incrementos; `1.0.0` é o MVP estável aprovado. |
| Seleção de microfone | Obrigatória no MVP, pois aparece no escopo funcional principal. |
| Tela cheia | Incluída como melhoria da visualização, mas não bloqueia o go-live se os demais critérios P0 forem atendidos. |
| Indicador de fala | Planejado para `0.4.0`; será calculado localmente e não enviará áudio ao servidor. |
| Áudio do sistema durante a tela | Fora do MVP; apenas o vídeo da janela/monitor será transmitido. |
| Queda do último participante | A sala permanece durante a tolerância de reconexão; após o prazo, é removida. |

## 3. Escopo priorizado

### P0 — obrigatório para o go-live

- Janela Electron segura, inicialização e encerramento corretos.
- Escolha e validação do apelido.
- Criar, copiar, entrar e sair de uma sala.
- Códigos de sala, limite de 5 pessoas e destruição de sala vazia.
- Lista de participantes atualizada em tempo real.
- Captura e seleção de microfone.
- Voz WebRTC para 2 a 5 participantes.
- Mute/desmute local e estado visual remoto.
- Compartilhamento de monitor/janela em 720p/30 FPS.
- Exclusividade atômica de um compartilhamento por sala.
- Parada da tela pelo aplicativo ou pelo controle do Windows.
- Limpeza ao sair e reconexão com renegociação completa.
- Erros amigáveis para permissão, sala, capacidade, tela ocupada e falha P2P.
- Validação, autorização por sala, limites de payload e rate limiting no servidor.
- Instalador, desinstalação, documentação e matriz de testes aprovada.

### P1 — desejável, sem bloquear a primeira publicação

- Indicador de participante falando.
- Visualização local em tela cheia.
- Persistência local do último apelido e microfone escolhido.
- Diagnóstico técnico local de ICE, RTT, jitter e perda de pacotes, sem telemetria externa.
- Teste de retorno local do microfone em tempo real, sem enviar o áudio à sala.

### Fora do MVP

- Webcam, mensagens, arquivos, contas, senha, amigos, comunidades, canais e histórico.
- Gravação, streaming público, bots, integrações com jogos e aplicativos mobile/web.
- Push-to-talk, volume individual, seleção de saída, redução de ruído e 1080p.
- TURN, SFU, múltiplos compartilhamentos, banco de dados e múltiplas instâncias do backend.
- Atualização automática e assinatura paga do executável.

Qualquer item fora desta lista precisa passar por controle de escopo antes de entrar em um ciclo.

## 4. Arquitetura proposta

```text
VoiceRoom (Electron)
  ├─ main: janela, permissões, ciclo de vida e IPC
  ├─ preload: API mínima e segura via contextBridge
  └─ renderer
      ├─ UI/estado da sala
      ├─ MediaManager: microfone e dispositivos
      ├─ PeerManager: uma RTCPeerConnection por participante
      ├─ ScreenShareController: captura, track e encerramento
      └─ SocketClient: salas, presença e signaling
                │
                │ HTTPS/WSS + Socket.IO
                ▼
Servidor de sinalização (Node.js)
  ├─ RoomStore em memória
  ├─ validação e rate limiting
  ├─ autorização de remetente/destinatário por sala
  ├─ retransmissão de SDP/ICE
  └─ lock de compartilhamento

Após a negociação, áudio e tela seguem diretamente entre os peers via WebRTC.
```

### 4.1 Estrutura sugerida

```text
voiceroom/
├── client/
│   ├── src/
│   │   ├── main/
│   │   ├── preload/
│   │   └── renderer/
│   │       ├── ui/
│   │       ├── state/
│   │       ├── media/
│   │       └── socket/
│   └── package.json
├── server/
│   ├── src/
│   │   ├── server.js
│   │   ├── rooms.js
│   │   ├── signaling.js
│   │   ├── validation.js
│   │   └── rate-limit.js
│   └── package.json
├── shared/
│   ├── events.js
│   ├── errors.js
│   └── config-schema.js
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   └── adr/
├── package.json
└── README.md
```

### 4.2 Regras técnicas essenciais

- O servidor deriva a identidade do socket; nunca confia em um `senderId` fornecido pelo cliente.
- O `socketId` é somente um detalhe de transporte; identidade e reconexão usam credenciais efêmeras próprias.
- SDP e ICE só podem ser encaminhados a um participante da mesma sala.
- O novo participante inicia a oferta para cada peer existente. Toda negociação fica centralizada no `PeerManager`, evitando ofertas simultâneas.
- ICE recebido antes de `remoteDescription` fica em fila e é aplicado depois.
- A track local de áudio é reutilizada entre os peers; troca de microfone usa `RTCRtpSender.replaceTrack()`.
- Mute usa `audioTrack.enabled`; apenas o estado visual é sinalizado ao grupo.
- A tela usa uma transceiver de vídeo ou `replaceTrack()` sempre que o protótipo comprovar compatibilidade, reduzindo renegociações.
- O servidor concede o lock de tela por confirmação atômica. Ao sair, desconectar ou encerrar a track, o lock é liberado.
- Uma reconexão cria novas `RTCPeerConnection`; conexões antigas nunca são reaproveitadas.
- O indicador de fala usa análise local do stream remoto, sem transmitir amostras ou eventos frequentes ao backend.

### 4.3 Contrato mínimo de eventos

| Evento | Direção | Resultado esperado |
|---|---|---|
| `room:create` | cliente → servidor | Confirmação com código, identidade efêmera e estado inicial. |
| `room:join` | cliente → servidor | Confirmação ou erro `ROOM_NOT_FOUND`/`ROOM_FULL`. |
| `room:leave` | cliente → servidor | Remove imediatamente e notifica a sala. |
| `room:state` | servidor → cliente | Fonte autoritativa de participantes, mute e compartilhador. |
| `peer:offer` | cliente ↔ servidor ↔ cliente | SDP validado e roteado a um membro da mesma sala. |
| `peer:answer` | cliente ↔ servidor ↔ cliente | Resposta validada e roteada ao iniciador. |
| `peer:ice` | cliente ↔ servidor ↔ cliente | Candidate validado, limitado e roteado. |
| `participant:muted` | cliente → servidor → sala | Atualiza apenas o estado visual. |
| `screen:start-request` | cliente → servidor | Confirma lock ou retorna `SCREEN_BUSY`. |
| `screen:started` | servidor → sala | Identifica o compartilhador atual. |
| `screen:stop` | cliente → servidor | Libera o lock de forma idempotente. |
| `screen:stopped` | servidor → sala | Remove a visualização e restaura o estado. |

Todos os comandos de negócio devem responder por acknowledgement com `{ ok, data?, errorCode? }`, ter schema e versão de protocolo validados, possuir timeout e ser idempotentes quando aplicável.

## 5. Estratégia de entrega

```text
Gate 0: riscos de rede e hospedagem
        ↓
0.1.0: fundação + salas
        ↓
0.2.0: voz 1:1 → Mesh com 5 pessoas
        ↓
0.3.0: compartilhamento de tela
        ↓
0.4.0: resiliência + UX + segurança
        ↓
1.0.0: empacotamento + validação + publicação
```

### Cronograma de referência

| Marco | Duração estimada | Entrega | Gate de saída |
|---|---:|---|---|
| Gate 0 — spikes e decisões | 2–3 dias | Provas de áudio/tela em Electron, rede externa, hospedagem gratuita e empacotamento | Áudio funciona em LAN e em ao menos um teste Wi-Fi ↔ 4G/5G; captura de tela validada; endpoint WSS viável e gratuito selecionado. |
| Fundação — `0.1.0` | 4–5 dias | Repositório, configuração, Electron seguro, UI inicial, servidor e salas | Dois clientes criam/entram/saem; limites e limpeza passam em integração; app abre em menos de 5 s na máquina de referência. |
| Voz 1:1 — `0.2.0-alpha` | 4–5 dias | Permissão, dispositivos, offer/answer/ICE, áudio remoto e mute | Dois PCs conversam; negar/remover microfone não derruba o app. |
| Voz Mesh — `0.2.0` | 4–5 dias | 3–5 participantes, presença, estados e limpeza de peers | Cinco participantes conectam sem peers duplicados; entrada/saída atualiza todos. |
| Tela — `0.3.0` | 4–5 dias | Seleção de fonte, stream 720p/30, lock único e encerramento | Um único compartilhador; todos visualizam; cancelar ou desconectar libera o estado corretamente. |
| Experiência — `0.4.0` | 5–6 dias | Reconexão, mensagens, indicadores, rate limit, logs e endurecimento | Cenários de queda, abuso e falhas do PRD passam sem crash ou estado órfão. |
| Release — `1.0.0` | 4–5 dias | Instalador, documentação, testes finais e artefatos | Checklist P0 aprovada em Windows limpo e em redes distintas; zero defeito crítico/alto aberto. |

Estimativa total: **27–34 dias úteis de execução**, mais **20% de reserva** para problemas de WebRTC, Electron e rede. Para uma pessoa, o compromisso realista é de aproximadamente **7–8 semanas**. A estimativa deve ser recalculada após o Gate 0.

## 6. Backlog por marco

### Gate 0 — reduzir riscos antes da construção

- [ ] Confirmar versões mínimas de Windows e arquitetura x64.
- [ ] Criar spike Electron com microfone e compartilhamento de janela/monitor.
- [ ] Conectar dois clientes por WebRTC em LAN.
- [ ] Executar ao menos 20 tentativas entre LAN, ISP ↔ ISP e Wi-Fi ↔ 4G/5G sem TURN.
- [ ] Registrar tipos de ICE, tempo de conexão e causa de falha.
- [ ] Validar uma hospedagem gratuita com HTTPS/WSS, WebSocket persistente, limites e política de inatividade aceitáveis.
- [x] Escolher e documentar servidores STUN configuráveis.
- [x] Gerar um instalador NSIS de prova.
- [ ] Observar o comportamento do SmartScreen em Windows limpo.
- [x] Registrar ADRs e atualizar estimativas.

### `0.1.0` — fundação, interface e salas

- [x] Inicializar Git, workspace de cliente/servidor, scripts e lockfile.
- [x] Centralizar `SIGNALING_SERVER`, `MAX_USERS_PER_ROOM`, `ROOM_CODE_LENGTH`, alfabeto e `STUN_SERVERS`.
- [x] Criar `BrowserWindow` com `contextIsolation`, sandbox e `nodeIntegration` desativado.
- [x] Implementar preload com uma API mínima e canais IPC permitidos explicitamente.
- [x] Bloquear navegação, pop-ups e permissões não esperadas; aplicar CSP.
- [x] Construir telas inicial e de sala com estados de carregamento e erro.
- [x] Implementar geração de código com tratamento de colisão.
- [x] Implementar `RoomStore`, criação, entrada, saída, limite de 5 e remoção da sala vazia.
- [x] Validar nome de 1–30 caracteres, código, payload e associação do socket à sala.
- [x] Implementar rate limiting inicial e endpoint de saúde.
- [ ] Definir limites globais de sockets/salas, heartbeat, TTL de estado e tamanho máximo de SDP/ICE.
- [x] Cobrir regras de sala com testes unitários e múltiplos sockets com testes de integração.

### `0.2.0-alpha` — voz entre duas pessoas

- [x] Pedir permissão do microfone com estado de progresso e erro claro.
- [x] Enumerar dispositivos e permitir selecionar a entrada.
- [x] Implementar `MediaManager` e troca de track sem reconstruir a sala.
- [x] Implementar o fluxo offer/answer/ICE e a fila de candidates antecipados.
- [x] Reproduzir áudio remoto sem duplicação.
- [x] Implementar mute por `track.enabled` e sincronizar seu indicador.
- [x] Tratar permissão negada, ausência e remoção do microfone.
- [x] Implementar teste de retorno local do microfone com medidor de nível e encerramento manual.
- [ ] Validar em dois computadores na mesma rede e em redes diferentes.

### `0.2.0` — Mesh, participantes e presença

- [ ] Manter uma `RTCPeerConnection` por participante remoto.
- [ ] Garantir regra única de offerer e impedir negociação duplicada.
- [ ] Atualizar lista e estados ao entrar, sair ou desconectar.
- [ ] Fechar peer, tracks, elementos de áudio e listeners ao remover participante.
- [ ] Validar 3 e 5 participantes reais.
- [ ] Medir RTT, jitter, perda, CPU, RAM e upload nas máquinas de referência.
- [ ] Adicionar indicador de fala se o orçamento P1 permitir.

### `0.3.0` — compartilhamento de tela

- [x] Integrar o seletor seguro de monitor/janela do Electron/Windows.
- [x] Aplicar restrições iniciais de 720p/30 FPS e `contentHint = "detail"`.
- [x] Implementar solicitação atômica e idempotente do lock no servidor.
- [x] Publicar/remover a track de tela em todas as conexões.
- [x] Exibir a fonte e o nome do compartilhador nos receptores.
- [x] Tratar cancelamento sem erro e `track.onended` do Windows.
- [x] Liberar lock quando o compartilhador para, sai, cai ou excede a tolerância.
- [ ] Testar a corrida de dois usuários tentando compartilhar simultaneamente.
- [ ] Adicionar tela cheia local se o orçamento P1 permitir.

### `0.4.0` — resiliência, UX e segurança

- [x] Implementar token efêmero de sessão e tolerância de reconexão.
- [x] Refazer room state e todas as conexões após reconectar.
- [ ] Aplicar timeout e mensagens úteis a estados ICE `failed`/`disconnected`.
- [x] Cobrir sala inexistente, sala cheia, tela ocupada e signaling inválido.
- [x] Sanitizar a exibição do apelido com `textContent`, nunca `innerHTML`.
- [x] Impedir signaling entre salas e falsificação de remetente/destinatário.
- [ ] Restringir origins, tamanho de mensagem e frequência por IP/socket/evento.
- [x] Excluir SDP, ICE, nomes, áudio e conteúdo de tela dos logs de produção.
- [ ] Testar internet interrompida, microfone removido, monitor desconectado e saída durante a tela.

### `1.0.0` — estabilização e distribuição

- [ ] Corrigir todos os defeitos críticos e altos; revisar os médios aceitos.
- [ ] Executar a matriz completa de testes em Windows limpo.
- [ ] Gerar `VoiceRoom Setup.exe`, atalho e desinstalador.
- [ ] Confirmar que o aplicativo abre sem console externo e em menos de 5 s.
- [ ] Verificar que o renderer não possui acesso às APIs Node/Electron não permitidas.
- [ ] Documentar instalação, uso, privacidade, limitações de rede e SmartScreen.
- [ ] Publicar checksums e notas da versão.
- [ ] Criar tag `v1.0.0` e arquivar evidências de aceite.

## 7. Estratégia de testes

### 7.1 Camadas

| Camada | Cobertura mínima |
|---|---|
| Unitária | Geração/colisão de código, validação, `RoomStore`, limite de sala, limpeza, lock de tela, tolerância e rate limiter. |
| Integração | 2–5 clientes Socket.IO; criação/entrada/saída; isolamento entre salas; roteamento SDP/ICE; alvo inválido; reconexão; corrida de tela. |
| E2E desktop | Inicialização, permissão, dispositivos, criação/entrada, áudio, mute, tela, saída e mensagens de erro. |
| Segurança | Apelido com HTML/script, payload excessivo, flood, evento forjado, signaling entre salas, navegação externa e tentativa de acesso ao Node no renderer. |
| Empacotamento | Instalação, atalho, abertura sem console, manutenção de preferências permitidas e desinstalação em Windows limpo. |

### 7.2 Matriz manual obrigatória

| Cenário | Resultado esperado |
|---|---|
| 2 PCs na mesma rede | Voz, mute e tela funcionam. |
| 2 PCs em redes diferentes (Wi-Fi ↔ 4G/5G) | Conecta ou, se a rota P2P for impossível, falha de forma diagnosticável e amigável. |
| 3 participantes | Todos ouvem todos; presença e tela atualizam corretamente. |
| 5 participantes | Limite suportado funciona sem peer duplicado ou estado inconsistente. |
| 6º participante | Entrada recusada com `ROOM_FULL`. |
| Compartilhador sai ou perde a conexão | Tela desaparece e lock é liberado após a regra de tolerância. |
| Internet cai e retorna | Cliente reentra e recria conexões ou informa falha sem crash. |
| Microfone é removido/trocado | Estado é atualizado e o usuário pode escolher outra entrada. |
| Monitor compartilhado é desconectado | A track encerra e a sala volta ao estado sem compartilhamento. |
| Usuário cancela o seletor de tela | Nenhuma mensagem de erro e nenhum lock permanece. |
| Dois usuários iniciam tela juntos | Exatamente um recebe o lock; o outro vê `SCREEN_BUSY`. |
| Servidor reinicia | Clientes informam a perda da sala; não exibem participantes fantasmas. |

### 7.3 Beta de campo recomendado

Antes de chamar a versão de `1.0.0`, executar um beta com 10–20 usuários comuns e pelo menos 30 chamadas concluídas, incluindo 10 pares de redes distintas e 5 sessões com cinco participantes e compartilhamento. Registrar apenas resultado, duração, configuração técnica não identificável e causa de falha; não coletar mídia nem identidade pessoal.

### 7.4 Metas e método de validação

- Inicialização: menos de 5 segundos na máquina de referência, medida do início do processo até a tela interativa.
- Entrada em sala: menos de 5 segundos em condições normais, medida do envio de `room:join` ao áudio pronto.
- Latência de áudio: desejável abaixo de 250 ms e aceitável abaixo de 500 ms; registrar método, rede e máquinas usadas.
- Compartilhamento: fonte pedida em 720p/30 FPS e legível para navegador, código e documentos.
- Estabilidade: chamada contínua de 30 minutos sem crash, crescimento progressivo de memória ou perda definitiva de áudio.
- Privacidade: nenhuma mídia ou dado pessoal persiste; logs contêm somente eventos técnicos mínimos.

Indicadores de decisão:

- `peer_connect_success`: conexões WebRTC estabelecidas em até 15 s ÷ tentativas válidas;
- `share_success`: primeiro frame remoto em até 8 s ÷ compartilhamentos aceitos;
- `reconnect_success`: sala e áudio restaurados em até 15 s ÷ quedas de até 10 s;
- meta inicial para o beta: pelo menos 98% na LAN e 90% na amostra entre redes distintas; abaixo disso, manter o produto como beta restrito ou reavaliar TURN;
- lock de tela e limite de 5 participantes: 100% de sucesso nos testes de concorrência.

Não definir limite rígido de CPU/RAM antes do spike. Registrar a linha de base em 2, 3 e 5 participantes e transformar os resultados em orçamento de desempenho. Como hipóteses iniciais a validar no hardware de referência: CPU média abaixo de 50%, RAM abaixo de 700 MB e upload do compartilhador abaixo de 6 Mbps em uma sala com 5 pessoas e tela.

## 8. Segurança e privacidade

Checklist obrigatório antes de `1.0.0`:

- [x] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` e `webSecurity: true`.
- [x] Preload expõe funções específicas; não expõe `ipcRenderer`, `require`, `fs`, `child_process` ou `shell`.
- [x] Canais IPC e seus argumentos são validados também no processo principal.
- [x] CSP aplicada; navegação e criação de janelas externas bloqueadas por padrão.
- [x] Nenhum conteúdo remoto ou `eval`; permissões do Electron seguem allowlist mínima.
- [ ] Signaling usa HTTPS/WSS e origin allowlist apropriada para desenvolvimento/produção.
- [x] Servidor valida nome, código, schemas, tamanho e frequência de todos os eventos.
- [x] Servidor garante que origem e destino pertencem à mesma sala.
- [x] Código de sala é tratado como convite conveniente, não como autenticação forte.
- [x] Logs não registram apelido, código de sala, token, IP, SDP/ICE bruto, conteúdo de mídia ou dados pessoais.
- [x] README explica que os peers podem conhecer endereços de rede usados pelo WebRTC.
- [x] Dependências e lockfile são revisados antes de cada release.

## 9. Observabilidade sem coleta de dados

O MVP deve registrar localmente ou no console do backend somente:

- criação e remoção de sala, sem nomes dos participantes;
- contagem de entrada/saída e motivo técnico;
- transições agregadas de `connectionState`/`iceConnectionState`;
- concessão/liberação do lock de tela;
- código de erro, duração da operação e versão do aplicativo;
- falha de validação/rate limit sem payload completo.

O backend deve oferecer `/healthz` para vida do processo e `/readyz` para capacidade de aceitar conexões. A operação deve manter instruções curtas para indisponibilidade, crescimento anormal de memória, abuso, falha ICE elevada e rollback.

Durante os testes, manter uma ficha manual com versão, Windows, topologia de rede, número de participantes, tempos, ICE selecionado e resultado. Não adicionar analytics externo ao MVP.

## 10. Registro de riscos

| Risco | Prob. | Impacto | Mitigação e gatilho |
|---|---|---:|---|
| P2P falha por NAT/CGNAT/firewall sem TURN | Alta | Alto | Gate 0 em Wi-Fi/4G, timeout e erro claro. Se a taxa de sucesso da amostra for insuficiente, reavaliar TURN ou restringir oficialmente as redes suportadas. |
| Hospedagem gratuita não sustenta WSS ou entra em suspensão | Média | Alto | Provar WebSocket, TLS, cold start, cotas e reinício antes do Marco 0.1. Trocar de opção antes de acoplar a distribuição. |
| Upload/CPU excessivo com 5 pessoas e tela | Média | Alto | Limite 5, 720p/30, medições por marco e redução adaptativa se necessária. |
| Glare, ICE fora de ordem ou peers duplicados | Média | Alto | Regra determinística de offerer, fila de ICE e `PeerManager` único, com testes de concorrência. |
| Lock de tela fica órfão | Média | Médio | Operações atômicas/idempotentes e liberação em stop, leave, disconnect e timeout. |
| Reconexão conflita com destruição de sala | Média | Alto | Token efêmero + tolerância de 30 s; saída explícita continua imediata. |
| Vulnerabilidade no Electron/IPC | Baixa | Alto | Configuração endurecida, API mínima no preload, CSP, navegação bloqueada e teste do renderer. |
| Abuso de sala/signaling público | Média | Médio | Alfabeto amplo, rate limit, limite de payload, validação e autorização por associação à sala. |
| SmartScreen reduz confiança na instalação | Alta | Médio | Aviso transparente, checksum e canal confiável de distribuição; assinatura fica para pós-validação. |
| Free tier ou STUN muda de política | Média | Alto | Configuração externa, sem acoplamento a provedor, e revisão antes de cada release. |
| Escopo cresce antes da validação | Média | Médio | P0/P1 explícitos; itens novos entram no backlog pós-MVP e não no ciclo ativo. |

## 11. Definition of Ready e Definition of Done

### Ready

Uma tarefa só entra em execução quando possui:

- comportamento e usuário beneficiado descritos;
- dependências e eventos envolvidos identificados;
- critérios de aceite observáveis;
- estados de erro e limpeza definidos;
- forma de teste e ambiente necessários definidos.

### Done

Uma tarefa só está concluída quando:

- implementação e tratamento básico de erros estão completos;
- testes automatizados relevantes passam;
- fluxo foi validado em pelo menos dois clientes; mídia exige dois computadores reais;
- interface reflete sucesso, espera, erro e encerramento;
- não há erro crítico conhecido nem recurso/listener/track órfão;
- documentação e configuração foram atualizadas;
- alteração foi revisada e versionada no Git.

## 12. Critérios de go-live

A publicação de `1.0.0` exige simultaneamente:

- [ ] Todos os itens P0 e critérios de aceite do PRD aprovados.
- [ ] Zero defeito crítico ou alto aberto.
- [ ] Testes reais em 2, 3 e 5 participantes concluídos.
- [ ] Ao menos um teste bem-sucedido entre redes distintas e falha sem TURN documentada.
- [ ] Inicialização e entrada em sala dentro das metas nas máquinas de referência.
- [ ] Chamada de 30 minutos sem crash nem vazamento progressivo evidente.
- [ ] Beta de campo executado ou dispensa formal registrada para uma distribuição estritamente privada.
- [ ] Instalação/desinstalação validada em Windows limpo.
- [ ] Endpoint de produção usa WSS, responde ao health check e permanece dentro da meta R$ 0.
- [ ] Configurações de produção não contêm segredos no renderer.
- [ ] README cobre instalação, uso, limitações, privacidade, SmartScreen e solução de problemas.
- [ ] Artefato, checksum, notas e tag `v1.0.0` estão disponíveis.

Plano de rollback: manter o instalador anterior e a versão anterior do servidor prontos para republicação. Como o servidor não persiste salas, qualquer rollback/redeploy interromperá chamadas em andamento e deverá ser feito em janela comunicada.

## 13. Processo de trabalho

- Branches: `main`, `develop`, `feature/*` e `fix/*`, conforme o PRD; manter branches curtas.
- Cada marco termina com build executável, demonstração, revisão da matriz de riscos e atualização da estimativa.
- Commits devem separar mudanças de cliente, signaling e infraestrutura quando possível.
- Dependências devem ser fixadas em lockfile; mudanças de Electron/WebRTC exigem smoke test empacotado.
- Defeitos P0 interrompem novas funcionalidades até correção.
- Decisões irreversíveis ou que alterem custo/privacidade recebem um ADR curto.

## 14. Próximas ações

Ordem recomendada para começar:

1. Aprovar as premissas e decisões da seção 2.
2. Executar o Gate 0, começando pelo teste WebRTC Wi-Fi ↔ 4G/5G.
3. Escolher hospedagem de sinalização gratuita e STUN configurável com base no teste, sem acoplamento ao provedor.
4. Confirmar Windows mínimo, x64 e política para SmartScreen.
5. Criar o repositório e os ADRs de Electron, Mesh, ausência de banco/TURN e reconexão.
6. Implementar `0.1.0` sem iniciar funcionalidades P1.
7. Reestimar o restante usando os resultados reais de rede, captura e empacotamento.

O desenvolvimento completo não deve começar antes de o Gate 0 confirmar que a combinação escolhida consegue entregar o fluxo central dentro das limitações assumidas.
