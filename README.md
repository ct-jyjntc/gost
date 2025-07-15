# GOST分布式管理面板

一个分布式GOST代理管理系统，包含中心管理面板和节点探针，支持远程管理多台服务器上的GOST节点。

## 系统架构

```
┌─────────────────┐    HTTP/WebSocket    ┌──────────────────┐
│   管理面板       │ ◄─────────────────► │   节点探针        │
│  (Control Panel) │                     │   (Node Agent)   │
│                 │                     │                  │
│ - Web界面        │                     │ - GOST进程管理    │
│ - 节点管理       │                     │ - 状态上报       │
│ - 配置下发       │                     │ - 命令执行       │
└─────────────────┘                     └──────────────────┘
```

## 功能特性

### 🚀 出口节点管理
- 添加出口节点配置
- 自动运行 `gost -L relay+mws://:34343` 命令
- 实时查看节点运行状态
- 一键启动/停止节点

### 🔄 入口节点管理
- 配置本地端口转发
- 支持TCP/UDP协议选择
- 可选择连接到已配置的出口节点
- 支持直连模式
- 自动生成GOST命令：
  - 使用出口节点: `gost -L tcp://:端口/目标IP:端口 -L udp://:端口/目标IP:端口 -F relay+mws://127.0.0.1:34343`
  - 直连模式: `gost -L tcp://:端口/目标IP:端口 -L udp://:端口/目标IP:端口`

### 💻 Web界面
- 现代化响应式设计
- 实时状态监控
- 简洁直观的操作界面
- 支持移动端访问

## 安装要求

1. **Node.js** (版本 14 或更高)
2. **GOST** 代理工具

### 安装GOST

#### macOS
```bash
# 使用Homebrew安装
brew install gost

# 或者下载二进制文件
wget https://github.com/ginuerzh/gost/releases/download/v2.11.5/gost-darwin-amd64-2.11.5.gz
gunzip gost-darwin-amd64-2.11.5.gz
chmod +x gost-darwin-amd64-2.11.5
sudo mv gost-darwin-amd64-2.11.5 /usr/local/bin/gost
```

#### Linux
```bash
# 下载并安装
wget https://github.com/ginuerzh/gost/releases/download/v2.11.5/gost-linux-amd64-2.11.5.gz
gunzip gost-linux-amd64-2.11.5.gz
chmod +x gost-linux-amd64-2.11.5
sudo mv gost-linux-amd64-2.11.5 /usr/local/bin/gost
```

