# ==============================================================================
# OmniRoute Free Intelligence Gateway Dockerfile
# Multi-stage, unprivileged, hardened microservice container spec
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependencies & Build Preparation
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /build

COPY deploy/omniroute/package.json ./
COPY deploy/omniroute/server.js ./

# Verify node environment and package integrity
RUN node -e "require('./package.json')"

# ------------------------------------------------------------------------------
# Stage 2: Hardened Unprivileged Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runtime

LABEL maintainer="Rakazo DevOps Team <security@rakazo.com>"
LABEL service="omniroute"
LABEL description="Sovereign Free Intelligence Gateway for Rakazo"

# Install curl for reliable health checks and dumb-init / tini for signal handling
RUN apk add --no-cache curl tini

# Create dedicated unprivileged system group and user (UID/GID 10001:10001)
RUN addgroup -g 10001 -S omniroute && \
    adduser -u 10001 -S omniroute -G omniroute -h /app -s /sbin/nologin

WORKDIR /app

# Copy application artifacts with unprivileged ownership
COPY --from=builder --chown=10001:10001 /build/package.json /app/package.json
COPY --from=builder --chown=10001:10001 /build/server.js /app/server.js

# Hardened security: make application directory read-only for runtime user
RUN chmod 0555 /app && \
    chmod 0444 /app/package.json /app/server.js

# Expose internal gateway port (no host binding by default)
EXPOSE 8080

# Configure production defaults
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    LOG_LEVEL=info

# Switch to unprivileged user
USER 10001:10001

# Container healthcheck
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Entrypoint using tini init for robust signal forwarding
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
