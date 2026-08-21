# ADR-001 — Electron com renderer isolado

- Status: aceito
- Data: 21/08/2026

## Decisão

Usar Electron para o cliente Windows, com HTML/CSS/JavaScript modular e sem framework de UI no MVP.

O renderer roda com `contextIsolation`, `sandbox`, `webSecurity` e `nodeIntegration: false`. O preload expõe apenas operações específicas via `contextBridge`.

## Motivo

Electron oferece Chromium/WebRTC, captura de tela e empacotamento Windows com baixo custo de implementação. A separação main/preload/renderer reduz a superfície de ataque.

## Consequências

- O renderer não pode importar APIs Node diretamente; o bundle é gerado com esbuild.
- Captura de fonte de tela passa por IPC validado no processo principal.
- O executável pode consumir mais memória que uma aplicação nativa.
- Assinatura de código permanece fora do MVP e pode gerar alerta do SmartScreen.

