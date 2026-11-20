# Arquitetura e decisões técnicas

## Camadas

- `src/renderer`: interface React; não acessa diretamente o sistema de arquivos nem o SQLite.
- `src/preload`: expõe somente funções explicitamente permitidas.
- `src/main`: regras de negócio, persistência, relatórios e operações privilegiadas.
- `src/shared`: contratos, tipos e schemas compartilhados.

## Persistência

O SQLite fica na pasta `userData` do Electron. O banco usa WAL, sincronização completa, chaves estrangeiras e índices básicos. Valores monetários são armazenados em centavos inteiros para evitar erros de ponto flutuante. A tela Administração pode executar `PRAGMA integrity_check` e mostrar a localização do arquivo e as contagens de produtos, vendas e movimentações.

Cadastro, edição e arquivamento de produtos são transacionais, incluindo seus registros de auditoria e movimentação inicial. Arquivar é uma exclusão lógica: o produto deixa de aparecer no catálogo, mas permanece no banco para preservar o histórico de vendas e estoque.

Nomes de produtos ativos são comparados sem diferenciar maiúsculas/minúsculas, inclusive em caracteres acentuados. Ao cadastrar um nome existente, a interface pede confirmação; confirmando, a quantidade informada é somada ao estoque atual em uma transação, com movimentação e auditoria, sem alterar categoria ou preços do produto existente. A edição também impede renomear um produto para o nome de outro ativo.

## Venda

O processo principal valida os dados, consolida itens repetidos, verifica o estoque atual e executa venda, itens, baixa de estoque, movimentação e auditoria dentro de uma transação SQLite. Se uma etapa falhar, toda a transação é revertida.

## Cancelamento

Cancelamento exige senha administrativa. A transação marca a venda como cancelada, devolve as quantidades e cria movimentos de estorno. Os itens da venda são preservados para auditoria.

## Credenciais administrativas

A senha e o código de recuperação são armazenados como hashes scrypt com salts aleatórios. O código de recuperação é mostrado uma única vez na configuração inicial; redefinir a senha o invalida e grava um código novo na mesma transação da alteração da senha. Para bancos antigos, `npm run admin:setup-recovery` provisiona o código localmente com o aplicativo fechado, sem alterar produtos ou vendas. Não há senha mestra embutida no aplicativo.

## Limitações e próximas melhorias obrigatórias

- Implementar edição e confirmação de quantidade inicial separada do ajuste.
- Adicionar restauração de backup com validação de integridade e confirmação administrativa.
- Adicionar testes de integração de serviços com banco temporário.
- Adicionar paginação e filtros para histórico.
- Tratar fuso horário e formato de data/hora local nos relatórios.
- Revisar segurança operacional e proteção do arquivo SQLite no Windows.
- Testar instalador e atualizações em Windows limpo antes da entrega.
