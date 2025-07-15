// 全局变量
let nodes = [];
let tasks = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 出口任务表单提交
    document.getElementById('add-exit-task-form').addEventListener('submit', function(e) {
        e.preventDefault();
        addExitTask();
    });
    
    // 入口任务表单提交
    document.getElementById('add-entry-task-form').addEventListener('submit', function(e) {
        e.preventDefault();
        addEntryTask();
    });
    
    // 模态框点击外部关闭
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// 切换标签页
function showTab(tabName) {
    // 隐藏所有标签内容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 移除所有标签按钮的激活状态
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // 显示选中的标签内容
    document.getElementById(tabName).classList.add('active');
    
    // 激活对应的标签按钮
    event.target.classList.add('active');
}

// 加载数据
async function loadData() {
    try {
        const response = await fetch('/api/nodes');
        if (response.ok) {
            const data = await response.json();
            nodes = data.nodes || [];
            tasks = data.tasks || [];
            
            renderNodes();
            renderExitTasks();
            renderEntryTasks();
            updateNodeOptions();
        } else {
            showError('加载数据失败');
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        showError('网络错误，请检查服务器连接');
    }
}

// 刷新数据
function refreshNodes() {
    loadData();
    showSuccess('数据已刷新');
}

// 渲染节点列表
function renderNodes() {
    const container = document.getElementById('nodes-list');
    
    if (nodes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>暂无节点连接</h3>
                <p>请在服务器上部署节点探针并连接到管理面板</p>
                <button class="btn btn-primary" onclick="showNodeGuideModal()">查看部署指南</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = nodes.map(node => {
        const lastHeartbeat = node.lastHeartbeat ? new Date(node.lastHeartbeat) : null;
        const isOnline = lastHeartbeat && (Date.now() - lastHeartbeat.getTime()) < 60000; // 1分钟内有心跳
        
        return `
            <div class="node-card">
                <div class="node-header">
                    <div class="node-title">
                        ${escapeHtml(node.nodeName)}
                        <span class="node-type">[${node.nodeType}]</span>
                    </div>
                    <div class="node-status ${isOnline ? 'status-running' : 'status-stopped'}">
                        ${isOnline ? '在线' : '离线'}
                    </div>
                </div>
                <div class="node-info">
                    <p><strong>节点ID:</strong> ${escapeHtml(node.nodeId)}</p>
                    <p><strong>主机名:</strong> ${escapeHtml(node.hostname)}</p>
                    <p><strong>平台:</strong> ${escapeHtml(node.platform)}</p>
                    ${node.systemInfo ? `
                        <p><strong>内存使用:</strong> ${formatMemory(node.systemInfo.memory)}</p>
                        <p><strong>运行时间:</strong> ${formatUptime(node.systemInfo.uptime)}</p>
                    ` : ''}
                    <p><strong>运行任务:</strong> ${(node.processes || []).length} 个</p>
                    ${lastHeartbeat ? `<p><strong>最后心跳:</strong> ${formatDate(lastHeartbeat)}</p>` : ''}
                </div>
                <div class="node-actions">
                    <button class="btn btn-primary" onclick="showNodeDetails('${node.nodeId}')">详情</button>
                    ${isOnline ? `
                        <button class="btn btn-success" onclick="pingNode('${node.nodeId}')">测试连接</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// 渲染出口任务列表
function renderExitTasks() {
    const container = document.getElementById('exit-tasks-list');
    const exitTasks = tasks.filter(task => task.type === 'exit');
    
    if (exitTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>暂无出口任务</h3>
                <p>点击上方按钮添加第一个出口任务</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = exitTasks.map(task => {
        const node = nodes.find(n => n.nodeId === task.nodeId);
        const nodeName = node ? node.nodeName : '节点离线';
        
        return `
            <div class="node-card">
                <div class="node-header">
                    <div class="node-title">${escapeHtml(task.name)}</div>
                    <div class="node-status ${getTaskStatusClass(task.status)}">
                        ${getTaskStatusText(task.status)}
                    </div>
                </div>
                <div class="node-info">
                    <p><strong>节点:</strong> ${escapeHtml(nodeName)}</p>
                    <p><strong>端口:</strong> ${task.port}</p>
                    <p><strong>命令:</strong> <code>${escapeHtml(task.command)}</code></p>
                    ${task.description ? `<p><strong>描述:</strong> ${escapeHtml(task.description)}</p>` : ''}
                    <p><strong>创建时间:</strong> ${formatDate(task.createdAt)}</p>
                </div>
                <div class="node-actions">
                    ${task.status === 'running' 
                        ? `<button class="btn btn-danger" onclick="stopTask('${task.taskId}')">停止</button>`
                        : `<button class="btn btn-success" onclick="startTask('${task.taskId}')">启动</button>`
                    }
                    <button class="btn btn-danger" onclick="deleteTask('${task.taskId}', '${escapeHtml(task.name)}')">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

// 渲染入口任务列表
function renderEntryTasks() {
    const container = document.getElementById('entry-tasks-list');
    const entryTasks = tasks.filter(task => task.type === 'entry');
    
    if (entryTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>暂无入口任务</h3>
                <p>点击上方按钮添加第一个入口任务</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = entryTasks.map(task => {
        const node = nodes.find(n => n.nodeId === task.nodeId);
        const nodeName = node ? node.nodeName : '节点离线';
        
        const exitTask = task.exitNodeId ? tasks.find(t => t.taskId === task.exitNodeId) : null;
        const exitName = exitTask ? exitTask.name : '直连';
        
        return `
            <div class="node-card">
                <div class="node-header">
                    <div class="node-title">${escapeHtml(task.name)}</div>
                    <div class="node-status ${getTaskStatusClass(task.status)}">
                        ${getTaskStatusText(task.status)}
                    </div>
                </div>
                <div class="node-info">
                    <p><strong>节点:</strong> ${escapeHtml(nodeName)}</p>
                    <p><strong>本地端口:</strong> ${task.localPort}</p>
                    <p><strong>目标地址:</strong> ${escapeHtml(task.targetIp)}:${task.targetPort}</p>
                    <p><strong>协议:</strong> ${task.protocols.join(', ').toUpperCase()}</p>
                    <p><strong>出口任务:</strong> ${escapeHtml(exitName)}</p>
                    <p><strong>命令:</strong> <code>${escapeHtml(task.command)}</code></p>
                    <p><strong>创建时间:</strong> ${formatDate(task.createdAt)}</p>
                </div>
                <div class="node-actions">
                    ${task.status === 'running' 
                        ? `<button class="btn btn-danger" onclick="stopTask('${task.taskId}')">停止</button>`
                        : `<button class="btn btn-success" onclick="startTask('${task.taskId}')">启动</button>`
                    }
                    <button class="btn btn-danger" onclick="deleteTask('${task.taskId}', '${escapeHtml(task.name)}')">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

// 更新节点选项
function updateNodeOptions() {
    const exitTaskNodeSelect = document.getElementById('exit-task-node');
    const entryTaskNodeSelect = document.getElementById('entry-task-node');
    const entryTaskExitSelect = document.getElementById('entry-task-exit');
    
    // 更新节点选项
    [exitTaskNodeSelect, entryTaskNodeSelect].forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">请选择节点</option>';
        
        nodes.forEach(node => {
            const option = document.createElement('option');
            option.value = node.nodeId;
            option.textContent = `${node.nodeName} (${node.nodeType})`;
            select.appendChild(option);
        });
        
        if (currentValue) {
            select.value = currentValue;
        }
    });
    
    // 更新出口任务选项
    const currentExitValue = entryTaskExitSelect.value;
    entryTaskExitSelect.innerHTML = '<option value="">直连（不使用出口）</option>';
    
    const exitTasks = tasks.filter(task => task.type === 'exit');
    exitTasks.forEach(task => {
        const node = nodes.find(n => n.nodeId === task.nodeId);
        const option = document.createElement('option');
        option.value = task.taskId;
        option.textContent = `${task.name} (${node ? node.nodeName : '离线'})`;
        entryTaskExitSelect.appendChild(option);
    });
    
    if (currentExitValue) {
        entryTaskExitSelect.value = currentExitValue;
    }
}// 显示模态框函数

function showNodeGuideModal() {
    document.getElementById('node-guide-modal').style.display = 'block';
}

function showAddExitTaskModal() {
    updateNodeOptions();
    document.getElementById('add-exit-task-modal').style.display = 'block';
    document.getElementById('exit-task-name').focus();
}

function showAddEntryTaskModal() {
    updateNodeOptions();
    document.getElementById('add-entry-task-modal').style.display = 'block';
    document.getElementById('entry-task-name').focus();
}

// 关闭模态框
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // 清空表单
    const form = document.querySelector(`#${modalId} form`);
    if (form) {
        form.reset();
    }
}

// 添加出口任务
async function addExitTask() {
    const nodeId = document.getElementById('exit-task-node').value;
    const name = document.getElementById('exit-task-name').value.trim();
    const port = document.getElementById('exit-task-port').value || 34343;
    const description = document.getElementById('exit-task-description').value.trim();
    
    if (!nodeId || !name) {
        showError('请选择节点并输入任务名称');
        return;
    }
    
    try {
        const response = await fetch('/api/tasks/exit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nodeId, name, port: parseInt(port), description })
        });
        
        if (response.ok) {
            showSuccess('出口任务添加成功');
            closeModal('add-exit-task-modal');
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '添加任务失败');
        }
    } catch (error) {
        console.error('添加出口任务失败:', error);
        showError('网络错误，请重试');
    }
}

// 添加入口任务
async function addEntryTask() {
    const nodeId = document.getElementById('entry-task-node').value;
    const name = document.getElementById('entry-task-name').value.trim();
    const localPort = document.getElementById('entry-task-port').value;
    const targetIp = document.getElementById('entry-task-target-ip').value.trim();
    const targetPort = document.getElementById('entry-task-target-port').value;
    const exitNodeId = document.getElementById('entry-task-exit').value;
    
    // 获取选中的协议
    const protocols = [];
    if (document.getElementById('entry-protocol-tcp').checked) protocols.push('tcp');
    if (document.getElementById('entry-protocol-udp').checked) protocols.push('udp');
    
    // 验证输入
    if (!nodeId || !name || !localPort || !targetIp || !targetPort) {
        showError('请填写所有必填字段');
        return;
    }
    
    if (protocols.length === 0) {
        showError('请至少选择一种协议');
        return;
    }
    
    if (localPort < 1 || localPort > 65535) {
        showError('端口号必须在1-65535之间');
        return;
    }
    
    if (targetPort < 1 || targetPort > 65535) {
        showError('目标端口号必须在1-65535之间');
        return;
    }
    
    try {
        const response = await fetch('/api/tasks/entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nodeId,
                name,
                localPort: parseInt(localPort),
                targetIp,
                targetPort: parseInt(targetPort),
                exitNodeId: exitNodeId || null,
                protocols
            })
        });
        
        if (response.ok) {
            showSuccess('入口任务添加成功');
            closeModal('add-entry-task-modal');
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '添加任务失败');
        }
    } catch (error) {
        console.error('添加入口任务失败:', error);
        showError('网络错误，请重试');
    }
}

