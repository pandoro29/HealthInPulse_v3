#!/bin/sh
# Prepara o banco e sobe o servidor. Roda a cada start do container.
set -e

# Sem segredos JWT o backend não assina token. Na demo, gera na hora; as
# sessões caem a cada restart. Para mantê-las, defina as variáveis no host.
for var in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  if [ -z "$(printenv "$var")" ]; then
    export "$var=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
    echo "[entrypoint] $var não definido: gerei um temporário"
  fi
done

# Caminho relativo no DATABASE_URL é relativo ao schema.prisma, como no Prisma
db_file="${DATABASE_URL#file:}"
case "$db_file" in
  /*) ;;
  *)  db_file="src/prisma/${db_file#./}" ;;
esac

# Seed que falha no meio deixa o banco pela metade. Sem isto, o próximo
# start veria o arquivo, pularia o seed e subiria com a demo incompleta.
# O banco vai para o lado (.failed, para investigar) e o container sai com
# erro: o próximo start recria e semeia do zero.
seed() {
  if ! node src/prisma/seed.js; then
    echo "[entrypoint] seed falhou: banco movido para $db_file.failed"
    mv -f "$db_file" "$db_file.failed" 2>/dev/null || true
    # Journal do SQLite junto: largado ao lado de um banco novo, seria "aplicado" nele
    mv -f "$db_file-journal" "$db_file.failed-journal" 2>/dev/null || true
    exit 1
  fi
}

# SEED_ON_START=true: recria o banco do zero a cada start (demo sempre limpa)
if [ "$SEED_ON_START" = "true" ]; then
  ./node_modules/.bin/prisma db push --skip-generate --force-reset --accept-data-loss
  seed
elif [ ! -f "$db_file" ]; then
  # Banco novo (primeiro start, ou disco efêmero do plano grátis) = dados da demo
  ./node_modules/.bin/prisma db push --skip-generate
  seed
else
  ./node_modules/.bin/prisma db push --skip-generate
fi

exec "$@"
