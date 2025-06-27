# 系统架构改造计划 (V3.0 - 精简版)

## 1. 目标

在**最小化修改**的前提下，实现以应用为中心的配置模式。通过为应用增加一个“环境类型”标识，来决定现有 `app_secret` 字段的具体用途。

## 2. 核心思路

*   **保留 `app_secret`**: **不移除、不改名**。我们将复用 `app_secret` 字段。
*   **引入环境类型**: 在 `applications` 表中**仅增加一个** `environment_type` 字段。
*   **`app_secret` 的双重语义**:
    *   若应用的 `environment_type` 为 **`test`**，则其 `app_secret` 字段的值被程序视为**一个长期有效的、可直接使用的 `AppKey`**。
    *   若 `environment_type` 为 **`production`** (或未设置，保持默认)，则 `app_secret` 字段的值维持其原有含义，即**用于换取动态 `AppKey` 的凭证**。

## 3. 架构变更图

```mermaid
graph TD
    subgraph "调用流程"
        A[智能体调用] --> B[从DB获取智能体及其应用的完整配置<br>(app_id, app_secret, base_url, environment_type...)];
        B --> C{csgClient};
    end

    subgraph "csgClient 内部逻辑"
        C --> D{判断 application.environment_type};
        D -- "test" --> E[直接使用 application.app_secret<br>作为最终认证Key];
        D -- "production" --> F[使用 application.app_secret<br>调用 getAppKey 换取临时Key];
    end

    subgraph "最终请求"
        E --> G[使用应用的 base_url 和最终Key<br>向目标平台发起请求];
        F --> G;
    end
```

## 4. 详细实施步骤

### 第一步：数据库层 - 最小化变更

*   **文件**: `backend/database/init.js`
*   **操作**: 在 `CREATE TABLE IF NOT EXISTS applications` 语句中，**仅增加一个字段**：
    *   `environment_type VARCHAR(20) NOT NULL DEFAULT 'production' CHECK (environment_type IN ('test', 'production'))`
    *   **关键点**: 设置 `DEFAULT 'production'` 可以确保所有现有应用无缝衔接，其行为与更新前完全一致。

### 第二步：后端 API 层 - 兼容新字段

*   **文件**: `backend/routes/applications.js`
*   **操作**:
    1.  在创建和更新应用的API中，增加对 `environment_type` 字段的处理。
    2.  在获取应用列表和详情的API中，返回 `environment_type` 字段。

### 第三步：核心服务层 - 调整分支逻辑

*   **文件**: `backend/services/csgClient.js`
*   **操作**: 重构 `callAgent` 方法，使其根据 `application.environment_type` 来决定如何使用 `application.app_secret`。
    ```javascript
    // V3.0 伪代码
    async callAgent(application, agentId, message, options) {
      const apiBase = application.base_url;
      let finalAppKey;

      if (application.environment_type === 'test') {
        // 测试应用：app_secret 就是最终的 Key
        finalAppKey = application.app_secret;
      } else { // production
        // 生产应用：app_secret 是用于换取临时 Key 的凭证
        finalAppKey = await this.getAppKey(application.app_id, application.app_secret, apiBase);
      }
      
      // ...后续使用 apiBase 和 finalAppKey 发起请求
    }
    ```

### 第四步：前端界面 - 优化交互提示

*   **文件**: `frontend/src/pages/Applications.tsx`
*   **操作**:
    1.  **应用列表**: 根据 `environment_type` 显示 "测试" 或 "生产" 标签。
    2.  **应用表单**:
        *   提供下拉框让用户选择 `environment_type`。
        *   `app_secret` 输入框的**标签或提示文字**应根据所选类型动态变化，引导用户输入正确的值（是“长期Key”还是“凭证Secret”）。