const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

class GostNodeAgent {
    constructor(config = {}) {
        this.config = {
            // 管理面板地址
            panelUrl: config.panelUrl || 'ws://localhost:3000',
            // 节点标识
            nodeId: config.nodeId || this.generateNodeId(),
            // 节点名称
            nodeName: config.nodeName || os.hostname(),
            // 重连间隔
            reconnectInterval: config.reconnectInterval || 5000,
            // 心跳间隔
            heartbeatInterval: config.heartbeatInterval || 1000,
            // 节点类型 (entry/exit)
            nodeType: config.nodeType || 'auto',
            // 配置文件路径
            configFile: config.configFile || './agent-config.json'
        };
        
        this.ws = null;
        this.processes = new Map(); // 运行中的GOST进程
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        
        this.loadConfig();
        this.init();
    }
    
    // 生成节点ID
    generateNodeId() {
        const networkInterfaces = os.networkInterfaces();
        let mac = '';
        
        for (const name of Object.keys(networkInterfaces)) {
            for (const net of networkInterfaces[name]) {
                if (!net.internal && net.mac !== '00:00:00:00:00:00') {
                    mac = net.mac;
                    break;
                }
            }
            if (mac) break;
        }
        
        return mac ? mac.replace(/:/g, '') : Date.now().toString();
    }
    
    // 加载配置
    loadConfig() {
        try {
            if (fs.existsSync(this.config.configFile)) {
                const savedConfig = JSON.parse(fs.readFileSync(this.config.configFile, 'utf8'));
                this.config = { ...this.config, ...savedConfig };
            }
            
            // 加载进程状态
            this.loadProcessState();
        } catch (error) {
            console.error('加载配置失败:', error);
        }
    }
    
    // 加载进程状态
    loadProcessState() {
        const stateFile = './process-state.json';
        try {
            if (fs.existsSync(stateFile)) {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                console.log(`📋 加载进程状态: ${Object.keys(state).length} 个进程`);
                
                // 检查这些进程是否还在运行
                for (const [processId, processInfo] of Object.entries(state)) {
                    if (this.isProcessRunning(processInfo.pid)) {
                        console.log(`✅ 恢复进程: ${processId} (PID: ${processInfo.pid})`);
                        // 这里不能直接恢复spawn对象，但可以记录进程信息
                        // 实际的进程管理需要通过PID来处理
                        this.processes.set(processId, {
                            ...processInfo,
                            recovered: true // 标记为恢复的进程
                        });
                    } else {
                        console.log(`❌ 进程已停止: ${processId} (PID: ${processInfo.pid})`);
                    }
                }
            }
        } catch (error) {
            console.error('加载进程状态失败:', error);
        }
    }
    
    // 保存进程状态
    saveProcessState() {
        const stateFile = './process-state.json';
        try {
            const state = {};
            for (const [processId, processInfo] of this.processes) {
                if (processInfo.process && processInfo.process.pid) {
                    state[processId] = {
                        command: processInfo.command,
                        description: processInfo.description,
                        startTime: processInfo.startTime,
                        pid: processInfo.process.pid
                    };
                }
            }
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        } catch (error) {
            console.error('保存进程状态失败:', error);
        }
    }
    
