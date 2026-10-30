FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_IDLE_MINUTES=15
ENV VITE_IDLE_MINUTES=$VITE_IDLE_MINUTES
RUN npm run build

# Sin privilegios de root (usuario nginx, puerto 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
