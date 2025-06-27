import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Eye, RefreshCw } from 'lucide-react';

interface Application {
  id: string;
  app_name: string;
  app_id: string;
  description: string;
  status: 'active' | 'inactive';
  agentCount: number;
  createdAt: string;
  updatedAt: string;
  base_url?: string;
  environment_type?: 'test' | 'production';
}

export function Applications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [formData, setFormData] = useState({
    app_name: '',
    app_id: '',
    description: '',
    base_url: '',
    app_secret: '',
    status: 'active' as 'active' | 'inactive',
    environment_type: 'production' as 'test' | 'production'
  });

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const response = await fetch('/api/v1/applications');
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        setApplications(apiResponse.data.items || []);
      }
    } catch (error) {
      console.error('Failed to fetch applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingApp
        ? `/api/v1/applications/${editingApp.app_id}`
        : '/api/v1/applications';
      const method = editingApp ? 'PUT' : 'POST';

      const body = {
        app_name: formData.app_name,
        app_id: formData.app_id,
        description: formData.description,
        base_url: formData.base_url,
        app_secret: formData.app_secret,
        status: formData.status,
        environment_type: formData.environment_type,
      };

      const requestBody = editingApp
        ? {
            app_name: formData.app_name,
            description: formData.description,
            base_url: formData.base_url,
            status: formData.status,
            environment_type: formData.environment_type,
          }
        : body;


      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        await fetchApplications();
        setShowForm(false);
        setEditingApp(null);
        setFormData({ app_name: '', app_id: '', description: '', base_url: '', app_secret: '', status: 'active', environment_type: 'production' });
      } else {
        const errorData = await response.json();
        console.error('Failed to save application:', errorData);
        alert(`Error: ${errorData.message}`);
      }
    } catch (error) {
      console.error('Failed to save application:', error);
    }
  };

  const handleEdit = (app: Application) => {
    setEditingApp(app);
    setFormData({
      app_name: app.app_name || '',
      app_id: app.app_id || '',
      description: app.description || '',
      base_url: app.base_url || '',
      app_secret: (app as any).app_secret || '',
      status: app.status,
      environment_type: app.environment_type || 'production'
    });
    setShowForm(true);
  };

  const handleDelete = async (app_id: string) => {
    if (confirm('确定要删除这个应用吗？')) {
      try {
        await fetch(`/api/v1/applications/${app_id}`, { method: 'DELETE' });
        await fetchApplications();
      } catch (error) {
        console.error('Failed to delete application:', error);
      }
    }
  };

  const refreshAppKey = async (app_id: string) => {
    try {
      await fetch(`/api/v1/applications/${app_id}/refresh-key`, { method: 'POST' });
      await fetchApplications();
      alert('AppKey已刷新');
    } catch (error) {
      console.error('Failed to refresh app key:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">应用管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            管理接入系统的智能体应用
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          添加应用
        </button>
      </div>

      {/* Application form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingApp ? '编辑应用' : '添加应用'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">应用名称</label>
                <input
                  type="text"
                  required
                  value={formData.app_name}
                  onChange={(e) => setFormData({ ...formData, app_name: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
             {!editingApp && (
               <div>
                 <label className="block text-sm font-medium text-gray-700">应用 ID (App ID)</label>
                 <input
                   type="text"
                   required
                   value={formData.app_id}
                   onChange={(e) => setFormData({ ...formData, app_id: e.target.value })}
                   className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                   placeholder="请输入自定义应用ID"
                 />
               </div>
             )}
              <div>
                <label className="block text-sm font-medium text-gray-700">基础URL</label>
                <input
                  type="text"
                  required
                  value={formData.base_url}
                  onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://api.example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">环境类型</label>
                <select
                  value={formData.environment_type}
                  onChange={(e) => setFormData({ ...formData, environment_type: e.target.value as 'test' | 'production' })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="production">生产环境</option>
                  <option value="test">测试环境</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {formData.environment_type === 'test' ? 'App Key (长期有效)' : 'App Secret (用于换取凭证)'}
                </label>
                <input
                  type="password"
                  required={!editingApp}
                  value={formData.app_secret}
                  onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder={formData.environment_type === 'test' ? '直接用于API认证的Key' : '用于换取动态AppKey的凭证'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>
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
                    setEditingApp(null);
                    setFormData({ app_name: '', app_id: '', description: '', base_url: '', app_secret: '', status: 'active', environment_type: 'production' });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  {editingApp ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Applications table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {loading ? (
            <li className="p-6 text-center text-gray-500">加载中...</li>
          ) : applications.length === 0 ? (
            <li className="p-6 text-center text-gray-500">暂无应用</li>
          ) : (
            applications.map((app) => (
              <li key={app.app_id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className={`h-3 w-3 rounded-full ${
                          app.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                        }`}></div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-900 flex items-center">
                          {app.app_name}
                          <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            app.environment_type === 'test' ? 'bg-yellow-100 text-yellow-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {app.environment_type === 'test' ? '测试' : '生产'}
                          </span>
                        </p>
                        <p className="text-sm text-gray-500">App ID: {app.app_id}</p>
                        <p className="text-sm text-gray-500">{app.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {app.agentCount} 个智能体
                      </span>
                      <button
                        onClick={() => refreshAppKey(app.app_id)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="刷新AppKey"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(app)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="编辑"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(app.app_id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 sm:flex sm:justify-between">
                    <div className="sm:flex">
                      <p className="flex items-center text-sm text-gray-500">
                        创建时间: {new Date(app.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                      <p>
                        最后更新: {new Date(app.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}