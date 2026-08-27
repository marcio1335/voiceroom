# Plano de implementação — migração do VoiceRoom para VPN local

## 1. Identificação

- **Fonte:** `voiceroom_prd_migracao_vpn_local.txt`
- **Status:** implementação executada no workspace; homologação física pendente
- **Produto:** VoiceRoom desktop para Windows
- **Objetivo:** substituir o signaling público no Render por um servidor Socket.IO efêmero executado no Electron do HOST, usando uma VPN já instalada como camada de conectividade.
- **Meta operacional:** chamadas de voz e compartilhamento de tela entre até 5 participantes, sem infraestrutura VoiceRoom externa obrigatória e com custo de R$ 0/mês.

### Execução registrada em 26/08/2026

- **Concluído no workspace:** fábrica de signaling reutilizável, módulos compartilhados de sala/validação/rate limiting, servidor local controlável pelo Electron, enumeração/classificação de interfaces IPv4, parser de IP/porta, IPC restrito, endpoint `/health`, cliente Socket.IO com URL em runtime, reconexão com limite de 30 s, UI de criação/entrada por IP, allowlist temporária de destinos HTTP/WebSocket, testes unitários/integração e atualização da documentação.
- **Verificado:** `npm test`, `npm run check`, bundle do renderer, build Electron e instalador NSIS `VoiceRoom Setup 0.1.2.exe`; o `app.asar` contém o signaling local e as dependências `socket.io`/`engine.io`.
- **Pendente para aceite de produção:** teste em dois PCs físicos com a VPN escolhida, validação de firewall do Windows em máquina limpa, confirmação do candidate pair WebRTC pela VPN, teste de mídia com 5 participantes e decisão final sobre fallback STUN.

### Estado das fases após a execução

| Fase | Estado | Evidência ou pendência |
|---|---|---|
| 0 — Baseline e prova de rede | parcial | Radmin VPN foi detectada e o bind/health/connect local passou; falta validar dois PCs e firewall |
| 1 — Fábrica de signaling | concluída | fábrica reutilizável, ciclo de vida, `/health` e testes automatizados |
| 2 — Servidor local no Electron | concluída | IPC, start/stop, encerramento do HOST e dependências no `app.asar` |
| 3 — Rede, parser e IPC seguro | concluída | enumeração VPN, validação IPv4/porta e allowlist de destinos |
| 4 — URL runtime e protocolo | concluída | cliente sem endpoint fixo, sala local `VPN234` e erros normalizados |
| 5 — Criação e entrada | concluída | seleção de IP, entrada por IP/IP:porta, copiar endereço e instruções na UI |
| 6 — WebRTC e reconexão | parcial | reconexão limitada a 30 s implementada; mídia e candidate pair exigem teste físico |
| 7 — Hardening | parcial | testes automatizados e validações concluídos; falta smoke test em máquina limpa |
| 8 — Empacotamento e corte | parcial | build/NSIS concluídos; falta aceite em dois PCs antes de desligar o Render |

## 2. Resultado esperado

Ao final da migração:

1. o HOST escolhe um IPv4 de uma interface VPN e cria uma sala;
2. o processo principal do Electron inicia o signaling local na porta `32145`;
3. o HOST entra na mesma sessão como participante comum;
4. convidados informam `IP` ou `IP:porta`, passam por validação e health check e conectam ao HOST;
5. Socket.IO transporta somente estado e signaling;
6. áudio e tela continuam P2P via WebRTC;
7. o encerramento do HOST fecha o servidor e encerra a sala para todos;
8. o aplicativo instalado funciona sem Render, domínio, backend hospedado ou banco de dados.

## 3. Escopo do MVP

### Incluído

- servidor HTTP + Socket.IO embutido no processo principal do Electron;
- uma sala por instância HOST;
- porta fixa `32145`;
- enumeração de interfaces IPv4, classificação heurística de VPN e seleção manual;
- entrada por IPv4, com porta padrão opcional;
- health check local;
- até 5 participantes;
- reconexão ao mesmo HOST por até 30 segundos;
- voz, mute, perfil, compartilhamento de tela e áudio do sistema existentes;
- validação de eventos e payloads, limites de tamanho e rate limiting;
- mensagens de diagnóstico para IP, VPN, firewall, timeout e conflito de porta;
- build e instalador Electron contendo cliente e servidor local.

