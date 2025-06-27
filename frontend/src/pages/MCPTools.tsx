import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, TestTube, Wrench, RefreshCw, Play } from 'lucide-react';

interface MCPTool {
  id: string;
  name: string;
  type: 'local' | 'remote';
  endpoint?: string;
  description: string;
  config: Record<string, any>;
  functions: string[];
  status: 'active' | 'inactive' | 'error';
  lastCall?: string;
  callCount: number;
  createdAt: string;
}

export function MCPTools() {
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<MCPTool | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testingTool, setTestingTool] = useState<MCPTool | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'local' as 'local' | 'remote',
    endpoint: '',
    description: '',
    config: {} as Record<string, any>,
    status: 'active' as 'active' | 'inactive'
  });

  useEffect(() => {
    fetchMCPTools();
  }, []);

  const fetchMCPTools = async () => {
    try {
      const response = await fetch('/api/v1/mcp/tools');
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        setMcpTools(apiResponse.data.tools || []);
      }
    } catch (error) {
      console.error('Failed to fetch MCP tools:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingTool 
        ? `/api/v1/mcp/${editingTool.id}`
        : '/api/v1/mcp';
      const method = editingTool ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchMCPTools();
        setShowForm(false);
        setEditingTool(null);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to save MCP tool:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'local',
      endpoint: '',
      description: '',
      config: {},
      status: 'active'
    });
  };

  const handleEdit = (tool: MCPTool) => {
    setEditingTool(tool);
    setFormData({
      name: tool.name,
      type: tool.type,
      endpoint: tool.endpoint || '',
      description: tool.description,
      config: tool.config,
      status: tool.status === 'error' ? 'active' : tool.status
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个MCP工具吗？')) {
      try {
        await fetch(`/api/v1/mcp/${id}`, { method: 'DELETE' });
        await fetchMCPTools();
      } catch (error) {
        console.error('Failed to delete MCP tool:', error);
      }
    }
  };

  const reloadTool = async (id: string) => {
    try {
      await fetch(`/api/v1/mcp/${id}/reload`, { method: 'POST' });
      await fetchMCPTools();
      alert('工具重新加载成功');
    } catch (error) {
      alert('工具重新加载失败');
    }
  };

  const testTool = async (tool: MCPTool) => {
    setTestingTool(tool);
    setTestResult(null);
    setShowTestModal(true);
  };

  const callMCPFunction = async (functionName: string, params: Record<string, any> = {}) => {
    if (!testingTool) return;
    
    try {
      const response = await fetch(`/api/v1/mcp/${testingTool.id}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          function: functionName,
          params
        }),
      });
      
      const result = await response.json();
      setTestResult({ function: functionName, result });
    } catch (error) {
      setTestResult({ function: functionName, error: error.message });
    }
  };

  const updateConfig = (key: string, value: any) => {
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        [key]: value
      }
    });
  };

  const renderConfigFields = () => {
    switch (formData.type) {
      case 'local':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">模块路径</label>
              <input
                type="text"
                value={formData.config.modulePath || ''}
                onChange={(e) => updateConfig('modulePath', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="./tools/custom_tool.py"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">初始化参数</label>
              <textarea
                value={JSON.stringify(formData.config.initParams || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateConfig('initParams', JSON.parse(e.target.value));
                  } catch {}
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder='{ "param1": "value1" }'
              />
            </div>
          </div>
        );
      case 'remote':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">API密钥</label>
              <input
                type="password"
                value={formData.config.apiKey || ''}
                onChange={(e) => updateConfig('apiKey', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="API密钥"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">超时时间（秒）</label>
              <input
                type="number"
                value={formData.config.timeout || 30}
                onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                min="1"
                max="300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">请求头</label>
              <textarea
                value={JSON.stringify(formData.config.headers || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateConfig('headers', JSON.parse(e.target.value));
                  } catch {}
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder='{ "Authorization": "Bearer token" }'
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MCP工具管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            管理Model Context Protocol工具和服务
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          添加MCP工具
        </button>
      </div>

      {/* MCP tool form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingTool ? '编辑MCP工具' : '添加MCP工具'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">工具名称</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">工具类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any, config: {} })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="local">本地工具</option>
                    <option value="remote">远程服务</option>
                  </select>
                </div>
              </div>

              {formData.type === 'remote' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">服务端点</label>
                  <input
                    type="text"
                    required={formData.type === 'remote'}
                    value={formData.endpoint}
                    onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="http://10.121.232.66:8080/mcp"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>

              {renderConfigFields()}

              <div>
                <label className="block text-sm font-medium text-gray-700">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="active">激活</option>
                  <option value="inactive">停用</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTool(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  {editingTool ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test modal */}
      {showTestModal && testingTool && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                测试MCP工具: {testingTool.name}
              </h3>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">可用函数</h4>
                  <div className="space-y-2">
                    {testingTool.functions.map((func) => (
                      <button
                        key={func}
                        onClick={() => callMCPFunction(func)}
                        className="block w-full text-left px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <span>{func}</span>
                          <Play className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">测试结果</h4>
                  {testResult ? (
                    <div className="bg-gray-900 text-gray-100 p-4 rounded-md">
                      <div className="text-sm">
                        <div className="text-blue-400 mb-2">函数: {testResult.function}</div>
                        {testResult.error ? (
                          <div className="text-red-400">
                            错误: {testResult.error}
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap text-xs">
                            {JSON.stringify(testResult.result, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      点击左侧函数进行测试
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    setShowTestModal(false);
                    setTestingTool(null);
                    setTestResult(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MCP tools grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full text-center py-8 text-gray-500">加载中...</div>
        ) : mcpTools.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">暂无MCP工具</div>
        ) : (
          mcpTools.map((tool) => (
            <div key={tool.id} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Wrench className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-4 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">{tool.name}</h3>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        tool.status === 'active' ? 'bg-green-100 text-green-800' :
                        tool.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {tool.status === 'active' ? '运行中' :
                         tool.status === 'inactive' ? '停用' : '错误'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{tool.type === 'local' ? '本地工具' : '远程服务'}</p>
                    {tool.endpoint && (
                      <p className="text-sm text-gray-500">端点: {tool.endpoint}</p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="text-sm text-gray-600">{tool.description}</p>
                </div>

                <div className="mt-4">
                  <div className="flex flex-wrap gap-1">
                    {tool.functions && tool.functions.slice(0, 3).map((func, index) => (
                      <span key={index} className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        {func}
                      </span>
                    ))}
                    {tool.functions && tool.functions.length > 3 && (
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                        +{tool.functions.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>调用次数: {tool.callCount}</span>
                    {tool.lastCall && (
                      <span>最后调用: {new Date(tool.lastCall).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-between">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => testTool(tool)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <TestTube className="h-3 w-3 mr-1" />
                      测试
                    </button>
                    <button
                      onClick={() => reloadTool(tool.id)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      重载
                    </button>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(tool)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tool.id)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}