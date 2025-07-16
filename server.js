const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = 3000;
const server = http.createServer(app);

// 创建WebSocket服务器
const wss = new WebSocket.Server({ 
    server,
    path: '/agent'
});

// 中间件
app.use(bodyParser.json());
app.use(express.static('public'));

// 存储节点和连接信息
let connectedNodes = new Map(); // 已连接的节点探针
let nodeConfigs = new Map(); // 节点配置
let gostTasks = new Map(); // GOST任务配置

// 配置文件路径
const CONFIG_FILE = 'panel_config.json';

// 加载配置
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const config = JSON.parse(data);
            nodeConfigs = new Map(config.nodeConfigs || []);
            gostTasks = new Map(config.gostTasks || []);
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// 保存配置
function saveConfig() {
    try {
        const config = {
            nodeConfigs: Array.from(nodeConfigs.entries()),
            gostTasks: Array.from(gostTasks.entries())
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('保存配置失败:', error);
    }
}

// WebSocket连接处理
wss.on('connection', (ws, req) => {
    console.log('🔗 新的节点探针连接');
    
    let nodeId = null;
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleAgentMessage(ws, message);
            
            if (message.type === 'register') {
                nodeId = message.data.nodeId;
            }
        } catch (error) {
            console.error('处理探针消息失败:', error);
        }
    });
    
    ws.on('close', () => {
        if (nodeId) {
            console.log(`❌ 节点探针断开连接: ${nodeId}`);
            connectedNodes.delete(nodeId);
            broadcastNodeStatus();
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

// 处理探针消息
function handleAgentMessage(ws, message) {
    switch (message.type) {
        case 'register':
            handleNodeRegister(ws, message.data);
            break;
        case 'heartbeat':
            handleNodeHeartbeat(message.data);
            break;
        case 'gost_started':
        case 'gost_stopped':
        case 'gost_error':
            handleGostStatus(message);
            break;
        case 'status_report':
            handleStatusReport(message.data);
            break;
        default:
            console.log(`未知消息类型: ${message.type}`);
    }
}

// 处理节点注册
function handleNodeRegister(ws, nodeData) {
    const { nodeId, runningProcesses } = nodeData;
    
    console.log(`✅ 节点注册: ${nodeData.nodeName} (${nodeId})`);
    
    // 保存节点连接
    connectedNodes.set(nodeId, {
        ws,
        ...nodeData,
        lastHeartbeat: Date.now(),
        status: 'online'
    });
    
    // 保存节点配置
    nodeConfigs.set(nodeId, {
        ...nodeData,
        registeredAt: new Date().toISOString()
    });
    
    // 同步运行中的进程状态
    if (runningProcesses && runningProcesses.length > 0) {
        console.log(`🔄 同步节点 ${nodeId} 的运行进程: ${runningProcesses.length} 个`);
        
        runningProcesses.forEach(processInfo => {
            const task = gostTasks.get(processInfo.processId);
            if (task) {
                // 更新任务状态为运行中
                task.status = 'running';
                task.pid = processInfo.pid;
                task.reconnectedAt = new Date().toISOString();
                gostTasks.set(processInfo.processId, task);
                console.log(`✅ 恢复任务状态: ${task.name} (${processInfo.processId})`);
            } else {
                // 发现未知进程，记录日志
                console.log(`⚠️  发现未知进程: ${processInfo.processId} - ${processInfo.description}`);
            }
        });
    }
    
    saveConfig();
    broadcastNodeStatus();
    
    // 发送欢迎消息
    ws.send(JSON.stringify({
        type: 'welcome',
        data: {
            message: '节点注册成功',
            nodeId,
            syncedProcesses: runningProcesses ? runningProcesses.length : 0
        }
    }));
}

// 处理心跳
function handleNodeHeartbeat(data) {
    const { nodeId } = data;
    const node = connectedNodes.get(nodeId);
    
    if (node) {
        node.lastHeartbeat = Date.now();
        node.systemInfo = {
            uptime: data.uptime,
            memory: data.memory,
            loadavg: data.loadavg,
            processes: data.processes
        };
    }
}

// 处理GOST状态
function handleGostStatus(message) {
    console.log(`GOST状态更新: ${message.type}`, message.data);
    
    const { processId } = message.data;
    const task = gostTasks.get(processId);
    
    if (task) {
        switch (message.type) {
            case 'gost_started':
                task.status = 'running';
                task.pid = message.data.pid;
                task.startedAt = new Date().toISOString();
                break;
            case 'gost_stopped':
                task.status = 'stopped';
                task.pid = null;
                task.stoppedAt = new Date().toISOString();
                break;
            case 'gost_error':
                task.status = 'error';
                task.error = message.data.error;
                task.errorAt = new Date().toISOString();
                break;
        }
        
        gostTasks.set(processId, task);
        saveConfig();
    }
    
    broadcastNodeStatus();
}

// 处理状态报告
function handleStatusReport(data) {
    const { nodeId } = data;
    const node = connectedNodes.get(nodeId);
    
    if (node) {
        node.processes = data.processes;
        node.systemInfo = data.system;
    }
}

// 广播节点状态
function broadcastNodeStatus() {
    // 这里可以通过Server-Sent Events或其他方式向前端推送状态更新
    // 暂时省略，前端通过轮询获取状态
}

// 向节点发送命令
function sendCommandToNode(nodeId, command) {
    const node = connectedNodes.get(nodeId);
    if (node && node.ws.readyState === WebSocket.OPEN) {
        node.ws.send(JSON.stringify(command));
        return true;
    }
    return false;
}

// API路由

// 获取所有节点状态
app.get('/api/nodes', (req, res) => {
    const nodes = Array.from(connectedNodes.entries()).map(([nodeId, node]) => ({
        nodeId,
        nodeName: node.nodeName,
        nodeType: node.nodeType,
        platform: node.platform,
        hostname: node.hostname,
        status: node.status,
        lastHeartbeat: node.lastHeartbeat,
        systemInfo: node.systemInfo,
        processes: node.processes || [],
        networkInterfaces: node.networkInterfaces
    }));
    
    const tasks = Array.from(gostTasks.entries()).map(([taskId, task]) => ({
        taskId,
        ...task
    }));
    
    res.json({
        nodes,
        tasks
    });
});

// 添加GOST任务（出口节点）
app.post('/api/tasks/exit', (req, res) => {
    const { nodeId, name, description, port = 34343, customIp, customPort } = req.body;

    if (!nodeId || !name) {
        return res.status(400).json({ error: '节点ID和名称不能为空' });
    }

    const node = connectedNodes.get(nodeId);
    if (!node) {
        return res.status(404).json({ error: '节点不在线' });
    }

    // 验证自定义端口
    const finalPort = customPort || port;
    if (finalPort < 1 || finalPort > 65535) {
        return res.status(400).json({ error: '端口号必须在1-65535之间' });
    }

    // 验证自定义IP地址
    if (customIp && !isValidIpAddress(customIp)) {
        return res.status(400).json({ error: '自定义IP地址格式不正确' });
    }

    const taskId = Date.now().toString();
    const command = `./gost -L relay+mws://:${finalPort}`;

    const task = {
        taskId,
        nodeId,
        name,
        description: description || '',
        type: 'exit',
        command,
        port: finalPort,
        customIp: customIp || null, // 保存用户自定义的IP地址
        customPort: customPort || null, // 保存用户自定义的端口
        status: 'stopped',
        createdAt: new Date().toISOString()
    };

    gostTasks.set(taskId, task);
    saveConfig();

    res.json(task);
});

// 添加GOST任务（入口节点）
app.post('/api/tasks/entry', (req, res) => {
    const { nodeId, name, localPort, targetIp, targetPort, exitNodeId, protocols } = req.body;
    
    if (!nodeId || !name || !localPort || !targetIp || !targetPort) {
        return res.status(400).json({ error: '必填字段不能为空' });
    }
    
    const node = connectedNodes.get(nodeId);
    if (!node) {
        return res.status(404).json({ error: '节点不在线' });
    }
    
    const taskId = Date.now().toString();
    const selectedProtocols = protocols || ['tcp', 'udp'];
    
    // 构建GOST命令
    let command = './gost';
    const commands = [];
    
    selectedProtocols.forEach(protocol => {
        // 格式化目标IP地址（IPv6需要方括号）
        const formattedTargetIp = formatIpForUrl(targetIp);
        commands.push(`-L ${protocol}://:${localPort}/${formattedTargetIp}:${targetPort}`);
    });
    
    // 如果指定了出口节点
    if (exitNodeId) {
        const exitTask = Array.from(gostTasks.values()).find(t =>
            t.taskId === exitNodeId && t.type === 'exit'
        );
        if (exitTask) {
            const exitNode = connectedNodes.get(exitTask.nodeId);
            if (exitNode) {
                // 获取出口节点的IP地址（支持自定义IP）
                const exitIp = getNodeIp(exitNode, exitTask);
                const exitPort = exitTask.customPort || exitTask.port;
                commands.push(`-F relay+mws://${exitIp}:${exitPort}`);
            }
        }
    }
    
    command = `./gost ${commands.join(' ')}`;
    
    const task = {
        taskId,
        nodeId,
        name,
        type: 'entry',
        command,
        localPort: parseInt(localPort),
        targetIp,
        targetPort: parseInt(targetPort),
        exitNodeId: exitNodeId || null,
        protocols: selectedProtocols,
        status: 'stopped',
        createdAt: new Date().toISOString()
    };
    
    gostTasks.set(taskId, task);
    saveConfig();
    
    res.json(task);
});

// 启动GOST任务
app.post('/api/tasks/:taskId/start', (req, res) => {
    const { taskId } = req.params;
    const task = gostTasks.get(taskId);
    
    if (!task) {
        return res.status(404).json({ error: '任务不存在' });
    }
    
    const success = sendCommandToNode(task.nodeId, {
        type: 'start_gost',
        data: {
            processId: taskId,
            command: task.command,
            description: task.name
        }
    });
    
    if (success) {
        task.status = 'starting';
        gostTasks.set(taskId, task);
        saveConfig();
        res.json({ message: '启动命令已发送' });
    } else {
        res.status(500).json({ error: '节点不在线或发送命令失败' });
    }
});

// 停止GOST任务
app.post('/api/tasks/:taskId/stop', (req, res) => {
    const { taskId } = req.params;
    const task = gostTasks.get(taskId);
    
    if (!task) {
        return res.status(404).json({ error: '任务不存在' });
    }
    
    const success = sendCommandToNode(task.nodeId, {
        type: 'stop_gost',
        data: {
            processId: taskId
        }
    });
    
    if (success) {
        task.status = 'stopping';
        gostTasks.set(taskId, task);
        saveConfig();
        res.json({ message: '停止命令已发送' });
    } else {
        res.status(500).json({ error: '节点不在线或发送命令失败' });
    }
});

// 删除GOST任务
app.delete('/api/tasks/:taskId', (req, res) => {
    const { taskId } = req.params;
    const task = gostTasks.get(taskId);
    
    if (!task) {
        return res.status(404).json({ error: '任务不存在' });
    }
    
    // 先停止任务
    sendCommandToNode(task.nodeId, {
        type: 'stop_gost',
        data: {
            processId: taskId
        }
    });
    
    // 删除任务配置
    gostTasks.delete(taskId);
    saveConfig();
    
    res.json({ message: '任务删除成功' });
});

// 验证IP地址格式（支持IPv4和IPv6）
function isValidIpAddress(ip) {
    // IPv4 正则表达式
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // 简化的IPv6验证 - 检查基本格式
    if (ip.includes(':')) {
        // 基本IPv6格式检查
        const parts = ip.split(':');
        if (parts.length < 3 || parts.length > 8) return false;

        // 检查每个部分是否为有效的十六进制
        for (const part of parts) {
            if (part !== '' && !/^[0-9a-fA-F]{1,4}$/.test(part)) {
                return false;
            }
        }

        // 检查双冒号（::）的使用
        const doubleColonCount = (ip.match(/::/g) || []).length;
        if (doubleColonCount > 1) return false;

        return true;
    }

    return ipv4Regex.test(ip);
}

// 格式化IP地址用于URL（IPv6需要方括号）
function formatIpForUrl(ip) {
    if (!ip) return ip;

    // 如果是IPv6地址且没有方括号，添加方括号
    if (ip.includes(':') && !ip.startsWith('[')) {
        return `[${ip}]`;
    }

    return ip;
}

// 获取节点IP地址（支持自定义IP）
function getNodeIp(node, exitTask = null) {
    // 如果出口任务配置了自定义IP，优先使用
    if (exitTask && exitTask.customIp) {
        return formatIpForUrl(exitTask.customIp);
    }

    // 尝试获取节点的外网IP（IPv4优先）
    for (const [interfaceName, addresses] of Object.entries(node.networkInterfaces || {})) {
        for (const addr of addresses) {
            if (addr.family === 'IPv4' && !addr.address.startsWith('127.') && !addr.address.startsWith('192.168.')) {
                return addr.address;
            }
        }
    }

    // 尝试获取IPv6外网地址
    for (const [interfaceName, addresses] of Object.entries(node.networkInterfaces || {})) {
        for (const addr of addresses) {
            if (addr.family === 'IPv6' && !addr.address.startsWith('fe80:') && !addr.address.startsWith('::1')) {
                return `[${addr.address}]`; // IPv6地址需要用方括号包围
            }
        }
    }

    // 如果没有外网IP，返回内网IP
    for (const [interfaceName, addresses] of Object.entries(node.networkInterfaces || {})) {
        for (const addr of addresses) {
            if (addr.family === 'IPv4' && !addr.address.startsWith('127.')) {
                return addr.address;
            }
        }
    }

    return '127.0.0.1';
}

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`🚀 GOST分布式管理面板启动成功！`);
    console.log(`📱 Web界面: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/agent`);
    loadConfig();
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭管理面板...');
    
    // 通知所有节点断开连接
    for (const [nodeId, node] of connectedNodes) {
        if (node.ws.readyState === WebSocket.OPEN) {
            node.ws.close();
        }
    }
    
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});