#!/usr/bin/env bash
# DebugHub Ubuntu 部署脚本
#
# 目标：
# - 面向 Ubuntu/Linux 服务器，不依赖 Homebrew。
# - 默认使用 SQLite，适合单机快速部署。
# - 默认监听 127.0.0.1:9527，便于后续用 Nginx 或 SSH 隧道暴露。
#
# 常用命令：
#   ./deploy-ubuntu.sh --install-deps --sqlite --data-dir /var/lib/debughub --host 127.0.0.1 --port 9527 --no-webui
#   ./deploy-ubuntu.sh --status
#   ./deploy-ubuntu.sh --stop
#   ./deploy-ubuntu.sh --logs

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_NAME="DebugHub"
readonly DEBUGHUB_DIR="$SCRIPT_DIR/DebugHub"
readonly WEBUI_DIR="$SCRIPT_DIR/WebUI"
readonly LOG_FILE="$DEBUGHUB_DIR/deploy.log"
readonly PID_FILE="$DEBUGHUB_DIR/.debughub.pid"
readonly MIN_SWIFT_MAJOR=5
readonly MIN_SWIFT_MINOR=9
readonly MIN_NODE_MAJOR=20

HOST="127.0.0.1"
PORT="9527"
DATA_DIR="/var/lib/debughub"
DATABASE_MODE="sqlite"
BUILD_MODE="release"
BUILD_WEBUI=false
INSTALL_DEPS=false
BUILD_ONLY=false
VERBOSE=false

if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    readonly RED=$'\033[0;31m'
    readonly GREEN=$'\033[0;32m'
    readonly YELLOW=$'\033[1;33m'
    readonly BLUE=$'\033[0;34m'
    readonly GRAY=$'\033[0;90m'
    readonly BOLD=$'\033[1m'
    readonly NC=$'\033[0m'
else
    readonly RED=''
    readonly GREEN=''
    readonly YELLOW=''
    readonly BLUE=''
    readonly GRAY=''
    readonly BOLD=''
    readonly NC=''
fi

timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

ensure_log_dir() {
    [[ -d "$DEBUGHUB_DIR" ]] || return 0
}

write_log() {
    local level="$1"
    local message="$2"
    ensure_log_dir
    printf '[%s] [%s] %s\n' "$(timestamp)" "$level" "$message" >> "$LOG_FILE" 2>/dev/null || true
}

log_info() {
    local message="$1"
    printf '%s[INFO]%s %s\n' "$BLUE" "$NC" "$message"
    write_log "INFO" "$message"
}

log_success() {
    local message="$1"
    printf '%s[OK]%s %s\n' "$GREEN" "$NC" "$message"
    write_log "SUCCESS" "$message"
}

log_warning() {
    local message="$1"
    printf '%s[WARN]%s %s\n' "$YELLOW" "$NC" "$message" >&2
    write_log "WARNING" "$message"
}

log_error() {
    local message="$1"
    printf '%s[ERROR]%s %s\n' "$RED" "$NC" "$message" >&2
    write_log "ERROR" "$message"
}

log_debug() {
    local message="$1"
    if [[ "$VERBOSE" == true ]]; then
        printf '%s[DEBUG]%s %s\n' "$GRAY" "$NC" "$message"
    fi
    write_log "DEBUG" "$message"
}

on_error() {
    local exit_code="$1"
    local line_no="$2"
    log_error "脚本在第 ${line_no} 行失败，退出码: ${exit_code}"
    exit "$exit_code"
}

trap 'on_error $? $LINENO' ERR

show_help() {
    cat <<EOF
${BOLD}DebugHub Ubuntu 部署脚本${NC}

用法:
  ./deploy-ubuntu.sh [选项]

部署选项:
  --sqlite                 使用 SQLite 数据库（默认）
  --data-dir <path>        SQLite 数据目录，默认 /var/lib/debughub
  --host <host>            监听地址，默认 127.0.0.1
  --port <port>            监听端口，默认 9527
  --debug                  Debug 构建
  --release                Release 构建（默认）
  --with-webui             重新构建 WebUI 并复制到 DebugHub/Public
  --no-webui               跳过 WebUI 构建（默认）
  --install-deps           使用 apt 安装缺失的 Ubuntu 依赖
  --build-only             只构建，不启动服务
  --verbose                输出详细日志

服务管理:
  --status                 查看服务状态
  --stop                   停止服务
  --restart                重启服务（不重新构建）
  --logs                   查看实时日志
  --help, -h               显示帮助

示例:
  ./deploy-ubuntu.sh --install-deps --sqlite --data-dir /var/lib/debughub --host 127.0.0.1 --port 9527 --no-webui
  ./deploy-ubuntu.sh --status
EOF
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

is_ubuntu() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=ubuntu' /etc/os-release
}

