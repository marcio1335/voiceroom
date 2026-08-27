# VoiceRoom

VoiceRoom é um aplicativo desktop Windows para chamadas de voz e compartilhamento de tela em grupos pequenos, sem cadastro.

## Estado atual

Esta implementação cobre a fundação do modo local via VPN:

- shell Electron com isolamento de contexto, sandbox e preload mínimo;
- servidor HTTP + Socket.IO embutido no Electron do HOST, com sala efêmera, limite de 5 pessoas e reconexão por token temporário;
- detecção de interfaces IPv4, seleção de IP VPN e fallback automático entre as portas `32145` e `32155`;
- identificadores internos sem caracteres ambíguos, não exibidos ao usuário;
- validação de nomes, IPs, protocolo e payloads de signaling;
- rate limiting inicial e endpoints `/health`, `/healthz` e `/readyz`;
- interface para criar/entrar/sair, copiar IP e visualizar participantes;
- base de WebRTC para áudio e compartilhamento de tela opcional, com até duas transmissões simultâneas por sala;
- perfis de tela Econômico (480p/30), Equilibrado (720p/30), Nitidez (1080p/30), Fluido (720p/60) e Máximo (1080p/60), com adaptação local por espectador e diagnóstico opcional;
- perfil e apelido persistidos somente no computador do usuário;
- descoberta limitada de salas VoiceRoom já visíveis na tabela de vizinhos da VPN, sem varredura ampla da rede.

Artefatos gerados localmente:

- `release/win-unpacked/VoiceRoom.exe` — build portátil para smoke test;
- `release/VoiceRoom Setup 0.1.3.exe` — instalador NSIS do último build local.

O signaling não depende de um serviço público. Ao criar uma sala, o HOST inicia o servidor local na interface VPN selecionada e compartilha seu IP com os convidados.

## Requisitos

- Windows 10/11 x64 para o cliente;
- Node.js 20 ou superior;
- npm 10 ou superior.

## Desenvolvimento local

```powershell
npm install
npm start
```

O aplicativo inicia sem servidor externo. Para uma chamada, todos os computadores devem estar na mesma rede virtual (Radmin VPN, Tailscale, ZeroTier, Hamachi ou equivalente). O comando `npm run server` permanece disponível somente para testes de compatibilidade do módulo de signaling.

Comandos úteis:

```powershell
npm run server   # servidor compatível para testes automatizados/desenvolvimento
npm start        # Electron com servidor local sob demanda
npm test         # testes de regras de sala e validação
npm run check    # verificação sintática dos módulos
npm run build    # build de diretório do Electron
npm run dist     # instalador NSIS
```

## Usar com amigos

1. Todos instalam e abrem a mesma VPN.
2. O HOST abre o VoiceRoom e clica em **Criar sala**.
3. O app identifica interfaces VPN; se houver mais de uma, o HOST escolhe o IP correto.
4. O HOST copia o endereço exibido. Se `32145` estiver ocupada, o app escolhe outra porta automaticamente.
5. Cada convidado informa seu nome e o endereço do HOST, por exemplo `26.42.13.7:32146`.
6. O Windows pode pedir permissão de firewall; permita o VoiceRoom em redes privadas.

Quando outro computador já estiver visível na tabela de vizinhos do Windows e estiver hospedando VoiceRoom, a seção **Salas na sua VPN** permite entrar sem digitar o endereço. A busca testa as portas `32145` a `32155` somente nos vizinhos já conhecidos; ela não percorre a faixa inteira da VPN.

Nenhum computador precisa executar `npm run server` ou manter um backend público.

O modo VPN começa com candidatos ICE locais (`iceServers: []`). Se uma VPN homologada exigir STUN, ele poderá ser habilitado como fallback explícito. TURN próprio não faz parte do MVP. O instalador ainda não é assinado, então o Windows SmartScreen pode exibir um aviso.

## Teste de microfone

Dentro de uma sala, selecione o dispositivo e use **Ouvir microfone**. O app liga um retorno em tempo real local sem o processamento da chamada, mostra o nível capturado e não envia esse teste aos participantes. Use fones para evitar microfonia; clique novamente em **Parar retorno** para encerrar.

## Ajustes de áudio

Na seção **Áudio** da sala, é possível escolher entre a supressão **Nativa (WebRTC)** (padrão), **RNNoise** (processamento local mais forte, com maior uso de CPU) ou desativá-la, além de configurar separadamente o cancelamento de eco e o ganho automático. A troca é aplicada ao áudio enviado sem recriar a captura do microfone; o app mantém o modo nativo automaticamente se o RNNoise não puder iniciar. O controle **Sensibilidade do microfone** aplica ganho de 0% a 200% ao áudio enviado aos participantes. O retorno local permanece direto para evitar cortes; marque **Aplicar ao teste de retorno** quando quiser testar também o processamento. Essas preferências ficam salvas localmente neste computador e podem ser alteradas durante a chamada; se o som começar a cortar, experimente desativar o cancelamento de eco, escolher o modo nativo ou reduzir o ganho.

## Atualizações do aplicativo

O instalador é necessário somente na primeira instalação. As versões seguintes são publicadas em GitHub Releases e baixadas pelo `electron-updater` em segundo plano. A instalação ocorre ao fechar o VoiceRoom ou pelo botão **Instalar agora**; uma chamada em andamento não é interrompida.

Se o computador estiver offline, o usuário continua na versão atual e pode usar salas locais normalmente. O canal de atualização é independente do signaling e não reintroduz o Render.

Para publicar uma versão:

1. atualize `version` no `package.json`;
2. crie a tag `vX.Y.Z`;
3. envie a tag ao GitHub para o workflow `.github/workflows/release.yml` gerar o instalador e os metadados.

## Limitações conhecidas do MVP

- A topologia é WebRTC Mesh e suporta oficialmente até 5 participantes e até 2 transmissões de tela simultâneas. Cada participante escolhe qual transmissão assistir, uma por vez; ao trocar, a transmissão anterior é fechada localmente. Equilibrado (720p/30) é o padrão. **Máximo (1080p/60) é muito pesado**, pode usar até 10 Mbps por espectador e afetar CPU, upload e estabilidade; o app mostra um aviso temporário ao selecioná-lo.
- A qualidade adaptativa é independente por espectador, mas continua limitada pela capacidade da máquina e da rede do apresentador. O painel de diagnóstico é local e mostra resolução, FPS, bitrate, RTT, perda e codec quando o Chromium fornece essas métricas.
- A VPN é obrigatória; STUN está desativado no caminho principal e TURN ainda não faz parte do MVP, então redes/VPNs restritivas podem falhar.
- As salas ficam apenas na memória do processo de sinalização.
- Compartilhamento de tela possui controle de tela cheia e botões individuais **Assistir transmissão** / **Parar de assistir**. O áudio do sistema é opcional e, no Windows, pode incluir o Discord e outros aplicativos; deixe a opção desmarcada para evitar eco.
- Na transmissão, a roda do mouse controla zoom entre 100% e 300%. O botão direito abre volume, mute local e fechamento da visualização. Clicar no nome de outro participante abre volume individual e mute somente para você.
- O signaling local fica disponível apenas enquanto o HOST mantém o aplicativo aberto. Fechar ou encerrar a sala desconecta todos os convidados.
- O instalador ainda não possui assinatura de código; o Windows SmartScreen pode exibir um aviso.

## Privacidade

O VoiceRoom não persiste apelidos, áudio ou tela. O WebRTC pode revelar aos participantes os endereços de rede necessários para estabelecer a conexão; isso deve ser informado antes de uma distribuição pública.
