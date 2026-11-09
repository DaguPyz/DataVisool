# syntax=docker/dockerfile:1
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
ARG RUNTIME_IMAGE=eclipse-temurin:17-jre-jammy

# These are validated copies of the native build outputs without embedded config.
FROM ${RUNTIME_IMAGE} AS runtime
ARG APP_VERSION
LABEL org.opencontainers.image.title="DataVisool Web Web" \
      org.opencontainers.image.version="${APP_VERSION}"
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 datavisool \
    && useradd --uid 10001 --gid datavisool --no-create-home --shell /usr/sbin/nologin datavisool
WORKDIR /datavisool/server
COPY server.jar ./server.jar
COPY component-docs ./component-docs
COPY LICENSE THIRD_PARTY_NOTICES.txt /datavisool/licenses/
COPY --chmod=755 entrypoint.sh /usr/local/bin/datavisool-entrypoint
COPY --chmod=755 healthcheck.sh /usr/local/bin/datavisool-healthcheck
ENV SPRING_CONFIG_LOCATION=file:/config/application.yml \
    SPRING_PROFILES_ACTIVE=prod \
    TZ=Asia/Shanghai
EXPOSE 8080
USER 10001:10001
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
    CMD ["/usr/local/bin/datavisool-healthcheck"]
ENTRYPOINT ["/usr/local/bin/datavisool-entrypoint"]

