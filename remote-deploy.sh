#!/bin/bash
#
# DebugPlatform 远程部署脚本
# 用于将项目部署到远程打包机
#
# 使用方式:
#   ./remote-deploy.sh                    # 交互式部署
#   ./remote-deploy.sh -y                 # 跳过确认（CI/CD 模式）
#   ./remote-deploy.sh user@192.168.1.100 # 直接指定目标
#
# 配置文件:
#   deploy.local     - 本地配置（不上传 Git，包含敏感信息）
#   deploy.local.example - 配置模板
#

set -e

# 保存原始参数用于检测 -y 标志
SCRIPT_ARGS=("$@")

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}${BOLD}==> $1${NC}"; }

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# =====================================
# 默认配置（可被 deploy.local 覆盖）
# =====================================
PROJECT_NAME="DebugPlatform"
DEPLOY_TARGET=""                        # SSH 目标 (user@host)
DEPLOY_DIR="\$HOME/$PROJECT_NAME"       # 远程部署目录
PORT=8081                               # 服务端口
HOST="0.0.0.0"                          # 监听地址
DATABASE_MODE="postgres"                # 数据库模式: sqlite 或 postgres

# PostgreSQL 配置（仅当 DATABASE_MODE=postgres 时使用）
POSTGRES_USER="debug_hub"
POSTGRES_PASSWORD="debug_hub_password"
POSTGRES_DB="debug_hub"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"

# =====================================
# 加载本地配置文件
# =====================================
LOCAL_CONFIG="$SCRIPT_DIR/deploy.local"
if [ -f "$LOCAL_CONFIG" ]; then
    log_info "加载本地配置: $LOCAL_CONFIG"
    # shellcheck source=/dev/null
    source "$LOCAL_CONFIG"
else
    log_warn "未找到本地配置文件 deploy.local"
    log_info "将使用默认配置或交互式输入"
    log_info "可复制 deploy.local.example 为 deploy.local 并修改"
fi

# 兼容旧配置变量名
REMOTE_DIR="${DEPLOY_DIR:-\$HOME/$PROJECT_NAME}"

# 需要排除的文件/目录
EXCLUDE_LIST=(
    ".git"
    ".DS_Store"
    "*.log"
    ".build"
    ".swiftpm"
    "node_modules"
    "deploy.local"
    "DebugHub/data"
    "DebugHub/.debughub.pid"
    "WebUI/dist"
)

# 打印横幅
print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}DebugPlatform - 远程部署工具${NC}                     ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# 获取用户输入
prompt_input() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local result

    if [ -n "$default" ]; then
        read -p "$(echo -e "${BLUE}?${NC} $prompt ${YELLOW}[$default]${NC}: ")" result
        result="${result:-$default}"
    else
        read -p "$(echo -e "${BLUE}?${NC} $prompt: ")" result
    fi

    eval "$var_name=\"$result\""
}

# 确认操作
confirm() {
    local prompt="$1"
    
    # 支持 -y 参数或 DEPLOY_YES 环境变量跳过确认
    if [[ "${DEPLOY_YES:-}" == "true" ]] || [[ " ${SCRIPT_ARGS[*]} " =~ " -y " ]] || [[ " ${SCRIPT_ARGS[*]} " =~ " --yes " ]]; then
        log_info "自动确认: $prompt"
        return 0
    fi
    
    local answer
    read -p "$(echo -e "${YELLOW}?${NC} $prompt (Y/n): ")" answer
    # 空输入（回车）或 Y/y 都表示确认
    [[ -z "$answer" ]] || [[ "$answer" =~ ^[Yy]$ ]]
}