require_ubuntu() {
    if [[ "$(uname -s)" != "Linux" ]]; then
        log_error "该脚本只适用于 Linux/Ubuntu，当前系统: $(uname -s)"
        return 1
    fi

    if ! is_ubuntu; then
        log_warning "当前不是标准 Ubuntu 系统，脚本仍会继续，但依赖安装命令可能不适用"
    fi
}

run_as_root_or_sudo() {
    if [[ "$(id -u)" -eq 0 ]]; then
        "$@"
    elif command_exists sudo; then
        sudo "$@"
    else
        log_error "当前用户不是 root，且系统没有 sudo，无法执行: $*"
        return 1
    fi
}

apt_package_installed() {
    dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "install ok installed"
}

missing_apt_packages() {
    local packages=(
        ca-certificates
        curl
        git
        clang
        build-essential
        pkg-config
        libssl-dev
        libsqlite3-dev
        zlib1g-dev
        libcurl4-openssl-dev
        libicu-dev
        lsof
    )

    local missing=()
    local package
    for package in "${packages[@]}"; do
        if ! apt_package_installed "$package"; then
            missing+=("$package")
        fi
    done

    printf '%s\n' "${missing[@]}"
}

install_missing_dependencies() {
    local missing=()
    local package
    while IFS= read -r package; do
        [[ -n "$package" ]] && missing+=("$package")
    done < <(missing_apt_packages)

    if [[ "${#missing[@]}" -eq 0 ]]; then
        log_success "Ubuntu 依赖已满足"
        return 0
    fi

    if [[ "$INSTALL_DEPS" != true ]]; then
        log_error "缺少 Ubuntu 依赖: ${missing[*]}"
        log_info "请先执行以下命令，或重新运行脚本并添加 --install-deps:"
        printf '  sudo apt update && sudo apt install -y %s\n' "${missing[*]}"
        return 1
    fi

    log_info "安装 Ubuntu 依赖: ${missing[*]}"
    run_as_root_or_sudo apt update
    run_as_root_or_sudo apt install -y "${missing[@]}"
    log_success "Ubuntu 依赖安装完成"
}

version_gte() {
    local major="$1"
    local minor="$2"
    local required_major="$3"
    local required_minor="$4"

    if (( major > required_major )); then
        return 0
    fi
    if (( major == required_major && minor >= required_minor )); then
        return 0
    fi
    return 1
}

check_swift() {
    if ! command_exists swift; then
        log_error "未找到 swift。请先安装 Swift toolchain，再运行部署脚本"
        log_info "Ubuntu 26.04 可通过 Swiftly 选择 Ubuntu 24.04 toolchain 安装"
        return 1
    fi

    local version
    version="$(swift --version | awk '/Swift version/ {print $3; exit}')"
    if [[ -z "$version" ]]; then
        log_error "无法识别 Swift 版本"
        return 1
    fi

    local major minor
    major="${version%%.*}"
    minor="${version#*.}"
    minor="${minor%%.*}"

    if ! version_gte "$major" "$minor" "$MIN_SWIFT_MAJOR" "$MIN_SWIFT_MINOR"; then
        log_error "Swift 版本过低: $version，需要 >= ${MIN_SWIFT_MAJOR}.${MIN_SWIFT_MINOR}"
        return 1
    fi

    log_success "Swift $version"
}

check_node_for_webui() {
    if [[ "$BUILD_WEBUI" != true ]]; then
        return 0
    fi

    if ! command_exists node || ! command_exists npm; then
        log_error "构建 WebUI 需要 Node.js 和 npm"
        return 1
    fi

    local node_major
    node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    if (( node_major < MIN_NODE_MAJOR )); then
        log_error "Node.js 版本过低: $(node -v)，需要 >= ${MIN_NODE_MAJOR}"
        return 1
    fi

    log_success "Node.js $(node -v)"
    log_success "npm $(npm -v)"
}

check_project_layout() {
    if [[ ! -f "$DEBUGHUB_DIR/Package.swift" ]]; then
        log_error "找不到 $DEBUGHUB_DIR/Package.swift，请在 DebugPlatform 仓库根目录执行脚本"
        return 1
    fi

    if [[ ! -d "$WEBUI_DIR" ]]; then
        log_error "找不到 $WEBUI_DIR"
        return 1
    fi

    log_success "项目结构检查通过"
}

validate_port() {
    if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
        log_error "端口必须是数字: $PORT"
        return 1
    fi
    if (( PORT < 1 || PORT > 65535 )); then
        log_error "端口超出范围: $PORT"
        return 1
    fi
}