### Fora do escopo

- VPN própria, usuários sem VPN, matchmaking ou descoberta automática;
- contas, autenticação central, banco de dados ou persistência da sala;
- senha da sala;
- servidor público alternativo, TURN próprio, SFU ou servidor de mídia;
- migração automática de HOST;
- IPv6;
- porta aleatória;
- suporte oficial acima de 5 participantes.

## 4. Estado atual do repositório

O planejamento considera a implementação existente, não apenas a arquitetura conceitual do PRD.

| Área | Situação atual | Impacto da migração |
|---|---|---|
| Electron main | `client/src/main/main.js` gerencia janela, tray, captura e atualizações | Deve assumir ciclo de vida do servidor local e expor IPC mínimo de rede/sala |
| Preload | API isolada em `client/src/preload/preload.js` | Deve receber métodos validados para listar interfaces, iniciar/parar servidor e consultar estado |
| Cliente Socket.IO | `client/src/renderer/socket.js` conecta no construtor a uma URL fixa | Deve aceitar URL em runtime, conectar somente após escolha de papel/endereço e poder trocar/fechar sessão |
| UI | usa código de sala, convite e deep link | Deve usar IP do HOST, seleção de interface, copiar endereço e distinguir HOST/convidado |
| Backend | `server/src/server.js` cria servidor e estado global ao importar | Deve virar uma fábrica sem efeitos colaterais, controlável pelo Electron |
| Salas | `RoomStore` suporta várias salas com código | Deve ser simplificado para uma sessão única ou encapsulado atrás de um identificador interno não exibido |
| Segurança | já existem validação de nome/avatar/SDP/ICE e rate limiting | Reutilizar e acrescentar validação de endereço, origem, papel do HOST e limites do servidor local |
| Health check | existem `/healthz` e `/readyz` | Padronizar `/health` e manter aliases se úteis aos testes |
| WebRTC | áudio e tela já são P2P; STUN público está configurado | Preservar mídia e tornar a configuração ICE explícita para modo VPN |
| Build | empacota `client`, `shared` e apenas `socket.io-client` | Incluir servidor local, `socket.io` e todos os módulos necessários no `app.asar` |
| Produção | bundle, CSP, README e scripts ainda referenciam Render | Remover essas referências apenas depois do gate de homologação |
| Ciclo da janela | fechar a janela oculta o app no tray | “Encerrar sala” deve parar o servidor; sair completamente também deve fazer cleanup idempotente |

## 5. Decisões e pendências técnicas antes de codificar

### D-01 — VPN de homologação

- **Decisão necessária:** escolher uma VPN principal para aceite do MVP.
- **Recomendação:** homologar primeiro com Radmin VPN, mantendo Tailscale e ZeroTier como testes de compatibilidade quando disponíveis.
- **Motivo:** regras de rota, interface e firewall variam entre produtos; “compatível conceitualmente” não substitui um alvo de aceite reproduzível.

### D-02 — Bind do servidor versus conexão do HOST

O PRD pede simultaneamente:

- bind preferencial somente no IP VPN; e
- HOST conectado por `127.0.0.1:32145`.

Um listener vinculado somente ao IP VPN não atende conexões em `127.0.0.1`.

- **Recomendação para o MVP:** vincular o listener ao IP VPN selecionado e conectar o próprio HOST por esse mesmo IP. A lógica de Socket.IO e WebRTC continua idêntica à do convidado e a porta não fica aberta em outras interfaces.
- **Alternativa:** usar `0.0.0.0` para permitir VPN + loopback, acompanhado de restrição de origem, validação de endereço remoto e instrução de firewall apenas para redes privadas.
- **Gate:** registrar a escolha em ADR antes da fase 2 e alinhar o critério “HOST via localhost” caso a recomendação seja aceita.

