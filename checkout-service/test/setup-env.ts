process.env.NODE_ENV = 'test'
process.env.PORT = '3003'
process.env.DATABASE_URL ||= 'postgresql://docker:docker@localhost:5433/checkout'
process.env.JWT_SECRET = 'checkout-service-e2e-secret'