# 配置 SSH 密钥
setup_ssh_key() {
    local target="$1"
    
    log_step "配置 SSH 密钥免密登录"
    
    # 检查本地是否有 SSH 密钥
    local key_file="$HOME/.ssh/id_ed25519"
    local key_type="ed25519"
    
    if [ ! -f "$key_file" ]; then
        key_file="$HOME/.ssh/id_rsa"
        key_type="rsa"
    fi
    
    if [ ! -f "$key_file" ]; then
        log_info "本地未找到 SSH 密钥，正在生成..."
        mkdir -p "$HOME/.ssh"
        chmod 700 "$HOME/.ssh"
        ssh-keygen -t ed25519 -f "$HOME/.ssh/id_ed25519" -N "" -C "deploy@$(hostname)"
        key_file="$HOME/.ssh/id_ed25519"
        log_success "SSH 密钥已生成: $key_file"
    else
        log_info "使用现有 SSH 密钥: $key_file"
    fi
    
    # 复制公钥到远程服务器
    log_info "将公钥复制到远程服务器..."
    log_info "请输入远程服务器密码（这是最后一次输入密码）:"
    
    if ssh-copy-id -i "${key_file}.pub" "$target" 2>/dev/null; then
        log_success "SSH 密钥配置完成！"
        return 0
    else
        # ssh-copy-id 可能不存在，手动复制
        log_warn "ssh-copy-id 失败，尝试手动配置..."
        local pub_key=$(cat "${key_file}.pub")
        if ssh "$target" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pub_key' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"; then
            log_success "SSH 密钥配置完成！"
            return 0
        else
            log_error "SSH 密钥配置失败"
            return 1
        fi
    fi
}

# 检查 SSH 连接
check_ssh() {
    local target="$1"
    log_info "检查 SSH 连接..."
    
    # 先尝试无密码连接
    if ssh -o ConnectTimeout=10 -o BatchMode=yes "$target" "echo ok" &>/dev/null; then
        log_success "SSH 连接正常（密钥认证）"
        return 0
    fi
    
    # 检查是否能 ping 通
    local server_ip="${target#*@}"
    if ping -c 1 -W 2 "$server_ip" &>/dev/null; then
        log_warn "SSH 密钥未配置"
        if confirm "是否现在配置 SSH 密钥免密登录（推荐）"; then
            if setup_ssh_key "$target"; then
                # 验证密钥是否生效
                if ssh -o ConnectTimeout=10 -o BatchMode=yes "$target" "echo ok" &>/dev/null; then
                    log_success "密钥验证成功，后续操作无需输入密码"
                    return 0
                fi
            fi
            log_warn "密钥配置可能未生效，继续需要输入密码"
        fi
        return 0
    else
        log_error "无法连接到 $server_ip（网络不可达）"
        log_info "请确保:"
        echo "  1. 目标服务器已开机"
        echo "  2. 网络连接正常"
        echo "  3. IP 地址正确"
        return 1
    fi
}

# 检查远程环境
check_remote_env() {
    local target="$1"
    log_info "检查远程环境..."
    
    # 检查是否是 macOS
    local os_type=$(ssh "$target" "uname -s")
    if [[ "$os_type" != "Darwin" ]]; then
        log_warn "远程服务器不是 macOS ($os_type)"
        log_warn "DebugHub 需要 macOS 环境运行 Swift"
        return 1
    fi
    log_info "操作系统: macOS ✓"
    
    # 检查 Swift 是否安装
    local swift_version=$(ssh "$target" "swift --version 2>/dev/null | head -1 || echo 'not found'")
    if [[ "$swift_version" == "not found" ]]; then
        log_warn "远程服务器未安装 Swift"
        log_info "请先在远程服务器安装 Xcode 或 Swift Toolchain"
        return 1
    fi
    log_info "Swift: $swift_version ✓"
    
    # 检查 Node.js（用于 WebUI 构建）- 使用 zsh -l 加载 nvm 环境
    local node_version=$(ssh "$target" "zsh -l -c 'node --version 2>/dev/null' || echo 'not found'")
    if [[ "$node_version" == "not found" ]]; then
        log_warn "远程服务器未安装 Node.js（WebUI 构建需要）"
        log_info "将尝试使用 nvm 安装..."
    else
        log_info "Node.js: $node_version ✓"
    fi
    
    return 0
}

