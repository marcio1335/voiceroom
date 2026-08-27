# ADR-003 — Sinalização efêmera sem banco

- Status: aceito
- Data: 21/08/2026

## Decisão

Manter sala e participantes em `Map` na memória do processo de signaling. No modo VPN local, o processo é executado pelo Electron do HOST e existe uma única sala por instância; o identificador interno não é exibido ao usuário, que compartilha o IP virtual do HOST.

## Motivo

O MVP não precisa de contas, histórico ou dados permanentes. A escolha reduz custo operacional e superfície de privacidade.

## Consequências

- Reiniciar o processo do HOST encerra a sala ativa.
- O IP da VPN é endereço de sessão, não autenticação forte; rate limiting e validação continuam obrigatórios.
- Um token efêmero separado do `socketId` permite retomada curta após queda.
- Escalar o signaling para múltiplas instâncias exigirá um store compartilhado.
