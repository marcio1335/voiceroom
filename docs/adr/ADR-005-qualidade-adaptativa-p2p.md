# ADR-005 — Qualidade adaptativa por espectador no P2P

- Status: aceito
- Data: 22/08/2026

## Contexto

O VoiceRoom transmite a tela por WebRTC P2P. O Render encaminha apenas sinalização; portanto, cada espectador adicional aumenta o upload e o trabalho de codificação do apresentador. Um limite fixo de bitrate atende ao caso comum, mas não distingue espectadores com redes diferentes e não fornece diagnóstico para explicar quedas de qualidade.

## Decisão

Manter uma única `MediaStream` de captura e aplicar o perfil efetivo separadamente em cada `RTCRtpSender` de vídeo. O perfil escolhido pelo apresentador é o teto; o controlador pode reduzir um espectador para um nível inferior e restaurá-lo após estabilidade.

Perfis suportados:

- Econômico: 480p/30, aproximadamente 1,2 Mbps;
- Equilibrado: 720p/30, aproximadamente 2,5 Mbps e padrão;
- Nitidez: 1080p/30, aproximadamente 5 Mbps;
- Fluido: 720p/60, aproximadamente 5 Mbps.

A adaptação utiliza estatísticas locais do WebRTC, com três amostras ruins para reduzir, dez boas para aumentar e intervalo mínimo de 15 segundos entre mudanças. A coleta ocorre a cada dois segundos enquanto houver espectador inscrito.

VP9 é preferido quando disponível, com fallback para VP8. AV1 permanece experimental até ser validado em hardware real.

## Motivos

- Não exige SFU, banco de dados, novo serviço ou custo mensal obrigatório.
- Um peer com perda ou RTT alto não reduz diretamente a qualidade dos demais.
- Capturar uma vez evita recriar a fonte e reduz interrupções.
- `maintain-resolution` favorece texto e interfaces; `maintain-framerate` atende vídeo e jogos.
- A voz deve conservar margem de banda; a tela é reduzida antes de tentar sacrificar o áudio.

## Consequências

- 1080p não é seguro como padrão para quatro espectadores: o upload máximo pode se aproximar de 20 Mbps antes do overhead.
- O bitrate real pode ser menor que o limite por decisão do congestion control nativo.
- A disponibilidade de stats, codecs e `setParameters()` varia entre versões do Chromium; toda aplicação é feature-detected e possui fallback.
- A mudança de resolução/bitrate não recria o stream. Elevar uma captura iniciada em 30 FPS para 60 FPS pode exigir `applyConstraints()` ou reinício, caso o runtime não suporte a alteração ao vivo.
- O painel de diagnóstico é local e não envia métricas, áudio ou vídeo ao servidor.

## Fora desta decisão

- TURN, SFU, retransmissão pública e gravação;
- nova fonte de áudio por aplicativo no Windows;
- mais de duas pessoas transmitindo na sala;
- garantia de 1080p/60 em qualquer hardware ou rede.

## Critérios de revisão

Reavaliar esta decisão se o beta apresentar taxa de falha P2P elevada, upload incompatível com o limite de participantes, CPU excessiva ou necessidade de mais espectadores. Nesses casos, comparar TURN como fallback de conectividade e SFU como nova arquitetura de mídia, com custo e operação separados.
