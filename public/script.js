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

    // 编辑出口任务表单提交
    document.getElementById('edit-exit-task-form').addEventListener('submit', function(e) {
        e.preventDefault();
        saveExitTaskEdit();
    });

    // 编辑入口任务表单提交
    document.getElementById('edit-entry-task-form').addEventListener('submit', function(e) {
        e.preventDefault();
        saveEntryTaskEdit();
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

    // 移除所有导航项的激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // 显示选中的标签内容
    document.getElementById(tabName).classList.add('active');

    // 激活对应的导航项
    event.target.closest('.nav-item').classList.add('active');
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
            // 只在没有打开的模态框时更新节点选项，避免影响用户正在进行的操作
            updateNodeOptionsIfNeeded();
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
                    <p><strong>运行任务:</strong> ${(node.processes || []).length} 个</p>
                    ${lastHeartbeat ? `<p><strong>最后心跳:</strong> ${formatDate(lastHeartbeat)}</p>` : ''}
                    ${node.systemInfo ? `<p><strong>运行时间:</strong> ${formatUptime(node.systemInfo.uptime)}</p>` : ''}
                </div>
                ${node.systemInfo ? `
                <div class="system-stats">
                    <div class="stat-item">
                        <div class="stat-label">CPU</div>
                        <div class="stat-value">${formatCpuUsage(node.systemInfo.cpu)}</div>
                        <div class="stat-bar">
                            <div class="stat-fill cpu-fill" style="width: ${(node.systemInfo.cpu?.usage || 0)}%"></div>
                        </div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">RAM</div>
                        <div class="stat-value">${formatMemoryUsage(node.systemInfo.memory)}</div>
                        <div class="stat-bar">
                            <div class="stat-fill memory-fill" style="width: ${(node.systemInfo.memory?.usage || 0) * 100}%"></div>
                        </div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">上行</div>
                        <div class="stat-value">${formatNetworkRate(node.systemInfo.network?.txRate)}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">下行</div>
                        <div class="stat-value">${formatNetworkRate(node.systemInfo.network?.rxRate)}</div>
                    </div>
                </div>
                ` : ''}
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
                    <p><strong>监听端口:</strong> ${task.port}</p>
                    ${task.customIp ? `<p><strong>自定义IP:</strong> <code>${escapeHtml(task.customIp)}</code></p>` : ''}
                    ${task.customPort ? `<p><strong>连接端口:</strong> ${task.customPort}</p>` : ''}
                    <p><strong>命令:</strong> <code>${escapeHtml(task.command)}</code></p>
                    ${task.description ? `<p><strong>描述:</strong> ${escapeHtml(task.description)}</p>` : ''}
                    <p><strong>创建时间:</strong> ${formatDate(task.createdAt)}</p>
                </div>
                <div class="node-actions">
                    ${task.status === 'running'
                        ? `<button class="btn btn-danger" onclick="stopTask('${task.taskId}')">停止</button>`
                        : `<button class="btn btn-success" onclick="startTask('${task.taskId}')">启动</button>`
                    }
                    <button class="btn btn-secondary" onclick="editExitTask('${task.taskId}')">编辑</button>
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

    // 保存当前选中状态
    const currentSelection = new Set();
    const existingCheckboxes = container.querySelectorAll('.task-checkbox:checked');
    existingCheckboxes.forEach(checkbox => {
        currentSelection.add(checkbox.dataset.taskId);
    });

    container.innerHTML = entryTasks.map(task => {
        const node = nodes.find(n => n.nodeId === task.nodeId);
        const nodeName = node ? node.nodeName : '节点离线';

        const exitTask = task.exitNodeId ? tasks.find(t => t.taskId === task.exitNodeId) : null;
        const exitName = exitTask ? exitTask.name : '直连';

        // 检查是否应该被选中
        const isChecked = currentSelection.has(task.taskId);

        return `
            <div class="node-card task-card ${isChecked ? 'selected' : ''}" data-task-id="${task.taskId}">
                <div class="node-header">
                    <div style="display: flex; align-items: center;">
                        <input type="checkbox" class="task-checkbox" data-task-id="${task.taskId}" ${isChecked ? 'checked' : ''} onchange="updateSelection()">
                        <div class="node-title">${escapeHtml(task.name)}</div>
                    </div>
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
                    <button class="btn btn-secondary" onclick="editEntryTask('${task.taskId}')">编辑</button>
                    <button class="btn btn-danger" onclick="deleteTask('${task.taskId}', '${escapeHtml(task.name)}')">删除</button>
                </div>
            </div>
        `;
    }).join('');

    // 重新更新选择状态和批量操作控件
    updateSelectionAfterRender();
}

// 检查是否有模态框打开
function hasOpenModal() {
    const modals = document.querySelectorAll('.modal');
    return Array.from(modals).some(modal => modal.style.display === 'block');
}

// 智能更新节点选项（避免在模态框打开时更新）
function updateNodeOptionsIfNeeded() {
    // 如果有模态框打开，不更新选项以避免干扰用户操作
    if (hasOpenModal()) {
        return;
    }
    updateNodeOptions();
}

// 更新节点选项
function updateNodeOptions() {
    const exitTaskNodeSelect = document.getElementById('exit-task-node');
    const entryTaskNodeSelect = document.getElementById('entry-task-node');
    const entryTaskExitSelect = document.getElementById('entry-task-exit');

    if (!exitTaskNodeSelect || !entryTaskNodeSelect || !entryTaskExitSelect) {
        return; // 如果元素不存在，直接返回
    }

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

// 打开模态框
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
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

// 防重复提交标志
let isSubmittingExitTask = false;

// 添加出口任务
async function addExitTask() {
    // 防重复提交
    if (isSubmittingExitTask) {
        return;
    }

    const nodeId = document.getElementById('exit-task-node').value;
    const name = document.getElementById('exit-task-name').value.trim();
    const port = document.getElementById('exit-task-port').value || 34343;
    const customIp = document.getElementById('exit-task-custom-ip').value.trim();
    const customPort = document.getElementById('exit-task-custom-port').value;
    const description = document.getElementById('exit-task-description').value.trim();

    if (!nodeId || !name) {
        showError('请选择节点并输入任务名称');
        return;
    }

    isSubmittingExitTask = true;

    // 构建请求数据
    const requestData = {
        nodeId,
        name,
        port: parseInt(port),
        description
    };

    // 添加自定义IP和端口（如果有）
    if (customIp) {
        requestData.customIp = customIp;
    }
    if (customPort) {
        requestData.customPort = parseInt(customPort);
    }

    try {
        const response = await fetch('/api/tasks/exit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
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
    } finally {
        // 重置提交标志
        isSubmittingExitTask = false;
    }
}

// 防重复提交标志
let isSubmittingEntryTask = false;

// 添加入口任务
async function addEntryTask() {
    // 防重复提交
    if (isSubmittingEntryTask) {
        return;
    }

    const nodeId = document.getElementById('entry-task-node').value;
    const name = document.getElementById('entry-task-name').value.trim();
    const localPort = document.getElementById('entry-task-port').value;
    const targetIp = document.getElementById('entry-task-target-ip').value.trim();
    const targetPort = document.getElementById('entry-task-target-port').value;

    isSubmittingEntryTask = true;
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
    } finally {
        // 重置提交标志
        isSubmittingEntryTask = false;
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

// 格式化CPU使用率
function formatCpuUsage(cpu) {
    if (!cpu) return '0%';
    return `${(cpu.usage || 0).toFixed(1)}%`;
}

// 格式化内存使用情况
function formatMemoryUsage(memory) {
    if (!memory) return '0%';

    const used = (memory.used || (memory.total - memory.free)) / (1024 * 1024 * 1024);
    const total = memory.total / (1024 * 1024 * 1024);
    const usage = (memory.usage || 0) * 100;

    return `${used.toFixed(1)}G / ${total.toFixed(1)}G (${usage.toFixed(1)}%)`;
}



// 格式化网络速率
function formatNetworkRate(rate) {
    if (!rate || rate === 0) return '0 B/s';

    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let unitIndex = 0;
    let value = rate;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
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

// 编辑出口任务
function editExitTask(taskId) {
    const task = tasks.find(t => t.taskId === taskId);
    if (!task) {
        showError('任务不存在');
        return;
    }

    if (task.status === 'running') {
        showError('请先停止任务再进行编辑');
        return;
    }

    // 填充表单
    document.getElementById('edit-exit-task-id').value = taskId;
    document.getElementById('edit-exit-task-name').value = task.name;
    document.getElementById('edit-exit-task-port').value = task.port;
    document.getElementById('edit-exit-task-custom-ip').value = task.customIp || '';
    document.getElementById('edit-exit-task-custom-port').value = task.customPort || '';
    document.getElementById('edit-exit-task-description').value = task.description || '';

    openModal('edit-exit-task-modal');
}

// 编辑入口任务
function editEntryTask(taskId) {
    const task = tasks.find(t => t.taskId === taskId);
    if (!task) {
        showError('任务不存在');
        return;
    }

    if (task.status === 'running') {
        showError('请先停止任务再进行编辑');
        return;
    }

    // 填充表单
    document.getElementById('edit-entry-task-id').value = taskId;
    document.getElementById('edit-entry-task-name').value = task.name;
    document.getElementById('edit-entry-task-local-port').value = task.localPort;
    document.getElementById('edit-entry-task-target-ip').value = task.targetIp;
    document.getElementById('edit-entry-task-target-port').value = task.targetPort;
    document.getElementById('edit-entry-task-exit-node').value = task.exitNodeId || '';

    // 设置协议复选框
    document.getElementById('edit-entry-task-tcp').checked = task.protocols.includes('tcp');
    document.getElementById('edit-entry-task-udp').checked = task.protocols.includes('udp');

    // 更新出口节点选项
    updateEditEntryExitNodeOptions();

    openModal('edit-entry-task-modal');
}

// 更新编辑表单中的出口节点选项
function updateEditEntryExitNodeOptions() {
    const select = document.getElementById('edit-entry-task-exit-node');
    const currentValue = select.value;

    const exitTasks = tasks.filter(task => task.type === 'exit');

    select.innerHTML = '<option value="">直连（不使用出口节点）</option>';

    exitTasks.forEach(task => {
        const node = nodes.find(n => n.nodeId === task.nodeId);
        const nodeName = node ? node.nodeName : '节点离线';
        const option = document.createElement('option');
        option.value = task.taskId;
        option.textContent = `${task.name} (${nodeName})`;
        select.appendChild(option);
    });

    // 恢复之前的选择
    select.value = currentValue;
}

// 保存出口任务编辑
async function saveExitTaskEdit() {
    const taskId = document.getElementById('edit-exit-task-id').value;
    const name = document.getElementById('edit-exit-task-name').value.trim();
    const port = document.getElementById('edit-exit-task-port').value;
    const customIp = document.getElementById('edit-exit-task-custom-ip').value.trim();
    const customPort = document.getElementById('edit-exit-task-custom-port').value;
    const description = document.getElementById('edit-exit-task-description').value.trim();

    if (!name) {
        showError('请输入任务名称');
        return;
    }

    const requestData = {
        name,
        description
    };

    if (port) requestData.port = parseInt(port);
    if (customIp) requestData.customIp = customIp;
    if (customPort) requestData.customPort = parseInt(customPort);

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (response.ok) {
            showSuccess('出口任务编辑成功');
            closeModal('edit-exit-task-modal');
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '编辑任务失败');
        }
    } catch (error) {
        console.error('编辑出口任务失败:', error);
        showError('网络错误，请重试');
    }
}

// 保存入口任务编辑
async function saveEntryTaskEdit() {
    const taskId = document.getElementById('edit-entry-task-id').value;
    const name = document.getElementById('edit-entry-task-name').value.trim();
    const localPort = document.getElementById('edit-entry-task-local-port').value;
    const targetIp = document.getElementById('edit-entry-task-target-ip').value.trim();
    const targetPort = document.getElementById('edit-entry-task-target-port').value;
    const exitNodeId = document.getElementById('edit-entry-task-exit-node').value;

    const protocols = [];
    if (document.getElementById('edit-entry-task-tcp').checked) protocols.push('tcp');
    if (document.getElementById('edit-entry-task-udp').checked) protocols.push('udp');

    if (!name || !localPort || !targetIp || !targetPort) {
        showError('请填写所有必填字段');
        return;
    }

    if (protocols.length === 0) {
        showError('请至少选择一种协议');
        return;
    }

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                localPort: parseInt(localPort),
                targetIp,
                targetPort: parseInt(targetPort),
                exitNodeId: exitNodeId || null,
                protocols
            })
        });

        if (response.ok) {
            showSuccess('入口任务编辑成功');
            closeModal('edit-entry-task-modal');
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '编辑任务失败');
        }
    } catch (error) {
        console.error('编辑入口任务失败:', error);
        showError('网络错误，请重试');
    }
}



