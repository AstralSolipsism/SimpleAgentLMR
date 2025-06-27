import { useEffect, useState } from 'react';
import { Bot, Workflow, Users, Activity, TrendingUp, AlertCircle } from 'lucide-react';

interface SystemStats {
  totalAgents: number;
  activeTasks: number;
  totalApplications: number;
  systemLoad: {
    memory?: { usage: number };
    [key: string]: any;
  };
  recentTasks: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    source_name?: string;
  }>;
}

export function Dashboard() {
  const [stats, setStats] = useState<SystemStats>({
    totalAgents: 0,
    activeTasks: 0,
    totalApplications: 0,
    systemLoad: { memory: { usage: 0 } },
    recentTasks: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSystemStats = async () => {
      try {
        const response = await fetch('/api/v1/visualization/stats/dashboard');
        const apiResponse = await response.json();
        if (apiResponse.success) {
          setStats(apiResponse.data);
        } else {
          console.error('Failed to fetch dashboard stats:', apiResponse.message);
        }
      } catch (error) {
        console.error('Failed to fetch system stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSystemStats(); // 立即执行一次
    const intervalId = setInterval(fetchSystemStats, 5000); // 每5秒执行一次

    return () => clearInterval(intervalId); // 组件卸载时清理定时器
  }, []);

  const StatCard = ({ title, value, icon: Icon, color }: {
    title: string;
    value: number | string;
    icon: any;
    color: string;
  }) => (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {title}
              </dt>
              <dd className="text-lg font-medium text-gray-900">
                {loading ? '加载中...' : value}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">系统仪表板</h1>
        <p className="mt-1 text-sm text-gray-600">
          实时监控A2A智能体调度系统的运行状态
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="注册智能体"
          value={stats.totalAgents}
          icon={Bot}
          color="text-blue-600"
        />
        <StatCard
          title="活跃任务"
          value={stats.activeTasks}
          icon={Workflow}
          color="text-green-600"
        />
        <StatCard
          title="接入应用"
          value={stats.totalApplications}
          icon={Users}
          color="text-purple-600"
        />
        <StatCard
          title="内存使用率"
          value={stats.systemLoad && stats.systemLoad.memory ? `${stats.systemLoad.memory.usage.toFixed(2)}%` : 'N/A'}
          icon={Activity}
          color="text-orange-600"
        />
      </div>

      {/* Recent tasks and system health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent tasks */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              最近任务
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-4 text-gray-500">加载中...</div>
              ) : stats.recentTasks.length > 0 ? (
                stats.recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{task.source_name || task.type}</p>
                      <p className="text-xs text-gray-500">ID: {task.id}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        task.status === 'completed' ? 'bg-green-100 text-green-800' :
                        task.status === 'running' ? 'bg-blue-100 text-blue-800' :
                        task.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {task.status === 'completed' ? '已完成' :
                         task.status === 'running' ? '运行中' :
                         task.status === 'failed' ? '失败' : '等待中'}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">暂无任务记录</div>
              )}
            </div>
          </div>
        </div>

        {/* System health */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              系统状态
            </h3>
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-green-400 mr-3"></div>
                <span className="text-sm text-gray-700">API服务运行正常</span>
              </div>
              <div className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-green-400 mr-3"></div>
                <span className="text-sm text-gray-700">数据库连接正常</span>
              </div>
              <div className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-green-400 mr-3"></div>
                <span className="text-sm text-gray-700">智能体通信正常</span>
              </div>
              <div className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-green-400 mr-3"></div>
                <span className="text-sm text-gray-700">维格表连接正常</span>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <div className="flex">
                  <TrendingUp className="h-5 w-5 text-blue-400" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-blue-800">性能优化建议</h4>
                    <p className="mt-1 text-sm text-blue-700">
                      系统运行良好，建议定期清理任务日志以优化性能。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}