#### Windows
1. 从 [GOST Releases](https://github.com/ginuerzh/gost/releases) 下载Windows版本
2. 解压并将gost.exe放到PATH环境变量中

## 快速开始

### 1. 部署管理面板

```bash
# 克隆项目
git clone <项目地址>
cd gost-panel

# 安装依赖
npm install

# 启动管理面板
npm start
```

管理面板将在 http://localhost:3000 启动

### 2. 部署节点探针

#### 方法一：自动安装脚本（推荐）
```bash
# 在目标服务器上运行
curl -sSL https://your-domain.com/agent/install.sh | bash -s -- \
  --panel ws://你的面板IP:3000 \
  --name "节点名称" \
  --type exit
```

#### 方法二：手动部署
```bash
# 1. 复制agent文件夹到目标服务器
scp -r agent/ user@server:/opt/gost-agent/

# 2. 在目标服务器上安装依赖
cd /opt/gost-agent
npm install

# 3. 启动探针
node agent.js --panel ws://你的面板IP:3000 --name "节点名称"

# 4. 后台运行
nohup node agent.js --panel ws://你的面板IP:3000 --name "节点名称" > agent.log 2>&1 &
```

### 3. 访问管理面板
打开浏览器访问: http://localhost:3000

## 使用说明

### 添加出口节点
1. 点击"出口节点"标签页
2. 点击"+ 添加出口节点"按钮
3. 填写节点名称和描述
4. 点击"添加节点"
5. 点击"启动"按钮启动节点

### 添加入口节点
1. 点击"入口节点"标签页
2. 点击"+ 添加入口节点"按钮
3. 填写配置信息：
   - **节点名称**: 便于识别的名称
   - **使用端口**: 本地监听端口
   - **落地IP**: 目标服务器IP
   - **落地端口**: 目标服务器端口
   - **出口节点**: 可选择已配置的出口节点，或选择直连
   - **协议类型**: 选择TCP和/或UDP
4. 点击"添加节点"
5. 点击"启动"按钮启动转发

### 管理节点
- **启动节点**: 点击绿色"启动"按钮
- **停止节点**: 点击红色"停止"按钮
- **删除节点**: 点击"删除"按钮（会先停止节点）
- **查看状态**: 节点卡片右上角显示运行状态

## 配置文件

节点配置自动保存在 `nodes_config.json` 文件中，包含：
- 出口节点配置
- 入口节点配置
- 节点创建时间等信息

## 开发模式

```bash
# 安装nodemon用于开发
npm install -g nodemon

# 启动开发模式（文件变化时自动重启）
npm run dev
```

## 注意事项

1. **端口冲突**: 确保配置的端口没有被其他程序占用
2. **防火墙**: 如需外部访问，请开放相应端口
3. **权限**: 某些端口（如1024以下）可能需要管理员权限
4. **GOST版本**: 建议使用GOST 2.11.5或更高版本
5. **网络**: 确保出口节点和入口节点之间网络连通

## 故障排除

### GOST命令未找到
```bash
# 检查GOST是否正确安装
which gost
gost -V
```

### 端口被占用
```bash
# 检查端口占用情况
lsof -i :端口号
# 或者
netstat -tulpn | grep 端口号
```

### 节点启动失败
1. 检查GOST是否正确安装
2. 检查端口是否被占用
3. 查看服务器控制台日志
4. 确认网络连接正常

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生HTML/CSS/JavaScript
- **代理工具**: GOST
- **数据存储**: JSON文件

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进这个项目！## 系统测试


```bash
# 运行完整系统测试（同时启动管理面板和测试节点）
node test-system.js
```

## 使用流程

### 1. 节点探针连接
- 部署节点探针到各个服务器
- 探针会自动连接到管理面板
- 在"节点管理"页面查看连接状态

### 2. 创建出口任务
- 切换到"出口任务"标签页
- 点击"+ 添加出口任务"
- 选择节点，配置任务名称和端口
- 启动任务，GOST将运行 `gost -L relay+mws://:34343`

### 3. 创建入口任务
- 切换到"入口任务"标签页
- 点击"+ 添加入口任务"
- 配置本地端口、目标地址、协议类型
- 可选择已创建的出口任务进行中转
- 启动任务开始端口转发

### 4. 监控管理
- 实时查看节点状态和系统信息
- 监控任务运行状态
- 一键启动/停止任务
- 查看节点心跳和连接状态

## API接口

### 节点管理
- `GET /api/nodes` - 获取所有节点和任务状态
- `POST /api/tasks/exit` - 创建出口任务
- `POST /api/tasks/entry` - 创建入口任务
- `POST /api/tasks/:id/start` - 启动任务
- `POST /api/tasks/:id/stop` - 停止任务
- `DELETE /api/tasks/:id` - 删除任务

### WebSocket通信
- 连接地址: `ws://面板地址:3000/agent`
- 支持节点注册、心跳、命令下发等

## 配置说明

### 管理面板配置
配置文件: `panel_config.json`
```json
{
  "nodeConfigs": [...],  // 节点配置
  "gostTasks": [...]     // 任务配置
}
```

### 节点探针配置
配置文件: `agent/agent-config.json`
```json
{
  "panelUrl": "ws://localhost:3000",
  "nodeId": "auto-generated",
  "nodeName": "节点名称",
  "nodeType": "auto"
}
```

## 部署建议

### 生产环境部署
1. **管理面板**
   - 使用PM2或systemd管理进程
   - 配置反向代理（Nginx）
   - 启用HTTPS和WSS
   - 设置防火墙规则

2. **节点探针**
   - 配置为系统服务
   - 设置自动重启
   - 监控日志输出
   - 定期更新GOST版本

### 安全建议
- 使用VPN或内网连接
- 配置访问控制
- 定期更新系统和依赖
- 监控异常连接

## 常见问题

### Q: 节点探针连接失败？
A: 检查网络连接、防火墙设置、WebSocket地址是否正确

### Q: GOST进程启动失败？
A: 确认GOST已正确安装，端口未被占用，命令格式正确

### Q: 如何查看详细日志？
A: 
- 管理面板: 查看控制台输出
- 节点探针: 查看agent.log文件
- 系统服务: `journalctl -u gost-agent -f`

### Q: 如何更新系统？
A: 
1. 停止所有服务
2. 更新代码
3. 重新安装依赖
4. 重启服务

## 开发指南

### 项目结构
```
gost-panel/
├── server.js          # 管理面板服务器
├── package.json       # 依赖配置
├── public/            # 前端文件
│   ├── index.html     # 主页面
│   ├── script.js      # 前端逻辑
│   └── style.css      # 样式文件
├── agent/             # 节点探针
│   ├── agent.js       # 探针主程序
│   ├── package.json   # 探针依赖
│   └── install.sh     # 安装脚本
└── README.md          # 说明文档
```

### 扩展开发
- 添加新的GOST配置模板
- 实现更多监控指标
- 支持配置文件导入导出
- 添加用户认证系统
- 实现集群管理功能

## 更新日志

### v1.0.0
- 基础的分布式架构
- 节点探针自动连接
- 出口/入口任务管理
- Web管理界面
- 实时状态监控

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT License