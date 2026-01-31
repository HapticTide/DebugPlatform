#!/bin/bash
# deploy.sh
# DebugHub 部署脚本
#
# 用法:
#   ./deploy.sh              # 使用默认配置启动
#   ./deploy.sh --port 9527  # 指定端口
#   ./deploy.sh --sqlite     # 使用 SQLite 数据库
#   ./deploy.sh --build-only # 仅编译不运行
#   ./deploy.sh --with-webui # 同时构建 WebUI
#   ./deploy.sh --help       # 显示帮助
#
# Created by Sun on 2025/12/02.
# Copyright © 2025 Sun. All rights reserved.

# ============================================================================
# 严格模式和错误处理
# ============================================================================

# -e: 命令失败时退出
# -u: 使用未定义变量时报错
# -o pipefail: 管道中任何命令失败都算失败
set -euo pipefail

# 捕获错误并显示行号
trap 'on_error $? $LINENO' ERR

# 捕获退出信号进行清理
trap 'on_exit' EXIT

# 捕获中断信号
trap 'on_interrupt' INT TERM

# ============================================================================
# 全局变量
# ============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
readonly PROJECT_NAME="DebugHub"
readonly DEBUGHUB_DIR="$SCRIPT_DIR/DebugHub"
readonly WEBUI_DIR="$SCRIPT_DIR/WebUI"
readonly LOG_FILE="$DEBUGHUB_DIR/deploy.log"
readonly PID_FILE="$DEBUGHUB_DIR/.debughub.pid"
readonly MIN_SWIFT_VERSION="5.9"
readonly MIN_NODE_VERSION="18"

# 运行时状态
CLEANUP_NEEDED=false
START_TIME=$(date +%s)

# 默认配置
DEFAULT_PORT=9527
DEFAULT_HOST="0.0.0.0"
DATABASE_MODE="postgres"
BUILD_MODE="release"
BUILD_WEBUI=false
SKIP_WEBUI_CHECK=false
DATA_DIR=""
VERBOSE=false

# PostgreSQL 默认配置
POSTGRES_USER="${POSTGRES_USER:-debug_hub}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-debug_hub_password}"
POSTGRES_DB="${POSTGRES_DB:-debug_hub}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# 颜色输出（支持 NO_COLOR 环境变量）
if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    readonly RED=$'\033[0;31m'
    readonly GREEN=$'\033[0;32m'
    readonly YELLOW=$'\033[1;33m'
    readonly BLUE=$'\033[0;34m'
    readonly CYAN=$'\033[0;36m'
    readonly GRAY=$'\033[0;90m'
    readonly BOLD=$'\033[1m'
    readonly NC=$'\033[0m'
else
    readonly RED=''
    readonly GREEN=''
    readonly YELLOW=''
    readonly BLUE=''
    readonly CYAN=''
    readonly GRAY=''
    readonly BOLD=''
    readonly NC=''
fi

# ============================================================================
# 日志函数
# ============================================================================

# 获取时间戳
timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

# 写入日志文件
write_log() {
    local level="$1"
    local message="$2"
    echo "[$(timestamp)] [$level] $message" >> "$LOG_FILE" 2>/dev/null || true
}

log_info() {
    local message="$1"
    echo -e "${BLUE}[INFO]${NC} $message"
    write_log "INFO" "$message"
}

log_success() {
    local message="$1"
    echo -e "${GREEN}[✓]${NC} $message"
    write_log "SUCCESS" "$message"
}

log_warning() {
    local message="$1"
    echo -e "${YELLOW}[WARNING]${NC} $message" >&2
    write_log "WARNING" "$message"
}

log_error() {
    local message="$1"
    echo -e "${RED}[ERROR]${NC} $message" >&2
    write_log "ERROR" "$message"
}

log_debug() {
    local message="$1"
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${GRAY}[DEBUG]${NC} $message"
    fi
    write_log "DEBUG" "$message"
}

log_step() {
    local step="$1"
    local total="$2"
    local message="$3"
    echo -e "${CYAN}[$step/$total]${NC} ${BOLD}$message${NC}"
    write_log "STEP" "[$step/$total] $message"
}

# ============================================================================
# 错误处理和清理
# ============================================================================

on_error() {
    local exit_code=$1
    local line_number=$2
    log_error "脚本在第 $line_number 行发生错误 (退出码: $exit_code)"
    log_error "查看日志获取详情: $LOG_FILE"
}

on_exit() {
    local exit_code=$?
    local elapsed=$(($(date +%s) - START_TIME))
    
    if [[ $exit_code -eq 0 ]]; then
        log_debug "脚本正常退出，耗时 ${elapsed}s"
    else
        log_debug "脚本异常退出 (退出码: $exit_code)，耗时 ${elapsed}s"
    fi
    
    # 清理临时文件
    if [[ "$CLEANUP_NEEDED" == true ]]; then
        cleanup
    fi
}

on_interrupt() {
    echo ""
    log_warning "收到中断信号，正在停止..."
    CLEANUP_NEEDED=true
    exit 130
}

cleanup() {
    log_debug "执行清理操作..."
    # 清理 PID 文件
    [[ -f "$PID_FILE" ]] && rm -f "$PID_FILE"
}

