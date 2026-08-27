# ADR-012 — Endpoint de signaling resolvido em runtime

- Status: aceito
- Data: 26/08/2026

## Decisão

O bundle não contém URL fixa de signaling. O renderer recebe um endereço normalizado como `http://<ipv4>:32145` após criar ou validar uma sala. O processo principal mantém uma allowlist temporária de destinos e filtra requisições HTTP/WebSocket do renderer; ao sair, a allowlist é limpa.

## Motivo

IPs de VPN variam por computador e não podem ser enumerados no build. A resolução em runtime permite Radmin VPN, Tailscale, ZeroTier e outras redes virtuais sem reintroduzir um endpoint público.

## Consequências

- O parser aceita somente IPv4 e porta opcional; hostname, URL arbitrária e IPv6 ficam fora do MVP.
- A CSP precisa permitir os esquemas necessários ao Socket.IO, enquanto a allowlist do main restringe o destino efetivo.
- Health check `/health` ocorre antes do handshake do convidado e produz mensagens de falha acionáveis.
