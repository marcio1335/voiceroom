# ADR-004 — Limite de compartilhamento de tela no MVP

- Status: substituído parcialmente por `ADR-005-qualidade-adaptativa-p2p.md`
- Data: 21/08/2026

## Decisão

O servidor mantém um lock atômico por participante e limita a sala a duas pessoas transmitindo simultaneamente. O cliente captura uma janela/monitor selecionado, preserva a proporção nativa e libera a track ao parar ou ao receber `track.onended`.

Cada espectador continua inscrito em apenas uma transmissão por vez. A mídia segue em WebRTC P2P: o apresentador possui um sender de tela separado para cada espectador inscrito.

## Motivo

O limite de duas transmissões atende ao uso em pequenos grupos sem transformar o Mesh em um sistema de múltiplas fontes irrestritas. A inscrição opcional evita que todos os participantes recebam vídeo quando não desejarem assistir.

## Consequências

- Uma terceira tentativa recebe `SCREEN_BUSY`.
- O lock é liberado em stop, saída, desconexão e expiração.
- O espectador pode trocar de fonte; a inscrição anterior é removida antes de permanecer na nova.
- Áudio do sistema é opcional e vem do loopback do Windows; pode incluir outros aplicativos e exige cuidado com eco.
- Aumentar o número de transmissores ou permitir múltiplas telas simultâneas por espectador exige novo desenho de mídia e testes.
