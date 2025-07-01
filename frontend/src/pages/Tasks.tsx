import { useEffect, useState } from 'react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Play, Pause, Square, Eye, RotateCcw, Filter, ChevronDown, Trash2, X } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'delegated';
  input_data: { input: string, context: any };
  result?: any;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  steps?: TaskStep[];
  subtasks?: Task[]; // 新增 subtasks 字段
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
// 新增 RenderResponse 组件用于智能渲染API响应
const RenderResponse = ({ data, preserveWhitespace }: { data: any, preserveWhitespace: boolean }) => {
  if (data === null) {
    return <span className="text-gray-500">null</span>;
  }
  if (typeof data === 'string') {
    return (
      <pre className={`text-xs text-gray-600 font-mono ${preserveWhitespace ? 'whitespace-pre-wrap' : 'whitespace-normal'}`}>
        <code>{data}</code>
      </pre>
    );
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span className="text-indigo-600">{data.toString()}</span>;
  }
  if (Array.isArray(data)) {
    return (
      <div className="pl-4 border-l border-gray-300">
        {data.map((item, index) => (
          <div key={index} className="flex items-start">
            <span className="text-gray-500 mr-2">{index}:</span>
            <RenderResponse data={item} preserveWhitespace={preserveWhitespace} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === 'object') {
    return (
      <div className="pl-4 border-l border-gray-300 space-y-1">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex items-start">
            <span className="font-semibold text-gray-700 mr-2">{key}:</span>
            <RenderResponse data={value} preserveWhitespace={preserveWhitespace} />
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [preserveWhitespace, setPreserveWhitespace] = useState(false);
  const [managementMode, setManagementMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [subtaskDetails, setSubtaskDetails] = useState<Record<string, Task>>({});

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

  const fetchTaskDetails = async (taskId: string) => {
    setLoadingDetails(true);
<<<<<<< HEAD
    setSubtaskDetails({}); // 重置
=======
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
    try {
      const response = await fetch(`/api/v1/tasks/${taskId}`);
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
<<<<<<< HEAD
        const mainTask = apiResponse.data;
        setSelectedTask(mainTask);
        setTaskSteps(mainTask.steps || []);

        if (mainTask.subtasks && mainTask.subtasks.length > 0) {
          mainTask.subtasks.forEach(async (subtask) => {
            try {
              const subtaskResponse = await fetch(`/api/v1/tasks/${subtask.id}`);
              const subtaskApiResponse = await subtaskResponse.json();
              if (subtaskApiResponse.success && subtaskApiResponse.data) {
                setSubtaskDetails(prev => ({
                  ...prev,
                  [subtask.id]: subtaskApiResponse.data
                }));
              }
            } catch (e) {
              console.error(`Failed to fetch subtask ${subtask.id}`, e);
            }
          });
        }
=======
        setSelectedTask(apiResponse.data);
        setTaskSteps(apiResponse.data.steps || []);
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
      }
    } catch (error) {
      console.error('Failed to fetch task details:', error);
      setSelectedTask(null);
      setTaskSteps([]);
    } finally {
      setLoadingDetails(false);
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

  const handleToggleManagementMode = () => {
    setManagementMode(!managementMode);
    setSelectedTaskIds([]); // 进入或退出管理模式时清空选择
  };

  const handleRowClick = (taskId: string) => {
    // 只有在管理模式下才响应行点击
    if (!managementMode) return;

    // 切换指定 taskId 的选中状态
    setSelectedTaskIds(prev => {
      const isSelected = prev.includes(taskId);
      if (isSelected) {
        return prev.filter(id => id !== taskId);
      } else {
        return [...prev, taskId];
      }
    });
  };

  const handleSelectAllChange = () => {
    const allTaskIds = tasks.map(task => task.id);
    const allSelected = selectedTaskIds.length === allTaskIds.length;

    if (allSelected) {
      // 如果当前已全选，则全部取消
      setSelectedTaskIds([]);
    } else {
      // 否则，全部选中
      setSelectedTaskIds(allTaskIds);
    }
  };

  const handleDeleteSelectedTasks = async () => {
    try {
      const response = await fetch('/api/v1/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: selectedTaskIds }),
      });
      const apiResponse = await response.json();
      if (apiResponse.success) {
        setTasks(prev => prev.filter(task => !selectedTaskIds.includes(task.id)));
        if (selectedTask && selectedTaskIds.includes(selectedTask.id)) {
            setSelectedTask(null);
        }
        handleToggleManagementMode(); // 操作完成后退出管理模式
      } else {
        console.error('Failed to delete tasks:', apiResponse.message);
      }
    } catch (error) {
      console.error('Error deleting tasks:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      case 'delegated': return 'bg-purple-100 text-purple-800';
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
      case 'delegated': return '已委托';
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
      {!managementMode ? (
        <Button variant="outline" onClick={handleToggleManagementMode}>管理任务</Button>
      ) : (
        <div className="flex items-center space-x-2">
            <Checkbox
              id="select-all"
              checked={selectedTaskIds.length === tasks.length && tasks.length > 0}
              onCheckedChange={handleSelectAllChange}
              aria-label="Select all tasks"
              className="mr-2"
              ref={(el: HTMLButtonElement | null) => {
                if (el) {
                  const numSelected = selectedTaskIds.length;
                  const numTasks = tasks.length;
                  (el as any).indeterminate = numSelected > 0 && numSelected < numTasks;
                }
              }}
            />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={selectedTaskIds.length === 0}>
                <Trash2 className="h-4 w-4 mr-2" />
                删除选中 ({selectedTaskIds.length})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确定要删除吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  你将要删除 {selectedTaskIds.length} 个主任务及其所有的子任务和执行步骤。此操作不可逆。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteSelectedTasks}>确认删除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" onClick={handleToggleManagementMode}>
            <X className="h-4 w-4 mr-2" />
            取消
          </Button>
        </div>
      )}
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
              <option value="delegated">已委托</option>
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
            <div className="max-h-[calc(100vh-20rem)] overflow-y-auto pr-2">
              {loading ? (
                <div className="text-center py-4 text-gray-500">加载中...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-4 text-gray-500">暂无任务</div>
              ) : (
<<<<<<< HEAD
<Accordion type="multiple" className="w-full space-y-2">
  {tasks.map((task) => {
    const isSelectedInManagement = selectedTaskIds.includes(task.id);
    const isSelectedForDetails = selectedTask?.id === task.id;
    return (
      <AccordionItem
        key={task.id}
        value={task.id}
        className={`border rounded-lg transition-colors duration-200 ${
          managementMode
            ? isSelectedInManagement ? 'bg-blue-50 border-blue-500' : 'bg-white'
            : isSelectedForDetails ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
        }`}
      >
        <div
          className="flex items-center p-4 space-x-4"
          style={{ cursor: managementMode ? 'pointer' : 'default' }}
          onClick={() => {
            if (managementMode) {
              handleRowClick(task.id);
            }
          }}
        >
          {managementMode && (
            <Checkbox
              checked={isSelectedInManagement}
              onClick={(e) => {
                e.stopPropagation();
                handleRowClick(task.id);
              }}
            />
          )}
          <AccordionTrigger
            className="p-0 flex-1 hover:no-underline"
            onClick={(e) => {
              e.stopPropagation();
              if (!managementMode) {
                fetchTaskDetails(task.id);
              }
            }}
            disabled={managementMode}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex-1 text-left">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-900">{task.source_name || task.source_id}</span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(task.status)}`}>
                    {getStatusText(task.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">ID: {task.id}</p>
              </div>
              <div className="text-right text-xs text-gray-500 pl-4">
                {new Date(task.created_at).toLocaleString()}
              </div>
            </div>
          </AccordionTrigger>
        </div>
        <AccordionContent className="p-4 pt-2 border-t bg-gray-50/50">
          {task.subtasks && task.subtasks.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">子任务列表:</h4>
              {task.subtasks.map(subtask => (
                <div key={subtask.id} className="p-3 bg-white border rounded-md flex justify-between items-center hover:shadow-sm transition-shadow duration-200">
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs text-gray-800 truncate">
                      <span className="font-medium">输入:</span> {subtask.input_data?.input || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 truncate">ID: {subtask.id}</p>
                  </div>
                  <div className="pl-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(subtask.status)}`}>
                      {getStatusText(subtask.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-center text-gray-500 py-2">没有子任务。</p>
          )}
        </AccordionContent>
      </AccordionItem>
    );
  })}
</Accordion>
=======
                tasks.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  const containerClass = `p-4 border rounded-lg cursor-pointer hover:bg-gray-50 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`;
                  
                  return (
                    <div
                      key={task.id}
                      className={containerClass}
                      onClick={() => {
                        fetchTaskDetails(task.id);
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
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
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
                <div className="flex items-center space-x-2 my-4">
                  <Switch
                    id="preserve-whitespace"
                    checked={preserveWhitespace}
                    onCheckedChange={setPreserveWhitespace}
                  />
                  <Label htmlFor="preserve-whitespace">保留原始格式</Label>
                </div>
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

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">主任务执行步骤</h4>
                    <div className="bg-gray-50 border rounded-md p-3 max-h-60 overflow-y-auto text-xs space-y-2">
                      {loadingDetails ? (
                        <div className="text-gray-500">加载步骤中...</div>
                      ) : taskSteps.length === 0 ? (
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
<<<<<<< HEAD
                                  <pre className={`mt-1 text-xs text-gray-600 font-mono ${preserveWhitespace ? 'whitespace-pre-wrap' : 'whitespace-normal'}`}>
=======
                                  <pre className="mt-1 text-xs text-gray-600 font-mono whitespace-pre-wrap">
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
                                    <code>{step.input}</code>
                                  </pre>
                                </div>
                                {step.response && (
                                  <div className="bg-gray-100 p-2 rounded">
                                    <h5 className="font-semibold text-gray-700">原始Completion</h5>
<<<<<<< HEAD
                                    <div className="mt-1">
                                      <RenderResponse data={step.response} preserveWhitespace={preserveWhitespace} />
                                    </div>
=======
                                    <pre className="mt-1 text-xs text-gray-600 font-mono whitespace-pre-wrap">
                                      <code>{JSON.stringify(step.response, null, 2)}</code>
                                    </pre>
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
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

                  {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">子任务</h4>
                      <div className="space-y-3">
<<<<<<< HEAD
                        {selectedTask.subtasks.map(subtask => {
                          const details = subtaskDetails[subtask.id];
                          return (
                            <Collapsible key={subtask.id} className="p-3 border rounded-lg bg-gray-50">
                              <CollapsibleTrigger className="flex justify-between items-center w-full text-left">
                                <div className="flex-1">
                                  <span className="font-bold text-gray-800">子任务: {subtask.id.substring(0, 8)}...</span>
                                  <p className="text-xs text-gray-600 mt-1">输入: {subtask.input_data.input}</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className={`font-semibold ${getStatusColor(subtask.status)} px-2 py-0.5 rounded-full text-xs`}>
=======
                        {selectedTask.subtasks.map(subtask => (
                          <Collapsible key={subtask.id}>
                            <div className="p-3 border rounded-lg bg-blue-50">
                              <CollapsibleTrigger className="flex justify-between items-center w-full text-left">
                                <div className="flex-1">
                                  <span className="font-bold text-blue-800">子任务: {subtask.id.substring(0, 8)}...</span>
                                  <p className="text-xs text-blue-600 mt-1">输入: {subtask.input_data.input}</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className={`font-semibold ${getStatusColor(subtask.status)} px-2 py-0.5 rounded-full`}>
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
                                    {getStatusText(subtask.status)}
                                  </span>
                                  <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
                                </div>
                              </CollapsibleTrigger>
<<<<<<< HEAD
                              <CollapsibleContent className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                                {!details ? (
                                  <p className="text-xs text-gray-500">正在加载步骤...</p>
                                ) : details.steps && details.steps.length > 0 ? (
                                  details.steps.map(step => (
                                    <Collapsible key={step.id} className="p-2 border rounded bg-white">
                                      <CollapsibleTrigger className="flex justify-between items-center w-full text-left text-xs">
                                        <span className="font-bold text-gray-800">{step.step_id}: {step.agent_name}</span>
                                        <div className="flex items-center space-x-2">
                                          <span className={`font-semibold ${getStatusColor(step.status)} px-2 py-0.5 rounded-full`}>
                                            {getStatusText(step.status)}
                                          </span>
                                          <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="mt-2 pt-2 border-t space-y-2">
                                        <div className="bg-gray-50 p-2 rounded">
                                          <h5 className="font-semibold text-gray-700 text-xs">Request</h5>
                                          <pre className={`mt-1 text-xs text-gray-600 font-mono ${preserveWhitespace ? 'whitespace-pre-wrap' : 'whitespace-normal'}`}>
                                            <code>{step.input}</code>
                                          </pre>
                                        </div>
                                        {step.response && (
                                          <div className="bg-gray-50 p-2 rounded">
                                            <h5 className="font-semibold text-gray-700 text-xs">Response</h5>
                                            <div className="mt-1">
                                              <RenderResponse data={step.response} preserveWhitespace={preserveWhitespace} />
                                            </div>
                                          </div>
                                        )}
                                        {step.error && (
                                          <div className="bg-red-100 p-2 rounded">
                                            <h5 className="font-semibold text-red-800 text-xs">错误</h5>
                                            <p className="text-red-600 font-mono text-xs">{step.error}</p>
                                          </div>
                                        )}
                                      </CollapsibleContent>
                                    </Collapsible>
=======
                              <CollapsibleContent className="mt-3 pt-3 border-t border-blue-200 space-y-2">
                                <h5 className="text-xs font-bold text-blue-800">子任务步骤:</h5>
                                {subtask.steps && subtask.steps.length > 0 ? (
                                  subtask.steps.map(step => (
                                    <div key={step.id} className="p-2 bg-white rounded border">
                                      <p className="font-semibold">{step.step_id}: {step.agent_name}</p>
                                      <p className="text-xs text-gray-600">状态: {getStatusText(step.status)}</p>
                                    </div>
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
                                  ))
                                ) : (
                                  <p className="text-xs text-gray-500">该子任务没有步骤。</p>
                                )}
                              </CollapsibleContent>
<<<<<<< HEAD
                            </Collapsible>
                          );
                        })}
=======
                            </div>
                          </Collapsible>
                        ))}
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
                      </div>
                    </div>
                  )}
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