# 构建 rsync 排除参数
build_exclude_args() {
    local args=""
    for item in "${EXCLUDE_LIST[@]}"; do
        args="$args --exclude='$item'"
    done
    echo "$args"
}

# 同步代码
sync_code() {
    local target="$1"
    local remote_dir="$2"
    
    log_step "同步代码到远程服务器"
    
    # 创建远程目录
    log_info "创建远程目录: $remote_dir"
    ssh "$target" "mkdir -p '$remote_dir'"
    
    # 构建 rsync 命令
    local exclude_args=$(build_exclude_args)
    
    log_info "同步文件..."
    eval rsync -avz --progress \
        $exclude_args \
        --delete \
        "$SCRIPT_DIR/" \
        "$target:$remote_dir/"
    
    # 同步 deploy.local（如果存在）
    if [ -f "$SCRIPT_DIR/deploy.local" ]; then
        log_info "同步 deploy.local 配置文件..."
        rsync -avz "$SCRIPT_DIR/deploy.local" "$target:$remote_dir/deploy.local"
    fi
    
    # 确保脚本有可执行权限
    log_info "设置脚本权限..."
    ssh "$target" "chmod +x '$remote_dir/DebugHub/deploy.sh' '$remote_dir/remote-deploy.sh' 2>/dev/null || true"
    
    log_success "代码同步完成"
}

# 配置远程环境
configure_remote() {
    local target="$1"
    local remote_dir="$2"
    local server_ip="$3"
    
    log_step "配置远程环境"
    
    local deploy_port="${PORT:-8081}"
    local deploy_host="${HOST:-0.0.0.0}"
    local deploy_db_mode="${DATABASE_MODE:-postgres}"
    
    # 生成公网地址
    local deploy_public_url="http://$server_ip:$deploy_port"
    
    log_info "服务端口: $deploy_port"
    log_info "数据库模式: $deploy_db_mode"
    log_info "访问地址: $deploy_public_url"
    
    # 创建数据目录
    ssh "$target" "mkdir -p '$remote_dir/DebugHub/data'"
    
    log_success "环境配置完成"
}

# 构建并启动服务
build_and_start() {
    local target="$1"
    local remote_dir="$2"
    
    log_step "构建并启动服务"
    
    local deploy_port="${PORT:-8081}"
    local deploy_host="${HOST:-0.0.0.0}"
    local deploy_db_mode="${DATABASE_MODE:-postgres}"
    
    # 停止旧服务（如果正在运行）
    log_info "检查并停止旧服务..."
    local stop_output=$(ssh "$target" "cd '$remote_dir/DebugHub' && ./deploy.sh --stop 2>&1" || true)
    if echo "$stop_output" | grep -q "服务已停止\|服务未在运行"; then
        echo "$stop_output" | grep -E "服务已停止|服务未在运行" | head -1
    fi
    
    # 构建 WebUI
    log_info "构建 WebUI..."
    # 使用 nvm 切换到项目要求的 Node.js 版本，静默安装依赖
    ssh "$target" "zsh -l -c 'cd \"$remote_dir/WebUI\" && nvm install >/dev/null 2>&1 && nvm use >/dev/null && npm install --silent 2>/dev/null && npm run deploy 2>&1'" | grep -E "built in|✓|error" || true
    log_success "WebUI 构建完成"
    
    # 构建并启动 DebugHub
    log_info "构建并启动 DebugHub..."
    local db_flag=""
    if [[ "$deploy_db_mode" == "sqlite" ]]; then
        db_flag="--sqlite"
    fi
    
    # 过滤掉冗长的编译输出，只显示关键信息
    ssh "$target" "cd '$remote_dir/DebugHub' && ./deploy.sh --port $deploy_port --host $deploy_host $db_flag 2>&1" | \
        grep -E "^\[|已启动|已停止|完成|成功|失败|错误|访问地址|http://" || true
    
    log_success "服务已启动"
}

