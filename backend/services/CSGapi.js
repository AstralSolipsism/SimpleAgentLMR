class CSGIntranetClient {
  /**
   * 日志等级常量定义：
   * - SILENT  (0): 完全禁用所有日志输出
   * - ERROR   (1): 仅记录严重错误信息，影响系统正常运行的致命问题
   * - WARN    (2): 记录警告信息，包含可恢复的异常或潜在问题
   * - INFO    (3): 常规运行信息，记录关键业务流程节点状态
   * - DEBUG   (4): 调试信息，包含请求头、参数等开发调试所需细节
   * - VERBOSE (5): 原始数据级别，记录网络层完整请求/响应内容和二进制数据
   * 
   * 使用示例：
   * 1. 生产环境推荐: WARN 或 INFO
   * 2. 开发调试推荐: DEBUG
   * 3. 网络问题排查: VERBOSE
   * 
   * 级别排序：SILENT < ERROR < WARN < INFO < DEBUG < VERBOSE
   */
  static LOG_LEVELS = {
    SILENT: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
    VERBOSE: 5
  };

  /**
 * 消息对象结构
 * @typedef {Object} MessageObject
 * @property {'user'|'assistant'} role - 消息角色
 * @property {string} content - 消息内容
 */

  /**
   * 创建API客户端实例
   * @param {Object} config - 客户端配置
   * @param {string} config.baseUrl - 服务基础地址（需包含协议和端口）
   * @param {string} config.appId - 应用ID
   * @param {string} config.appSecret - 应用密钥
   * @param {number} config.agentId - 智能体ID
   * @param {number} [config.timeout=300000] - 请求超时时间（毫秒），默认5分钟
   * @param {Object} [config.customHeaders] - 自定义透传参数（需以"ext-"开头）
   * @param {string} [config.logLevel='VERBOSE'] - 日志等级，支持：
   *   - 数值：0(SILENT)~5(VERBOSE)
   *   - 字符串：'silent'/'error'/'warn'/'info'/'debug'/'verbose'
   * @param {function} [config.logger=console.log] - 日志记录函数
   */
  constructor({
    baseUrl = 'https://10.10.65.104:5030',
    appId = '',
    appSecret = '',
    agentId = 133150132,
    timeout = 300000,
    customHeaders = {},
    logLevel = 'VERBOSE',
    logger = console.log
  }) {

    if (!baseUrl.startsWith('https://')) {
      throw new Error('必须使用HTTPS协议');
    }

    this.config = {
      baseUrl: baseUrl.replace(/\/$/, ''),
      appId,
      appSecret,
      agentId,
      timeout,
      customHeaders,
      logger: (message, level = 'info') => {
        const levels = ['error', 'warn', 'info', 'debug'];
        if (!levels.includes(level)) level = 'info';
        const prefixMap = {
          error: '[ERROR]',
          warn: '[WARN] ',
          info: '[INFO] ',
          debug: '[DEBUG]'
        };

        console.log(`${prefixMap[level]} [${new Date().toISOString()}] ${message}`);
      }
    };

    this._initLogger(logLevel);

    // 安全控制字段
    this.appKey = null;           // 当前有效的appKey
    this.appKeyPromise = null;    // 正在进行的appKey请求Promise
    this.appKeyExpire = 0;        // appKey过期时间戳（毫秒）

    Object.keys(this.config.customHeaders).forEach(key => {
      if (!key.startsWith('ext-')) {
        throw new Error(`自定义头参数 "${key}" 必须使用 "ext-" 前缀`);
      }
    });

    this.appKey = null;
    this.endUrls = {
      getAppKey: '/knowledgeService/extSecret/generateAppKey',
      chat: '/knowledgeService/extChatApi/v2/chat',
      knowledgeQuery: '/knowledgeService/extChatApi/v2/queryVector'
    };
  }

  /**
   * 初始化日志系统
   * @private
   * @param {number|string} level - 日志等级配置
   */
  _initLogger(level) {
    // 统一日志级别转换
    if (typeof level === 'string') {
      const upperLevel = level.toUpperCase();
      this.logLevel = CSGIntranetClient.LOG_LEVELS[upperLevel] ?? 3;
    } else {
      this.logLevel = Math.min(Math.max(level, 0), 5);
    }

    // 保存原始logger（用户自定义或默认的console.log）
    const originalLogger = this.config.logger;

    // 用分级控制逻辑包裹原始logger
    this.config.logger = (message, level = 'info') => {
      // 1. SILENT级别直接拦截
      if (this.logLevel === CSGIntranetClient.LOG_LEVELS.SILENT) return;

      // 2. 级别映射和标准化
      const levelMap = {
        error: 1, warn: 2, info: 3, debug: 4, verbose: 5
      };
      const normalizedLevel = level.toLowerCase();
      const currentLevel = levelMap[normalizedLevel] ?? 3;

      // 3. 强制记录ERROR/WARN（即使当前日志级别低于它们）
      const isForceLevel = ['error', 'warn'].includes(normalizedLevel);

      // 4. 执行过滤
      if (!isForceLevel && currentLevel > this.logLevel) return;

      // 5. 调用原始logger，并传入标准化后的level
      originalLogger(message, normalizedLevel);
    };
  }




  /**
   * 通用请求方法
   * @private
   * @param {string} endUrl - API端点路径
   * @param {Object} options - 请求配置
   * @returns {Promise<Object|ReadableStream>} 返回JSON对象或流对象
   */
  async _request(endUrl, { headers = {}, body, method = 'POST' }) {
    // 生成请求唯一标识
    const requestId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();

    // 安全处理敏感信息
    const sanitizedHeaders = {
      ...headers,
      'appId': this.config.appId?.replace(/(?<=.{3})./g, '*'),
      'appKey': this.appKey ? `${this.appKey.substr(0, 4)}****` : '未获取'
    };

    // 请求开始日志
    this.config.logger(`[请求开始] ID:${requestId}`, 'debug');
    this.config.logger(`| URL    : ${this.config.baseUrl}${endUrl}`, 'debug');
    this.config.logger(`| 超时   : ${this.config.timeout}ms`, 'debug');
    this.config.logger(`| 头部   : ${JSON.stringify(sanitizedHeaders)}`, 'debug');
    this.config.logger(`| 体内容 : ${JSON.stringify(body) || 0} bytes`, 'debug');

    // 详细日志模式记录完整内容
    if (this.config.logLevel >= CSGIntranetClient.LOG_LEVELS.VERBOSE) {
      const sanitizedBody = { ...body };
      // 过滤敏感字段
      ['password', 'token'].forEach(field => {
        if (sanitizedBody[field]) sanitizedBody[field] = '****';
      });
      this.config.logger(`| 详细体 : ${JSON.stringify(sanitizedBody)}`, 'debug');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.config.logger(`[请求超时] ID:${requestId}`, 'error');
    }, this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${endUrl}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'appId': this.config.appId,
          'appKey': this.appKey,
          ...this.config.customHeaders,
          ...headers
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseMeta = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
        redirected: response.redirected,
        type: response.type,
        url: response.url
      };

      // 响应日志
      const duration = Date.now() - startTime;
      this.config.logger(`[请求完成] ID:${requestId} 状态码:${response.status} 耗时:${duration}ms`, 'debug');

      this.config.logger(
        `[响应元数据] ${JSON.stringify(responseMeta)}`,
        'debug'
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (body?.stream) {
        this.config.logger(
          `[流式响应建立] ID:${requestId}`,
          'debug'
        );
        return {
          rawStream: response.body,
          meta: responseMeta
        };
      }

      const responseText = await response.text();
      this.config.logger(
        `[原始响应] ${responseText}`,
        'debug'
      );


      // 非流式响应处理
      const data = JSON.parse(responseText);
      if (endUrl === this.endUrls.chat) {
        return data;
      } else {
        if (data.resultCode !== "0") {
          throw new Error(data.resultMsg || `错误码: ${data.resultCode}`);
        }
        return data.resultObject || data.data;
      }

    } catch (error) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      const errorMessage = error.name === 'AbortError'
        ? `请求超时 (${this.config.timeout}ms)`
        : error.message;

      this.config.logger(`[请求失败] ID:${requestId} 错误:${errorMessage} 耗时:${duration}ms`, 'error');
      throw error;
    }
  }



  /**
   * 获取AppKey（带重试机制）
   * @param {number} [maxRetry=3] - 最大重试次数
   * @returns {Promise<string>} 返回获取的AppKey
   */
  async getAppKey(maxRetry = 3) {
    if (this.appKeyPromise) {
      return this.appKeyPromise;
    }

    this.appKeyPromise = (async () => {
      let retryCount = 0;

      while (retryCount <= maxRetry) {
        try {
          this.config.logger('开始获取AppKey...');

          const result = await this._request(this.endUrls.getAppKey, {
            body: {
              appId: this.config.appId,
              appSecret: this.config.appSecret
            }
          });

          this.appKey = result.appKey;
          this.appKeyExpire = Date.now() + 570_000;
          this.config.logger(`✅ 获取AppKey成功: ${this.appKey.substr(0, 4)}****`);
          return this.appKey;

        } catch (error) {
          retryCount++;

          if (retryCount > maxRetry) {
            this.config.logger(`❌ 获取AppKey失败（${maxRetry}次重试后）: ${error.message}`, 'error');
            throw new Error(`获取AppKey失败: ${error.message}`);
          }

          const delay = 500 * retryCount;
          this.config.logger(`🔄 第${retryCount}次重试（${delay}ms后）: ${error.message}`, 'warn');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    })();

    try {
      return await this.appKeyPromise;
    } finally {
      this.appKeyPromise = null;
    }
  }

  /**
   * 消息队列验证方法（公开方法）
   * @param {MessageObject[]} messages - 待验证的消息队列
   * @returns {Array<{index: number, error: string}>} 错误详情列表
   */
  validateMessages(messages) {
    const errors = [];

    messages.forEach((msg, index) => {
      const errorReasons = [];

      // 内容存在性校验
      if (!Object.prototype.hasOwnProperty.call(msg, 'content')) {
        errorReasons.push('缺少content字段');
      }
      // 类型校验
      else if (typeof msg.content !== 'string') {
        errorReasons.push(`content类型错误 (${typeof msg.content})`);
      }
      // 有效性校验
      else if (msg.content.trim() === '') {
        errorReasons.push('内容为空字符串');
      }

      // 角色校验
      if (!['user', 'assistant', 'system'].includes(msg.role)) {
        errorReasons.push(`非法角色: ${msg.role}`);
      }

      if (errorReasons.length > 0) {
        errors.push({
          index: index + 1, // 转换为自然序号
          role: msg.role,
          error: errorReasons.join(', ')
        });
      }
    });

    return errors;
  }


  /**
   * 发起聊天请求
   * @param {string} content - 用户当前消息内容
   * @param {Object} [options] - 额外选项
   * @param {boolean} [options.stream=false] - 是否使用流式响应
   * @param {number} [options.max_tokens=8000] - 最大token数（1-20000）
   * @param {number} [options.temperature=0.1] - 温度参数（0.0-1.0）
   * @param {number} [options.top_p=0.1] - 核心采样概率（0.0-1.0）
   * @param {number} [options.presence_penalty=0.1] - 存在惩罚（0.0-1.0）
   * @param {number} [options.frequency_penalty=0.1] - 频率惩罚（0.0-1.0）
   * @param {Array} [options.messages] - 历史消息数组（格式应符合MessageObject）
   * @param {Object} [options] - 额外选项
   * @param {MessageObject[]} [options.messages] - 历史消息数组（最后一条必须是用户消息）
   * @returns {Promise<string|ReadableStream>} 返回原始响应内容或流对象
   */
  async getChatInfo(content, options = {}) {
    try {
      // 消息队列验证
      const validationErrors = this.validateMessages(options.messages || []);
      if (validationErrors.length > 0) {
        const errorDetails = validationErrors.map(e =>
          `第${e.index}条消息 (role=${e.role}) : ${e.error}`
        ).join('\n');
        throw new Error(`消息校验失败:\n${errorDetails}`);
      }

      //开始获取appKey
      if (!this.appKey || Date.now() > this.appKeyExpire) {
        // 如果已有进行中的请求会直接复用
        await this.getAppKey();
      }

      const requestBody = {
        agentId: this.config.agentId,
        stream: false,
        max_tokens: 8000,
        temperature: 0.1,
        ...options,
        messages: [
          ...(options.messages || []),
          { role: "user", content: content }
        ]
      };

      // 参数范围校验
      const validateRange = (value, min, max, param) => {
        if (value < min || value > max) {
          throw new Error(`${param}必须在${min}-${max}之间`);
        }
      };

      validateRange(requestBody.temperature, 0.0, 1.0, 'temperature');
      validateRange(requestBody.top_p, 0.0, 1.0, 'top_p');
      validateRange(requestBody.presence_penalty, 0.0, 1.0, 'presence_penalty');
      validateRange(requestBody.frequency_penalty, 0.0, 1.0, 'frequency_penalty');
      if (requestBody.max_tokens < 1 || requestBody.max_tokens > 20000) {
        throw new Error('max_tokens必须在1-20000之间');
      }

      // 校验最后一条消息
      const lastMessage = requestBody.messages[requestBody.messages.length - 1];
      if (lastMessage.role !== 'user') {
        throw new Error('提交的消息必须以用户提问结尾');
      }

      const response = await this._request(this.endUrls.chat, {
        headers: {
          appId: this.config.appId,
          appKey: this.appKey
        },
        body: requestBody
      });

      // 流式响应直接返回流对象
      if (requestBody.stream) {
        return response;
      }

      // 非流式处理
      const rawContent = response?.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("API返回空内容");

      return rawContent;
    } catch (error) {
      this.config.logger(`❌ 与大瓦特沟通失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 流式响应处理器
   * @param {ReadableStream} stream - 原始数据流
   * @param {function} onData - 数据块回调函数 (content: string, isFinal: boolean) => void
   */
  async _handleStream(streamWrapper, onData, onInfo) {

    const { rawStream: stream, meta } = streamWrapper || {};

    // 增强类型检查
    if (!stream || !(stream instanceof ReadableStream)) {
      this.config.logger(`无效的流对象，类型: ${typeof stream}`, 'error');
      throw new Error('API未返回有效的流');
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastValidContent = ''; // 记录最后有效内容

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 处理完整的数据行
        while (buffer.includes('\n')) {
          const lineEnd = buffer.indexOf('\n');
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith('info: ')) {
            try {
              const infoData = JSON.parse(line.slice(6));
              if (onInfo) onInfo(infoData);
            } catch (error) {
              this.config.logger(`info解析失败: ${error.message}`, 'error');
            }
          }
          else if (line === 'data: [DONE]') {
            onData(lastValidContent, true);
            return;
          }
          else if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              const content = json.choices[0].delta.content || '';
              if (content) lastValidContent = content;
              onData(lastValidContent, false);
            } catch (error) {
              this.config.logger(`流数据解析失败: ${error.message}`, 'error');
            }
          }
        }
      }
    } catch (error) {
      this.config.logger(`流式处理中断: ${error.message}`, 'error');
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 发起聊天请求（流式返回）
   * @param {string} content - 用户消息
   * @param {Object} [options] - 配置选项
   * @param {function} [options.onProgress] - 流式进度回调 (content: string) => void
   */
  async getStreamInfo(content, options = {}) {
    const response = await this.getChatInfo(content, { ...options, stream: true });
    let isStreamConsumed = false;

    // 流式处理封装
    return {
      on: (callbacks) => {
        if (isStreamConsumed) {
          throw new Error('Stream has already been consumed');
        }
        isStreamConsumed = true;
        return this._handleStream(
          response,
          callbacks.onData || (() => { }),
          callbacks.onInfo || (() => { })
        );
      },
      complete: async () => {
        if (isStreamConsumed) {
          throw new Error('Stream has already been consumed');
        }
        isStreamConsumed = true;
        let fullContent = '';
        await this._handleStream(response,
          (chunk) => fullContent += chunk,
          (info) => this.config.logger(`组件信息: ${JSON.stringify(info)}`, 'debug')
        );
        return fullContent;
      }
    };
  }

  /**
   * 执行知识库查询并返回结构化结果
   * 
   * 返回对象结构：
   * {
   *   count: number,        // 实际返回的结果数量
   *   results: Array,       // 解析后的知识片段数组
   *   raw: Object           // 原始的API响应
   * }
   * 
   * results数组中的每个元素（知识片段）结构：
   * {
   *   id: string,           // 知识片段ID
   *   content: string,      // 知识片段的内容文本
   *   similarity: number,   // 该片段与查询关键词的相似度（0.00~1.00）
   *   file: {               // 所属文件的信息
   *     id: number,         // 文件ID
   *     name: string,       // 文件名
   *     url: string | null  // 文件URL（可能为null）
   *   },
   *   knowledgeBase: {      // 所属知识库的信息
   *     id: number,         // 知识库ID
   *     name: string        // 知识库名称
   *   }
   * }
   * 
   * @param {Object} options - 查询参数
   * @param {string} options.keywords - 检索关键词
   * @param {number[]} options.knowledgeIds - 知识库ID数组，可同时查询多个知识库
   * @param {number} [options.topk=10] - 最大返回的知识片段数量，默认返回10条
   * @param {number} [options.similarity=0.95] - 最低相似度阈值(0.00~1.00)，默认0.95
   * @param {string[]} [options.tags=[]] - 文件标签过滤数组，默认空数组（不过滤）
   * @returns {Promise<Object>} 返回结构化知识库查询结果
   * 
   * @example
   * // 使用示例
   * const result = await client.queryKnowledgeBase({
   *   keywords: "电力系统稳定性",
   *   knowledgeIds: [123, 456],
   *   topk: 5,
   *   similarity: 0.3
   * });
   * 
   * console.log(`找到 ${result.count} 条相关片段`);
   * result.results.forEach((item, index) => {
   *   console.log(`片段 #${index + 1} (相似度: ${(item.similarity * 100).toFixed(1)}%):`);
   *   console.log(item.content.substring(0, 100) + '...');
   *   console.log(`来源: ${item.file.name} (知识库: ${item.knowledgeBase.name})`);
   * });
   */
  async queryKnowledgeBase({
    keywords,
    knowledgeIds,
    topk = 10,
    similarity = 0.01,
    tags = []
  }) {
    // 验证必填参数
    if (!keywords || !knowledgeIds) {
      throw new Error('keywords和knowledgeIds为必填参数');
    }

    // 参数有效性检查
    if (similarity < 0 || similarity > 1) {
      throw new Error('similarity必须在0.00~1.00之间');
    }

    if (!Array.isArray(knowledgeIds)) {
      throw new Error('knowledgeIds必须是数组形式');
    }

    if (!Array.isArray(tags)) {
      throw new Error('tags必须是数组形式');
    }

    // 获取AppKey
    if (!this.appKey || Date.now() > this.appKeyExpire) {
      await this.getAppKey();
    }

    // 构建请求体（所有参数都使用默认值或用户提供的值）
    const requestBody = {
      keywords,
      knowledgeIds,
      topk,
      similarity,
      tags
    };

    try {
      this.config.logger('发起知识库查询请求...', 'info');
      this.config.logger(`请求参数: ${JSON.stringify({
        ...requestBody,
        knowledgeIds: `[${knowledgeIds.join(', ')}]`,
        tags: `[${tags.join(', ')}]`
      })}`, 'debug');

      const response = await this._request(this.endUrls.knowledgeQuery, {
        body: requestBody
      });

      this.config.logger(`✅ 知识库查询成功，返回${response.count || 0}条结果`, 'info');

      const resultObject = response;
      const slices = resultObject.slices || [];
      const count = resultObject.count || 0;

      // 3. 转换数据格式
      const parsedSlices = slices.map(slice => ({
        id: slice.sliceId,
        content: slice.sliceContent,
        similarity: parseFloat(slice.similarity) || 0,
        file: {
          id: slice.fileId,
          name: slice.fileName,
          url: slice.fileUrl // 可能为null
        },
        knowledgeBase: {
          id: slice.knowledgeId,
          name: slice.knowledgeName
        }
      }));

      return {
        count: count,
        results: parsedSlices,
        // 保留原始响应
        raw: response
      };

    } catch (error) {
      this.config.logger(`❌ 知识库查询失败: ${error.message}`, 'error');
      throw new Error(`知识库查询失败: ${error.message}`);
    }
  }

  /*
  -----------------------------------SQL查询部分-----------------------------------
  主要功能：查询柳州局sql数据库
  todo: 
  1.
  
  
  
  
  
  */


  static _lineExtractorClient = null;
  /**
   * 专用线路名称提取客户端-用指定智能体提取线路名称 
   * @returns {CSGIntranetClient} 专用客户端实例-单例模式
   */
  static _getLineExtractorClient(baseUrl, logLevel) {
    if (CSGIntranetClient._lineExtractorClient) {
      // 更新已有实例的日志级别
      CSGIntranetClient._lineExtractorClient.config.logLevel = logLevel;
      return CSGIntranetClient._lineExtractorClient;
    }

    CSGIntranetClient._lineExtractorClient = new CSGIntranetClient({
      baseUrl,
      appId: '',
      appSecret: '',
      agentId: 225420267,
      logLevel: logLevel, // 使用主客户端配置
      timeout: 30000
    });

    return CSGIntranetClient._lineExtractorClient;
  }

  /**
   * 线路名称提取器
   * @param {string} userInput - 用户输入的线路名称（可能不完整或不规范）
   * @returns {Promise<string|null>} 返回匹配的标准线路名称或null
   */
  async getLineName(userInput) {
    const lineNames = ["±500kV牛从乙线", "±500kV牛从甲乙线", "±500kV牛从甲线", "±500kV金中直流线", "±500kV高肇直流线", "±800kV新东直流线", "±800kV昆柳段直流线", "±800kV柳龙段直流线", "35kV冕换线", "35kV吉河线", "35kV埠东线", "35kV棉桂线", "35kV穿桂线", "500kV凤河甲线", "500kV如桂甲乙线", "500kV山河乙线", "500kV山河甲线", "500kV换如甲乙线", "500kV换如甲线", "500kV换柳甲乙线", "500kV柳漓乙线", "500kV柳漓甲线", "500kV桂山乙线", "500kV桂山甲线", "500kV沙柳乙线", "500kV沙柳甲线", "500kV河柳乙线", "500kV河柳甲乙线", "500kV河柳甲线", "500kV黎桂乙线", "500kV黎桂甲线", "500kV龙凤甲线", "500kV龙平甲线", "500kV龙沙乙线", "500kV龙沙甲乙线", "500kV龙沙甲线", "柳侧接地极线", "桂侧接地极线"];
    this.config.logger(`开始线路名称提取，输入: "${userInput}"`, 'debug');
    /* 1. 先尝试精确匹配
    const exactMatch = lineNames.find(line => 
      line === userInput || line.includes(userInput)
    );
    if (exactMatch) {
      this.config.logger(`精确匹配到线路: ${exactMatch}`, 'info'); // 添加成功日志
      return exactMatch;
    }*/

    // 2. 使用大语言模型进行智能匹配
    //this.config.logger(`未找到精确匹配，启动智能匹配...`, 'debug');
    const prompt = `用户输入了一段包含电力线路名称的信息："${userInput}"。
    
    请从以下标准线路名称中选择最匹配的线路名称（只需返回线路名称）：
    ${lineNames.join('\n')}
    
    匹配规则：
    1. 允许部分匹配（如"牛从线"匹配"±500kV牛从甲乙线"）
    2. 允许同义词匹配（如"金中线"匹配"±500kV金中直流线"）
    3. 如果存在多个线路名称，以逗号分隔（如“金中和龙平”返回“±500kV金中直流线, 500kV龙平甲线”）
    4. 如果无匹配项，返回"未匹配"`;

    try {
      // 获取专用客户端实例（单例）
      const extractorClient = CSGIntranetClient._getLineExtractorClient(
        this.config.baseUrl,
        this.logLevel // 传递主客户端配置的日志级别
      );

      // 使用专用客户端调用大模型
      const response = await extractorClient.getChatInfo(prompt, {
        stream: false,
        temperature: 0.01,
        max_tokens: 50
      });

      return lineNames.find(line => response.includes(line)) || null;
    } catch (error) {
      this.config.logger(`线路名称提取失败: ${error.message}`, 'error');
      return null;
    }
  }
  /** 
   * 视图字段缓存 
   */
  _viewFieldCache = new Map();

  /**
 * 获取视图字段
 * @param {string} viewName - 视图名称
 * @returns {Promise<string[]>} 字段列表
 */
  async getViewFields(viewName) {
    // 检查缓存
    if (this._viewFieldCache.has(viewName)) {
      const cachedFields = this._viewFieldCache.get(viewName);
      this.config.logger(
        `[视图字段缓存命中] 视图名称:${viewName} 缓存字段数:${cachedFields.length}`,
        'debug'
      );
      return cachedFields;
    }

    // 执行空查询获取元数据
    const sql = `SELECT * FROM \`${viewName}\` WHERE 1=0`;
    try {
      this.config.logger(
        `[开始获取视图字段] 视图名称:${viewName} 执行探测SQL:${sql}`,
        'debug'
      );

      const res = await this.querySQL(sql);
      const fields = Object.keys(res[0] || {});

      this.config.logger(
        `[视图字段获取成功] 视图名称:${viewName} 发现字段:${fields.join(', ')} 总数:${fields.length}`,
        'info'
      );

      this._viewFieldCache.set(viewName, fields);
      return fields;
    } catch (error) {
      this.config.logger(
        `[视图字段获取失败] 视图名称:${viewName} 错误原因:${error.message}`,
        'error'
      );
      throw new Error(`获取视图字段失败: ${error.message}`);
    }
  }

  /**
 * 安全SQL查询
 * @param {string} viewName - 视图名称
 * @param {string[]} fields - 要查询的字段
 * @param {Object} [options] - 查询条件等
 * @returns {Promise<Object>}
 */

  escapeValue(value) {
    if (typeof value === 'number') return value;
    if (value === 'NULL') return 'NULL';
    return `'${value.replace(/'/g, "''")}'`; // 仅转义单引号
  }

  async safeQuery(viewName, fields, options = {}) {
    // 验证视图名称格式
    /*if (!/^[a-zA-Z_][\w$]*$/.test(viewName)) {
      throw new Error('非法视图名称');
    }*/

    // 获取字段白名单
    const validFields = await this.getViewFields(viewName);

    // 处理查询字段
    let fieldList;
    if (fields.includes('*')) {
      if (fields.length > 1) throw new Error('星号不能与其他字段共用');
      fieldList = '*';
    } else {
      const invalidFields = fields.filter(f => !validFields.includes(f));
      if (invalidFields.length > 0) throw new Error(`无效字段: ${invalidFields}`);
      fieldList = fields.map(f => `\`${f}\``).join(', ');
    }

    // 处理WHERE条件
    let whereClause = '1=1';
    if (options.where) {
      // 应当限制where条件格式，例如只允许key=value形式
      /*if (!/^[\w\s=<>]+$/.test(options.where)) {
        throw new Error('非法查询条件');
      }*/
      whereClause = options.where.split(' AND ').map(cond => {
        const [key, op, val] = cond.split(/\s+/);
        /*if (!validFields.includes(key)) throw new Error(`非法字段: ${key}`);*/
        return `\`${key}\` ${op} ${this.escapeValue(val)}`;
      }).join(' AND ');
    }

    const sql = `SELECT ${fieldList} FROM \`${viewName}\` WHERE ${whereClause}`;
    return this.querySQL(sql);
  }
  /**
 * 执行SQL查询
 * @param {string} sql - 要执行的SQL语句
 * @param {function} [callBack] - 可选回调函数（使用回调时为异步模式）
 * @returns {Promise<Object>|void} 返回Promise（无回调时）或undefined（有回调时）
 */
  async querySQL(sql, callBack) {
    const selectApiPath = 'http://10.121.232.66/lzSDWebAddin/database/getData';
    const requestId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();

    // 记录请求日志
    this.config.logger(`[SQL请求开始] ID:${requestId} SQL: ${sql}`, 'debug');

    const forbiddenKeywords = ['DROP', 'DELETE', 'UPDATE'];
    if (forbiddenKeywords.some(kw => sql.toUpperCase().includes(kw))) {
      throw new Error('包含危险操作关键词');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.config.logger(`[SQL请求超时] ID:${requestId}`, 'error');
    }, this.config.timeout);

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ sql }),
      signal: controller.signal
    };

    const handleResponse = async (response) => {
      // 记录完整响应信息
      const responseMeta = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      };

      this.config.logger(
        `[SQL响应元数据] ${JSON.stringify(responseMeta)}`,
        'debug'
      );

      const responseText = await response.text();
      this.config.logger(
        `[SQL原始响应] ${responseText}`,
        'debug'
      );

      try {
        return JSON.parse(responseText);
      } catch (error) {
        throw new Error(`响应JSON解析失败: ${responseText}`);
      }
    };

    // 处理回调模式
    if (callBack) {
      fetch(selectApiPath, fetchOptions)
        .then(handleResponse)
        .then(data => callBack(data))
        .catch(error => {
          this._handleSQLError(error, requestId, startTime);
          throw error;
        });
      return;
    }

    // 处理Promise模式
    try {
      const response = await fetch(selectApiPath, fetchOptions);
      return await handleResponse(response);
    } catch (error) {
      this._handleSQLError(error, requestId, startTime);
      throw error;
    }
  }

  /**
   * 统一处理SQL错误
   * @private
   */
  _handleSQLError(error, requestId, startTime) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    const errorMessage = error.name === 'AbortError'
      ? `请求超时 (${this.config.timeout}ms)`
      : error.message;

    this.config.logger(
      `[SQL请求失败] ID:${requestId} 错误:${errorMessage} 耗时:${duration}ms`,
      'error'
    );
  }
}

window.CSGIntranetClient = CSGIntranetClient;
