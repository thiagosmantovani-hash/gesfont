# GESFONT

Gestão de fontes para Mac (também roda em Windows e Linux). Organiza a biblioteca por cliente, ativa e desativa fontes sem instalar nada de forma definitiva, encontra e resolve duplicadas, navega pelo Google Fonts, mostra glifos e recursos OpenType, compara fontes e testa combinações de título e texto.

**Site para baixar:** https://thiagosmantovani-hash.github.io/gesfont-releases/

## Instalar

1. Abra a [última versão](https://github.com/thiagosmantovani-hash/gesfont-releases/releases/latest) e baixe o `.dmg`:
   - `GESFONT-x.y.z-arm64.dmg` para Macs com chip Apple (M1 em diante);
   - `GESFONT-x.y.z.dmg` para Macs Intel.
2. Abra o `.dmg` e arraste o GESFONT para **Aplicativos**. Ele precisa ficar em Aplicativos para conseguir se atualizar sozinho.
3. Na primeira abertura, o macOS avisa que não pôde verificar o desenvolvedor, porque o app não tem certificado pago da Apple. Clique em **OK**, vá em Ajustes do Sistema > Privacidade e Segurança e clique em **Abrir mesmo assim**. Isso só acontece uma vez.

Depois disso, as versões novas chegam sozinhas (veja Atualizações automáticas).

## Rodar a partir do código

Para testar mudanças no código antes de publicar, com Node.js 20 ou mais novo:

```
npm install
npm start
```

Para gerar o `.dmg` no seu Mac sem publicar: `npm run dist:mac` (os arquivos ficam em `dist/`).

## Pasta GESFONT

Na primeira abertura o app cria a pasta `GESFONT` na sua pasta de usuário (`Macintosh HD > Usuários > seu nome > GESFONT`).

- As pastas dentro dela aparecem na barra lateral, em **Pastas**, como uma árvore. Clicar no título **Pastas** mostra tudo o que está na GESFONT.
- Crie, renomeie e apague pastas pelo app (botão + e botão direito) ou direto no Finder. Os dois lados ficam sincronizados.
- Para organizar, arraste uma família da lista para uma pasta da barra lateral, ou use o botão direito e **Mover para pasta**. Os arquivos são movidos de verdade. Fontes ativas continuam ativas e nomes de família alterados continuam valendo.
- Arquivos de fonte arrastados do Finder para uma pasta da barra lateral, ou soltos na janela com uma pasta aberta, vão para essa pasta.
- Arraste fontes para essa pasta pelo Finder e elas aparecem no app sozinhas.
- Arquivos soltos arrastados para a janela do app são copiados para lá. Se já existir um arquivo idêntico, a cópia é pulada.
- Fontes baixadas do Google Fonts ficam na subpasta `Google Fonts`.
- Pastas de fora da GESFONT (do servidor, do Dropbox) podem ser adicionadas em **Outras pastas**. Elas são lidas no lugar, sem mover nada. Arrastar uma família delas para uma pasta da GESFONT copia os arquivos.
- Para usar outra pasta principal, vá em Ajustes e clique em **Alterar…**. Os arquivos não são copiados e a pasta antiga não é apagada.

## Como a ativação funciona

- Ativar uma fonte copia o arquivo para `~/Library/Fonts`. O macOS reconhece na hora e a fonte aparece em todos os apps.
- Desativar apaga só essa cópia. O arquivo original continua na pasta dele.
- Fontes que você instalou por fora do GESFONT nunca são removidas.
- Alguns apps (Adobe, Figma desktop) só atualizam a lista de fontes depois de reabertos.

No Windows a cópia vai para a pasta de fontes do usuário e é registrada no registro do usuário. No Linux vai para `~/.local/share/fonts/gesfont`.

## O que dá para fazer

**Lista e grade.** Os botões no começo da barra alternam entre a lista (prévia com texto longo) e a grade (um glifo por família, com nome, formato e número de estilos). Na grade, o círculo mostra o estado: vazio está inativa, verde cheio está ativa, contorno verde está parcialmente ativa e tracejado está no Google Fonts sem download. Na lista, o interruptor fica verde quando a família está ativa. Clique no círculo para ativar ou desativar. O caractere da grade se troca no campo de texto.

**Duplicadas.** A aba lista os estilos que aparecem em mais de um arquivo, com versão, formato, tamanho, data e pasta, e marca os arquivos idênticos. Em cada grupo dá para manter um arquivo e mandar os outros para a Lixeira, ou usar **Resolver todas**, que mantém a versão mais nova em formato instalável. Quando os arquivos são iguais, fica o original da sua pasta e a cópia sai. A segunda aba sugere famílias com nomes quase iguais (por exemplo "Open Sans" e "OpenSans") para mesclar. Tudo vai para a Lixeira do sistema e pode ser recuperado. Fontes do sistema não são apagadas.

**Renomear e mesclar famílias.** Clique com o botão direito numa família e escolha **Renomear família** ou **Mesclar com outra família**. Os arquivos não mudam, só o agrupamento no app. Para desfazer, use **Restaurar nome original** no mesmo menu, ou **Restaurar** em Ajustes para desfazer tudo.

**Coleções por cliente.** Crie uma coleção, arraste famílias para ela na barra lateral ou use o botão +. Cada coleção tem um tom de cinza, ativa ou desativa tudo de uma vez e exporta os arquivos das fontes para uma pasta. Em Ajustes dá para exportar e importar as coleções num arquivo, para guardar uma cópia ou levar para outro Mac.

**Tags.** Pelo menu de uma família (botão direito, **Tags…**) você cria tags livres, como estilo, uso ou cliente. As tags aparecem na barra lateral e entram na busca. As tags automáticas (classificação e variável) e as do Google Fonts podem ser ocultadas em Ajustes.

**Fontes do sistema: Nativas e Verificação.** Ao abrir, o GESFONT varre todas as pastas de fontes do computador e separa o que encontrou em dois grupos:

- **Nativas** são as fontes do próprio sistema operacional (no Mac, as de `/System/Library/Fonts` e as que o macOS baixa sob demanda). Ficam sempre ativas e não podem ser movidas nem apagadas, nem pelo GESFONT. A aba Nativas mostra todas, com cadeado. Dá para ver, comparar, combinar e pôr em coleções.
- **Instaladas** são as que alguém instalou depois, por fora do GESFONT: em `~/Library/Fonts` (só o seu usuário) ou em `/Library/Fonts` (todos os usuários). Elas ficam ativas o tempo todo. A aba **Verificação** lista cada família com uma decisão: **Manter** onde está, **Mover para a GESFONT** (para a pasta "Importadas do sistema", com a opção de continuar ativa, agora controlada pelo app) ou **Apagar** (vai para a Lixeira). Nada muda até você clicar em **Aplicar decisões**. Fontes instaladas para todos os usuários pedem a senha do Mac uma vez. As que você mantém saem da lista e ficam na aba Mantidas, de onde dá para revisar de novo. Quando alguém instala uma fonte nova no sistema, o GESFONT percebe e ela aparece na Verificação.

**Combinar.** Teste título, subtítulo e texto juntos, cada um com fonte, estilo e tamanho próprios. O subtítulo pode ficar como digitado ou em maiúsculas. Em **Cores**, escolha uma das seis paletas prontas ou defina fundo, título, subtítulo, texto, destaque e texto do destaque, pelo seletor ou pelo código hexadecimal. Abaixo do layout, o app mostra o contraste de cada cor com o fundo e avisa quando fica abaixo do recomendado para leitura. O layout de teste tem dois formatos, **Página** e **Post quadrado**, e todos os textos são editáveis. **Copiar especificação** copia fontes, tamanhos e cores em texto, pronto para mandar para o cliente ou para a equipe. As combinações salvas guardam as cores também.

**Google Fonts, glifos e comparar** continuam como na versão anterior.

## Atualizações automáticas

O GESFONT procura versão nova nas [Releases deste repositório](https://github.com/thiagosmantovani-hash/gesfont-releases/releases) ao abrir e a cada seis horas. Quando encontra, baixa em segundo plano, confere a integridade do arquivo (SHA-512) e mostra **Reiniciar e atualizar** no rodapé da barra lateral. Ao clicar, o app fecha, troca o GESFONT.app em Aplicativos pela versão nova e abre de novo. Em Ajustes dá para desligar a atualização automática e para verificar na hora. No menu GESFONT também há **Verificar atualizações…**.

O motor de atualização é o `electron-updater`, o equivalente ao Sparkle para apps Electron. O Sparkle em si é para apps nativos do macOS e não roda dentro do Electron. Como o app não tem certificado Developer ID, o macOS não deixa o atualizador padrão trocar o app, por isso o GESFONT usa um instalador próprio (`main/updater.js`) que faz a troca depois de conferir o arquivo. Se algo impedir a troca (app fora de Aplicativos, sem permissão de escrita), o aviso vira **Baixar** e abre a página da versão.

### Publicar uma versão nova

A automação `.github/workflows/release.yml` gera os instaladores num Mac do GitHub (chip Apple e Intel) e publica a Release com o arquivo `latest-mac.yml`, que é o que os apps instalados consultam.

1. Faça as mudanças no código e aumente `"version"` no `package.json` (por exemplo, de 2.1.0 para 2.1.1). Os apps só atualizam para um número maior que o instalado.
2. Envie para a branch `main`. A automação percebe o número novo e começa sozinha. Se o número não mudou, ela não publica nada.
3. Em uns 10 minutos a versão aparece em Releases. Os Macs com o GESFONT recebem a atualização na próxima consulta, em até seis horas, ou na hora com **Verificar atualizações…**.

Para acompanhar ou rodar de novo à mão: aba **Actions** > **Publicar versão** > **Run workflow**.

### Se um dia tiver o certificado da Apple

Com o Apple Developer Program (US$ 99 por ano) o app passa a abrir sem o aviso de desenvolvedor e usa o atualizador padrão. Para ativar: apague `"identity": null` do `package.json` e crie em Settings > Secrets and variables > Actions os segredos `CSC_LINK` (certificado .p12 em base64), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID`, repassando-os no passo "Gerar e publicar" da automação.

## Ajustes

A engrenagem no rodapé da barra lateral abre os ajustes:

- **Pasta principal:** onde fica e como trocar.
- **Exibição das fontes:** tamanho padrão da prévia, velocidade de rolagem, agrupar ou não em famílias, restaurar nomes originais.
- **Textos de exemplo:** um por linha. A primeira linha é o texto padrão das prévias.
- **Comportamento do app:** manter na barra de menus ao fechar, iniciar com o sistema, iniciar oculto e desativar todas as fontes ao sair.
- **Aparência:** automático, claro ou escuro.
- **Coleções:** importar e exportar.
- **Tags:** ocultar tags automáticas ou do Google Fonts.
- **Atualizações:** atualizar automaticamente e verificar agora.
- **Ativação:** pasta de destino, desativar todas, ler de novo as fontes do sistema.

## Atalhos

| Atalho | Ação |
| --- | --- |
| Cmd+O | Adicionar pasta |
| Cmd+Shift+O | Importar arquivos |
| Cmd+Shift+G | Abrir a pasta GESFONT no Finder |
| Cmd+N | Nova coleção |
| Cmd+F | Buscar |
| Cmd+L e Cmd+G | Lista e grade |
| Cmd+1 a Cmd+7 | Biblioteca, Nativas, Google Fonts, Comparar, Combinar, Duplicadas, Verificação do sistema |
| Cmd+ e Cmd- | Aumentar e diminuir a prévia |
| Cmd+R | Atualizar pastas |
| Cmd+, | Ajustes |
| Esc | Voltar dos detalhes |

## Onde ficam os dados

A biblioteca, as coleções, as tags, os nomes de família alterados e os ajustes ficam em `~/Library/Application Support/GESFONT/gesfont.json`. As fontes ficam na pasta GESFONT e nas pastas que você adicionou.

## Estrutura do código

```
main/            processo principal (Node)
  main.js        janela, menu, pasta principal e subpastas, Lixeira, barra de menus, comunicação com a interface
  updater.js     atualizações automáticas (electron-updater e instalador próprio para Mac)
  system.js      fontes do sistema: nativas, instaladas e as decisões da Verificação
  scanner.js     leitura das pastas e dos metadados das fontes (fontkit)
  activator.js   ativação e desativação por sistema operacional
  google.js      catálogo e downloads do Google Fonts
  ttc.js         extrai faces de arquivos TTC para a prévia
  store.js       persistência em JSON
  preload.js     ponte segura entre interface e sistema
  assets/        ícone da janela e da barra de menus
renderer/        interface (HTML, CSS e JavaScript sem build)
  app.js         barra lateral, monograma, navegação, aviso de atualização
  folders.js     árvore de pastas da GESFONT, mover fontes entre pastas
  state.js       estado, ações, duplicadas, tags, nomes de família
  components.js  linha e card de família, menu de contexto, seletores
  views/         listas e grade, detalhes, comparar, combinar, duplicadas, verificação, ajustes
docs/                  site de download (GitHub Pages), lê a última Release pela API
build/icon.png         ícone do app
build/adhoc-sign.js    assinatura ad-hoc do app no Mac
.github/workflows/     automação que gera e publica as versões
```
