# SimpleA2A系统更新版部署指南

## 重要更新

本指南反映了针对用户提出的4个关键问题的解决方案：

1. **环境切换功能**：在系统配置页面提供测试/生产环境切换
2. **输出配置细化**：支持具体的datasheet、record和操作类型选择
3. **astral_vika库架构重构**：从子进程模式重构为HTTP微服务架构
4. **性能优化**：解决N+1查询问题，添加智能缓存机制

## 新架构特点

### Python微服务架构
- **独立Python服务**：使用FastAPI创建专门的维格表API服务
- **HTTP通信**：Node.js后端通过HTTP调用Python服务，替代低效的子进程模式
- **正确的API调用**：使用astral_vika库的正确调用方式（`vika.datasheet().records.acreate()`等）
- **智能缓存**：多层缓存机制，支持精确的缓存失效
- **QPS控制**：内置请求频率限制，支持2-20 QPS范围调节

### 增强的输出配置
- **操作类型选择**：创建、更新、追加、Upsert操作
- **记录级控制**：支持指定具体的recordId或匹配条件
- **动态变量**：支持`${recordId}`、`${taskId}`等动态变量
- **字段映射**：可视化的字段映射配置界面

## 部署架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   前端 (React)   │    │  后端 (Node.js)  │    │ Python微服务     │
│                 │    │                 │    │ (FastAPI)       │
│ http://10.121   │◄──►│ Port: 3000      │◄──►│ Port: 5001      │
│ .232.66/        │    │                 │    │                 │
│ simpleA2A       │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                        ┌─────────────────┐    ┌─────────────────┐
                        │   SQLite/MySQL  │    │   维格表 API     │
                        │   (系统数据)     │    │                 │
                        └─────────────────┘    └─────────────────┘
```

## 安装步骤

### 1. 环境准备

确保以下软件已安装：
- **Node.js** >= 16.0.0
- **Python** >= 3.8
- **Apache24**（已有）
- **MySQL**（已有，不会影响）

### 2. 安装Python依赖

```bash
cd C:\Apache24\htdocs\www\fastadmin\public\simpleA2A\backend\python_service
pip install -r requirements.txt
```

依赖包括：
- `fastapi==0.104.1`
- `uvicorn[standard]==0.24.0`
- `astral_vika`
- `pydantic==2.5.0`

### 3. 安装Node.js依赖

```bash
cd C:\Apache24\htdocs\www\fastadmin\public\simpleA2A\backend
npm install
```

新增依赖：
- `axios` - HTTP客户端
- `concurrently` - 并发进程管理

### 4. 服务启动

#### 方法一：分别启动（推荐用于生产）

```bash
# 启动Python微服务
cd C:\Apache24\htdocs\www\fastadmin\public\simpleA2A\backend
npm run start-python

# 另开终端启动Node.js后端
npm start
```

#### 方法二：同时启动（推荐用于开发）

```bash
cd C:\Apache24\htdocs\www\fastadmin\public\simpleA2A\backend

# 开发模式（自动重载）
npm run dev-all

# 生产模式
npm run start-all
```

### 5. Windows服务配置

创建Python微服务的Windows服务：

```bash
# 安装nssm（Non-Sucking Service Manager）
# 下载：https://nssm.cc/download

# 创建Python服务
nssm install SimpleA2A-Python
nssm set SimpleA2A-Python Application "C:\Python\python.exe"
nssm set SimpleA2A-Python AppParameters "C:\Apache24\htdocs\www\fastadmin\public\simpleA2A\backend\python_service\start_service.py"
nssm set SimpleA2A-Python AppDirectory "C:\Apache24\htdocs\www\fastadmin\public\simpleA2A\backend\python_service"
nssm start SimpleA2A-Python

# 创建Node.js服务
nssm install SimpleA2A-Backend
nssm set SimpleA2A-Backend Application "C:\nodejs\node.exe"
nssm set SimpleA2A-Backend AppParameters "app.js"
nssm set SimpleA2A-Backend AppDirectory "C:\Apache24\htdocs\www\fastadmin\public\simpleA2A\backend"
nssm start SimpleA2A-Backend
```

## 系统配置

### 1. 环境切换

访问 `http://10.121.232.66/simpleA2A/system-config`：

1. 点击"系统设置"标签页
2. 在"运行环境"下拉菜单中选择：
   - **测试环境**：使用OpenAI格式API（如DeepSeek）
   - **生产环境**：使用内网智能体平台
3. 点击"保存配置"

### 2. 维格表配置

在"维格表配置"标签页：

```json
{
  "用户Token": "uskoInjR7NrA4OfkL97qN37",
  "API地址": "https://api.vika.cn/fusion/v1",
  "空间站ID": "spcBxkW6UiuzT",
  "QPS限制": 2
}
```

点击"测试连接"验证配置。

### 3. 输出配置管理

访问 `http://10.121.232.66/simpleA2A/output-configs`：

#### 创建新的输出配置

1. 点击"新建配置"
2. 选择类型为"维格表"
3. 配置详细参数：

```json
{
  "名称": "销售数据输出",
  "类型": "维格表",
  "空间站": "spcBxkW6UiuzT",
  "数据表": "dst销售记录表ID",
  "操作类型": "create", // create|update|append|upsert
  "字段映射": {
    "客户名称": "fld客户名称字段ID",
    "销售金额": "fld销售金额字段ID",
    "销售日期": "fld销售日期字段ID"
  }
}
```