// 批量操作功能
let selectedTasks = new Set();

// 更新选择状态
function updateSelection() {
    const checkboxes = document.querySelectorAll('.task-checkbox');
    selectedTasks.clear();

    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedTasks.add(checkbox.dataset.taskId);
            checkbox.closest('.task-card').classList.add('selected');
        } else {
            checkbox.closest('.task-card').classList.remove('selected');
        }
    });

    const count = selectedTasks.size;
    document.getElementById('selected-count').textContent = `已选择 ${count} 个任务`;

    const batchControls = document.getElementById('batch-controls');
    if (count > 0) {
        batchControls.style.display = 'flex';
        updateBatchOptions();
    } else {
        batchControls.style.display = 'none';
    }
}

// 渲染后更新选择状态（用于保持选中状态）
function updateSelectionAfterRender() {
    const checkboxes = document.querySelectorAll('.task-checkbox');
    let hasSelection = false;

    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            hasSelection = true;
            selectedTasks.add(checkbox.dataset.taskId);
            checkbox.closest('.task-card').classList.add('selected');
        }
    });

    const count = selectedTasks.size;
    const selectedCountElement = document.getElementById('selected-count');
    if (selectedCountElement) {
        selectedCountElement.textContent = `已选择 ${count} 个任务`;
    }

    const batchControls = document.getElementById('batch-controls');
    if (batchControls) {
        if (count > 0) {
            batchControls.style.display = 'flex';
            updateBatchOptions();
        } else {
            batchControls.style.display = 'none';
        }
    }
}

