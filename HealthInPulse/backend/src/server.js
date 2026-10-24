require('dotenv').config();
const http = require('http');
const app  = require('./app');
const { initSocket } = require('./config/socket');
const prisma = require('./config/database');
const logger = require('./utils/logger');
const kbRepository = require('./services/clinical/kb/kbRepository');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Inicializa Socket.io no mesmo servidor HTTP
initSocket(server);

const ensureKnowledgeBase = async () => {
  try {
    const { action, counts } = await kbRepository.ensureSeeded();
    const kb = await kbRepository.get();
    const created = Object.values(counts).reduce((a, b) => a + b, 0);
    const what = action === 'none' ? 'em dia'
      : action === 'replace' ? 'gravada a partir do seed'
      : created ? `${created} itens novos do seed (edições da médica mantidas)` : 'editada pela médica, sem itens novos';
    logger.info(`🧠 Base de conhecimento v${kb.version}: ${kb.conditions.length} condições, ${what}`);
  } catch (err) {
    // P2021: tabela não existe; P2022: coluna não existe. Os dois são banco
    // criado antes do schema novo (ex.: o dev.db do notebook do stand).
    if (err.code === 'P2021' || err.code === 'P2022') {
      throw new Error('O banco está desatualizado em relação ao schema (faltam tabelas ou colunas '
        + 'da base de conhecimento). Rode `npm run setup` na raiz (mantém seus dados) ou `npm run db:reset`.');
    }
    throw err;
  }
};

const start = async () => {
  try {
    // Testa a conexão com o banco antes de subir
    await prisma.$connect();
    logger.info('✅ Banco de dados conectado');

    // Base de conhecimento do motor clínico: cria/completa a partir do JS
    // e já deixa o kb em cache, para a primeira triagem não esperar.
    await ensureKnowledgeBase();

    server.listen(PORT, () => {
      logger.info(`🚀 Servidor rodando na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    logger.error('❌ Falha ao iniciar o servidor:', err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} recebido — encerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Servidor encerrado com sucesso');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();