### D-03 — Modelo de sessão sem código visível

- **Recomendação:** manter um identificador constante interno, como `local`, durante a primeira refatoração, preservando eventos e testes existentes; remover a noção de código da API pública e UI.
- **Motivo:** reduz risco na migração do signaling e permite simplificar o `RoomStore` em uma segunda etapa sem alterar WebRTC ao mesmo tempo.
- **Regra:** o primeiro participante autorizado após `startLocalServer` é o HOST; os seguintes entram na sessão já existente.

### D-04 — Política ICE

- iniciar testes com `iceServers: []`;
- confirmar via `getStats()` que o par selecionado usa IPs VPN e candidatos `host`/UDP;
- manter STUN público como fallback configurável somente se uma VPN homologada exigir;
- não ativar STUN silenciosamente: o modo efetivo deve aparecer no diagnóstico.

### D-05 — CSP e endereço dinâmico

A CSP atual permite apenas localhost e Render. Um IP VPN arbitrário não pode ficar enumerado no HTML durante o build.

- **Recomendação:** permitir no `connect-src` apenas os esquemas necessários ao Socket.IO local e combinar isso com uma allowlist de destino em runtime, mantida pelo processo principal antes da conexão.
- bloquear qualquer destino diferente do endereço validado da sessão;
- não aceitar URL completa digitada pelo usuário; o parser produz internamente `http://<ipv4>:<porta>`;
- documentar e testar a política no aplicativo empacotado.

### D-06 — Atualizações automáticas

O updater via GitHub pode permanecer porque não participa das salas, mas ainda é uma dependência externa opcional do aplicativo.

- **Decisão necessária:** definir se “sem infraestrutura externa” significa somente operação de chamada ou também ausência de verificação de atualizações.
- **Recomendação:** manter atualizações opcionais e garantir que falhas/offline não bloqueiem criação ou entrada em sala.

## 6. Arquitetura-alvo

```text
Processo principal Electron (HOST)
├── network.js
│   └── enumera, classifica e valida IPv4
├── local-server.js
│   └── inicia/para HTTP + Socket.IO + estado efêmero
├── IPC restrito
│   └── renderer solicita operações, sem acesso direto ao Node
└── lifecycle
    └── encerra servidor ao encerrar sala ou aplicativo

Renderer HOST                     Renderer convidado
├── SocketClient(runtimeUrl)      ├── parser IP/porta + health check
├── entra como HOST               ├── SocketClient(runtimeUrl)
└── WebRTC P2P  <---------------> └── WebRTC P2P
             signaling via Socket.IO no HOST
```

Estrutura de destino sugerida:

```text
client/src/main/
├── main.js
├── local-server.js
└── network.js

client/src/preload/
└── preload.js

client/src/renderer/
├── app.js
├── config.js
├── socket.js
├── webrtc.js
├── index.html
└── styles.css

shared/
├── config.js
├── protocol.js
└── validation.js
```

`server/src` pode permanecer temporariamente como origem compartilhada durante a refatoração, mas não deve continuar sendo um serviço implantável necessário ao produto final.

## 7. Plano de execução

As estimativas abaixo representam esforço de desenvolvimento e teste, não prazo de calendário. Total provável: **14 a 22 dias úteis de uma pessoa**, condicionado à disponibilidade de pelo menos dois PCs físicos para homologação.

### Fase 0 — Baseline, decisões e prova de rede

**Estimativa:** 1–2 dias  
**Dependências:** dois PCs, mesma VPN, acesso ao firewall do Windows.

Tarefas:

- [ ] escolher a VPN principal de homologação;
- [ ] registrar D-02 (bind/localhost), D-04 (ICE), D-05 (CSP) e D-06 (updater);
- [ ] executar testes manuais de ping e TCP na porta `32145` entre dois PCs;
- [ ] criar um spike mínimo de HTTP/Socket.IO no IP VPN selecionado;
- [ ] confirmar comportamento do firewall no executável de desenvolvimento;
- [ ] registrar IP local/remoto, protocolo e rota usada.

