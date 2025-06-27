import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Message {
  sender: 'user' | 'bot';
  content: string;
}

const TaskTester: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [inputSources, setInputSources] = useState<any[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const pollTaskResult = (taskId: string) => {
    let pollCount = 0;
    const maxPolls = 30; // 30次 * 2秒 = 60秒超时

    const poll = async () => {
      if (pollCount >= maxPolls) {
        clearInterval(pollingIntervalRef.current!);
        setMessages(prev => [...prev, { sender: 'bot', content: '任务超时，请稍后重试。' }]);
        return;
      }

      try {
        const response = await fetch(`/api/v1/tasks/${taskId}`);
        const result = await response.json();

        if (result.success) {
          const task = result.data;
          if (task.status === 'completed' || task.status === 'failed') {
            clearInterval(pollingIntervalRef.current!);
            pollingIntervalRef.current = null;
            const output = task.status === 'failed'
              ? `错误: ${task.error}`
              : (typeof task.result === 'object' ? JSON.stringify(task.result, null, 2) : task.result);
            setMessages(prev => [...prev, { sender: 'bot', content: output }]);
          }
        }
      } catch (error) {
        console.error('Polling failed:', error);
        clearInterval(pollingIntervalRef.current!);
        pollingIntervalRef.current = null;
        setMessages(prev => [...prev, { sender: 'bot', content: '轮询任务结果时发生错误。' }]);
      }
      pollCount++;
    };

    pollingIntervalRef.current = setInterval(poll, 2000);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedSourceId) {
      alert('请选择一个输入源并输入消息。');
      return;
    }

    const userMessage: Message = { sender: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    try {
      const response = await fetch(`/api/v1/tasks/trigger/${selectedSourceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: inputValue, context: { sourceType: 'manual_test' } }),
      });

      const result = await response.json();

      if (result.success && result.data.taskId) {
        pollTaskResult(result.data.taskId);
      } else {
        setMessages(prev => [...prev, { sender: 'bot', content: `启动任务失败: ${result.message || '未知错误'}` }]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, { sender: 'bot', content: '发送消息时发生网络错误。' }]);
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
            {messages.length === 0 ? (
              <p className="text-gray-500">对话历史将显示在这里...</p>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex space-x-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入你的消息..."
            />
            <Button onClick={handleSend}>发送</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TaskTester;