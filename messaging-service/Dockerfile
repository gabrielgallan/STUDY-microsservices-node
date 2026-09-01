FROM rabbitmq:3-management

ENV RABBITMQ_DEFAULT_USER=admin
ENV RABBITMQ_DEFAULT_PASS=admin

EXPOSE 5672 15672

HEALTHCHECK --interval=30s --timeout=10s --retries=5 \
  CMD rabbitmq-diagnostics -q ping