**Saída:** decisões aprovadas e evidência de que a VPN escolhida transporta signaling na porta fixa.  
**Gate:** não avançar para a UI antes de comprovar comunicação bidirecional entre máquinas.

### Fase 1 — Extrair o signaling para uma fábrica reutilizável

**Estimativa:** 2–3 dias  
**Dependência:** fase 0.

Tarefas:

- [ ] separar criação, configuração e inicialização hoje concentradas em `server/src/server.js`;
- [ ] implementar fábrica que receba `host`, `port`, limites e callbacks;
- [ ] eliminar efeitos colaterais de `listen()` e estado global durante `require()`;
- [ ] reutilizar `RoomStore`, validações, protocolo e rate limiting existentes;
- [ ] adaptar a sessão única sem remover prematuramente os eventos WebRTC atuais;
- [ ] implementar `/health` com `{ "status": "ok", "app": "VoiceRoom" }` e manter aliases se necessário;
- [ ] garantir encerramento de sockets, timers de reconexão, HTTP server e estado;
- [ ] tornar `stop()` seguro quando chamado mais de uma vez.

Arquivos principais:

- `server/src/server.js` ou novo módulo compartilhado de fábrica;
- `server/src/rooms.js`;
- `server/src/validation.js`;
- `server/src/rate-limit.js`;
- `shared/protocol.js`;
- `shared/config.js`.

**Saída:** signaling pode ser iniciado/parado programaticamente em testes, sem processo externo.  
**Gate:** testes de servidor existentes continuam passando e novos testes comprovam ciclo iniciar → usar → parar → reutilizar porta.

### Fase 2 — Servidor local e ciclo de vida no Electron

**Estimativa:** 2–3 dias  
**Dependência:** fase 1.

Tarefas:

- [ ] criar `client/src/main/local-server.js` com `startLocalServer`, `stopLocalServer` e `getServerStatus`;
- [ ] impedir dois servidores simultâneos na mesma instância;
- [ ] mapear `EADDRINUSE`, `EADDRNOTAVAIL` e falhas de permissão para códigos estáveis de UI;
- [ ] integrar cleanup a “Encerrar sala”, `before-quit` e `will-quit`;
- [ ] manter a sala ativa quando a janela apenas for ocultada no tray;
- [ ] encerrar a sala antes de instalar atualização ou sair completamente;
- [ ] emitir evento de encerramento do HOST antes de fechar sockets, quando possível;
- [ ] adicionar `socket.io` e módulos do servidor às dependências/arquivos empacotados;
- [ ] testar `app.asar`/`win-unpacked`, não apenas execução via Node.

Arquivos principais:

- `client/src/main/local-server.js`;
- `client/src/main/main.js`;
- `package.json`;
- `client/package.json`.

**Saída:** o Electron instalado consegue hospedar a sessão sem `npm run server`.  
**Gate:** criar e encerrar duas salas sequenciais na porta `32145` sem reiniciar o aplicativo.

### Fase 3 — Rede, parser e IPC seguro

**Estimativa:** 1,5–2,5 dias  
**Dependência:** fase 0; pode avançar em paralelo à fase 1.

Tarefas:

- [ ] criar `network.js` usando `os.networkInterfaces()` no processo principal;
- [ ] excluir loopback, interfaces internas e endereços não IPv4;
- [ ] retornar somente campos serializáveis: `name`, `address`, `family`, `internal` e `vpnScore/reason`;
- [ ] pontuar candidatos por nome da interface e faixas conhecidas sem tratar heurística como certeza;
- [ ] destacar Radmin `26/8`, Hamachi `25/8`, Tailscale `100.64/10` e nomes conhecidos;
- [ ] não classificar Ethernet/Wi-Fi privada como VPN automaticamente sem evidência adicional;
- [ ] sempre permitir seleção manual de qualquer IPv4 local válido;
- [ ] implementar parser estrito para `IPv4` e `IPv4:porta`;
- [ ] aceitar espaços externos, rejeitar protocolos, hostname, IPv6, octeto >255 e porta inválida;
- [ ] usar `32145` quando a porta for omitida;
- [ ] expor IPC com schemas/allowlist, sem liberar `ipcRenderer` genérico;
- [ ] reenumerar interfaces a cada tentativa de criar sala.

