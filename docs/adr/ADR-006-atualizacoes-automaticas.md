# ADR-006 — Atualizações automáticas do cliente Windows

- Status: aceito
- Data: 22/08/2026

## Decisão

O cliente Electron usa `electron-updater` com o alvo NSIS e releases do GitHub. A primeira instalação continua sendo feita pelo instalador; depois disso, o cliente verifica atualizações após a inicialização e em intervalos periódicos.

O download ocorre em segundo plano. `autoInstallOnAppQuit` deixa a instalação para a saída do aplicativo, evitando interromper uma chamada. A interface exibe o progresso e permite instalar imediatamente quando o pacote estiver pronto.

O workflow `.github/workflows/release.yml` publica os artefatos quando uma tag `vX.Y.Z` é enviada ao repositório.

## Motivo

Isso elimina a necessidade de distribuir manualmente um novo instalador a cada versão e mantém o custo operacional em zero usando GitHub Releases.

## Consequências

- Uma release precisa conter os metadados e artefatos gerados pelo `electron-builder`.
- A versão do `package.json` deve ser incrementada antes da tag.
- Releases privadas do GitHub não podem ser baixadas por clientes sem autenticação; não é seguro embutir um token no aplicativo.
- O instalador inicial, assinatura de código e um canal HTTPS de distribuição continuam necessários.
- Em desenvolvimento, a checagem fica desativada.

## Fora de escopo

- Atualização do servidor Render.
- Atualização sem reiniciar o processo Electron.
- Assinatura de código e criação de certificados.
