# ADR-003 — Sinalização efêmera sem banco

- Status: aceito
- Data: 21/08/2026

## Decisão

Manter salas e participantes em `Map` na memória do processo Node.js. Uma sala é criada por código aleatório de seis caracteres e desaparece quando todos os participantes saem ou expiram.

## Motivo

O MVP não precisa de contas, histórico ou dados permanentes. A escolha reduz custo operacional e superfície de privacidade.

## Consequências

- Reiniciar o servidor encerra as salas ativas.
- O código é convite, não autenticação forte; rate limiting e validação são obrigatórios.
- Um token efêmero separado do `socketId` permite retomada curta após queda.
- Escalar o signaling para múltiplas instâncias exigirá um store compartilhado.