# 显示部署结果
show_result() {
    local server_ip="$1"
    local port="${PORT:-8081}"
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}                    ${BOLD}部署完成！${NC}                             ${GREEN}║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  访问地址: ${CYAN}${BOLD}http://$server_ip:$port${NC}"
    echo ""
    echo -e "  ${BLUE}常用命令 (SSH 到服务器后):${NC}"
    echo "    cd ~/$PROJECT_NAME/DebugHub"
    echo "    ./deploy.sh --status   # 查看状态"
    echo "    ./deploy.sh --restart  # 重启服务"
    echo "    ./deploy.sh --stop     # 停止服务"
    echo "    ./deploy.sh --logs     # 查看日志"
    echo ""
}

# 显示帮助
show_help() {
    echo "DebugPlatform 远程部署脚本"
    echo ""
    echo "用法: $0 [选项] [user@host]"
    echo ""
    echo "选项:"
    echo "  -y, --yes       跳过所有确认（CI/CD 模式）"
    echo "  -h, --help      显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                        # 交互式部署"
    echo "  $0 root@192.168.1.100     # 部署到指定服务器"
    echo "  $0 -y root@192.168.1.100  # 自动确认部署"
    echo ""
    echo "配置文件:"
    echo "  deploy.local              # 本地配置（不上传 Git）"
    echo "  deploy.local.example      # 配置模板"
    echo ""
}

# 主函数
main() {
    print_banner
    
    # 解析命令行参数
    local target=""
    local server_ip=""
    local user=""
    
    for arg in "$@"; do
        case "$arg" in
            -y|--yes)
                # 忽略，已在 SCRIPT_ARGS 中处理
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                # 第一个非标志参数视为目标服务器
                if [ -z "$target" ]; then
                    target="$arg"
                fi
                ;;
        esac
    done
    
    # 如果命令行没有指定，使用配置文件中的目标
    target="${target:-$DEPLOY_TARGET}"
    
    # 如果没有提供参数且配置文件也没有，交互式获取
    if [ -z "$target" ]; then
        log_info "请输入部署目标信息"
        echo ""
        
        prompt_input "远程服务器 IP" "" "server_ip"
        prompt_input "SSH 用户名" "root" "user"
        
        target="${user}@${server_ip}"
    else
        # 从 target 解析 IP
        if [[ "$target" == *"@"* ]]; then
            server_ip="${target#*@}"
            user="${target%@*}"
        else
            server_ip="$target"
            target="root@$server_ip"
            user="root"
        fi
        log_info "使用配置: $target"
    fi
    
    echo ""
    log_info "部署目标: $target"
    log_info "远程目录: $REMOTE_DIR"
    log_info "服务端口: $PORT"
    log_info "数据库模式: $DATABASE_MODE"
    echo ""
    
    # 检查连接
    if ! check_ssh "$target"; then
        exit 1
    fi
    
    # 检查远程环境
    if ! check_remote_env "$target"; then
        if ! confirm "环境检查有警告，是否继续"; then
            exit 1
        fi
    fi
    
    echo ""
    if ! confirm "确认开始部署到 $target"; then
        log_info "部署已取消"
        exit 0
    fi
    
    # 获取远程用户的实际 home 目录，展开 $HOME
    log_info "获取远程目录路径..."
    local remote_home=$(ssh "$target" "echo \$HOME")
    local actual_remote_dir="${REMOTE_DIR/\$HOME/$remote_home}"
    log_info "实际远程目录: $actual_remote_dir"
    
    # 执行部署步骤
    sync_code "$target" "$actual_remote_dir"
    configure_remote "$target" "$actual_remote_dir" "$server_ip"
    build_and_start "$target" "$actual_remote_dir"
    
    show_result "$server_ip"
}

# 入口
main "$@"