    // 检查进程是否还在运行
    isProcessRunning(pid) {
        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // 保存配置
    saveConfig() {
        try {
            fs.writeFileSync(this.config.configFile, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('保存配置失败:', error);
        }
    }
    
    // 初始化
    init() {
        console.log(`🚀 GOST节点探针启动`);
        console.log(`📋 节点ID: ${this.config.nodeId}`);
        console.log(`🏷️  节点名称: ${this.config.nodeName}`);
        console.log(`🌐 管理面板: ${this.config.panelUrl}`);
        
        this.connect();
        
        // 优雅关闭
        process.on('SIGINT', () => {
            console.log('\n正在关闭节点探针...');
            this.cleanup();
            process.exit(0);
        });
    }
    
    // 连接到管理面板
    connect() {
        try {
            const wsUrl = this.config.panelUrl.replace('http://', 'ws://').replace('https://', 'wss://');
            this.ws = new WebSocket(`${wsUrl}/agent`);
            
            this.ws.on('open', () => {
                console.log('✅ 已连接到管理面板');
                this.register();
                this.startHeartbeat();
                
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
            });
            
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            
            this.ws.on('close', () => {
                console.log('❌ 与管理面板连接断开');
                this.stopHeartbeat();
                this.scheduleReconnect();
            });
            
            this.ws.on('error', (error) => {
                console.error('WebSocket错误:', error);
                this.scheduleReconnect();
            });
            
        } catch (error) {
            console.error('连接失败:', error);
            this.scheduleReconnect();
        }
    }
    
    // 重连调度
    scheduleReconnect() {
        if (this.reconnectTimer) return;
        
        console.log(`⏰ ${this.config.reconnectInterval/1000}秒后尝试重连...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.config.reconnectInterval);
    }
    
    // 注册节点
    register() {
        const nodeInfo = {
            type: 'register',
            data: {
                nodeId: this.config.nodeId,
                nodeName: this.config.nodeName,
                nodeType: this.config.nodeType,
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                uptime: os.uptime(),
                memory: {
                    total: os.totalmem(),
                    free: os.freemem()
                },
                cpus: os.cpus().length,
                networkInterfaces: this.getNetworkInfo(),
                version: require('./package.json').version,
                runningProcesses: this.getRunningProcesses() // 添加当前运行的进程信息
            }
        };
        
        this.sendMessage(nodeInfo);
    }
    
    // 获取当前运行的进程信息
    getRunningProcesses() {
        const runningProcesses = [];
        for (const [processId, processInfo] of this.processes) {
            runningProcesses.push({
                processId,
                command: processInfo.command,
                description: processInfo.description,
                startTime: processInfo.startTime,
                pid: processInfo.process ? processInfo.process.pid : processInfo.pid // 兼容恢复的进程
            });
        }
        return runningProcesses;
    }
    
    // 获取网络信息
    getNetworkInfo() {
        const interfaces = os.networkInterfaces();
        const result = {};
        
        for (const [name, nets] of Object.entries(interfaces)) {
            result[name] = nets.filter(net => !net.internal).map(net => ({
                address: net.address,
                family: net.family,
                mac: net.mac
            }));
        }
        
        return result;
    }
    
    // 开始心跳
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat();
        }, this.config.heartbeatInterval);
    }
    
    // 停止心跳
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    
    // 获取CPU使用率
    async getCpuUsage() {
        return new Promise((resolve) => {
            // 如果有缓存的CPU数据且时间间隔小于500ms，直接返回缓存
            const now = Date.now();
            if (this.lastCpuMeasure && (now - this.lastCpuTime) < 500) {
                resolve(this.lastCpuUsage || 0);
                return;
            }

            const startMeasure = process.cpuUsage();
            const startTime = Date.now();

            setTimeout(() => {
                const endMeasure = process.cpuUsage(startMeasure);
                const endTime = Date.now();
                const totalTime = (endTime - startTime) * 1000; // 转换为微秒

                const cpuPercent = ((endMeasure.user + endMeasure.system) / totalTime) * 100;
                const usage = Math.min(100, Math.max(0, cpuPercent));

                // 缓存结果
                this.lastCpuUsage = usage;
                this.lastCpuTime = now;

                resolve(usage);
            }, 100);
        });
    }



    // 获取网络流量信息
    getNetworkStats() {
        try {
            const { execSync } = require('child_process');
            let networkInfo = { rxBytes: 0, txBytes: 0, rxRate: 0, txRate: 0 };

            if (os.platform() === 'win32') {
                // Windows - 使用 typeperf 或 wmic
                networkInfo = { rxBytes: 0, txBytes: 0, rxRate: 0, txRate: 0 };
            } else {
                // Linux/macOS
                const output = execSync('cat /proc/net/dev 2>/dev/null || netstat -ibn | grep -v "Name"', { encoding: 'utf8' });

                let totalRx = 0, totalTx = 0;
                const lines = output.split('\n');

                for (const line of lines) {
                    if (line.includes(':')) {
                        // Linux format
                        const parts = line.split(/\s+/);
                        if (parts.length >= 10 && !parts[0].includes('lo:')) {
                            totalRx += parseInt(parts[1]) || 0;
                            totalTx += parseInt(parts[9]) || 0;
                        }
                    } else if (line.match(/^\s*\w+/)) {
                        // macOS format
                        const parts = line.split(/\s+/);
                        if (parts.length >= 7 && !parts[0].includes('lo')) {
                            totalRx += parseInt(parts[6]) || 0;
                            totalTx += parseInt(parts[9]) || 0;
                        }
                    }
                }

                // 计算速率 (如果有上次的数据)
                const now = Date.now();
                if (this.lastNetworkStats && this.lastNetworkTime) {
                    const timeDiff = (now - this.lastNetworkTime) / 1000; // 秒
                    networkInfo.rxRate = Math.max(0, (totalRx - this.lastNetworkStats.rxBytes) / timeDiff);
                    networkInfo.txRate = Math.max(0, (totalTx - this.lastNetworkStats.txBytes) / timeDiff);
                }

                networkInfo.rxBytes = totalRx;
                networkInfo.txBytes = totalTx;

                // 保存当前数据用于下次计算速率
                this.lastNetworkStats = { rxBytes: totalRx, txBytes: totalTx };
                this.lastNetworkTime = now;
            }

            return networkInfo;
        } catch (error) {
            console.error('获取网络信息失败:', error);
            return { rxBytes: 0, txBytes: 0, rxRate: 0, txRate: 0 };
        }
    }

    // 发送心跳
    async sendHeartbeat() {
        const cpuUsage = await this.getCpuUsage();
        const networkStats = this.getNetworkStats();

        const heartbeat = {
            type: 'heartbeat',
            data: {
                nodeId: this.config.nodeId,
                timestamp: Date.now(),
                uptime: os.uptime(),
                memory: {
                    total: os.totalmem(),
                    free: os.freemem(),
                    used: os.totalmem() - os.freemem(),
                    usage: (os.totalmem() - os.freemem()) / os.totalmem()
                },
                cpu: {
                    usage: cpuUsage,
                    loadavg: os.loadavg()
                },
                network: networkStats,
                processes: Array.from(this.processes.keys()).map(id => ({
                    id,
                    status: 'running'
                }))
            }
        };

        this.sendMessage(heartbeat);
    }
  // 处理消息
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📨 收到消息: ${message.type}`);
            
            switch (message.type) {
                case 'welcome':
                    console.log(`🎉 ${message.data.message}`);
                    if (message.data.syncedProcesses) {
                        console.log(`📋 同步进程数量: ${message.data.syncedProcesses}`);
                    }
                    break;
                case 'start_gost':
                    this.startGost(message.data);
                    break;
                case 'stop_gost':
                    this.stopGost(message.data);
                    break;
                case 'get_status':
                    this.sendStatus();
                    break;
                case 'update_config':
                    this.updateConfig(message.data);
                    break;
                case 'ping':
                    this.sendMessage({ type: 'pong', data: { nodeId: this.config.nodeId } });
                    break;
                default:
                    console.log(`❓ 未知消息类型: ${message.type}`);
            }
        } catch (error) {
            console.error('处理消息失败:', error);
        }
    }
    
    // 启动GOST进程
    startGost(config) {
        const { processId, command, description } = config;
        
        if (this.processes.has(processId)) {
            this.sendMessage({
                type: 'gost_error',
                data: {
                    processId,
                    error: '进程已在运行中'
                }
            });
            return;
        }
        
        try {
            console.log(`🚀 启动GOST进程: ${command}`);

            // 解析命令
            const commandParts = command.split(' ');
            const executable = commandParts[0]; // 获取可执行文件路径 (./gost)
            const args = commandParts.slice(1); // 获取参数

            const process = spawn(executable, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let output = '';
            let errorOutput = '';
            
            process.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                console.log(`[${processId}] stdout: ${text.trim()}`);
            });
            
            process.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                console.log(`[${processId}] stderr: ${text.trim()}`);
            });
            
