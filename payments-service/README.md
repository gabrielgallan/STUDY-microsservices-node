# Description

Microservice responsible for processing e-commerce payments. Integrates with payment gateways and manages transactions, confirmations, refunds, and the financial status of placed orders.

# Running locally

1. Enter the directory
```bash
cd ./payments-service
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