get_pid() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid="$(cat "$PID_FILE" 2>/dev/null || true)"
        if [[ -n "$pid" ]] && ps -p "$pid" >/dev/null 2>&1; then
            printf '%s\n' "$pid"
            return 0
        fi
    fi

    # PID 文件丢失时，限定匹配当前仓库构建产物，避免误伤其它 DebugHub。
    pgrep -f "$DEBUGHUB_DIR/.build/.*/DebugHub serve" 2>/dev/null | head -1 || true
}

stop_server() {
    local pid
    pid="$(get_pid)"
    if [[ -z "$pid" ]]; then
        rm -f "$PID_FILE"
        log_warning "服务未在运行"
        return 0
    fi

    log_info "停止服务，PID: $pid"
    kill "$pid" 2>/dev/null || true

    local count=0
    while ps -p "$pid" >/dev/null 2>&1 && (( count < 15 )); do
        sleep 1
        ((++count))
    done

    if ps -p "$pid" >/dev/null 2>&1; then
        log_warning "服务未正常退出，强制终止 PID: $pid"
        kill -9 "$pid" 2>/dev/null || true
    fi

    rm -f "$PID_FILE"
    log_success "服务已停止"
}

show_status() {
    local pid
    pid="$(get_pid)"

    printf '\n%sDebugHub 服务状态%s\n\n' "$BOLD" "$NC"
    if [[ -z "$pid" ]]; then
        log_warning "服务未在运行"
        printf '日志: %s\n' "$LOG_FILE"
        return 0
    fi

    log_success "服务正在运行，PID: $pid"
    ps -fp "$pid" || true
    if command_exists lsof; then
        lsof -Pan -p "$pid" -iTCP -sTCP:LISTEN || true
    fi
    printf '日志: %s\n' "$LOG_FILE"
}

show_logs() {
    ensure_log_dir
    touch "$LOG_FILE"
    log_info "实时日志，按 Ctrl+C 退出"
    tail -f "$LOG_FILE"
}

ensure_data_dir() {
    if [[ "$DATABASE_MODE" != "sqlite" ]]; then
        log_error "deploy-ubuntu.sh 当前只支持 SQLite 部署"
        return 1
    fi

    if [[ ! -d "$DATA_DIR" ]]; then
        log_info "创建数据目录: $DATA_DIR"
        run_as_root_or_sudo mkdir -p "$DATA_DIR"
    fi

    if [[ ! -w "$DATA_DIR" ]]; then
        log_info "调整数据目录权限给当前用户: $DATA_DIR"
        run_as_root_or_sudo chown "$(id -u):$(id -g)" "$DATA_DIR"
    fi

    if [[ ! -w "$DATA_DIR" ]]; then
        log_error "数据目录不可写: $DATA_DIR"
        return 1
    fi

    log_success "数据目录可写: $DATA_DIR"
}

build_webui() {
    if [[ "$BUILD_WEBUI" != true ]]; then
        if [[ ! -f "$DEBUGHUB_DIR/Public/index.html" ]]; then
            log_warning "DebugHub/Public/index.html 不存在，WebUI 可能无法访问；可加 --with-webui 构建"
        else
            log_info "跳过 WebUI 构建，使用已有 DebugHub/Public"
        fi
        return 0
    fi

    log_info "构建 WebUI"
    cd "$WEBUI_DIR"

    if [[ -f package-lock.json ]]; then
        npm ci
    else
        npm install
    fi

    npm run build
    rm -rf "$DEBUGHUB_DIR/Public"
    mkdir -p "$DEBUGHUB_DIR/Public"
    cp -R "$WEBUI_DIR/dist/." "$DEBUGHUB_DIR/Public/"
    log_success "WebUI 构建完成"
}

resolve_swift_dependencies() {
    log_info "解析 Swift 依赖"
    cd "$DEBUGHUB_DIR"
    swift package resolve 2>&1 | tee -a "$LOG_FILE"
    log_success "Swift 依赖解析完成"
}

build_debughub() {
    log_info "编译 DebugHub (${BUILD_MODE})"
    cd "$DEBUGHUB_DIR"

    if [[ "$BUILD_MODE" == "release" ]]; then
        swift build -c release 2>&1 | tee -a "$LOG_FILE"
    else
        swift build 2>&1 | tee -a "$LOG_FILE"
    fi

    local binary
    binary="$(binary_path)"
    if [[ ! -x "$binary" ]]; then
        log_error "编译产物不存在或不可执行: $binary"
        return 1
    fi

    log_success "编译完成: $binary"
}

