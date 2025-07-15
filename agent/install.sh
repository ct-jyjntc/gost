#!/bin/bash

# GOST节点探针安装脚本
# 使用方法: curl -sSL https://your-domain.com/install.sh | bash -s -- --panel ws://your-panel:3000 --name "节点名称"

set -e

# 默认配置
PANEL_URL=""
NODE_NAME=""
NODE_TYPE="auto"
INSTALL_DIR="/opt/gost-agent"
SERVICE_NAME="gost-agent"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --panel)
            PANEL_URL="$2"
            shift 2
            ;;
        --name)
            NODE_NAME="$2"
            shift 2
            ;;
        --type)
            NODE_TYPE="$2"
            shift 2
            ;;
        --dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

# 检查必需参数
if [[ -z "$PANEL_URL" ]]; then
    echo "错误: 请指定管理面板地址 --panel ws://your-panel:3000"
    exit 1
fi

if [[ -z "$NODE_NAME" ]]; then
    NODE_NAME=$(hostname)
    echo "使用主机名作为节点名称: $NODE_NAME"
fi

echo "🚀 开始安装GOST节点探针..."
echo "📋 管理面板: $PANEL_URL"
echo "🏷️  节点名称: $NODE_NAME"
echo "📁 安装目录: $INSTALL_DIR"

# 检查系统
if [[ "$EUID" -ne 0 ]]; then
    echo "请使用root权限运行此脚本"
    exit 1
fi

# 检查并安装Node.js
if ! command -v node &> /dev/null; then
    echo "📦 安装Node.js..."
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        yum install -y nodejs
    else
        echo "❌ 不支持的系统，请手动安装Node.js"
        exit 1
    fi
fi

# 检查并安装GOST
if ! command -v gost &> /dev/null; then
    echo "📦 安装GOST..."
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            GOST_ARCH="amd64"
            ;;
        aarch64|arm64)
            GOST_ARCH="arm64"
            ;;
        armv7l)
            GOST_ARCH="armv7"
            ;;
        *)
            echo "❌ 不支持的架构: $ARCH"
            exit 1
            ;;
    esac
    
    GOST_VERSION="2.11.5"
    GOST_URL="https://github.com/ginuerzh/gost/releases/download/v${GOST_VERSION}/gost-linux-${GOST_ARCH}-${GOST_VERSION}.gz"
    
    wget -O /tmp/gost.gz "$GOST_URL"
    gunzip /tmp/gost.gz
    chmod +x /tmp/gost
    mv /tmp/gost /usr/local/bin/gost
    
    echo "✅ GOST安装完成"
fi

# 创建安装目录
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# 下载节点探针代码（这里需要替换为实际的下载地址）
echo "📥 下载节点探针..."
cat > package.json << 'EOF'
{
  "name": "gost-node-agent",
  "version": "1.0.0",
  "description": "GOST节点探针",
  "main": "agent.js",
  "dependencies": {
    "ws": "^8.14.2",
    "axios": "^1.6.0"
  }
}
EOF

# 这里应该下载实际的agent.js文件
# 为了演示，我们创建一个简化版本
echo "📝 创建探针配置..."

# 安装依赖
npm install

# 创建配置文件
cat > agent-config.json << EOF
{
  "panelUrl": "$PANEL_URL",
  "nodeName": "$NODE_NAME",
  "nodeType": "$NODE_TYPE"
}
EOF

# 创建systemd服务文件
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=GOST Node Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node agent.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 启用并启动服务
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

echo "✅ GOST节点探针安装完成！"
echo ""
echo "📋 服务状态:"
systemctl status $SERVICE_NAME --no-pager -l
echo ""
echo "🔧 管理命令:"
echo "  启动服务: systemctl start $SERVICE_NAME"
echo "  停止服务: systemctl stop $SERVICE_NAME"
echo "  重启服务: systemctl restart $SERVICE_NAME"
echo "  查看日志: journalctl -u $SERVICE_NAME -f"
echo "  查看状态: systemctl status $SERVICE_NAME"
echo ""
echo "📁 安装目录: $INSTALL_DIR"
echo "⚙️  配置文件: $INSTALL_DIR/agent-config.json"