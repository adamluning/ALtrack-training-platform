FROM node:18-alpine AS build
WORKDIR /app

# Install frontend deps and copy Chart.js UMD into frontend/vendor
COPY frontend/package.json ./package.json
COPY frontend/package-lock.json ./package-lock.json
RUN npm ci
RUN mkdir -p /app/frontend/vendor && cp node_modules/chart.js/dist/chart.umd.min.js /app/frontend/vendor/chart.umd.min.js || true

FROM nginx:alpine

# Copy static frontend files
COPY frontend /usr/share/nginx/html
# Copy bundled vendor files produced during build
COPY --from=build /app/frontend/vendor /usr/share/nginx/html/vendor
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80