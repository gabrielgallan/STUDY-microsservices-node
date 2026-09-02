# Description

Microservice responsible for the e-commerce product catalog. Handles product registration, listing products by seller, categorization, and inventory management, providing the data needed for catalog display and integration with the other services.

# Running locally

1. Enter the directory
```bash
cd ./products-service
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