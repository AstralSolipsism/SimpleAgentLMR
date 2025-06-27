import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface SystemConfig {
  system: {
    port: number;
    host: string;
    apiPrefix: string;
    environment: string;
  };
  vika: {
    userToken: string;
    apiBase: string;
    spaceId: string;
    rateLimitQPS: number;
  };
  database: {
    type: string;
    sqlite: {
      path: string;
    };
    mysql: {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    };
  };
  agentPlatform: {
    test: {
      type: string;
      apiBase: string;
      apiKey: string;
      model: string;
    };
    production: {
      type: string;
      apiBase: string;
      apiKey: string;
      appId: string;
      appSecret: string;
    };
  };
  taskExecution: {
    maxConcurrentTasks: number;
    taskTimeout: number;
    retryAttempts: number;
    logLevel: string;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxKeys: number;
  };
  currentEnvironment?: string;
  environmentDescription?: string;
}

interface ConnectionTest {
  vika: { success: boolean; message: string; data?: any };
  agent: { success: boolean; message: string; data?: any };
}

const SystemConfig: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<{ vika: boolean; agent: boolean }>({ vika: false, agent: false });
  const [testResults, setTestResults] = useState<ConnectionTest | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [vikaSpaceConfig, setVikaSpaceConfig] = useState<any>(null);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/config');
      if (response.ok) {
        const result = await response.json();
        setConfig(result.data);
        setOriginalConfig(JSON.parse(JSON.stringify(result.data)));
      } else {
        throw new Error('加载配置失败');
      }
    } catch (error) {
      setMessage({ type: 'error', text: `加载配置失败: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      const response = await fetch('/api/v1/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: '配置保存成功' });
        setOriginalConfig(JSON.parse(JSON.stringify(config)));
      } else {
        throw new Error(result.message || '保存失败');
      }
    } catch (error) {
      setMessage({ type: 'error', text: `保存配置失败: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const switchEnvironment = async (environment: string) => {
    try {
      const response = await fetch('/api/v1/config/environment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ environment }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: `环境已切换到: ${environment}` });
        // 重新加载配置
        await loadConfig();
      } else {
        throw new Error(result.message || '环境切换失败');
      }
    } catch (error) {
      setMessage({ type: 'error', text: `环境切换失败: ${error.message}` });
    }
  };

  const testVikaConnection = async () => {
    try {
      setTesting(prev => ({ ...prev, vika: true }));
      const response = await fetch('/api/v1/config/test/vika', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      setTestResults(prev => ({ ...prev, vika: result.data }));
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        vika: { success: false, message: `连接测试失败: ${error.message}` }
      }));
    } finally {
      setTesting(prev => ({ ...prev, vika: false }));
    }
  };

  const testAgentConnection = async () => {
    if (!config) return;

    try {
      setTesting(prev => ({ ...prev, agent: true }));
      
      const currentEnv = config.system.environment;
      const agentConfig = config.agentPlatform[currentEnv];
      
      const response = await fetch('/api/v1/config/test/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: 'test-agent',
          appId: agentConfig.appId,
          appSecret: agentConfig.appSecret,
        }),
      });

      const result = await response.json();
      setTestResults(prev => ({ ...prev, agent: result.data }));
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        agent: { success: false, message: `连接测试失败: ${error.message}` }
      }));
    } finally {
      setTesting(prev => ({ ...prev, agent: false }));
    }
  };

  const loadVikaSpaceConfig = async () => {
    if (!config?.vika.spaceId) return;

    try {
      const response = await fetch(`/api/v1/config/vika/spaces/${config.vika.spaceId}`);
      if (response.ok) {
        const result = await response.json();
        setVikaSpaceConfig(result.data);
      }
    } catch (error) {
      console.error('加载维格表空间配置失败:', error);
    }
  };

  const updateConfig = (path: string, value: any) => {
    if (!config) return;

    const keys = path.split('.');
    const newConfig = JSON.parse(JSON.stringify(config));
    let current = newConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setConfig(newConfig);
  };

  const hasChanges = () => {
    return JSON.stringify(config) !== JSON.stringify(originalConfig);
  };

  const handleClearVikaCache = async () => {
    setClearingCache(true);
    try {
      const response = await fetch('/api/v1/output-configs/vika/clear-cache', {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        toast.success('Vika缓存清除成功');
      } else {
        throw new Error(result.message || '清除Vika缓存失败');
      }
    } catch (error) {
      toast.error(`操作失败: ${error.message}`);
    } finally {
      setClearingCache(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">加载配置中...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">配置加载失败</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">系统配置</h1>
          <p className="text-gray-600 mt-2">管理A2A智能体调度系统的全局配置</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={config.currentEnvironment === 'production' ? 'default' : 'secondary'}>
            {config.currentEnvironment === 'production' ? '生产环境' : '测试环境'}
          </Badge>
          <Button
            onClick={saveConfig}
            disabled={!hasChanges() || saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      {message && (
        <Alert>
          <AlertDescription className={message.type === 'error' ? 'text-red-600' : 'text-green-600'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="system" className="space-y-4">
        <TabsList>
          <TabsTrigger value="system">系统设置</TabsTrigger>
          <TabsTrigger value="vika">维格表配置</TabsTrigger>
          <TabsTrigger value="agent">智能体平台</TabsTrigger>
          <TabsTrigger value="database">数据库配置</TabsTrigger>
          <TabsTrigger value="advanced">高级设置</TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>系统基础配置</CardTitle>
              <CardDescription>配置系统的基本运行参数</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="environment">运行环境</Label>
                  <Select 
                    value={config.system.environment} 
                    onValueChange={(value) => switchEnvironment(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">测试环境</SelectItem>
                      <SelectItem value="production">生产环境</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 mt-1">{config.environmentDescription}</p>
                </div>
                <div>
                  <Label htmlFor="port">服务端口</Label>
                  <Input
                    id="port"
                    type="number"
                    value={config.system.port}
                    onChange={(e) => updateConfig('system.port', parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="host">监听地址</Label>
                  <Input
                    id="host"
                    value={config.system.host}
                    onChange={(e) => updateConfig('system.host', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="apiPrefix">API前缀</Label>
                  <Input
                    id="apiPrefix"
                    value={config.system.apiPrefix}
                    onChange={(e) => updateConfig('system.apiPrefix', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vika">
          <Card>
            <CardHeader>
              <CardTitle>维格表配置</CardTitle>
              <CardDescription>配置维格表API连接参数</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vikaToken">用户Token</Label>
                  <Input
                    id="vikaToken"
                    type="password"
                    value={config.vika.userToken}
                    onChange={(e) => updateConfig('vika.userToken', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="vikaApiBase">API地址</Label>
                  <Input
                    id="vikaApiBase"
                    value={config.vika.apiBase}
                    onChange={(e) => updateConfig('vika.apiBase', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="vikaSpaceId">空间站ID</Label>
                  <Input
                    id="vikaSpaceId"
                    value={config.vika.spaceId}
                    onChange={(e) => updateConfig('vika.spaceId', e.target.value)}
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={loadVikaSpaceConfig}
                  >
                    加载空间配置
                  </Button>
                </div>
                <div>
                  <Label htmlFor="vikaQPS">QPS限制</Label>
                  <Input
                    id="vikaQPS"
                    type="number"
                    value={config.vika.rateLimitQPS}
                    onChange={(e) => updateConfig('vika.rateLimitQPS', parseInt(e.target.value))}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={testVikaConnection} 
                  disabled={testing.vika}
                  variant="outline"
                >
                  {testing.vika ? '测试中...' : '测试连接'}
                </Button>
                {testResults?.vika && (
                  <Badge variant={testResults.vika.success ? 'default' : 'destructive'}>
                    {testResults.vika.message}
                  </Badge>
                )}
              </div>

              {vikaSpaceConfig && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">空间站信息</h4>
                  <div className="bg-gray-50 p-3 rounded">
                    <pre className="text-sm overflow-auto">
                      {JSON.stringify(vikaSpaceConfig, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>测试环境智能体配置</CardTitle>
                <CardDescription>配置测试环境的智能体平台连接（OpenAI格式）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="testApiBase">API地址</Label>
                    <Input
                      id="testApiBase"
                      value={config.agentPlatform.test.apiBase}
                      onChange={(e) => updateConfig('agentPlatform.test.apiBase', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="testApiKey">API密钥</Label>
                    <Input
                      id="testApiKey"
                      type="password"
                      value={config.agentPlatform.test.apiKey}
                      onChange={(e) => updateConfig('agentPlatform.test.apiKey', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="testModel">模型名称</Label>
                    <Input
                      id="testModel"
                      value={config.agentPlatform.test.model}
                      onChange={(e) => updateConfig('agentPlatform.test.model', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>生产环境智能体配置</CardTitle>
                <CardDescription>配置生产环境的内网智能体平台连接</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="prodApiBase">API地址</Label>
                    <Input
                      id="prodApiBase"
                      value={config.agentPlatform.production.apiBase}
                      onChange={(e) => updateConfig('agentPlatform.production.apiBase', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="prodAppId">应用ID</Label>
                    <Input
                      id="prodAppId"
                      value={config.agentPlatform.production.appId}
                      onChange={(e) => updateConfig('agentPlatform.production.appId', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="prodAppSecret">应用密钥</Label>
                    <Input
                      id="prodAppSecret"
                      type="password"
                      value={config.agentPlatform.production.appSecret}
                      onChange={(e) => updateConfig('agentPlatform.production.appSecret', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={testAgentConnection} 
                    disabled={testing.agent}
                    variant="outline"
                  >
                    {testing.agent ? '测试中...' : '测试连接'}
                  </Button>
                  {testResults?.agent && (
                    <Badge variant={testResults.agent.success ? 'default' : 'destructive'}>
                      {testResults.agent.message}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle>数据库配置</CardTitle>
              <CardDescription>配置系统数据存储</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="dbType">数据库类型</Label>
                <Select 
                  value={config.database.type} 
                  onValueChange={(value) => updateConfig('database.type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sqlite">SQLite</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.database.type === 'sqlite' && (
                <div>
                  <Label htmlFor="sqlitePath">SQLite文件路径</Label>
                  <Input
                    id="sqlitePath"
                    value={config.database.sqlite.path}
                    onChange={(e) => updateConfig('database.sqlite.path', e.target.value)}
                  />
                </div>
              )}

              {config.database.type === 'mysql' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="mysqlHost">主机地址</Label>
                    <Input
                      id="mysqlHost"
                      value={config.database.mysql.host}
                      onChange={(e) => updateConfig('database.mysql.host', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="mysqlPort">端口</Label>
                    <Input
                      id="mysqlPort"
                      type="number"
                      value={config.database.mysql.port}
                      onChange={(e) => updateConfig('database.mysql.port', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="mysqlDatabase">数据库名</Label>
                    <Input
                      id="mysqlDatabase"
                      value={config.database.mysql.database}
                      onChange={(e) => updateConfig('database.mysql.database', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="mysqlUsername">用户名</Label>
                    <Input
                      id="mysqlUsername"
                      value={config.database.mysql.username}
                      onChange={(e) => updateConfig('database.mysql.username', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="mysqlPassword">密码</Label>
                    <Input
                      id="mysqlPassword"
                      type="password"
                      value={config.database.mysql.password}
                      onChange={(e) => updateConfig('database.mysql.password', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>任务执行配置</CardTitle>
                <CardDescription>配置任务执行相关参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="maxTasks">最大并发任务数</Label>
                    <Input
                      id="maxTasks"
                      type="number"
                      value={config.taskExecution.maxConcurrentTasks}
                      onChange={(e) => updateConfig('taskExecution.maxConcurrentTasks', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="taskTimeout">任务超时时间（毫秒）</Label>
                    <Input
                      id="taskTimeout"
                      type="number"
                      value={config.taskExecution.taskTimeout}
                      onChange={(e) => updateConfig('taskExecution.taskTimeout', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="retryAttempts">重试次数</Label>
                    <Input
                      id="retryAttempts"
                      type="number"
                      value={config.taskExecution.retryAttempts}
                      onChange={(e) => updateConfig('taskExecution.retryAttempts', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="logLevel">日志级别</Label>
                    <Select 
                      value={config.taskExecution.logLevel} 
                      onValueChange={(value) => updateConfig('taskExecution.logLevel', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debug">Debug</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warn">Warn</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>缓存配置</CardTitle>
                <CardDescription>配置系统缓存参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="cacheEnabled"
                    checked={config.cache.enabled}
                    onCheckedChange={(checked) => updateConfig('cache.enabled', checked)}
                  />
                  <Label htmlFor="cacheEnabled">启用缓存</Label>
                </div>
                
                {config.cache.enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cacheTTL">缓存过期时间（秒）</Label>
                      <Input
                        id="cacheTTL"
                        type="number"
                        value={config.cache.ttl}
                        onChange={(e) => updateConfig('cache.ttl', parseInt(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cacheMaxKeys">最大缓存键数量</Label>
                      <Input
                        id="cacheMaxKeys"
                        type="number"
                        value={config.cache.maxKeys}
                        onChange={(e) => updateConfig('cache.maxKeys', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>缓存管理</CardTitle>
                <CardDescription>手动清除系统中的各种缓存</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-4">
                  <Button
                    variant="destructive"
                    onClick={handleClearVikaCache}
                    disabled={clearingCache}
                  >
                    {clearingCache ? '正在清除...' : '清除Vika缓存'}
                  </Button>
                  <p className="text-sm text-gray-500">
                    清除维格表相关的后端和前端缓存。
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SystemConfig;