#### 高级配置选项

**更新指定记录**：
```json
{
  "操作类型": "update",
  "目标记录ID": "${recordId}", // 支持动态变量
  "字段映射": {
    "状态": "fld状态字段ID",
    "更新时间": "fld更新时间字段ID"
  }
}
```

**Upsert操作**：
```json
{
  "操作类型": "upsert",
  "匹配条件": {
    "fld客户ID字段": "${customerId}"
  },
  "字段映射": {
    "客户名称": "fld客户名称字段ID",
    "最后更新": "fld最后更新字段ID"
  }
}
```

### 4. 智能体配置

在"智能体管理"页面为每个智能体配置输出规范：

```json
{
  "name": "销售数据分析师",
  "agentId": "sales-analyst-001",
  "outputConfig": {
    "defaultOutputId": "output-config-001",
    "supportedOperations": ["create", "update"],
    "requiredFields": ["客户名称", "销售金额"]
  }
}
```

## 智能体Prompt规范（更新版）

### 增强的输出格式

智能体现在支持更精确的维格表操作：

```
# 创建新记录
```json:vika-operation
{
  "operation": "create",
  "datasheet": "dst123456",
  "data": {
    "客户名称": "张三公司",
    "销售金额": 50000,
    "销售日期": "2024-06-24"
  }
}
```

# 更新指定记录
```json:vika-operation
{
  "operation": "update",
  "datasheet": "dst123456",
  "recordId": "rec789012",
  "data": {
    "状态": "已完成",
    "完成时间": "2024-06-24 17:46:15"
  }
}
```

# Upsert操作（存在则更新，不存在则创建）
```json:vika-operation
{
  "operation": "upsert",
  "datasheet": "dst123456",
  "query": {
    "filter": "客户ID = 'CUST001'"
  },
  "data": {
    "客户名称": "更新后的公司名",
    "最后联系时间": "2024-06-24"
  }
}
```

# 批量操作
```json:vika-operation
{
  "operation": "batch",
  "datasheet": "dst123456",
  "operations": [
    {
      "type": "create",
      "data": {"客户名称": "客户A", "金额": 1000}
    },
    {
      "type": "update", 
      "recordId": "rec123",
      "data": {"状态": "已处理"}
    }
  ]
}
```
```

## API接口更新

### 新增的维格表服务状态接口

```http
GET /api/v1/config/vika/status
```

响应：
```json
{
  "success": true,
  "data": {
    "python_service": {
      "status": "healthy",
      "cache_size": 25,
      "config_loaded": true
    },
    "connection_test": {
      "success": true,
      "message": "维格表连接成功"
    }
  }
}
```

### 缓存管理接口

```http
DELETE /api/v1/config/cache/vika?pattern=records:dst123456
```

### 批量操作接口

```http
POST /api/v1/config/vika/batch
Content-Type: application/json

{
  "operations": [
    {
      "type": "create_record",
      "data": {
        "datasheet_id": "dst123456",
        "records": [{"fields": {"名称": "测试"}}]
      }
    }
  ]
}
```

## 性能优化

### 缓存策略
- **空间站信息**：1小时缓存
- **数据表结构**：1小时缓存
- **记录数据**：5分钟缓存
- **写操作后自动清除相关缓存**

### QPS控制
- **默认限制**：2 QPS
- **可调范围**：2-20 QPS
- **智能限流**：按操作类型分别限制

### 批量优化
- **空间站配置**：并行获取所有数据表信息，解决N+1查询问题
- **批量操作**：支持一次请求执行多个维格表操作
- **连接复用**：Python服务保持长连接，避免重复初始化

## 故障排除

### 常见问题

#### 1. Python服务无法启动
```bash
# 检查依赖
cd python_service
python -c "import fastapi; import astral_vika; print('依赖正常')"

# 手动启动调试
python start_service.py --reload
```

#### 2. 维格表连接失败
- 检查Token是否有效
- 验证空间站ID是否正确
- 确认QPS限制设置

#### 3. 环境切换不生效
- 检查系统配置页面的环境选择
- 重启后端服务
- 清除浏览器缓存

#### 4. 输出配置不工作
- 验证字段映射是否正确
- 检查数据表权限
- 查看任务执行日志

### 日志查看

```bash
# Python服务日志
tail -f python_service/logs/vika_service.log

# Node.js服务日志
tail -f logs/app.log

# 缓存状态
curl http://127.0.0.1:5001/cache/stats
```

## 部署检查清单

- [ ] Python依赖已安装
- [ ] Node.js依赖已安装
- [ ] Python微服务正常启动（端口5001）
- [ ] Node.js后端正常启动（端口3000）
- [ ] Apache代理配置正确
- [ ] 维格表连接测试通过
- [ ] 环境切换功能正常
- [ ] 输出配置页面可访问
- [ ] 智能体Prompt规范已更新

## 维护与监控

### 定期维护
- **每周**：清理过期缓存
- **每月**：检查日志文件大小
- **季度**：更新依赖包版本

### 监控指标
- Python服务健康状态
- 维格表API调用成功率
- 缓存命中率
- 任务执行成功率

---

**版本**：2.0.0  
**更新日期**：2024-06-24  

**主要改进**：
- 重构维格表服务架构
- 增强输出配置功能
- 添加环境切换支持
- 解决性能瓶颈问题