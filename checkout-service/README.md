# Description

Microservice responsible for orchestrating the e-commerce checkout flow. Consolidates cart items, calculates totals (shipping, discounts, and final amount), and coordinates communication between the products, users, and payments services to complete an order.

# Running locally

1. Enter the directory
```bash
cd ./checkout-service
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