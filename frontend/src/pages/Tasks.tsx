import { useEffect, useState } from 'react';
import { Play, Pause, Square, Eye, RotateCcw, Filter, ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// 更新Task接口以匹配后端返回的数据
interface Task {
  id: string;
  source_id: string;
  source_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input_data: { input: string, context: any };
  result?: any;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

// 新的TaskStep接口
interface TaskStep {
  id: number;
  task_id: string;
  step_id: string;
  agent_id?: number;
  agent_name?: string;
  input?: string;
  context?: any;
  response?: any;
  parsed_actions?: any;
  action_results?: any;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  started_at: string;
  finished_at?: string;
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000); // 每5秒刷新一次
    return () => clearInterval(interval);
  }, [filter]);

  useEffect(() => {
    if (selectedTask && selectedTask.status === 'running') {
      startStreaming(selectedTask.id);
    } else {
      stopStreaming();
    }
  }, [selectedTask]);

  const fetchTasks = async () => {
    try {
      const url = filter === 'all'
        ? '/api/v1/tasks'
        : `/api/v1/tasks?status=${filter}`;
      const response = await fetch(url);
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        setTasks(apiResponse.data.items || []);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskSteps = async (taskId: string) => {
    try {
      const response = await fetch(`/api/v1/tasks/${taskId}/steps`);
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        setTaskSteps(apiResponse.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch task steps:', error);
    }
  };

  const startStreaming = (taskId: string) => {
    if (isStreaming) return;
    
    setIsStreaming(true);
    const eventSource = new EventSource(`/api/v1/tasks/${taskId}/stream`);
    
    eventSource.onmessage = (event) => {
      const step = JSON.parse(event.data) as TaskStep;
      setTaskSteps(prev => [...prev, step]);
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      setIsStreaming(false);
    };
    
    return () => {
      eventSource.close();
      setIsStreaming(false);
    };
  };

  const stopStreaming = () => {
    setIsStreaming(false);
  };

  const cancelTask = async (taskId: string) => {
    try {
      await fetch(`/api/v1/tasks/${taskId}/cancel`, { method: 'POST' });
      await fetchTasks();
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  };

  const retryTask = async (taskId: string) => {
    try {
      await fetch(`/api/v1/tasks/${taskId}/retry`, { method: 'POST' });
      await fetchTasks();
    } catch (error) {
      console.error('Failed to retry task:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return '已完成';
      case 'running': return '运行中';
      case 'failed': return '失败';
      case 'cancelled': return '已取消';
      case 'pending': return '等待中';
      default: return status;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">任务管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            监控和管理系统中的任务执行情况
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">所有任务</option>
              <option value="running">运行中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
              <option value="pending">等待中</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks list */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              任务列表
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-4 text-gray-500">加载中...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-4 text-gray-500">暂无任务</div>
              ) : (
                tasks.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  const containerClass = `p-4 border rounded-lg cursor-pointer hover:bg-gray-50 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`;
                  
                  return (
                    <div
                      key={task.id}
                      className={containerClass}
                      onClick={() => {
                        setSelectedTask(task);
                        fetchTaskSteps(task.id);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">{task.source_name || task.source_id}</span>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(task.status)}`}>
                              {getStatusText(task.status)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 truncate">ID: {task.id}</p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          {new Date(task.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Task details and logs */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {selectedTask ? '任务详情' : '选择任务查看详情'}
              </h3>
              {selectedTask && (
                <div className="flex space-x-2">
                  {selectedTask.status === 'running' && (
                    <button
                      onClick={() => cancelTask(selectedTask.id)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      取消
                    </button>
                  )}
                  {(selectedTask.status === 'failed' || selectedTask.status === 'cancelled') && (
                    <button
                      onClick={() => retryTask(selectedTask.id)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      重试
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {selectedTask ? (
              <div>
                <div className="mb-4">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">任务ID</dt>
                      <dd className="text-sm text-gray-900 truncate">{selectedTask.id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">状态</dt>
                      <dd className={`text-sm font-medium ${getStatusColor(selectedTask.status)}`}>
                        {getStatusText(selectedTask.status)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">创建时间</dt>
                      <dd className="text-sm text-gray-900">{new Date(selectedTask.created_at).toLocaleString()}</dd>
                    </div>
                    {selectedTask.finished_at && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">完成时间</dt>
                        <dd className="text-sm text-gray-900">{new Date(selectedTask.finished_at).toLocaleString()}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {selectedTask.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <h4 className="text-sm font-medium text-red-800">错误信息</h4>
                    <p className="text-sm text-red-600 mt-1 font-mono">{selectedTask.error}</p>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">执行步骤</h4>
                  <div className="bg-gray-50 border rounded-md p-3 h-80 overflow-y-auto text-xs space-y-2">
                    {taskSteps.length === 0 ? (
                      <div className="text-gray-500">暂无步骤信息</div>
                    ) : (
                      taskSteps.map((step) => (
                        <Collapsible key={step.id} open={expandedStepId === step.id.toString()} onOpenChange={() => setExpandedStepId(expandedStepId === step.id.toString() ? null : step.id.toString())}>
                          <div className="p-2 border-b">
                            <CollapsibleTrigger className="flex justify-between items-center w-full text-left">
                              <span className="font-bold text-gray-800">{step.step_id}: {step.agent_name}</span>
                              <div className="flex items-center space-x-2">
                                <span className={`font-semibold ${getStatusColor(step.status)} px-2 py-0.5 rounded-full`}>
                                  {getStatusText(step.status)}
                                </span>
                                <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-2">
                              <div className="bg-gray-100 p-2 rounded">
                                <h5 className="font-semibold text-gray-700">原始Prompt</h5>
                                <pre className="mt-1 text-xs text-gray-600 font-mono whitespace-pre-wrap">
                                  <code>{step.input}</code>
                                </pre>
                              </div>
                              {step.response && (
                                <div className="bg-gray-100 p-2 rounded">
                                  <h5 className="font-semibold text-gray-700">原始Completion</h5>
                                  <pre className="mt-1 text-xs text-gray-600 font-mono whitespace-pre-wrap">
                                    <code>{JSON.stringify(step.response, null, 2)}</code>
                                  </pre>
                                </div>
                              )}
                              {step.error && (
                                <div className="bg-red-100 p-2 rounded">
                                  <h5 className="font-semibold text-red-800">错误</h5>
                                  <p className="text-red-600 font-mono">{step.error}</p>
                                </div>
                              )}
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                点击左侧任务查看详细信息
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}