Arquivos principais:

- `client/src/main/network.js`;
- `client/src/main/main.js`;
- `client/src/preload/preload.js`;
- `shared/config.js`;
- `shared/validation.js`.

**Saída:** renderer recebe lista segura de interfaces e endereço normalizado.  
**Gate:** testes unitários cobrem interfaces múltiplas, VPN não detectada e todas as entradas válidas/inválidas do PRD.

### Fase 4 — URL de signaling em runtime e protocolo de sessão

**Estimativa:** 2–3 dias  
**Dependências:** fases 1–3.

Tarefas:

- [ ] remover conexão automática do construtor de `SocketClient`;
- [ ] aceitar somente endereço normalizado produzido pelo parser;
- [ ] implementar `connect(url)`, timeout, `disconnect()` e recriação segura do socket;
- [ ] executar health check antes do handshake do convidado;
- [ ] criar fluxo HOST: iniciar servidor → health check local → conectar → criar/entrar na sessão;
- [ ] criar fluxo convidado: validar → health check → conectar → entrar;
- [ ] remover a dependência funcional de `SIGNALING_SERVER` no bundle;
- [ ] simplificar/remover `room:create`, `roomCode` e deep links conforme D-03;
- [ ] manter versão de protocolo explícita e erro de incompatibilidade;
- [ ] garantir que convidado não possa assumir papel de HOST;
- [ ] preservar mute, avatar, tela, ofertas, respostas e ICE.

Arquivos principais:

- `client/src/renderer/socket.js`;
- `client/src/renderer/config.js`;
- `client/src/renderer/app.js`;
- `shared/protocol.js`;
- `scripts/bundle-renderer.js`.

**Saída:** duas instâncias conectam usando endereço informado em runtime, sem URL Render incorporada.  
**Gate:** busca no código-fonte e bundle não encontra endpoint de signaling público.

### Fase 5 — Nova experiência de criação e entrada

**Estimativa:** 2–3 dias  
**Dependências:** fases 3–4.

Tarefas:

- [ ] substituir campo de código por “IP do host”;
- [ ] adicionar estado de carregamento para enumeração, health check e conexão;
- [ ] criar seletor de interfaces com nome, IP e indicação “parece VPN”;
- [ ] selecionar automaticamente somente quando houver candidata inequívoca;
- [ ] manter ação “Escolher outro IP” sempre disponível;
- [ ] mostrar “Sala local via VPN”, papel, IP e porta efetivos;
- [ ] implementar “Copiar IP” e opcional “Copiar endereço completo”;
- [ ] diferenciar “Encerrar sala” para HOST e “Sair” para convidado;
- [ ] substituir mensagens de conexão genéricas pelas mensagens previstas no PRD;
- [ ] remover/ocultar código da sala e link de convite baseado em código;
- [ ] manter acessibilidade, navegação por teclado e feedback em `aria-live`;
- [ ] atualizar estilos sem afetar controles de áudio e tela.

Arquivos principais:

- `client/src/renderer/index.html`;
- `client/src/renderer/app.js`;
- `client/src/renderer/styles.css`.

**Saída:** fluxos completos de HOST e convidado operam pela UI.  
**Gate:** teste manual sem DevTools consegue criar, copiar, entrar, sair e encerrar sala.

### Fase 6 — WebRTC, reconexão e diagnóstico

**Estimativa:** 2–3 dias  
**Dependência:** fase 4.

Tarefas:

- [ ] começar com `iceServers: []` no modo VPN;
- [ ] registrar candidatos local/remoto, tipo, protocolo e par selecionado sem expor dados fora do app;
- [ ] exibir diagnóstico técnico sob ação do usuário;
- [ ] confirmar que áudio e tela nunca são retransmitidos pelo Socket.IO;
- [ ] preservar prioridade de voz e perfis 720p/30, 1080p/30 e 720p/60;
- [ ] limitar reconexão ao mesmo IP por `RECONNECT_TIMEOUT = 30000`;
- [ ] após reconectar, recuperar estado e recriar `RTCPeerConnection`s;
- [ ] ao expirar o timeout, limpar mídia/estado e retornar à tela inicial;
- [ ] ao receber encerramento do HOST ou disconnect definitivo, fechar peers e informar o motivo;
- [ ] decidir e testar fallback STUN conforme D-04.

