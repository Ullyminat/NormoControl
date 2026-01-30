# Builder Stage
FROM golang:alpine AS builder

# Install build dependencies (needed for SQLite CGO)
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy dependency files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
# CGO_ENABLED=1 is required for go-sqlite3
RUN CGO_ENABLED=1 GOOS=linux go build -o server cmd/server/main.go

# Final Stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates libreoffice ttf-freefont ttf-liberation ttf-dejavu font-noto

# Copy binary from builder
COPY --from=builder /app/server .

# Create directory for uploads and DB
RUN mkdir -p uploads

# Expose port
EXPOSE 8090

# Run
CMD ["./server"]
