# Build Stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Serve Stage
FROM nginx:alpine

# Copy build artifacts to nginx html dir
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy PDF Worker specifically (React-PDF 7+ uses mjs or js, react-pdf 9 uses pdfjs-dist 4+)
# Let's try to locate it. It is usually in node_modules/pdfjs-dist/build/pdf.worker.min.mjs
COPY --from=builder /app/node_modules/pdfjs-dist/build/pdf.worker.min.mjs /usr/share/nginx/html/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
