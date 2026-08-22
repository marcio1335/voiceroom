# VoiceRoom

VoiceRoom é um aplicativo desktop Windows para chamadas de voz e compartilhamento de tela em grupos pequenos, sem cadastro.

## Estado atual

Esta implementação cobre a fundação `0.1.0` do planejamento:

- shell Electron com isolamento de contexto, sandbox e preload mínimo;
- servidor Node.js + Socket.IO com salas efêmeras, limite de 5 pessoas e reconexão por token temporário;
- códigos de sala sem caracteres ambíguos;
- validação de nomes, códigos, protocolo e payloads de signaling;
- rate limiting inicial e endpoints `/healthz` e `/readyz`;
- interface para criar/entrar/sair, copiar código e visualizar participantes;
- base de WebRTC para áudio e compartilhamento de tela.

Artefatos gerados localmente:

- `release/win-unpacked/VoiceRoom.exe` — build portátil para smoke test;
- `release/VoiceRoom Setup 0.1.0.exe` — instalador NSIS.

O signaling server público está em `https://voiceroom-signaling.onrender.com`. O desenvolvimento local continua usando `http://localhost:3000`.

## Requisitos

- Windows 10/11 x64 para o cliente;
- Node.js 20 ou superior;
- npm 10 ou superior.

## Desenvolvimento local

```powershell
npm install
npm run dev
```

O comando inicia o signaling server em `http://127.0.0.1:3000` e o Electron. Para testar dois clientes no mesmo computador, abra duas instâncias do app depois de iniciar o servidor.

Comandos úteis:

```powershell
npm run server   # apenas o servidor
npm start        # apenas o Electron
npm test         # testes de regras de sala e validação
npm run check    # verificação sintática dos módulos
npm run build    # build de diretório do Electron
npm run dist     # instalador NSIS
```

`npm start` e `npm run dev` geram o renderer apontando para `http://localhost:3000`. `npm run build` e `npm run dist` usam `https://voiceroom-signaling.onrender.com`, cuja conexão WebSocket é feita por WSS.

Para substituir o endpoint incorporado em qualquer bundle, exporte `VOICEROOM_SIGNALING_SERVER` antes do comando. Se usar outro host, adicione-o também ao `connect-src` da CSP em `client/src/renderer/index.html`:

```powershell
$env:VOICEROOM_SIGNALING_SERVER = "https://outro-endpoint.example.com"
npm run bundle:renderer:production
Remove-Item Env:VOICEROOM_SIGNALING_SERVER
```

## Disponibilizar para amigos

O endereço padrão `localhost` só funciona na máquina que está executando o servidor. Para gerar um instalador para uso entre computadores:

1. Confirme que o Render responde em `https://voiceroom-signaling.onrender.com/readyz`.
2. Gere o instalador; o script de produção já incorpora o endpoint público:

   ```powershell
   npm run dist
   ```

3. Envie `release/VoiceRoom Setup 0.1.0.exe` aos amigos. Eles não precisam executar o servidor, apenas instalar o cliente.

O MVP usa STUN, mas ainda não usa TURN. Pessoas em algumas redes corporativas, CGNAT ou firewalls restritivos podem não conseguir estabelecer a chamada. O instalador também não é assinado, então o Windows SmartScreen pode exibir um aviso.

## Teste de microfone

Dentro de uma sala, selecione o dispositivo e use **Ouvir microfone**. O app liga um retorno em tempo real local sem o processamento da chamada, mostra o nível capturado e não envia esse teste aos participantes. Use fones para evitar microfonia; clique novamente em **Parar retorno** para encerrar.

## Ajustes de áudio

Na seção **Áudio** da sala, é possível ativar ou desativar separadamente o cancelamento de eco, a supressão de ruído e o ganho automático. Essas três opções são aplicadas ao vivo na faixa de captura da chamada, sem recriar o microfone. O controle **Sensibilidade do microfone** aplica ganho de 0% a 200% ao áudio enviado aos participantes. O retorno local permanece direto para evitar cortes; marque **Aplicar ao teste de retorno** quando quiser testar também o processamento. Essas preferências ficam salvas localmente neste computador e podem ser alteradas durante a chamada; se o som começar a cortar, experimente desativar o cancelamento de eco ou reduzir o ganho.

## Limitações conhecidas do MVP

- A topologia é WebRTC Mesh e suporta oficialmente até 5 participantes.
- STUN está configurado; TURN ainda não faz parte do MVP, então redes restritivas podem falhar.
- As salas ficam apenas na memória do processo de sinalização.
- Compartilhamento de tela possui controle de tela cheia. O áudio do sistema é opcional e, no Windows, pode incluir o Discord e outros aplicativos; deixe a opção desmarcada para evitar eco.
- O instalador ainda não possui assinatura de código; o Windows SmartScreen pode exibir um aviso.

## Privacidade

O VoiceRoom não persiste apelidos, áudio ou tela. O WebRTC pode revelar aos participantes os endereços de rede necessários para estabelecer a conexão; isso deve ser informado antes de uma distribuição pública.
