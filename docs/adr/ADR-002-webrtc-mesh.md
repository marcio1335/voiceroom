# ADR-002 — WebRTC Mesh com cinco participantes

- Status: aceito
- Data: 21/08/2026

## Decisão

Usar uma `RTCPeerConnection` por par de participantes. O servidor Socket.IO apenas coordena sala, presença e troca de SDP/ICE; não transporta áudio nem vídeo.

## Motivo

A topologia Mesh elimina o custo de um servidor de mídia e atende grupos pequenos. O limite oficial é de cinco participantes por sala.

## Consequências

- Upload, CPU e número de conexões crescem quadraticamente.
- STUN é configurável; TURN não faz parte do primeiro MVP.
- O `PeerManager` centraliza negociação, fila de ICE e limpeza.
- Crescimento além do limite exigirá reavaliação para SFU.

