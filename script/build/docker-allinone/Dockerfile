# syntax=docker/dockerfile:1
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
ARG MYSQL_IMAGE=mysql:8.4.11

FROM ${MYSQL_IMAGE} AS mysql-runtime
RUN microdnf install -y python3 java-17-openjdk-headless shadow-utils tar gzip \
    && microdnf clean all \
    && groupadd --gid 10001 datavisool \
    && useradd --uid 10001 --gid datavisool --no-create-home --shell /sbin/nologin datavisool \
    && mkdir -p /usr/local/lib/datavisool /datavisool/server /usr/app /config \
        /data/mysql /data/resource /data/logs /data/config \
    && ln -s /data/logs /datavisool/server/logs \
    && ln -s /data/resource /usr/app/resource \
    && python3 --version && java -version && mysql --version && tar --version
COPY patch-mysql-entrypoint.py /tmp/patch-mysql-entrypoint.py
RUN python3 /tmp/patch-mysql-entrypoint.py /usr/local/bin/docker-entrypoint.sh \
    && rm /tmp/patch-mysql-entrypoint.py
WORKDIR /datavisool/server

# The context contains validated native outputs, never application sources.
FROM mysql-runtime AS assembled
ARG APP_VERSION
ARG MYSQL_IMAGE
LABEL org.opencontainers.image.title="DataVisool Web Web (All-in-one)" \
      org.opencontainers.image.version="${APP_VERSION}" \
      io.datavisool.deployment="allinone" \
      io.datavisool.mysql.base="${MYSQL_IMAGE}"
COPY server.jar /datavisool/server/server.jar
COPY component-docs /datavisool/server/component-docs
COPY LICENSE THIRD_PARTY_NOTICES.txt /datavisool/licenses/
COPY runtime.py /usr/local/lib/datavisool/runtime.py
COPY application.yml /config/application.yml

# Flatten the MySQL root filesystem into a scratch stage. This resets inherited
# image metadata, including MySQL's VOLUME /var/lib/mysql.
FROM scratch AS runtime
COPY --from=assembled / /
ARG APP_VERSION
ARG MYSQL_IMAGE
LABEL org.opencontainers.image.title="DataVisool Web Web (All-in-one)" \
      org.opencontainers.image.version="${APP_VERSION}" \
      io.datavisool.deployment="allinone" \
      io.datavisool.mysql.base="${MYSQL_IMAGE}"
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/mysql/bin" \
    SPRING_CONFIG_LOCATION=file:/config/application.yml \
    SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=50.0 -Duser.timezone=Asia/Shanghai" \
    TZ=Asia/Shanghai
WORKDIR /datavisool/server
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
    CMD ["python3", "-u", "/usr/local/lib/datavisool/runtime.py", "healthcheck"]
ENTRYPOINT ["python3", "-u", "/usr/local/lib/datavisool/runtime.py"]