// 启动任务
async function startTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/start`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showSuccess('启动命令已发送');
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '启动任务失败');
        }
    } catch (error) {
        console.error('启动任务失败:', error);
        showError('网络错误，请重试');
    }
}

// 停止任务
async function stopTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/stop`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showSuccess('停止命令已发送');
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '停止任务失败');
        }
    } catch (error) {
        console.error('停止任务失败:', error);
        showError('网络错误，请重试');
    }
}

// 删除任务
async function deleteTask(taskId, taskName) {
    if (!confirm(`确定要删除任务 "${taskName}" 吗？此操作不可撤销。`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('任务删除成功');
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '删除任务失败');
        }
    } catch (error) {
        console.error('删除任务失败:', error);
        showError('网络错误，请重试');
    }
}

// 测试节点连接
async function pingNode(nodeId) {
    // 这里可以实现ping节点的功能
    showSuccess('连接测试功能待实现');
}

// 显示节点详情
function showNodeDetails(nodeId) {
    const node = nodes.find(n => n.nodeId === nodeId);
    if (!node) return;
    
    alert(`节点详情：\n节点ID: ${node.nodeId}\n节点名称: ${node.nodeName}\n主机名: ${node.hostname}\n平台: ${node.platform}`);
}

// 工具函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

function formatMemory(memory) {
    if (!memory) return 'N/A';
    const used = memory.total - memory.free;
    const usedGB = (used / 1024 / 1024 / 1024).toFixed(1);
    const totalGB = (memory.total / 1024 / 1024 / 1024).toFixed(1);
    const percentage = ((used / memory.total) * 100).toFixed(1);
    return `${usedGB}GB / ${totalGB}GB (${percentage}%)`;
}

function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}天 ${hours}小时 ${minutes}分钟`;
    } else if (hours > 0) {
        return `${hours}小时 ${minutes}分钟`;
    } else {
        return `${minutes}分钟`;
    }
}

function getTaskStatusClass(status) {
    switch (status) {
        case 'running':
            return 'status-running';
        case 'starting':
        case 'stopping':
            return 'status-warning';
        case 'error':
            return 'status-error';
        default:
            return 'status-stopped';
    }
}

function getTaskStatusText(status) {
    switch (status) {
        case 'running':
            return '运行中';
        case 'starting':
            return '启动中';
        case 'stopping':
            return '停止中';
        case 'stopped':
            return '已停止';
        case 'error':
            return '错误';
        default:
            return '未知';
    }
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        max-width: 300px;
        word-wrap: break-word;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        ${type === 'success' ? 'background: #28a745;' : 'background: #dc3545;'}
    `;
    
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 定期刷新数据
setInterval(loadData, 10000); // 每10秒刷新一次