Arquivos principais:

- `client/src/renderer/webrtc.js`;
- `client/src/renderer/socket.js`;
- `client/src/renderer/app.js`;
- `client/src/renderer/config.js`.

**Saída:** mídia funciona pela VPN, com reconexão básica e evidência do candidate pair usado.  
**Gate:** queda e retorno da VPN dentro de 30 segundos recriam a chamada; após o limite, o app volta ao início.

### Fase 7 — Hardening de segurança e erros

**Estimativa:** 1,5–2,5 dias  
**Dependências:** fases 2–6.

Tarefas:

- [ ] aplicar limite de 5 participantes também no servidor local;
- [ ] conservar limites de SDP, ICE, avatar, nome e buffer HTTP;
- [ ] validar todos os eventos conhecidos e ignorar/rejeitar desconhecidos;
- [ ] revisar chaves do rate limiter para o ambiente VPN;
- [ ] restringir origem/destino Socket.IO conforme D-05;
- [ ] confirmar que nenhum conteúdo recebido é executado ou inserido como HTML;
- [ ] não registrar SDP completo, ICE completo, avatar ou nome em logs de produção;
- [ ] criar códigos de erro estáveis para IP inválido, host ausente, timeout, firewall provável, VPN ausente, porta ocupada e sala encerrada;
- [ ] diferenciar erro comprovado de porta/IP de hipóteses de firewall/VPN na mensagem;
- [ ] validar que o listener não fica ativo após encerrar sala;
- [ ] documentar orientação do Firewall do Windows para redes privadas.

**Saída:** superfície local limitada, erros acionáveis e logs sem dados desnecessários.  
**Gate:** revisão de segurança e testes negativos aprovados.

### Fase 8 — Testes reais, empacotamento e corte do Render

**Estimativa:** 3–4 dias  
**Dependências:** todas as fases anteriores.

Tarefas:

- [ ] executar suíte automatizada e verificação sintática;
- [ ] gerar bundle de produção, build desempacotado e instalador NSIS;
- [ ] verificar que `socket.io` server e módulos locais existem no artefato;
- [ ] instalar em dois PCs físicos, preferencialmente em redes físicas diferentes;
- [ ] executar matriz funcional, WebRTC e desempenho da seção 9;
- [ ] validar comportamento com firewall permitido e bloqueado;
- [ ] validar criação repetida e liberação da porta;
- [ ] atualizar README, documentação de uso e troubleshooting;
- [ ] remover URL, variáveis, scripts e instruções do Render;
- [ ] desligar o Render somente após homologação e release recuperável;
- [ ] monitorar a primeira distribuição entre os usuários do grupo.

**Saída:** instalador homologado operando pela VPN, sem serviço VoiceRoom externo.  
**Gate final:** todos os critérios P0 da seção 10 aprovados e nenhuma regressão crítica de voz/tela.

## 8. Ordem recomendada de entregas

| Incremento | Conteúdo demonstrável | Critério de avanço |
|---|---|---|
| I1 — prova técnica | servidor na porta 32145 acessível entre 2 PCs VPN | health check e Socket.IO respondem |
| I2 — núcleo local | Electron inicia/para servidor; build contém dependências | porta é liberada e reutilizável |
| I3 — entrada por IP | interfaces, parser, health check e SocketClient runtime | HOST + 1 convidado entram sem Render |
| I4 — experiência completa | UI HOST/convidado, copiar IP, mensagens e encerramento | fluxo utilizável sem ferramentas técnicas |
| I5 — mídia e resiliência | voz, tela, áudio de tela, reconexão e stats | testes WebRTC aprovados em 2 PCs |
| I6 — release | hardening, 5 participantes, documentação e instalador | checklist P0 completo; Render removível |

