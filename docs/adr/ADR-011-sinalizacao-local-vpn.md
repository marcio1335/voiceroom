# ADR-011 — Signaling local hospedado pelo HOST via VPN

- Status: aceito
- Data: 26/08/2026

## Decisão

O criador da sala inicia, dentro do processo principal do Electron, um servidor HTTP + Socket.IO efêmero na porta fixa `32145`. O servidor é vinculado ao IPv4 da interface VPN selecionada. O próprio HOST conecta ao mesmo endereço virtual; convidados recebem somente o IP e conectam ao mesmo endpoint.

O código de signaling é uma fábrica reutilizável (`client/src/main/signaling-server.js`). O processo antigo em `server/src` permanece apenas como wrapper de desenvolvimento e testes, não como dependência de produção.

## Motivo

Essa topologia elimina Render, domínio, backend hospedado e banco de dados do caminho da chamada, mantendo Socket.IO para signaling e WebRTC P2P para áudio/tela.

## Consequências

- Fechar o HOST encerra a sala; migração automática de HOST fica fora do MVP.
- A porta fixa simplifica suporte e firewall, mas pode entrar em conflito localmente.
- O bind específico reduz exposição em interfaces não VPN; a UI sempre oferece seleção manual quando a heurística é inconclusiva.
- A VPN continua sendo uma dependência de conectividade e pode usar internet própria para formar o túnel.
- O instalador precisa incluir `socket.io` server e suas dependências.
