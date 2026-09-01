process.env.NODE_ENV = 'test'
process.env.PORT = '3002'
process.env.DATABASE_URL = 'postgresql://docker:docker@localhost:5436/products'
process.env.JWT_SECRET = 'products-service-e2e-secret'