## 9. Estratégia de testes

### 9.1 Unitários

- parser de `IP` e `IP:porta`;
- rejeição de hostname, esquema, IPv6 e porta fora do intervalo;
- classificação de interfaces e escolha automática inequívoca;
- normalização de display name, avatar, SDP e ICE;
- estado da sessão única e limite de 5 pessoas;
- transições do ciclo de vida `stopped → starting → running → stopping → stopped`;
- mapeamento de `EADDRINUSE` e outros erros;
- stop idempotente e limpeza de timers.

### 9.2 Integração

- servidor iniciado em porta efêmera durante testes automatizados;
- `/health` retorna identidade e status corretos;
- HOST entra, convidado entra, estado é sincronizado;
- offer, answer e candidate chegam somente ao destinatário;
- convidado sai sem encerrar sala;
- HOST encerra e todos recebem encerramento;
- sexto participante é rejeitado;
- payload excessivo e evento inválido são rejeitados;
- porta ocupada impede criação sem derrubar o app;
- iniciar/parar/iniciar reutiliza a mesma porta.

### 9.3 Aplicativo empacotado

- `VoiceRoom.exe` inicia servidor sem Node instalado separadamente;
- tray não encerra sala ao apenas ocultar janela;
- “Encerrar sala” libera a porta;
- “Sair completamente” libera a porta;
- atualização/saída faz cleanup;
- CSP permite somente o destino aprovado em runtime;
- clipboard copia o endereço correto;
- firewall apresenta orientação compreensível.

### 9.4 Matriz real de VPN e WebRTC

| Cenário | Resultado esperado |
|---|---|
| HOST + 1 convidado | voz bidirecional e estado correto |
| HOST + 2 convidados | mesh e lista de participantes estáveis |
| 5 participantes | limite suportado, sem sexto usuário |
| HOST fecha/encerra | sala termina e convidados voltam ao início |
| convidado fecha VPN | desconecta e inicia janela de reconexão |
| VPN retorna em até 30 s | Socket.IO reconecta e peers são recriados |
| VPN não retorna | timeout, cleanup e tela inicial |
| porta 32145 ocupada | erro específico ao HOST |
| IP inválido | erro antes de qualquer conexão |
| IP válido sem VoiceRoom | “sala não localizada” após timeout controlado |
| interface errada | falha explicada e opção de trocar IP |
| firewall bloqueado | orientação de VPN/firewall sem diagnóstico falso definitivo |
| redes físicas diferentes | sessão funciona pela VPN homologada |

Em cada cenário WebRTC, coletar quando disponível:

- `candidateType`, protocolo e candidate pair selecionado;
- RTT, bitrate, packet loss e `qualityLimitationReason`;
- CPU, memória, upload, resolução e FPS;
- resultados para 720p/30, 1080p/30 e 720p/60 com 1, 2 e 4 espectadores.

## 10. Critérios de aceite priorizados

### P0 — bloqueiam a migração

- [ ] Render pode ser desligado sem afetar criação, entrada, voz ou tela;
- [ ] instalador contém e inicia o signaling local;
- [ ] HOST cria sessão em IPv4 selecionado e porta `32145`;
- [ ] interfaces são listadas e seleção manual sempre está disponível;
- [ ] convidado entra por `IP` ou `IP:porta` válido;
- [ ] health check diferencia entrada inválida de host indisponível;
- [ ] lista de participantes e limite de 5 funcionam;
- [ ] offer, answer e ICE funcionam;
- [ ] voz, mute, compartilhamento e áudio do sistema funcionam;
- [ ] HOST encerra a sala; convidado sair não encerra;
- [ ] reconexão básica funciona dentro de 30 segundos;
- [ ] porta ocupada, IP inválido e host indisponível geram erro claro;
- [ ] servidor libera porta e timers ao encerrar;
- [ ] custo de infraestrutura VoiceRoom permanece R$ 0/mês.

### P1 — necessários para release estável

