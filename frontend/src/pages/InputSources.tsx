import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, TestTube, Globe, Database, Mail } from 'lucide-react';

interface InputSource {
  id: string;
  source_id: string;
  source_name: string;
  source_type: 'http_endpoint' | 'webhook';
  endpoint: string;
  method?: string;
  agent_id: string;
  agent_name: string;
  config: Record<string, any>;
  status: 'active' | 'inactive';
  lastTriggered?: string;
  triggerCount: number;
  createdAt: string;
}

interface Agent {
  id: string;
  agent_name: string;
  agentId: string;
}

export function InputSources() {
  const [inputSources, setInputSources] = useState<InputSource[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<InputSource | null>(null);
  const [formData, setFormData] = useState({
    source_name: '',
    source_type: 'http_endpoint' as 'http_endpoint' | 'webhook',
    endpoint: '',
    method: 'POST',
    agent_id: '',
    config: {} as Record<string, any>,
    status: 'active' as 'active' | 'inactive'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sourcesRes, agentsRes] = await Promise.all([
        fetch('/api/v1/input-sources'),
        fetch('/api/v1/agents')
      ]);
      
      const [sourcesApiResponse, agentsApiResponse] = await Promise.all([
        sourcesRes.json(),
        agentsRes.json()
      ]);
      
      if (sourcesApiResponse.success && sourcesApiResponse.data) {
        setInputSources(sourcesApiResponse.data.items || []);
      }
      if (agentsApiResponse.success && agentsApiResponse.data) {
        setAgents(agentsApiResponse.data.items || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingSource 
        ? `/api/v1/input-sources/${editingSource.id}`
        : '/api/v1/input-sources';
      const method = editingSource ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_name: formData.source_name,
          source_type: formData.source_type,
          endpoint: formData.endpoint,
          method: formData.method,
          agent_id: formData.agent_id,
          config: formData.config,
          status: formData.status,
        }),
      });

      if (response.ok) {
        await fetchData();
        setShowForm(false);
        setEditingSource(null);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to save input source:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      source_name: '',
      source_type: 'http_endpoint',
      endpoint: '',
      method: 'POST',
      agent_id: '',
      config: {},
      status: 'active'
    });
  };

  const handleEdit = (source: InputSource) => {
    setEditingSource(source);
    setFormData({
      source_name: source.source_name,
      source_type: source.source_type,
      endpoint: source.endpoint,
      method: source.method || 'POST',
      agent_id: source.agent_id,
      config: source.config,
      status: source.status
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个输入源吗？')) {
      try {
        await fetch(`/api/v1/input-sources/${id}`, { method: 'DELETE' });
        await fetchData();
      } catch (error) {
        console.error('Failed to delete input source:', error);
      }
    }
  };

  const testInputSource = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/input-sources/${id}/test`, { method: 'POST' });
      const result = await response.json();
      alert(result.success ? '测试成功' : `测试失败: ${result.error}`);
    } catch (error) {
      alert('测试失败');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'http_endpoint': return Globe;
      case 'webhook': return Globe;
      default: return Globe;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'http_endpoint': return 'HTTP接口';
      case 'webhook': return 'Webhook';
      default: return type;
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
    switch (formData.source_type) {
      case 'http_endpoint':
      case 'webhook':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">请求方法</label>
              <select
                value={formData.method}
                onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">认证令牌</label>
              <input
                type="text"
                value={formData.config.authToken || ''}
                onChange={(e) => updateConfig('authToken', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="可选：Bearer token"
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
          <h1 className="text-2xl font-bold text-gray-900">输入源配置</h1>
          <p className="mt-1 text-sm text-gray-600">
            配置系统接收外部任务的输入源
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          添加输入源
        </button>
      </div>

      {/* Input source form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingSource ? '编辑输入源' : '添加输入源'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">输入源名称</label>
                  <input
                    type="text"
                    required
                    value={formData.source_name}
                    onChange={(e) => setFormData({ ...formData, source_name: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">类型</label>
                  <select
                    value={formData.source_type}
                    onChange={(e) => setFormData({ ...formData, source_type: e.target.value as any, config: {} })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="http_endpoint">HTTP接口</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">端点地址</label>
                <input
                  type="text"
                  required
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder={formData.source_type === 'http_endpoint' ? '/api/tasks/receive' : '输入源地址'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">目标智能体</label>
                <select
                  required
                  value={formData.agent_id}
                  onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">选择智能体</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.agentId}>{agent.agent_name}</option>
                  ))}
                </select>
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
                    setEditingSource(null);
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
                  {editingSource ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Input sources grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full text-center py-8 text-gray-500">加载中...</div>
        ) : inputSources.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">暂无输入源</div>
        ) : (
          inputSources.map((source) => {
            const Icon = getTypeIcon(source.source_type);
            return (
              <div key={source.id} className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Icon className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900">{source.source_name}</h3>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          source.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {source.status === 'active' ? '激活' : '停用'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{getTypeText(source.source_type)}</p>
                      <p className="text-sm text-gray-500">端点: {source.endpoint}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <p className="text-sm text-gray-600">目标智能体: {source.agent_name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-gray-500">触发次数: {source.triggerCount}</span>
                      {source.lastTriggered && (
                        <span className="text-xs text-gray-500">
                          最后触发: {new Date(source.lastTriggered).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => testInputSource(source.id)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <TestTube className="h-3 w-3 mr-1" />
                      测试
                    </button>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(source)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}