# syntax=docker/dockerfile:1

# 1. Build Frontend
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 2. Build Backend Go
FROM --platform=$BUILDPLATFORM golang:alpine AS backend-builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} go build -ldflags="-w -s" -o dist/nas-panel cmd/server/main.go

# 3. Final Minimal Image
FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

# Copy binary and frontend assets
COPY --from=backend-builder /app/dist/nas-panel /app/nas-panel
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Persistent directory for SQLite DB
VOLUME [ "/app/data" ]
ENV PORT=8080
ENV DB_PATH=/app/data/nas_panel.db

EXPOSE 8080
CMD ["/app/nas-panel"]