- [ ] detecção heurística reconhece a VPN homologada;
- [ ] candidate pair da VPN é visível no diagnóstico;
- [ ] CSP/allowlist bloqueia destinos não aprovados;
- [ ] logs de produção não expõem payloads sensíveis;
- [ ] build e instalador passam smoke test em máquina limpa;
- [ ] documentação explica VPN, firewall, criação, entrada e falhas comuns.

### P2 — pós-MVP

- [ ] senha curta opcional;
- [ ] discovery por mDNS/broadcast/multicast;
- [ ] IPv6;
- [ ] migração de HOST;
- [ ] suporte ampliado a VPNs com comportamento não homologado.

## 11. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---:|---:|---|
| Firewall bloqueia conexões ao HOST | alta | alto | teste antecipado, mensagem clara, rede privada e guia de liberação |
| Bind escolhido contradiz localhost | alta | alto | resolver D-02 antes da implementação e cobrir em teste |
| Instalador omite `socket.io` ou módulos do servidor | média | alto | declarar dependência de runtime e inspecionar `app.asar`/máquina limpa |
| CSP impede IP dinâmico ou fica ampla demais | média | alto | allowlist em runtime e teste negativo de destinos |
| VPN escolhe rota/candidato inesperado | média | alto | `getStats()`, diagnóstico e homologação por produto |
| Heurística seleciona Ethernet/Wi-Fi errada | média | médio | seleção automática apenas inequívoca e override sempre visível |
| Reconexão deixa peers/timers órfãos | média | alto | máquina de estados, cleanup idempotente e testes de queda repetida |
| Host no tray parece fechado, mas sala continua | média | médio | textos claros para ocultar, sair e encerrar sala |
| Remoção precoce do Render bloqueia usuários | baixa | alto | corte somente após instalador homologado e release anterior disponível |
| Mesh degrada com 5 participantes | média | médio | preservar limite, medir upload/CPU e priorizar áudio |

## 12. Observabilidade e diagnóstico local

Sem backend externo, o diagnóstico deve permanecer local e efêmero:

- estado do servidor: parado/iniciando/ativo/encerrando/erro;
- IP e porta vinculados;
- quantidade de participantes, sem armazenar histórico;
- causa normalizada da última falha;
- estado Socket.IO e tempo de reconexão restante;
- candidate pair, RTT, perda, bitrate e codec do WebRTC;
- botão para copiar relatório técnico sanitizado, sem SDP, ICE completo, tokens ou avatar.

Não enviar telemetria para serviço externo no MVP.

## 13. Estratégia de corte e rollback

1. manter o código do servidor público e a release atual disponíveis durante o desenvolvimento, sem criar fallback automático dentro do novo app;
2. publicar uma versão de teste separada para o grupo de homologação;
3. aprovar todos os P0 em pelo menos dois PCs físicos;
4. gerar release estável e preservar o instalador anterior;
5. desligar o serviço Render;
6. executar novamente smoke test com o Render indisponível;
7. remover configuração, documentação e scripts legados em commit separado;
8. se houver falha crítica, redistribuir a release anterior; reativar Render apenas como rollback operacional temporário, nunca como dependência silenciosa da nova arquitetura.

## 14. Definição de pronto

A migração está pronta quando:

- código, testes, bundle, instalador e documentação refletem exclusivamente o modo VPN para signaling;
- a chamada funciona em dois PCs físicos sem servidor VoiceRoom externo;
- os critérios P0 estão documentados com evidências de teste;
- não há porta, processo, socket, peer ou timer órfão após encerrar;
- segurança e mensagens de falha foram verificadas no executável instalado;
- decisões divergentes do PRD estão registradas em ADR;
- o Render pode permanecer desligado sem regressão funcional.

## 15. Próximo passo recomendado

Executar a homologação de **Fase 8** em dois PCs físicos: instalar a versão `0.1.2`, confirmar a mesma VPN, abrir a porta `32145` no firewall quando solicitado, criar a sala no HOST, entrar como convidado, validar voz/tela e observar o candidate pair WebRTC. Só depois desse aceite o Render deve ser desligado.
