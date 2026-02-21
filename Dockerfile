FROM denoland/deno:latest

WORKDIR /app

COPY config.ts tools.ts bot.ts ./
COPY server/ ./server/

RUN deno cache bot.ts

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-run", "--allow-ffi", "--unstable-ffi", "bot.ts"]