# ============================================================================
# 工具函数
# ============================================================================

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 版本比较: returns 0 if $1 >= $2
version_gte() {
    local v1="${1#v}"
    local v2="${2#v}"
    printf '%s\n%s\n' "$v2" "$v1" | sort -V -C
}

# 验证端口号
validate_port() {
    local port="$1"
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        log_error "无效的端口号: $port (必须是数字)"
        return 1
    fi
    if [[ "$port" -lt 1 || "$port" -gt 65535 ]]; then
        log_error "端口号超出范围: $port (有效范围: 1-65535)"
        return 1
    fi
    if [[ "$port" -lt 1024 ]] && [[ $EUID -ne 0 ]]; then
        log_warning "端口 $port < 1024 需要 root 权限"
    fi
    return 0
}

# 检查端口是否被占用，如果是 DebugHub 进程则自动杀掉
check_port_available() {
    local port="$1"
    # 只检查 LISTEN 状态的进程（不包括连接中的客户端）
    if lsof -sTCP:LISTEN -i ":$port" >/dev/null 2>&1; then
        local process=$(lsof -sTCP:LISTEN -i ":$port" -t 2>/dev/null | head -1)
        local pname=""
        local ppath=""
        if [[ -n "$process" ]]; then
            # 获取进程名和完整命令路径
            pname=$(ps -p "$process" -o comm= 2>/dev/null || echo "unknown")
            ppath=$(ps -p "$process" -o command= 2>/dev/null || echo "")
        fi
        
        # 检查是否是 DebugHub 进程（检查路径中是否包含 DebugHub）
        if [[ "$ppath" == *"DebugHub"* ]] || [[ "$(basename "$pname")" == "DebugHub" ]]; then
            log_info "端口 $port 被旧的 DebugHub 进程占用 (PID: $process)，正在停止..."
            kill "$process" 2>/dev/null || true
            
            # 等待进程退出
            local count=0
            while ps -p "$process" > /dev/null 2>&1 && [[ $count -lt 5 ]]; do
                sleep 1
                ((count++))
            done
            
            # 如果还没退出，强制杀掉
            if ps -p "$process" > /dev/null 2>&1; then
                log_warning "进程未响应，强制终止..."
                kill -9 "$process" 2>/dev/null || true
                sleep 1
            fi
            
            # 清理 PID 文件
            rm -f "$PID_FILE"
            log_success "旧进程已停止"
            return 0
        fi
        
        log_error "端口 $port 已被占用 (进程: $pname, PID: $process)"
        log_info "释放端口: kill $process 或使用其他端口: --port <新端口>"
        return 1
    fi
    return 0
}

# 检查磁盘空间
check_disk_space() {
    local required_mb="${1:-500}"
    local path="${2:-$SCRIPT_DIR}"
    
    local available_kb
    if [[ "$(uname)" == "Darwin" ]]; then
        available_kb=$(df -k "$path" | awk 'NR==2 {print $4}')
    else
        available_kb=$(df -k "$path" | awk 'NR==2 {print $4}')
    fi
    
    local available_mb=$((available_kb / 1024))
    
    if [[ $available_mb -lt $required_mb ]]; then
        log_error "磁盘空间不足: 需要 ${required_mb}MB, 可用 ${available_mb}MB"
        return 1
    fi
    
    log_debug "磁盘空间检查通过: 可用 ${available_mb}MB"
    return 0
}

# 检查目录权限
check_directory_writable() {
    local dir="$1"
    local test_file="$dir/.write_test_$$"
    
    if ! mkdir -p "$dir" 2>/dev/null; then
        log_error "无法创建目录: $dir"
        return 1
    fi
    
    if ! touch "$test_file" 2>/dev/null; then
        log_error "目录不可写: $dir"
        return 1
    fi
    
    rm -f "$test_file"
    return 0
}

# 格式化时间
format_duration() {
    local seconds=$1
    if [[ $seconds -lt 60 ]]; then
        echo "${seconds}s"
    elif [[ $seconds -lt 3600 ]]; then
        echo "$((seconds / 60))m $((seconds % 60))s"
    else
        echo "$((seconds / 3600))h $((seconds % 3600 / 60))m"
    fi
}

# ============================================================================
# 依赖检查与安装
# ============================================================================

install_homebrew() {
    if command_exists brew; then
        log_success "Homebrew 已安装"
        return 0
    fi
    
    log_info "安装 Homebrew..."
    
    # 检查网络连接
    if ! curl -sI https://raw.githubusercontent.com >/dev/null 2>&1; then
        log_error "无法访问 GitHub，请检查网络连接"
        return 1
    fi
    
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # 添加到 PATH
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    else
        log_error "Homebrew 安装后未找到可执行文件"
        return 1
    fi
    
    log_success "Homebrew 安装完成"
}

