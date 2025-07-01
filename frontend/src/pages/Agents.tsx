import { useEffect, useState, useMemo } from 'react';
import { Plus, Edit, Trash2, TestTube, Bot, Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface MCPTool {
  id: string;
  tool_name: string;
  display_name?: string;
  type: 'local' | 'remote';
  description: string;
}
// New Agent interface
interface Agent {
  id: string;
  agent_name: string;
  agentId: string;
  app_id: string;
  app_name: string;
  responsibilities_and_functions: string;
<<<<<<< HEAD
  capabilities?: { capability_type: string; target_name: string; displayName?: string }[];
  allowed_tools?: { name: string; displayName: string }[];
=======
  capabilities?: { capability_type: string; target_name: string }[];
  allowed_tool_names?: string[];
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
  subordinate_agent_ids?: string[];
  status: 'active' | 'inactive' | 'error';
  createdAt: string;
  model?: string;
}

// Simplified agent for selection
interface SimplifiedAgent {
  id: string;
  name: string;
}

export function Agents() {
  // Updated state variables
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allAgentsForSelection, setAllAgentsForSelection] = useState<SimplifiedAgent[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  // const [showForm, setShowForm] = useState(false); // 旧状态，可以删除
  const [isDialogOpen, setIsDialogOpen] = useState(false); // 新状态
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<any | null>(null);
  const [testingStates, setTestingStates] = useState<{ [key: string]: boolean }>({});
  
  // Updated formData state
  const [formData, setFormData] = useState({
    agent_name: '',
    agentId: '',
    app_id: '',
    responsibilities_and_functions: '',
    allowed_tool_names: [] as string[],
    subordinate_agent_ids: [] as string[],
    model: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  // Updated fetchData to get simplified agents list
  const fetchData = async () => {
    try {
      const [agentsRes, appsRes, mcpRes] = await Promise.all([
        fetch('/api/v1/agents'),
        fetch('/api/v1/applications'),
        fetch('/api/v1/mcp/tools')
      ]);
      
      const [agentsApiResponse, appsApiResponse, mcpApiResponse] = await Promise.all([
        agentsRes.json(),
        appsRes.json(),
        mcpRes.json()
      ]);
      
      if (agentsApiResponse.success && agentsApiResponse.data) {
        const agentItems = agentsApiResponse.data.items || [];
        const processedData = agentItems.map((agent: any) => {
<<<<<<< HEAD
          const allowed_tools: { name: string; displayName: string }[] = [];
=======
          const allowed_tool_names: string[] = [];
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
          const subordinate_agent_ids: string[] = [];
          if (Array.isArray(agent.capabilities)) {
            for (const cap of agent.capabilities) {
              if (cap.capability_type === 'mcp_tool') {
<<<<<<< HEAD
                allowed_tools.push({
                  name: cap.target_name,
                  displayName: cap.displayName || cap.target_name
                });
=======
                allowed_tool_names.push(cap.target_name);
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
              } else if (cap.capability_type === 'sub_agent') {
                subordinate_agent_ids.push(cap.target_name);
              }
            }
          }
<<<<<<< HEAD
          return { ...agent, allowed_tools, subordinate_agent_ids };
=======
          return { ...agent, allowed_tool_names, subordinate_agent_ids };
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
        });
        setAgents(processedData);
        // Populate the list for the subordinate agent selector
        const simplifiedAgents = processedData.map((agent: any) => ({
          id: agent.agentId,
          name: agent.agent_name,
        }));
        setAllAgentsForSelection(simplifiedAgents);
      }
      if (appsApiResponse.success && appsApiResponse.data) {
        setApplications(appsApiResponse.data.items || []);
      }
      if (mcpApiResponse.success && mcpApiResponse.data) {
        setMcpTools(mcpApiResponse.data.tools || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Updated handleSubmit with new payload
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingAgent
        ? `/api/v1/agents/${editingAgent.agentId}`
        : '/api/v1/agents';
      const method = editingAgent ? 'PUT' : 'POST';
      
      const payload = {
        agent_name: formData.agent_name,
        agent_id: formData.agentId,
        app_id: formData.app_id,
        responsibilities_and_functions: formData.responsibilities_and_functions,
        allowed_tool_names: formData.allowed_tool_names,
        subordinate_agent_ids: formData.subordinate_agent_ids,
        model: formData.model,
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchData();
        setIsDialogOpen(false); // 替换 setShowForm(false)
        setEditingAgent(null);
        resetForm();
      } else {
        const errorData = await response.json();
        console.error('Failed to save agent:', errorData);
        alert(`Error: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save agent:', error);
    }
  };

  // 处理“添加”
  const handleAddNew = () => {
    resetForm();
    setEditingAgent(null);
    setIsDialogOpen(true); // 使用新状态
  };

  // Updated resetForm
  const resetForm = () => {
    setFormData({
      agent_name: '',
      agentId: '',
      app_id: '',
      responsibilities_and_functions: '',
      allowed_tool_names: [],
      subordinate_agent_ids: [],
      model: ''
    });
    setSelectedApplication(null);
  };

  // Updated handleEdit
  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    const app = applications.find(app => app.app_id === agent.app_id);
    setSelectedApplication(app || null);
    setFormData({
      agent_name: agent.agent_name,
      agentId: agent.agentId,
      app_id: agent.app_id,
      responsibilities_and_functions: agent.responsibilities_and_functions || '',
      allowed_tool_names: agent.allowed_tools?.map(t => t.name) || [],
      subordinate_agent_ids: agent.subordinate_agent_ids || [],
      model: agent.model || ''
    });
    setIsDialogOpen(true); // 使用新状态
  };

  const handleDelete = async (agentId: string) => {
    if (confirm('确定要删除这个智能体吗？')) {
      try {
        await fetch(`/api/v1/agents/${agentId}`, { method: 'DELETE' });
        await fetchData();
      } catch (error) {
        console.error('Failed to delete agent:', error);
      }
    }
  };

  const testConnection = async (agentId: string) => {
    setTestingStates(prev => ({ ...prev, [agentId]: true }));
    try {
      const response = await fetch(`/api/v1/agents/${agentId}/test`, { method: 'POST' });
      const result = await response.json();
      alert(result.success ? '连接测试成功' : `连接测试失败: ${result.error}`);
    } catch (error) {
      alert('连接测试失败');
    } finally {
      setTestingStates(prev => ({ ...prev, [agentId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">智能体管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            管理系统中的智能体实例及其职责、工具和层级关系
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          添加智能体
        </button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAgent ? '编辑智能体' : '添加智能体'}</DialogTitle>
            <DialogDescription>
              在这里定义智能体的所有属性，包括它的核心职责和所能使用的工具。
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">智能体名称</label>
                <input
                  type="text"
                  required
                  value={formData.agent_name}
                  onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Agent ID</label>
                <input
                  type="text"
                  required
                  value={formData.agentId}
                  onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">所属应用</label>
              <select
                required
                value={formData.app_id}
                onChange={(e) => {
                  const selectedApp = applications.find(app => app.app_id === e.target.value);
                  setSelectedApplication(selectedApp || null);
                  setFormData({ ...formData, app_id: e.target.value, model: '' });
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">选择应用</option>
                {applications.map((app) => (
                  <option key={app.app_id} value={app.app_id}>{app.app_name}</option>
                ))}
              </select>
            </div>

            {selectedApplication?.environment_type === 'test' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Model</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如: csg-pro"
                />
              </div>
            )}

            <div>
              <label htmlFor="responsibilities" className="block text-sm font-medium text-gray-700">职责与功能</label>
              <Textarea
                id="responsibilities"
                value={formData.responsibilities_and_functions}
                onChange={(e) => setFormData({ ...formData, responsibilities_and_functions: e.target.value })}
                className="mt-1 block w-full"
                rows={10}
                placeholder="定义智能体的核心职责、功能和行为准则..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">可传递的下级</label>
              <MultiSelectCombobox
                options={allAgentsForSelection.filter(agent => agent.id !== formData.agentId)}
                selectedValues={formData.subordinate_agent_ids}
                onChange={(selected) => setFormData({ ...formData, subordinate_agent_ids: selected })}
                placeholder="选择下级智能体..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">允许调用的工具</label>
              <div className="mt-2">
                <MultiSelectCombobox
                  options={mcpTools.map(tool => ({
                    id: tool.tool_name,
                    name: tool.display_name || tool.tool_name
                  }))}
                  selectedValues={formData.allowed_tool_names}
                  onChange={(selected) => setFormData({ ...formData, allowed_tool_names: selected })}
                  placeholder="选择允许调用的工具..."
                />
              </div>
<<<<<<< HEAD
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">
                {editingAgent ? '更新' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
=======

              {/* Updated Tools Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700">允许调用的工具</label>
                <div className="mt-2">
                  <MultiSelectCombobox
                    options={mcpTools.map(tool => ({ id: tool.tool_name, name: tool.tool_name }))}
                    selectedValues={formData.allowed_tool_names}
                    onChange={(selected) => setFormData({ ...formData, allowed_tool_names: selected })}
                    placeholder="选择允许调用的工具..."
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingAgent(null);
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
                  {editingAgent ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309

      {/* Agents grid - Updated display */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full text-center py-8 text-gray-500">加载中...</div>
        ) : agents.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">暂无智能体</div>
        ) : (
          agents.map((agent) => (
            <div key={agent.id} className="bg-white overflow-hidden shadow rounded-lg flex flex-col">
              <div className="p-6 flex-grow">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Bot className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-4 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">{agent.agent_name}</h3>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        agent.status === 'active' ? 'bg-green-100 text-green-800' :
                        agent.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {agent.status === 'active' ? '运行中' :
                         agent.status === 'inactive' ? '停用' : '错误'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">ID: {agent.agentId}</p>
                    <p className="text-sm text-gray-500">应用: {agent.app_name}</p>
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="text-sm text-gray-600 line-clamp-2">{agent.responsibilities_and_functions}</p>
                </div>

                <div className="mt-4">
                  <h4 className="text-xs font-medium text-gray-500">工具</h4>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {agent.allowed_tools?.length > 0 ? agent.allowed_tools.slice(0, 5).map((tool, index) => (
                      <Badge key={index} variant="secondary">{tool.displayName}</Badge>
                    )) : <span className="text-xs text-gray-400">无</span>}
                     {agent.allowed_tools?.length > 5 && (
                      <Badge variant="outline">+{agent.allowed_tools.length - 5}</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-xs font-medium text-gray-500">下级</h4>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {agent.subordinate_agent_ids?.length > 0 ? agent.subordinate_agent_ids.slice(0, 5).map((id, index) => (
                      <Badge key={index} variant="outline">{allAgentsForSelection.find(a => a.id === id)?.name || id}</Badge>
                    )) : <span className="text-xs text-gray-400">无</span>}
                    {agent.subordinate_agent_ids?.length > 5 && (
                       <Badge variant="outline">+{agent.subordinate_agent_ids.length - 5}</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => testConnection(agent.agentId)}
                      disabled={testingStates[agent.agentId]}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    >
                      <TestTube className="h-3 w-3 mr-1" />
                      {testingStates[agent.agentId] ? '测试中...' : '测试'}
                    </button>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(agent)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(agent.agentId)}
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

// MultiSelectCombobox Component
interface MultiSelectComboboxProps {
  options: { id: string; name: string }[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

function MultiSelectCombobox({ options, selectedValues, onChange, placeholder }: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (currentValue: string) => {
    const newSelectedValues = selectedValues.includes(currentValue)
      ? selectedValues.filter((value) => value !== currentValue)
      : [...selectedValues, currentValue];
    onChange(newSelectedValues);
  };

  const selectedOptions = useMemo(() => 
    options.filter(option => selectedValues.includes(option.id)),
    [options, selectedValues]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10"
        >
          <div className="flex gap-1 flex-wrap">
            {selectedOptions.length > 0 ? (
              selectedOptions.map(option => (
                <Badge
                  key={option.id}
                  variant="secondary"
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(option.id);
                  }}
                >
                  {option.name}
                  <X className="ml-1 h-3 w-3 cursor-pointer" />
                </Badge>
              ))
            ) : (
              <span className="text-gray-500">{placeholder || 'Select...'}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="搜索..." />
          <CommandList>
            <CommandEmpty>未找到结果。</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    handleSelect(option.id);
                    // setOpen(false); // Keep open for multi-select
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${selectedValues.includes(option.id) ? "opacity-100" : "opacity-0"}`}
                  />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}