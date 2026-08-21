# ADR-004 — Um compartilhamento de tela por sala

- Status: aceito
- Data: 21/08/2026

## Decisão

O servidor concede um lock atômico a apenas um participante. O cliente captura uma janela/monitor selecionado, transmite vídeo em até 720p/30 FPS e libera a track ao parar ou ao receber `track.onended`.

## Motivo

Um único vídeo reduz upload, CPU e complexidade de negociação no Mesh.

## Consequências

- Uma segunda tentativa recebe `SCREEN_BUSY`.
- O lock é liberado em stop, saída, desconexão e expiração.
- Áudio do sistema fica fora do MVP.
- A mudança para múltiplos compartilhamentos exigirá novo desenho de mídia e testes.

