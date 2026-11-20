# Stock Fácil

Aplicativo desktop local para controle de produtos, estoque, vendas e operações do seu negócio.

## Stack

- Electron + electron-vite
- React + TypeScript
- SQLite (`better-sqlite3`)
- Zod para validação
- PDFKit e ExcelJS para relatórios
- Vitest para testes unitários

## Requisitos

- Node.js LTS (recomendado Node 22)
- npm
- macOS para desenvolvimento atual; Windows para validar e gerar o instalador final Windows

## Instalação no macOS

Instale Homebrew caso ainda não tenha:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Instale Node e Git:
```bash
brew update
brew install node git
node -v
npm -v
```

Na pasta do projeto:
```bash
npm install
npm run typecheck
npm test
npm run dev
```

## Gerar instalador

macOS:
```bash
npm run dist:mac
```

Windows x64:
```bash
npm run dist:win
```

**Importante:** o projeto usa `better-sqlite3`, que contém um módulo nativo. Para uma entrega Windows confiável, gere e valide o instalador em Windows x64 (ou em CI Windows) para que a dependência seja compilada para a plataforma correta. Não considere um `.exe` produzido por cross-build no Mac como validado sem teste em Windows.

## Dados e backup

O banco é criado em `app.getPath('userData')`, separado da pasta de instalação. A exportação de backup cria uma cópia SQLite escolhida pelo usuário. Guarde cópias em outro dispositivo ou serviço seguro.

## Recuperação da senha administrativa

Na primeira configuração, o aplicativo gera um código aleatório de recuperação e o mostra uma única vez. Guarde-o fora do computador; somente o hash com salt fica no banco. A recuperação redefine a senha e invalida o código usado, emitindo outro.

Em instalações antigas sem código de recuperação, feche o Stock Fácil e execute `npm run admin:setup-recovery` na pasta do projeto. O comando preserva os demais dados e mostra o novo código uma única vez. Se perder um código já configurado, use `npm run admin:setup-recovery -- --rotate`, também com o aplicativo fechado. A troca normal de senha pede a senha atual.

## Segurança

- `contextIsolation: true`, `nodeIntegration: false` e preload com API IPC allowlist.
- Validação no processo principal com Zod.
- SQL parametrizado.
- Quantidades e valores em centavos no banco.
- Senha administrativa com scrypt, salt aleatório e comparação de hash em tempo constante.
- Transações para venda e estorno.
- Gravações de produtos e arquivamento em transações, com trilha de auditoria.
- Histórico de movimentações e trilha de auditoria.
- Verificação da integridade do banco SQLite disponível na tela Administração.

A senha do aplicativo não impede um usuário com acesso administrativo ao sistema operacional de excluir manualmente o arquivo do banco. Controle de permissões do Windows e backups externos continuam necessários.

## Testes

```bash
npm test
```

Os testes iniciais cobrem validações de produtos, vendas e períodos. Antes da distribuição comercial, acrescente testes de integração do SQLite, IPC, concorrência de vendas, cancelamentos e geração dos arquivos.

## Escopo desta versão inicial

Esta base inclui cadastro, edição, arquivamento, ajustes de estoque, venda, baixa de estoque, cancelamento com estorno, exportação de relatório PDF/XLSX e backup manual.

Ainda precisam ser concluídos/validados antes de uso comercial: restauração de backup com validação, testes de integração, proteção contra manipulação externa do arquivo, assinatura do instalador, política de atualização e homologação em Windows. O sistema não faz integração com adquirentes, emissão fiscal ou conciliação bancária.
