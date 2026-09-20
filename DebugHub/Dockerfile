# syntax=docker/dockerfile:1
# =============================================================================
# DebugHub (Vapor / Swift on Server) — 多阶段构建
#   build 阶段：swift:6.0 工具链编译 Release，静态链接 Swift stdlib
#   run   阶段：精简 Ubuntu，仅带运行时依赖，非 root 运行
# 构建上下文应为本目录（DebugHub/），Public/ 静态资源随仓库提交、直接打包
# =============================================================================

# ---- Build image -----------------------------------------------------------
FROM swift:6.0-jammy AS build

WORKDIR /build

# 先只拷贝清单，最大化 resolve 层缓存（仓库未提交 Package.resolved，由此步生成）
COPY ./Package.* ./
RUN swift package resolve

# 再拷贝全部源码
COPY . .

# 编译 Release，静态链接 Swift 运行时（运行镜像无需 swift 运行库）
RUN swift build -c release --static-swift-stdlib

# 收拢产物到 /staging
RUN mkdir -p /staging \
    && cp "$(swift build --package-path /build -c release --show-bin-path)/DebugHub" /staging/ \
    && cp -R /build/Public /staging/Public

# ---- Run image -------------------------------------------------------------
FROM ubuntu:jammy

# 运行时依赖：证书、时区、Foundation 网络（libcurl）、healthcheck 用 curl
RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        tzdata \
        curl \
        libcurl4 \
    && rm -rf /var/lib/apt/lists/*

# 非 root 运行
RUN useradd --user-group --create-home --system --skel /dev/null --home-dir /app vapor

WORKDIR /app
COPY --from=build --chown=vapor:vapor /staging /app

# 数据目录（SQLite 模式或落盘缓存用；postgres 模式不强制需要）
RUN mkdir -p /app/data && chown vapor:vapor /app/data

USER vapor:vapor

EXPOSE 9527

ENTRYPOINT ["./DebugHub"]
CMD ["serve", "--env", "production", "--hostname", "0.0.0.0", "--port", "9527"]
