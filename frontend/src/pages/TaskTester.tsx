import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader, Info, ChevronDown, Share2, Wrench } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { generateStepSummary } from '@/lib/utils';
interface Message {
  sender: 'user' | 'bot';
  content: string;
}

const LOCAL_STORAGE_KEY = 'taskTesterState';

const RenderResponse = ({ data }: { data: any }) => {
  if (data === null || data === undefined) {
    return <span className="text-gray-500">null</span>;
  }
  if (typeof data === 'string') {
    return (
      <pre className={`text-xs text-gray-600 font-mono whitespace-pre-wrap`}>
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
            <RenderResponse data={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === 'object' && data !== null) {
    return (
      <div className="pl-4 border-l border-gray-300 space-y-1">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex items-start">
            <span className="font-semibold text-gray-700 mr-2">{key}:</span>
            <RenderResponse data={value} />
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const TaskTester: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [inputSources, setInputSources] = useState<any[]>([]);
  
  // New states for task tracking
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [taskSteps, setTaskSteps] = useState<any[]>([]);
  const [taskResult, setTaskResult] = useState<any | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pollTaskStatus = useCallback(async (currentTaskId: string) => {
    if (!currentTaskId) return;
    try {
      const response = await fetch(`/api/v1/tasks/${currentTaskId}`);
      const result = await response.json();

      if (result.success) {
        const task = result.data;
        setTaskStatus(task.status);
        setTaskSteps(task.steps || []);
        setTaskResult(task.result || task.error);

        if (task.status === 'delegated') {
          const subtask = task.subtasks && task.subtasks.length > 0 ? task.subtasks[0] : null;
          if (subtask && subtask.id) {
            const subtaskId = subtask.id;
            const delegationStep = {
              description: `任务已委托，正在追踪子任务 (ID: ${subtaskId})`,
              status: 'info',
            };
            setTaskSteps(prevSteps => [...prevSteps, delegationStep]);
            setTaskId(subtaskId); // 修复：只传递子任务的 ID
            // 立即轮询新的子任务状态
            pollTaskStatus(subtaskId);
          } else {
            setTaskResult({ error: '任务已委托，但未找到有效的子任务ID。' });
            setIsPolling(false);
          }
        } else {
          const isFinalStatus = ['completed', 'failed'].includes(task.status);
          if (!isFinalStatus) {
            pollingTimeoutRef.current = setTimeout(() => pollTaskStatus(currentTaskId), 2000);
          } else {
            setIsPolling(false);
          }
        }
      }
    } catch (error) {
      console.error('Polling failed:', error);
      setTaskResult({ error: '轮询任务结果时发生错误。' });
      setIsPolling(false);
    }
  }, []);

  // Effect for loading state from localStorage on initial load
  useEffect(() => {
    const fetchInputSources = async () => {
      try {
        const response = await fetch('/api/v1/input-sources');
        const result = await response.json();
        if (result.success) {
          setInputSources(result.data.items);
        }
      } catch (error) {
        console.error('Failed to fetch input sources:', error);
      }
    };
    fetchInputSources();

    const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedStateJSON) {
      const savedState = JSON.parse(savedStateJSON);
      setTaskId(savedState.taskId);
      setTaskStatus(savedState.taskStatus);
      setTaskSteps(savedState.taskSteps || []);
      setTaskResult(savedState.taskResult);
      setMessages(savedState.messages || []);
      setSelectedSourceId(savedState.selectedSourceId || '');

      const isFinalStatus = ['completed', 'failed'].includes(savedState.taskStatus);
      if (savedState.taskId && !isFinalStatus) {
        setIsPolling(true);
        pollTaskStatus(savedState.taskId);
      }
    }
    
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, [pollTaskStatus]);

  // Effect for persisting state to localStorage
  useEffect(() => {
    if (taskId) {
      const stateToPersist = {
        taskId,
        taskStatus,
        taskSteps,
        taskResult,
        messages,
        selectedSourceId,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToPersist));
    }
  }, [taskId, taskStatus, taskSteps, taskResult, messages, selectedSourceId]);


  const handleSend = async () => {
    if (!inputValue.trim() || !selectedSourceId) {
      alert('请选择一个输入源并输入消息。');
      return;
    }

    if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
    }

    const userMessage: Message = { sender: 'user', content: inputValue };
    setMessages([userMessage]); // Start with only the user message
    setInputValue('');
    
    // Reset previous task state
    setTaskStatus('pending');
    setTaskSteps([]);
    setTaskResult(null);
    setIsPolling(true);

    try {
      const response = await fetch(`/api/v1/tasks/trigger/${selectedSourceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputValue, context: { sourceType: 'manual_test' } }),
      });

      const result = await response.json();

      if (result.success && result.data.taskId) {
        const newTaskId = result.data.taskId;
        setTaskId(newTaskId);
        pollTaskStatus(newTaskId);
      } else {
        setTaskResult({ error: `启动任务失败: ${result.message || '未知错误'}` });
        setIsPolling(false);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setTaskResult({ error: '发送消息时发生网络错误。' });
      setIsPolling(false);
    }
  };

  const renderStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="text-green-500" />;
      case 'failed':
        return <XCircle className="text-red-500" />;
      case 'info':
        return <Info className="text-gray-500" />;
      default:
        return <Loader className="animate-spin text-blue-500" />;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>任务测试</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">选择输入源</label>
            <Select onValueChange={setSelectedSourceId} value={selectedSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="请选择一个输入源进行测试" />
              </SelectTrigger>
              <SelectContent>
                {inputSources.map((source) => (
                  <SelectItem key={source.id} value={source.id.toString()}>
                    {source.source_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-96 border rounded-md p-4 overflow-y-auto bg-gray-50 space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className="flex justify-end">
                <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-blue-500 text-white">
                  {msg.content}
                </div>
              </div>
            ))}
            
            {taskId && (
              <div className="space-y-2">
                <h4 className="font-semibold">任务进度 (ID: {taskId})</h4>
                <ul className="space-y-2">
                  {taskSteps.map((step, index) => (
                    <li key={index} className="bg-white rounded-md border">
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center justify-between p-2 w-full text-left hover:bg-gray-50">
                          <div className="flex items-center space-x-2 flex-grow">
                            {renderStepIcon(step.status)}
                            <span className="font-medium text-sm">{`步骤 ${index + 1}`}</span>
                            <span className="text-sm text-gray-600 truncate">{generateStepSummary(step, index === taskSteps.length - 1, taskStatus || '')}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500 px-2 py-0.5 rounded-full bg-gray-100">{step.status}</span>
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="p-4 border-t bg-gray-50/50">
                          <RenderResponse data={step} />
                        </CollapsibleContent>
                      </Collapsible>
                    </li>
                  ))}
                </ul>
                {!isPolling && taskResult && (
                  <div className="mt-4 p-4 rounded-md bg-gray-100">
                    <h4 className="font-bold mb-2">最终结果:</h4>
                    <pre className="whitespace-pre-wrap break-all text-sm">
                      {(() => {
                        if (!taskResult) return null;
                        if (typeof taskResult === 'string') return taskResult;
                        return JSON.stringify(taskResult, null, 2);
                      })()}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {messages.length === 0 && !taskId && (
              <p className="text-gray-500">对话历史和任务进度将显示在这里...</p>
            )}
          </div>

          <div className="flex space-x-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入你的消息..."
              disabled={isPolling}
            />
            <Button onClick={handleSend} disabled={isPolling}>
              {isPolling ? '运行中...' : '发送'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TaskTester;