// 清除选择
function clearSelection() {
    const checkboxes = document.querySelectorAll('.task-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        checkbox.closest('.task-card').classList.remove('selected');
    });
    selectedTasks.clear();
    document.getElementById('batch-controls').style.display = 'none';
}

// 缓存上次的选项数据，避免不必要的重新生成
let lastNodesData = '';
let lastExitTasksData = '';

// 更新批量操作选项
function updateBatchOptions() {
    const nodeSelect = document.getElementById('batch-target-node');
    const exitSelect = document.getElementById('batch-target-exit');

    if (!nodeSelect || !exitSelect) {
        return; // 如果元素不存在，直接返回
    }

    // 保存当前选中状态
    const currentNodeValue = nodeSelect.value;
    const currentExitValue = exitSelect.value;

    // 检查节点数据是否有变化
    const currentNodesData = JSON.stringify(nodes.map(n => ({ id: n.nodeId, name: n.nodeName, hostname: n.hostname })));
    if (currentNodesData !== lastNodesData) {
        lastNodesData = currentNodesData;

        // 更新目标节点选项
        nodeSelect.innerHTML = '<option value="">选择目标节点</option>';
        nodes.forEach(node => {
            const option = document.createElement('option');
            option.value = node.nodeId;
            option.textContent = `${node.nodeName} (${node.hostname})`;
            nodeSelect.appendChild(option);
        });

        // 恢复选中状态
        if (currentNodeValue) {
            nodeSelect.value = currentNodeValue;
        }
    }

    // 检查出口任务数据是否有变化
    const exitTasks = tasks.filter(task => task.type === 'exit');
    const currentExitTasksData = JSON.stringify(exitTasks.map(t => ({
        id: t.taskId,
        name: t.name,
        nodeId: t.nodeId,
        nodeName: nodes.find(n => n.nodeId === t.nodeId)?.nodeName || '节点离线'
    })));

    if (currentExitTasksData !== lastExitTasksData) {
        lastExitTasksData = currentExitTasksData;

        // 更新出口节点选项
        exitSelect.innerHTML = '<option value="">直连（不使用出口节点）</option>';
        exitTasks.forEach(task => {
            const node = nodes.find(n => n.nodeId === task.nodeId);
            const nodeName = node ? node.nodeName : '节点离线';
            const option = document.createElement('option');
            option.value = task.taskId;
            option.textContent = `${task.name} (${nodeName})`;
            exitSelect.appendChild(option);
        });

        // 恢复选中状态
        if (currentExitValue) {
            exitSelect.value = currentExitValue;
        }
    }
}

