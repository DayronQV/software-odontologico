# Gateway público para Render: sirve la SPA y reenvía /api y /ws al backend.
# Render termina el TLS (certificado gestionado) y entrega HTTP plano a este contenedor.
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_IDLE_MINUTES=15
ENV VITE_IDLE_MINUTES=$VITE_IDLE_MINUTES
RUN npm run build

# Sin privilegios de root (usuario nginx)
FROM nginxinc/nginx-unprivileged:1.27-alpine
# nginx sustituye ${PORT}, ${BACKEND_HOSTPORT} y ${NGINX_LOCAL_RESOLVERS} al arrancar (plantillas).
COPY docker/render/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=10000 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
EXPOSE 10000
