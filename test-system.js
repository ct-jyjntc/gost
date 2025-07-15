#!/usr/bin/env node

// GOST分布式管理系统测试脚本

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 GOST分布式管理系统测试');
console.log('================================');

// 启动管理面板
console.log('🚀 启动管理面板...');
const panel = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname
});

// 等待3秒后启动节点探针
setTimeout(() => {
    console.log('\n🔌 启动节点探针...');
    const agent = spawn('node', ['agent.js', '--panel', 'ws://localhost:3000', '--name', '测试节点'], {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'agent')
    });
    
    // 处理退出
    process.on('SIGINT', () => {
        console.log('\n🛑 正在关闭测试系统...');
        panel.kill();
        agent.kill();
        process.exit(0);
    });
    
}, 3000);

console.log('\n📱 管理面板地址: http://localhost:3000');
console.log('⏹️  按 Ctrl+C 停止测试');