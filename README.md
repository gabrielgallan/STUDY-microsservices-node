# Description

A distributed system built as part of the **"Microsserviços com Node"** course, composed of five independent microservices — **users-service**, **products-service**, **checkout-service**, **payments-service**, and **messaging-service** — orchestrated behind an **API Gateway**. The project explores real-world patterns for building, securing, and operating microservices, combining synchronous HTTP communication with asynchronous messaging via RabbitMQ.

# Architecture and Patterns

The system follows a **database-per-service** approach, where each microservice owns and manages its own PostgreSQL database, ensuring loose coupling and independent deployability.

<img width="550" height="320" alt="image" src="https://github.com/user-attachments/assets/2bfad33b-56ae-4855-9d32-eab26a4fed61" />

### API Gateway
 
All external traffic enters through a single **API Gateway**, responsible for:
 
- **Reverse Proxy** — abstracting internal service locations from the client.
- **CORS Protection** — restricting which origins can consume the API.
- **Rate Limiting** — throttling requests to protect services from abuse and overload.

### Resilience Patterns
 
Synchronous communication between services is protected by a set of resilience patterns to prevent cascading failures:
 
- **Circuit Breaker** — stops calls to a failing service after a threshold of errors, allowing it time to recover.
- **Retry** — automatically retries transient failures before surfacing an error.
- **Timeout** — enforces maximum wait times for inter-service calls, avoiding thread/resource exhaustion.

<img width="441" height="471" alt="image" src="https://github.com/user-attachments/assets/afe4d3ec-e552-47d7-8459-06c62bcb4646" />

### Observability
 
Each service exposes:
 
- **Structured Logging** — for traceability across requests and services.
- **Health Checks** — endpoints reporting the service's own status and its critical dependencies (database, message broker, etc.), enabling readiness/liveness monitoring.
### Asynchronous Communication
 
Beyond synchronous REST calls, the system introduces **event-driven communication** using **RabbitMQ**, decoupling services such as `checkout-service` and `payments-service` through message queues handled by the `messaging-service`. This allows services to react to events without direct, blocking dependencies on one another.

# Technologies

<div style="display:flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem;">
    <div style="display:flex; align-items:center; gap: 0.5rem;">
        <img src="https://devicons.io/devicons/icons/nodejs-icon.svg" width="25"/> Node.js
    </div>
    <div style="display:flex; align-items:center; gap: 0.5rem;">
        <img src="https://devicons.io/devicons/icons/nestjs.svg" width="25"/> NestJS    
    </div>
    <div style="display:flex; align-items:center; gap: 0.5rem;">
        <img src="https://devicons.io/devicons/icons/docker-icon.svg" width="25"/> Docker
    </div>
    <div style="display:flex; align-items:center; gap: 0.5rem;">
        <img src="https://devicons.io/devicons/icons/postgresql.svg" width="25"/> PostgreSQL
    </div>
    <div style="display:flex; align-items:center; gap: 0.5rem;">
        <img src="https://devicons.io/devicons/icons/jwt-icon.svg" width="25"/> JWT
    </div>
    <div style="display:flex; align-items:center; gap: 0.5rem;">
        <img src="https://devicons.io/devicons/icons/rabbitmq-icon.svg" width="25"/> RabbitMQ
    </div>
</div>

# Documentations

Each microservice exposes its own Swagger documentation at the `/api` route, describing its individual endpoints, DTOs, and request/response contracts.
 
The **API Gateway** aggregates and documents the entire public-facing API in a unified reference, available at `/reference`.

Additionally, each microservice contains its own concise `README.md` with instructions on how to install and run it locally.
