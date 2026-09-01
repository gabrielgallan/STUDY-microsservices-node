# Description

Microservice responsible for managing platform users. Handles registration, authentication, profile updates, and personal data, exposing endpoints for querying and maintaining account information.

# Running locally

1. Enter the directory
```bash
cd ./users-service
```

2. Install dependencies
```bash
pnpm i
```

3. Run docker compose
```bash
docker compose up -d
```

4. Create and configure .env based on .env.example

5. Start server
```bash
pnpm start:dev
```