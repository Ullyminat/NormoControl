FROM golang:alpine AS builder

RUN apk add --no-cache gcc musl-dev libreoffice ttf-freefont ttf-liberation ttf-dejavu font-noto font-noto-cjk openjdk11-jre

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -o server cmd/server/main.go

FROM alpine:latest

WORKDIR /app

RUN apk add --no-cache ca-certificates libreoffice ttf-freefont ttf-liberation ttf-dejavu font-noto

COPY --from=builder /app/server .

RUN mkdir -p uploads

EXPOSE 8090

CMD ["./server"]