// 批量切换入口节点
async function batchSwitchNode() {
    const nodeId = document.getElementById('batch-target-node').value;
    if (!nodeId) {
        showError('请选择目标节点');
        return;
    }

    if (selectedTasks.size === 0) {
        showError('请选择要操作的任务');
        return;
    }

    if (!confirm(`确定要将 ${selectedTasks.size} 个任务切换到选定的节点吗？`)) {
        return;
    }

    await performBatchOperation('switch_node', { nodeId });
}

// 批量切换出口节点
async function batchSwitchExit() {
    const exitNodeId = document.getElementById('batch-target-exit').value;

    if (selectedTasks.size === 0) {
        showError('请选择要操作的任务');
        return;
    }

    const exitName = exitNodeId ?
        tasks.find(t => t.taskId === exitNodeId)?.name || '未知出口' :
        '直连';

    if (!confirm(`确定要将 ${selectedTasks.size} 个任务切换到 "${exitName}" 吗？`)) {
        return;
    }

    await performBatchOperation('switch_exit', { exitNodeId });
}

// 批量停止任务
async function batchStopTasks() {
    if (selectedTasks.size === 0) {
        showError('请选择要操作的任务');
        return;
    }

    if (!confirm(`确定要停止 ${selectedTasks.size} 个任务吗？`)) {
        return;
    }

    await performBatchOperation('stop');
}

// 批量删除任务
async function batchDeleteTasks() {
    if (selectedTasks.size === 0) {
        showError('请选择要操作的任务');
        return;
    }

    if (!confirm(`确定要删除 ${selectedTasks.size} 个任务吗？此操作不可恢复！`)) {
        return;
    }

    await performBatchOperation('delete');
}

// 执行批量操作
async function performBatchOperation(action, params = {}) {
    try {
        const requestData = {
            action,
            taskIds: Array.from(selectedTasks),
            ...params
        };

        const response = await fetch('/api/tasks/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (response.ok) {
            const result = await response.json();
            showSuccess(result.message);

            // 显示详细结果
            if (result.errorCount > 0) {
                const errors = result.results.filter(r => !r.success);
                console.log('批量操作错误:', errors);
            }

            clearSelection();
            loadData();
        } else {
            const error = await response.json();
            showError(error.error || '批量操作失败');
        }
    } catch (error) {
        console.error('批量操作失败:', error);
        showError('网络错误，请重试');
    }
}

// 页面加载时获取数据
loadData();

// 定期刷新数据
setInterval(loadData, 1000); // 每1秒刷新一次