            process.on('close', (code) => {
                console.log(`[${processId}] 进程退出，代码: ${code}`);
                this.processes.delete(processId);
                
                this.sendMessage({
                    type: 'gost_stopped',
                    data: {
                        processId,
                        exitCode: code,
                        output: output.slice(-1000), // 只保留最后1000字符
                        error: errorOutput.slice(-1000)
                    }
                });
            });
            
            process.on('error', (error) => {
                console.error(`[${processId}] 进程错误:`, error);
                this.processes.delete(processId);
                
                this.sendMessage({
                    type: 'gost_error',
                    data: {
                        processId,
                        error: error.message
                    }
                });
            });
            
            // 保存进程信息
            this.processes.set(processId, {
                process,
                command,
                description,
                startTime: Date.now()
            });
            
            // 保存进程状态到文件
            this.saveProcessState();
            
            // 发送启动成功消息
            this.sendMessage({
                type: 'gost_started',
                data: {
                    processId,
                    pid: process.pid,
                    command,
                    description
                }
            });
            
        } catch (error) {
            console.error(`启动GOST进程失败:`, error);
            this.sendMessage({
                type: 'gost_error',
                data: {
                    processId,
                    error: error.message
                }
            });
        }
    }
    
    // 停止GOST进程
    stopGost(config) {
        const { processId } = config;
        const processInfo = this.processes.get(processId);
        
        if (!processInfo) {
            this.sendMessage({
                type: 'gost_error',
                data: {
                    processId,
                    error: '进程不存在或未运行'
                }
            });
            return;
        }
        
        try {
            console.log(`🛑 停止GOST进程: ${processId}`);
            processInfo.process.kill('SIGTERM');
            
            // 如果5秒后还没退出，强制杀死
            setTimeout(() => {
                if (this.processes.has(processId)) {
                    console.log(`💀 强制杀死进程: ${processId}`);
                    processInfo.process.kill('SIGKILL');
                }
            }, 5000);
            
        } catch (error) {
            console.error(`停止GOST进程失败:`, error);
            this.sendMessage({
                type: 'gost_error',
                data: {
                    processId,
                    error: error.message
                }
            });
        }
    }
    
    // 发送状态
    sendStatus() {
        const processes = Array.from(this.processes.entries()).map(([id, info]) => ({
            id,
            command: info.command,
            description: info.description,
            startTime: info.startTime,
            pid: info.process.pid,
            uptime: Date.now() - info.startTime
        }));
        
        this.sendMessage({
            type: 'status_report',
            data: {
                nodeId: this.config.nodeId,
                processes,
                system: {
                    uptime: os.uptime(),
                    memory: {
                        total: os.totalmem(),
                        free: os.freemem()
                    },
                    loadavg: os.loadavg()
                }
            }
        });
    }
    
    // 更新配置
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
        
        this.sendMessage({
            type: 'config_updated',
            data: {
                nodeId: this.config.nodeId,
                config: this.config
            }
        });
        
        console.log('✅ 配置已更新');
    }
    
    // 发送消息
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    
    // 清理资源
    cleanup() {
        this.stopHeartbeat();
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        // 停止所有GOST进程
        for (const [processId, processInfo] of this.processes) {
            console.log(`停止进程: ${processId}`);
            try {
                processInfo.process.kill('SIGTERM');
            } catch (error) {
                console.error(`停止进程失败: ${processId}`, error);
            }
        }
        
        if (this.ws) {
            this.ws.close();
        }
    }
}

// 命令行参数解析
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {};
    
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        const value = args[i + 1];
        
        switch (key) {
            case 'panel':
                config.panelUrl = value;
                break;
            case 'name':
                config.nodeName = value;
                break;
            case 'type':
                config.nodeType = value;
                break;
            case 'id':
                config.nodeId = value;
                break;
        }
    }
    
    return config;
}

// 主程序
if (require.main === module) {
    const config = parseArgs();
    new GostNodeAgent(config);
}

module.exports = GostNodeAgent;