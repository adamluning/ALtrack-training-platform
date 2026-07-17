# ---- Build stage ----
FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o api ./api


# ---- Runtime stage ----
FROM debian:bookworm-slim

WORKDIR /app

# install migrate
RUN apt-get update && apt-get install -y curl \
    && curl -L https://github.com/golang-migrate/migrate/releases/latest/download/migrate.linux-amd64.tar.gz \
    | tar xvz \
    && mv migrate /usr/local/bin/migrate

COPY --from=builder /app/api .
COPY migrations ./migrations

EXPOSE 8080

CMD ["./api"]