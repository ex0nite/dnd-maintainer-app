# account-admin: one bundled file, no node_modules, no shell scripts. Built by `deploy/qnap/build-account-admin.sh`,
# which drops `server.mjs` next to this file.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server.mjs /tmp/server.mjs
# COPY keeps the ACL a QNAP share puts on the file, which hides it from the `node` user even in mode 0444.
# Writing a fresh file inside the image drops it.
RUN cat /tmp/server.mjs > /app/server.mjs && rm /tmp/server.mjs && chmod 0444 /app/server.mjs
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/admin-api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