binary_path() {
    if [[ "$BUILD_MODE" == "release" ]]; then
        printf '%s/.build/release/DebugHub\n' "$DEBUGHUB_DIR"
    else
        printf '%s/.build/debug/DebugHub\n' "$DEBUGHUB_DIR"
    fi
}

check_port_available() {
    if command_exists lsof && lsof -Pan -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        log_error "端口已被占用: $PORT"
        lsof -Pan -iTCP:"$PORT" -sTCP:LISTEN || true
        return 1
    fi
}

healthcheck_host() {
    if [[ "$HOST" == "0.0.0.0" || "$HOST" == "::" ]]; then
        printf '127.0.0.1'
    else
        printf '%s' "$HOST"
    fi
}

wait_for_health() {
    local url="http://$(healthcheck_host):${PORT}/health"
    local count=0

    log_info "等待健康检查: $url"
    while (( count < 30 )); do
        if curl -fsS "$url" >/dev/null 2>&1; then
            log_success "健康检查通过: $url"
            return 0
        fi
        sleep 1
        ((++count))
    done

    log_error "健康检查失败: $url"
    tail -n 80 "$LOG_FILE" || true
    return 1
}

start_server() {
    local binary
    binary="$(binary_path)"
    if [[ ! -x "$binary" ]]; then
        log_error "可执行文件不存在，请先构建: $binary"
        return 1
    fi

    stop_server
    check_port_available

    ensure_log_dir
    touch "$LOG_FILE"

    log_info "启动 DebugHub: http://${HOST}:${PORT}"
    log_info "数据库: SQLite，数据目录: $DATA_DIR"

    (
        cd "$DEBUGHUB_DIR"
        export DATABASE_MODE="$DATABASE_MODE"
        export DATA_DIR="$DATA_DIR"
        nohup "$binary" serve --hostname "$HOST" --port "$PORT" >> "$LOG_FILE" 2>&1 &
        echo "$!" > "$PID_FILE"
    )

    local pid
    pid="$(cat "$PID_FILE")"
    if ! ps -p "$pid" >/dev/null 2>&1; then
        log_error "服务启动失败"
        tail -n 80 "$LOG_FILE" || true
        return 1
    fi

    log_success "服务已启动，PID: $pid"
    wait_for_health
}

restart_server() {
    local binary
    binary="$(binary_path)"
    if [[ ! -x "$binary" ]]; then
        log_error "可执行文件不存在，无法重启: $binary"
        return 1
    fi

    ensure_data_dir
    start_server
}

run_deploy() {
    printf '\n%sDebugHub Ubuntu 部署%s\n\n' "$BOLD" "$NC"

    require_ubuntu
    check_project_layout
    validate_port
    echo "=== Ubuntu deploy started at $(timestamp) ===" >> "$LOG_FILE"

    install_missing_dependencies
    check_swift
    check_node_for_webui
    ensure_data_dir
    build_webui
    resolve_swift_dependencies
    build_debughub

    if [[ "$BUILD_ONLY" == true ]]; then
        log_success "构建完成，未启动服务"
        return 0
    fi

    start_server

    printf '\n部署完成:\n'
    printf '  Web UI: http://%s:%s\n' "$HOST" "$PORT"
    printf '  Health: http://%s:%s/health\n' "$HOST" "$PORT"
    printf '  Log:    %s\n' "$LOG_FILE"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --sqlite)
                DATABASE_MODE="sqlite"
                shift
                ;;
            --data-dir)
                if [[ -z "${2:-}" ]]; then
                    log_error "--data-dir 需要参数"
                    exit 1
                fi
                DATA_DIR="$2"
                shift 2
                ;;
            --host)
                if [[ -z "${2:-}" ]]; then
                    log_error "--host 需要参数"
                    exit 1
                fi
                HOST="$2"
                shift 2
                ;;
            --port)
                if [[ -z "${2:-}" ]]; then
                    log_error "--port 需要参数"
                    exit 1
                fi
                PORT="$2"
                shift 2
                ;;
            --debug)
                BUILD_MODE="debug"
                shift
                ;;
            --release)
                BUILD_MODE="release"
                shift
                ;;
            --with-webui)
                BUILD_WEBUI=true
                shift
                ;;
            --no-webui)
                BUILD_WEBUI=false
                shift
                ;;
            --install-deps)
                INSTALL_DEPS=true
                shift
                ;;
            --build-only)
                BUILD_ONLY=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --status)
                show_status
                exit 0
                ;;
            --stop)
                stop_server
                exit 0
                ;;
            --restart)
                restart_server
                exit 0
                ;;
            --logs)
                show_logs
                exit 0
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    run_deploy
}

main "$@"
