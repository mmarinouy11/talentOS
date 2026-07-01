FROM node:22-slim
RUN apt-get update && apt-get install -y poppler-utils openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
ENV NODE_ENV=production
CMD ["npm", "start"]