check_swift() {
    if ! command_exists swift; then
        log_error "Swift 未安装"
        log_info "请安装 Xcode Command Line Tools:"
        log_info "  xcode-select --install"
        return 1
    fi
    
    local swift_version
    # 匹配 "Apple Swift version X.Y" 或 "Swift version X.Y"
    swift_version=$(swift --version 2>&1 | grep -oE 'Swift version [0-9]+\.[0-9]+(\.[0-9]+)?' | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
    
    if [[ -z "$swift_version" ]]; then
        log_warning "无法检测 Swift 版本"
    elif ! version_gte "$swift_version" "$MIN_SWIFT_VERSION"; then
        log_error "Swift 版本过低: $swift_version (需要 >= $MIN_SWIFT_VERSION)"
        return 1
    fi
    
    log_success "Swift $swift_version"
    return 0
}

# 查找合适版本的 Node.js
find_suitable_node() {
    local node_path=""
    local node_version=""
    
    # 优先使用 Homebrew 安装的 Node.js
    if [[ -x "/opt/homebrew/bin/node" ]]; then
        node_path="/opt/homebrew/bin/node"
        node_version=$("$node_path" --version 2>&1 | grep -oE '[0-9]+' | head -1)
        if [[ $node_version -ge $MIN_NODE_VERSION ]]; then
            echo "$node_path"
            return 0
        fi
    fi
    
    # 检查 /usr/local/bin (Intel Mac Homebrew)
    if [[ -x "/usr/local/bin/node" ]]; then
        node_path="/usr/local/bin/node"
        node_version=$("$node_path" --version 2>&1 | grep -oE '[0-9]+' | head -1)
        if [[ $node_version -ge $MIN_NODE_VERSION ]]; then
            echo "$node_path"
            return 0
        fi
    fi
    
    # 回退到 PATH 中的 node
    if command_exists node; then
        echo "node"
        return 0
    fi
    
    return 1
}

check_node() {
    local node_cmd
    node_cmd=$(find_suitable_node) || {
        log_error "未找到 Node.js >= v$MIN_NODE_VERSION"
        log_info "安装 Node.js:"
        log_info "  brew install node"
        return 1
    }
    
    # 导出 NODE 和 NPM 路径供后续使用
    export NODE_CMD="$node_cmd"
    if [[ "$node_cmd" != "node" ]]; then
        local node_dir
        node_dir=$(dirname "$node_cmd")
        export NPM_CMD="$node_dir/npm"
        # 临时将正确的 Node 路径加到 PATH 最前面
        export PATH="$node_dir:$PATH"
        log_info "使用 Node.js: $node_cmd"
    else
        export NPM_CMD="npm"
    fi
    
    local node_version
    node_version=$("$NODE_CMD" --version 2>&1 | grep -oE '[0-9]+' | head -1)
    
    if [[ -z "$node_version" ]]; then
        log_warning "无法检测 Node.js 版本"
    elif [[ $node_version -lt $MIN_NODE_VERSION ]]; then
        log_error "Node.js 版本过低: v$node_version (需要 >= v$MIN_NODE_VERSION)"
        return 1
    fi
    
    if ! command -v "$NPM_CMD" &> /dev/null; then
        log_error "npm 未安装"
        return 1
    fi
    
    log_success "Node.js v$node_version ($NODE_CMD)"
    return 0
}

install_postgresql() {
    if command_exists psql; then
        local pg_version
        pg_version=$(psql --version 2>&1 | grep -oE '[0-9]+' | head -1)
        log_success "PostgreSQL $pg_version 已安装"
    else
        log_info "安装 PostgreSQL..."
        brew install postgresql@17 || {
            log_error "PostgreSQL 安装失败"
            return 1
        }
        log_success "PostgreSQL 安装完成"
    fi
    
    # 确保 PostgreSQL 命令在 PATH 中
    local pg_paths=(
        "/opt/homebrew/opt/postgresql@17/bin"
        "/opt/homebrew/opt/postgresql@16/bin"
        "/opt/homebrew/opt/postgresql@15/bin"
        "/usr/local/opt/postgresql@17/bin"
        "/usr/local/opt/postgresql@16/bin"
    )
    
    for pg_path in "${pg_paths[@]}"; do
        if [[ -d "$pg_path" ]]; then
            export PATH="$pg_path:$PATH"
            log_debug "PostgreSQL PATH: $pg_path"
            break
        fi
    done
    
    return 0
}

start_postgresql() {
    log_info "检查 PostgreSQL 服务..."
    
    # 检查服务是否运行
    if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -t 1 >/dev/null 2>&1; then
        log_success "PostgreSQL 服务运行中 ($POSTGRES_HOST:$POSTGRES_PORT)"
        return 0
    fi
    
    log_info "尝试启动 PostgreSQL..."
    
    # 尝试通过 brew services 启动
    local started=false
    for pg_service in postgresql@17 postgresql@16 postgresql; do
        if brew services list 2>/dev/null | grep -q "$pg_service"; then
            log_debug "尝试启动 $pg_service..."
            if brew services start "$pg_service" 2>/dev/null; then
                started=true
                break
            fi
        fi
    done
    
    # 如果 brew services 失败，尝试 pg_ctl
    if [[ "$started" != true ]]; then
        local data_dirs=(
            "/opt/homebrew/var/postgresql@17"
            "/opt/homebrew/var/postgresql@16"
            "/opt/homebrew/var/postgres"
            "/usr/local/var/postgres"
        )
        
        for data_dir in "${data_dirs[@]}"; do
            if [[ -d "$data_dir" ]]; then
                log_debug "尝试从 $data_dir 启动..."
                if pg_ctl -D "$data_dir" start -l "$data_dir/server.log" -w -t 30 2>/dev/null; then
                    started=true
                    break
                fi
            fi
        done
    fi
    
    # 等待服务就绪
    if [[ "$started" == true ]]; then
        log_info "等待 PostgreSQL 就绪..."
        local max_wait=30
        local waited=0
        while [[ $waited -lt $max_wait ]]; do
            if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -t 1 >/dev/null 2>&1; then
                log_success "PostgreSQL 服务已启动"
                return 0
            fi
            sleep 1
            ((waited++))
        done
    fi
    
    # 启动失败
    log_error "PostgreSQL 服务启动失败"
    echo ""
    log_info "请手动启动 PostgreSQL，推荐使用 Docker:"
    echo ""
    echo -e "  ${CYAN}docker run -d --name debughub-postgres \\\\${NC}"
    echo -e "    ${CYAN}-e POSTGRES_USER=$POSTGRES_USER \\\\${NC}"
    echo -e "    ${CYAN}-e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \\\\${NC}"
    echo -e "    ${CYAN}-e POSTGRES_DB=$POSTGRES_DB \\\\${NC}"
    echo -e "    ${CYAN}-p $POSTGRES_PORT:5432 \\\\${NC}"
    echo -e "    ${CYAN}postgres:17${NC}"
    echo ""
    log_info "或使用 SQLite 模式: ./deploy.sh --sqlite"
    return 1
}

setup_database() {
    log_info "配置数据库..."
    
    local psql_cmd="psql -h $POSTGRES_HOST -p $POSTGRES_PORT"
    
    # 检查是否能连接到 postgres 数据库
    if ! $psql_cmd postgres -c "SELECT 1;" >/dev/null 2>&1; then
        log_warning "无法连接到 postgres 数据库，跳过初始化"
        log_info "请确保数据库用户和数据库已创建"
        return 0
    fi
    
    # 检查并创建用户
    local user_exists
    user_exists=$($psql_cmd postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$POSTGRES_USER'" 2>/dev/null || echo "0")
    
    if [[ "$user_exists" != "1" ]]; then
        log_info "创建数据库用户: $POSTGRES_USER"
        $psql_cmd postgres -c "CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';" 2>/dev/null || {
            log_warning "用户创建失败，可能已存在或权限不足"
        }
    else
        log_debug "用户已存在: $POSTGRES_USER"
    fi
    
    # 检查并创建数据库
    local db_exists
    db_exists=$($psql_cmd postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" 2>/dev/null || echo "0")
    
    if [[ "$db_exists" != "1" ]]; then
        log_info "创建数据库: $POSTGRES_DB"
        $psql_cmd postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;" 2>/dev/null || {
            log_warning "数据库创建失败，可能已存在或权限不足"
        }
        $psql_cmd postgres -c "GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;" 2>/dev/null || true
    else
        log_debug "数据库已存在: $POSTGRES_DB"
    fi
    
    # 验证连接
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" >/dev/null 2>&1; then
        log_success "数据库连接验证成功"
        return 0
    else
        log_error "数据库连接验证失败"
        log_info "请检查用户名和密码配置:"
        log_info "  POSTGRES_USER=$POSTGRES_USER"
        log_info "  POSTGRES_DB=$POSTGRES_DB"
        return 1
    fi
}

# ============================================================================
# 构建函数
# ============================================================================

# 检测 WebUI 是否需要重新构建
# 比较 WebUI/src 和 DebugHub/Public 的修改时间
check_webui_needs_rebuild() {
    local public_dir="$DEBUGHUB_DIR/Public"
    local src_dir="$WEBUI_DIR/src"
    
    # 如果 Public 目录不存在或为空，需要构建
    if [[ ! -d "$public_dir" ]] || [[ -z "$(ls -A "$public_dir" 2>/dev/null)" ]]; then
        log_debug "Public 目录为空，需要构建 WebUI"
        return 0
    fi
    
    # 如果 index.html 不存在，需要构建
    if [[ ! -f "$public_dir/index.html" ]]; then
        log_debug "Public/index.html 不存在，需要构建 WebUI"
        return 0
    fi
    
    # 如果 src 目录不存在，无法构建
    if [[ ! -d "$src_dir" ]]; then
        log_debug "WebUI/src 目录不存在，跳过构建"
        return 1
    fi
    
    # 获取 Public/index.html 的修改时间
    local public_mtime
    public_mtime=$(stat -f %m "$public_dir/index.html" 2>/dev/null || echo "0")
    
    # 检查 WebUI/src 目录下是否有更新的文件
    local newest_src_file
    newest_src_file=$(find "$src_dir" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) -newer "$public_dir/index.html" 2>/dev/null | head -1)
    
    if [[ -n "$newest_src_file" ]]; then
        log_info "检测到 WebUI 源代码变更: $(basename "$newest_src_file")"
        return 0
    fi
    
    # 检查 package.json 是否更新
    if [[ -f "$WEBUI_DIR/package.json" ]] && [[ "$WEBUI_DIR/package.json" -nt "$public_dir/index.html" ]]; then
        log_info "检测到 package.json 变更"
        return 0
    fi
    
    log_debug "WebUI 无变更，跳过构建"
    return 1
}

build_webui() {
    log_info "构建 WebUI..."
    
    if [[ ! -d "$WEBUI_DIR" ]]; then
        log_error "WebUI 目录不存在: $WEBUI_DIR"
        return 1
    fi
    
    # 检查 Node.js
    check_node || return 1
    
    cd "$WEBUI_DIR"
    
    # 检查 package.json
    if [[ ! -f "package.json" ]]; then
        log_error "找不到 package.json"
        return 1
    fi
    
    # 安装依赖
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        log_info "安装 npm 依赖..."
        npm install --legacy-peer-deps || {
            log_error "npm install 失败"
            return 1
        }
    else
        log_debug "npm 依赖已是最新"
    fi
    
    # 构建
    log_info "执行 npm run build..."
    local build_start=$(date +%s)
    
    npm run build || {
        log_error "WebUI 构建失败"
        return 1
    }
    
    local build_duration=$(($(date +%s) - build_start))
    log_debug "WebUI 构建耗时: $(format_duration $build_duration)"
    
    # 检查构建产物
    if [[ ! -d "dist" ]] || [[ ! -f "dist/index.html" ]]; then
        log_error "构建产物不完整，找不到 dist/index.html"
        return 1
    fi
    
    # 部署到 Public 目录
    log_info "部署到 DebugHub/Public..."
    
    local public_dir="$DEBUGHUB_DIR/Public"
    
    # 备份旧文件（可选）
    if [[ -d "$public_dir" ]] && [[ -n "$(ls -A "$public_dir" 2>/dev/null)" ]]; then
        log_debug "清理旧的 Public 文件..."
        rm -rf "${public_dir:?}"/*
    fi
    
    # 确保目录存在
    mkdir -p "$public_dir"
    
    # 复制新文件
    cp -r dist/* "$public_dir/" || {
        log_error "复制文件到 Public 目录失败"
        return 1
    }
    
    # 验证部署
    if [[ -f "$public_dir/index.html" ]]; then
        local file_count
        file_count=$(find "$public_dir" -type f | wc -l | tr -d ' ')
        log_success "WebUI 构建完成 ($file_count 个文件)"
    else
        log_error "部署验证失败"
        return 1
    fi
    
    cd "$SCRIPT_DIR"
    return 0
}

resolve_dependencies() {
    log_info "解析 Swift 包依赖..."
    cd "$DEBUGHUB_DIR"
    
    # 检查 Package.swift
    if [[ ! -f "Package.swift" ]]; then
        log_error "找不到 Package.swift"
        return 1
    fi
    
    local resolve_start=$(date +%s)
    
    swift package resolve 2>&1 | while IFS= read -r line; do
        log_debug "$line"
    done
    
    local resolve_status=${PIPESTATUS[0]}
    local resolve_duration=$(($(date +%s) - resolve_start))
    
    if [[ $resolve_status -ne 0 ]]; then
        log_error "依赖解析失败"
        return 1
    fi
    
    log_success "依赖解析完成 ($(format_duration $resolve_duration))"
    return 0
}

build_project() {
    log_info "编译项目 (${BUILD_MODE} 模式)..."
    cd "$DEBUGHUB_DIR"
    
    # 检查磁盘空间（编译需要较多空间）
    check_disk_space 1000 || return 1
    
    local build_start=$(date +%s)
    local build_cmd="swift build"
    
    if [[ "$BUILD_MODE" == "release" ]]; then
        build_cmd="swift build -c release"
    fi
    
    log_debug "执行: $build_cmd"
    
    # 执行编译
    if [[ "$VERBOSE" == true ]]; then
        $build_cmd
    else
        $build_cmd 2>&1 | grep -E '(error:|warning:|Building|Compiling|Linking)' || true
    fi
    
    local build_status=${PIPESTATUS[0]}
    local build_duration=$(($(date +%s) - build_start))
    
    if [[ $build_status -ne 0 ]]; then
        log_error "编译失败"
        return 1
    fi
    
    # 验证编译产物
    local binary_path
    if [[ "$BUILD_MODE" == "release" ]]; then
        binary_path=".build/release/DebugHub"
    else
        binary_path=".build/debug/DebugHub"
    fi
    
    if [[ ! -f "$binary_path" ]]; then
        log_error "编译产物不存在: $binary_path"
        return 1
    fi
    
    local binary_size
    binary_size=$(du -h "$binary_path" | cut -f1)
    
    log_success "编译完成 ($(format_duration $build_duration), $binary_size)"
    return 0
}

# ============================================================================
# 运行函数
# ============================================================================

run_server() {
    local port="${1:-$DEFAULT_PORT}"
    local host="${2:-$DEFAULT_HOST}"
    
    # 验证端口
    validate_port "$port" || return 1
    check_port_available "$port" || return 1
    
    # 确定二进制路径
    local binary_path
    if [[ "$BUILD_MODE" == "release" ]]; then
        binary_path="$DEBUGHUB_DIR/.build/release/DebugHub"
    else
        binary_path="$DEBUGHUB_DIR/.build/debug/DebugHub"
    fi
    
    if [[ ! -f "$binary_path" ]]; then
        log_error "可执行文件不存在: $binary_path"
        log_info "请先运行编译"
        return 1
    fi
    
    # 检查 Public 目录
    if [[ ! -f "$DEBUGHUB_DIR/Public/index.html" ]]; then
        log_warning "Public/index.html 不存在，WebUI 可能无法访问"
        log_info "运行 --with-webui 构建前端"
    fi
    
    echo ""
    echo "=============================================="
    echo "  $PROJECT_NAME 服务配置"
    echo "=============================================="
    echo ""
    log_info "地址: http://${host}:${port}"
    log_info "数据库: $DATABASE_MODE"
    
    if [[ "$DATABASE_MODE" == "postgres" ]]; then
        log_info "PostgreSQL: $POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB"
    elif [[ -n "$DATA_DIR" ]]; then
        log_info "数据目录: $DATA_DIR"
    fi
    
    echo ""
    
    # 设置环境变量
    export DATABASE_MODE="$DATABASE_MODE"
    export POSTGRES_HOST="$POSTGRES_HOST"
    export POSTGRES_PORT="$POSTGRES_PORT"
    export POSTGRES_USER="$POSTGRES_USER"
    export POSTGRES_PASSWORD="$POSTGRES_PASSWORD"
    export POSTGRES_DB="$POSTGRES_DB"
    
    if [[ -n "$DATA_DIR" ]]; then
        export DATA_DIR="$DATA_DIR"
    fi
    
    # 后台启动服务
    log_info "启动服务..."
    nohup "$binary_path" serve --hostname "$host" --port "$port" >> "$LOG_FILE" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"
    
    # 等待服务启动
    sleep 2
    
    if ps -p "$new_pid" > /dev/null 2>&1; then
        log_success "服务已启动 (PID: $new_pid)"
        echo ""
        echo "=============================================="
        echo "  访问地址: http://${host}:${port}"
        echo "=============================================="
        echo ""
        echo "  常用命令:"
        echo "    ./deploy.sh --status   # 查看状态"
        echo "    ./deploy.sh --restart  # 重启服务"
        echo "    ./deploy.sh --stop     # 停止服务"
        echo "    ./deploy.sh --logs     # 查看日志"
        echo ""
    else
        log_error "服务启动失败，请查看日志: $LOG_FILE"
        rm -f "$PID_FILE"
        return 1
    fi
}

# ============================================================================
# 帮助信息
# ============================================================================

show_help() {
    cat << EOF
${BOLD}$PROJECT_NAME 部署脚本${NC}

${BOLD}用法:${NC}
    ./deploy.sh [选项]

${BOLD}选项:${NC}
    ${CYAN}--port <端口>${NC}       指定服务端口 (默认: $DEFAULT_PORT)
    ${CYAN}--host <地址>${NC}       指定绑定地址 (默认: $DEFAULT_HOST)
    ${CYAN}--postgres${NC}          使用 PostgreSQL 数据库 (默认)
    ${CYAN}--sqlite${NC}            使用 SQLite 数据库
    ${CYAN}--data-dir <目录>${NC}   指定 SQLite 数据存储目录 (默认: ./data)
    ${CYAN}--debug${NC}             使用 Debug 模式编译
    ${CYAN}--release${NC}           使用 Release 模式编译 (默认)
    ${CYAN}--build-only${NC}        仅编译不运行
    ${CYAN}--skip-db-setup${NC}     跳过数据库配置
    ${CYAN}--with-webui${NC}        强制构建 WebUI 前端 (需要 Node.js)
    ${CYAN}--no-webui${NC}          跳过 WebUI 自动检测和构建
    ${CYAN}--verbose, -v${NC}       显示详细输出
    ${CYAN}--help, -h${NC}          显示此帮助信息

${BOLD}WebUI 自动构建:${NC}
    脚本会自动检测 WebUI 源代码变更。如果检测到 src/ 目录下的文件比
    Public/ 目录更新，将自动重新构建 WebUI。使用 --no-webui 可禁用此行为。

${BOLD}服务管理:${NC}
    ${CYAN}--stop${NC}              停止服务
    ${CYAN}--restart${NC}           重启服务
    ${CYAN}--status${NC}            查看服务状态
    ${CYAN}--logs${NC}              查看实时日志

${BOLD}示例:${NC}
    ./deploy.sh                                     # 使用默认配置 (PostgreSQL + 自动检测 WebUI)
    ./deploy.sh --port 3000                         # 使用端口 3000
    ./deploy.sh --sqlite                            # 使用 SQLite (零配置)
    ./deploy.sh --sqlite --data-dir /var/lib/data   # SQLite + 指定数据目录
    ./deploy.sh --build-only                        # 仅编译
    ./deploy.sh --with-webui                        # 强制构建 WebUI
    ./deploy.sh --no-webui                          # 跳过 WebUI 构建
    ./deploy.sh --verbose                           # 显示详细日志
    ./deploy.sh --stop                              # 停止服务
    ./deploy.sh --restart                           # 重启服务
    ./deploy.sh --status                            # 查看状态
    ./deploy.sh --logs                              # 查看日志

${BOLD}环境变量:${NC}
    DATABASE_MODE       数据库模式: postgres (默认) 或 sqlite
    DATA_DIR            SQLite 数据存储目录 (默认: ./data)
    SQLITE_PATH         SQLite 数据库完整路径 (覆盖 DATA_DIR)
    POSTGRES_HOST       PostgreSQL 主机 (默认: localhost)
    POSTGRES_PORT       PostgreSQL 端口 (默认: 5432)
    POSTGRES_USER       PostgreSQL 用户 (默认: debug_hub)
    POSTGRES_PASSWORD   PostgreSQL 密码 (默认: debug_hub_password)
    POSTGRES_DB         PostgreSQL 数据库 (默认: debug_hub)
    NO_COLOR            禁用颜色输出

${BOLD}PostgreSQL 快速启动 (Docker):${NC}
    docker run -d --name debughub-postgres \\
      -e POSTGRES_USER=debug_hub \\
      -e POSTGRES_PASSWORD=debug_hub_password \\
      -e POSTGRES_DB=debug_hub \\
      -p 5432:5432 \\
      postgres:17

${BOLD}日志文件:${NC}
    $LOG_FILE

EOF
}

show_version() {
    echo "$PROJECT_NAME deploy script v1.0.0"
}

# ============================================================================
# 服务管理函数
# ============================================================================

# 获取服务 PID
get_server_pid() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "$pid"
            return 0
        fi
    fi
    
    # 如果 PID 文件不存在或无效，尝试通过进程名查找
    local pid=$(pgrep -f "DebugHub serve" 2>/dev/null | head -1)
    if [[ -n "$pid" ]]; then
        echo "$pid"
        return 0
    fi
    
    echo ""
    return 1
}

# 停止服务
stop_server() {
    local pid=$(get_server_pid)
    if [[ -z "$pid" ]]; then
        log_warn "服务未在运行"
        rm -f "$PID_FILE"
        return 0
    fi
    
    log_info "停止服务 (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    
    # 等待进程退出
    local count=0
    while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt 10 ]]; do
        sleep 1
        ((count++))
    done
    
    if ps -p "$pid" > /dev/null 2>&1; then
        log_warn "服务未响应，强制终止..."
        kill -9 "$pid" 2>/dev/null || true
    fi
    
    rm -f "$PID_FILE"
    log_success "服务已停止"
}

# 查看服务状态
show_status() {
    local pid=$(get_server_pid)
    
    echo ""
    echo "=============================================="
    echo -e "  ${BOLD}$PROJECT_NAME 服务状态${NC}"
    echo "=============================================="
    echo ""
    
    if [[ -n "$pid" ]]; then
        log_success "服务正在运行 (PID: $pid)"
        echo ""
        
        # 显示进程信息
        if command -v ps &> /dev/null; then
            local mem=$(ps -o rss= -p "$pid" 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')
            local cpu=$(ps -o %cpu= -p "$pid" 2>/dev/null | tr -d ' ')
            local start_time=$(ps -o lstart= -p "$pid" 2>/dev/null | xargs)
            echo "  内存: $mem"
            echo "  CPU:  ${cpu}%"
            echo "  启动: $start_time"
        fi
        
        # 显示端口信息
        local port=$(lsof -Pan -p "$pid" -i 2>/dev/null | grep LISTEN | awk '{print $9}' | cut -d: -f2 | head -1)
        if [[ -n "$port" ]]; then
            echo "  端口: $port"
            echo "  地址: http://localhost:$port"
        fi
        
        echo ""
        echo "  日志: $LOG_FILE"
        echo "  PID:  $PID_FILE"
        echo ""
    else
        log_warn "服务未在运行"
        echo ""
        echo "  启动服务: ./deploy.sh"
        echo ""
    fi
}

# 重启服务
restart_server() {
    log_info "重启服务..."
    stop_server
    sleep 1
    
    # 重新运行完整部署流程
    log_info "重新启动服务..."
    
    # 确定二进制路径
    local binary_path
    if [[ "$BUILD_MODE" == "release" ]]; then
        binary_path="$DEBUGHUB_DIR/.build/release/DebugHub"
    else
        binary_path="$DEBUGHUB_DIR/.build/debug/DebugHub"
    fi
    
    if [[ ! -f "$binary_path" ]]; then
        log_error "可执行文件不存在: $binary_path"
        log_info "请先运行 ./deploy.sh 进行编译"
        return 1
    fi
    
    # 后台启动服务
    local port=$DEFAULT_PORT
    local host=$DEFAULT_HOST
    
    export DATABASE_MODE="${DATABASE_MODE:-postgres}"
    export POSTGRES_HOST="$POSTGRES_HOST"
    export POSTGRES_PORT="$POSTGRES_PORT"
    export POSTGRES_USER="$POSTGRES_USER"
    export POSTGRES_PASSWORD="$POSTGRES_PASSWORD"
    export POSTGRES_DB="$POSTGRES_DB"
    
    nohup "$binary_path" serve --hostname "$host" --port "$port" >> "$LOG_FILE" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"
    
    sleep 2
    
    if ps -p "$new_pid" > /dev/null 2>&1; then
        log_success "服务已启动 (PID: $new_pid)"
        log_info "访问地址: http://${host}:${port}"
    else
        log_error "服务启动失败，请查看日志: $LOG_FILE"
        rm -f "$PID_FILE"
        return 1
    fi
}

# 查看日志
show_logs() {
    if [[ -f "$LOG_FILE" ]]; then
        log_info "实时日志 (Ctrl+C 退出)..."
        tail -f "$LOG_FILE"
    else
        log_warn "日志文件不存在: $LOG_FILE"
    fi
}

# ============================================================================
# 主流程
# ============================================================================

main() {
    local port=$DEFAULT_PORT
    local host=$DEFAULT_HOST
    local build_only=false
    local skip_db_setup=false
    local total_steps=5
    local current_step=0
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --port)
                if [[ -z "${2:-}" ]]; then
                    log_error "--port 需要指定端口号"
                    exit 1
                fi
                port="$2"
                shift 2
                ;;
            --host)
                if [[ -z "${2:-}" ]]; then
                    log_error "--host 需要指定地址"
                    exit 1
                fi
                host="$2"
                shift 2
                ;;
            --data-dir)
                if [[ -z "${2:-}" ]]; then
                    log_error "--data-dir 需要指定目录"
                    exit 1
                fi
                DATA_DIR="$2"
                shift 2
                ;;
            --sqlite)
                DATABASE_MODE="sqlite"
                shift
                ;;
            --postgres)
                DATABASE_MODE="postgres"
                shift
                ;;
            --debug)
                BUILD_MODE="debug"
                shift
                ;;
            --release)
                BUILD_MODE="release"
                shift
                ;;
            --build-only)
                build_only=true
                shift
                ;;
            --skip-db-setup)
                skip_db_setup=true
                shift
                ;;
            --with-webui)
                BUILD_WEBUI=true
                shift
                ;;
            --no-webui)
                SKIP_WEBUI_CHECK=true
                shift
                ;;
            --stop)
                stop_server
                exit 0
                ;;
            --restart)
                restart_server
                exit 0
                ;;
            --status)
                show_status
                exit 0
                ;;
            --logs)
                show_logs
                exit 0
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --version)
                show_version
                exit 0
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            -*)
                log_error "未知选项: $1"
                echo ""
                log_info "使用 --help 查看帮助"
                exit 1
                ;;
            *)
                log_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
    
    # 初始化日志
    echo "=== Deploy started at $(timestamp) ===" >> "$LOG_FILE"
    log_debug "参数: port=$port host=$host db=$DATABASE_MODE build=$BUILD_MODE"
    
    # 计算总步骤数
    if [[ "$BUILD_WEBUI" == true ]]; then
        total_steps=$((total_steps + 1))
    fi
    if [[ "$DATABASE_MODE" == "postgres" ]] && [[ "$skip_db_setup" == false ]]; then
        total_steps=$((total_steps + 1))
    fi
    if [[ "$build_only" == true ]]; then
        total_steps=$((total_steps - 1))
    fi
    
    echo ""
    echo "=============================================="
    echo -e "  ${BOLD}$PROJECT_NAME 部署脚本${NC}"
    echo "=============================================="
    echo ""
    
    # 1. 检查基础依赖
    ((current_step++))
    log_step $current_step $total_steps "检查系统依赖"
    install_homebrew || exit 1
    check_swift || exit 1
    
    # 2. 数据库配置 (PostgreSQL)
    if [[ "$DATABASE_MODE" == "postgres" ]] && [[ "$skip_db_setup" == false ]]; then
        ((current_step++))
        log_step $current_step $total_steps "配置 PostgreSQL"
        install_postgresql || exit 1
        start_postgresql || exit 1
        setup_database || exit 1
    elif [[ "$DATABASE_MODE" == "sqlite" ]]; then
        log_info "使用 SQLite 数据库模式"
        if [[ -n "$DATA_DIR" ]]; then
            check_directory_writable "$DATA_DIR" || exit 1
        fi
    fi
    
    # 3. 构建 WebUI
    # 如果显式指定了 --with-webui，或者检测到源代码有变更，则构建
    # 使用 --no-webui 可以跳过自动检测
    local should_build_webui=false
    if [[ "$BUILD_WEBUI" == true ]]; then
        should_build_webui=true
    elif [[ "$SKIP_WEBUI_CHECK" == false ]] && check_webui_needs_rebuild; then
        should_build_webui=true
        log_info "自动检测到 WebUI 变更，将自动重新构建"
    fi
    
    if [[ "$should_build_webui" == true ]]; then
        ((current_step++))
        log_step $current_step $total_steps "构建 WebUI"
        build_webui || exit 1
    fi
    
    # 4. 解析依赖
    ((current_step++))
    log_step $current_step $total_steps "解析 Swift 依赖"
    resolve_dependencies || exit 1
    
    # 5. 编译项目
    ((current_step++))
    log_step $current_step $total_steps "编译项目"
    build_project || exit 1
    
    # 6. 运行服务
    if [[ "$build_only" == false ]]; then
        ((current_step++))
        log_step $current_step $total_steps "启动服务"
        run_server "$port" "$host"
    else
        echo ""
        log_success "编译完成！"
        echo ""
        log_info "手动运行服务:"
        if [[ "$BUILD_MODE" == "release" ]]; then
            echo "  cd DebugHub && .build/release/DebugHub serve --port $port"
        else
            echo "  cd DebugHub && swift run DebugHub serve --port $port"
        fi
        echo ""
    fi
}

# 运行主函数
main "$@"
