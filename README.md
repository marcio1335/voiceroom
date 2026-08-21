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

O servidor ainda precisa ser executado em uma URL pública com HTTPS/WSS para testes entre redes. O padrão local é `http://localhost:3000`.

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

Para apontar o cliente para outro signaling server durante o desenvolvimento, defina `window.VOICEROOM_SIGNALING_SERVER` antes do bundle do renderer ou altere temporariamente `client/src/renderer/config.js`. Em produção, o endpoint deve usar WSS.

## Disponibilizar para amigos

O endereço padrão `localhost` só funciona na máquina que está executando o servidor. Para uso entre computadores:

1. Publique `server/src/server.js` em um host acessível pela Internet que aceite Node.js e WebSocket.
2. Configure `HOST=0.0.0.0`, a porta fornecida pelo host e HTTPS/WSS. Verifique `https://SEU-ENDPOINT/readyz`.
3. Gere o cliente apontando para o endpoint público antes de criar o instalador:

   ```powershell
   $env:VOICEROOM_SIGNALING_SERVER = "https://SEU-ENDPOINT"
   npm run dist
   Remove-Item Env:VOICEROOM_SIGNALING_SERVER
   ```

4. Envie `release/VoiceRoom Setup 0.1.0.exe` aos amigos. Eles não precisam executar o servidor, apenas instalar o cliente.

O MVP usa STUN, mas ainda não usa TURN. Pessoas em algumas redes corporativas, CGNAT ou firewalls restritivos podem não conseguir estabelecer a chamada. O instalador também não é assinado, então o Windows SmartScreen pode exibir um aviso.

## Teste de microfone

Dentro de uma sala, selecione o dispositivo e use **Ouvir microfone**. O app liga um retorno em tempo real local, mostra o nível capturado e não envia esse teste aos participantes. Use fones para evitar microfonia; clique novamente em **Parar retorno** para encerrar.

## Limitações conhecidas do MVP

- A topologia é WebRTC Mesh e suporta oficialmente até 5 participantes.
- STUN está configurado; TURN ainda não faz parte do MVP, então redes restritivas podem falhar.
- As salas ficam apenas na memória do processo de sinalização.
- Compartilhamento de tela transmite vídeo sem áudio do sistema.
- O instalador ainda não possui assinatura de código; o Windows SmartScreen pode exibir um aviso.

## Privacidade

O VoiceRoom não persiste apelidos, áudio ou tela. O WebRTC pode revelar aos participantes os endereços de rede necessários para estabelecer a conexão; isso deve ser informado antes de uma distribuição pública.
