import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, TestTube, Download, Database, FileText, ChevronsUpDown, Folder, File as FileIcon, FolderOpen } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

interface OutputConfig {
  id: string;
  name: string;
  type: 'vika' | 'file' | 'database' | 'api';
  config: {
    spaceId?: string;
    datasheetId?: string;
    viewId?: string;
    recordId?: string;
    operation?: 'create' | 'update' | 'append' | 'upsert';
    fieldMapping?: Record<string, string>;
    conditions?: Record<string, any>;
    [key: string]: any;
  };
  description: string;
  status: 'active' | 'inactive';
  lastUsed?: string;
  usageCount: number;
  createdAt: string;
}

interface VikaSpace {
  id: string;
  name: string;
}

interface VikaNodeBase {
  id: string;
  name: string;
  type: 'Folder' | 'Datasheet';
}

interface VikaFolder extends VikaNodeBase {
  type: 'Folder';
  children: VikaNode[];
}

interface VikaDatasheet extends VikaNodeBase {
  type: 'Datasheet';
}

type VikaNode = VikaFolder | VikaDatasheet;

interface VikaField {
  id: string;
  name: string;
  type: string;
}

const initialFormConfig = {
  spaceId: '',
  datasheetId: '',
  recordId: '',
  operation: 'create',
  conditions: {},
  fieldMapping: {},
  filePath: '',
  format: 'json',
  dbType: 'mysql',
  connectionString: '',
  tableName: '',
  endpoint: '',
  method: 'POST',
  authHeader: ''
};

export function OutputConfigs() {
  const [outputConfigs, setOutputConfigs] = useState<OutputConfig[]>([]);
  const [vikaSpaces, setVikaSpaces] = useState<VikaSpace[]>([]);
  const [vikaDatasheets, setVikaDatasheets] = useState<VikaNode[]>([]);
  const [vikaFields, setVikaFields] = useState<VikaField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<OutputConfig | null>(null);
  const [formData, setFormData] = useState({
    config_name: '',
    output_type: 'vika' as 'vika' | 'file' | 'database' | 'api',
    description: '',
    config: initialFormConfig,
    status: 'active' as 'active' | 'inactive'
  });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    fetchOutputConfigs();
  }, []);

  useEffect(() => {
    fetchVikaSpaces();
  }, []);

  const fetchOutputConfigs = async () => {
    try {
      const response = await fetch('/api/v1/output-configs');
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data && Array.isArray(apiResponse.data.items)) {
        const transformedConfigs = apiResponse.data.items.map((item: any) => {
          const typeMap: { [key: string]: 'vika' | 'file' | 'database' | 'api' } = {
            'vika_datasheet': 'vika',
            'vika_record': 'vika',
            'file': 'file',
            'database': 'database',
            'api': 'api'
          };
          const frontendType = typeMap[item.output_type] || item.output_type;

          return {
            id: item.id,
            name: item.config_name,
            type: frontendType,
            description: item.description,
            status: item.status,
            lastUsed: item.last_used_at,
            usageCount: item.usage_count,
            createdAt: item.created_at,
            config: {
              spaceId: item.vika_space_id,
              datasheetId: item.vika_datasheet_id,
              viewId: item.vika_view_id,
              recordId: item.vika_record_id,
              operation: item.operation,
              fieldMapping: item.field_mapping,
              conditions: item.conditions,
              filePath: item.file_path,
              format: item.format,
              dbType: item.db_type,
              connectionString: item.connection_string,
              tableName: item.table_name,
              endpoint: item.endpoint,
              method: item.method,
              authHeader: item.auth_header,
            }
          };
        });
        setOutputConfigs(transformedConfigs);
      } else {
        setOutputConfigs([]);
      }
    } catch (error) {
      console.error('Failed to fetch output configs:', error);
      setOutputConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchVikaSpaces = async () => {
    try {
      const response = await fetch('/api/v1/output-configs/vika/spaces');
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        const spacesData = apiResponse.data || [];
        setVikaSpaces(spacesData);
      }
    } catch (error) {
      console.error('Failed to fetch Vika spaces:', error);
    }
  };

  const fetchVikaDatasheets = async (spaceId: string) => {
    try {
      const response = await fetch(`/api/v1/output-configs/vika/spaces/${spaceId}/datasheets`);
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        setVikaDatasheets(apiResponse.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch Vika datasheets:', error);
    }
  };

  const fetchVikaFields = async (datasheetId: string) => {
    try {
      const response = await fetch(`/api/v1/output-configs/vika/datasheets/${datasheetId}/fields`);
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        setVikaFields(apiResponse.data.fields || []);
      }
    } catch (error) {
      console.error('Failed to fetch Vika fields:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Frontend validation to prevent backend errors
    if (formData.output_type === 'vika' && !formData.config.datasheetId) {
      alert('请选择一个数据表后再提交。');
      return; // Stop submission if datasheet is not selected for vika type
    }

    try {
      const url = editingConfig
        ? `/api/v1/output-configs/${editingConfig.id}`
        : '/api/v1/output-configs';
      const method = editingConfig ? 'PUT' : 'POST';

      // Create a flat payload that matches the backend API contract
      const payload = {
        config_name: formData.config_name,
        output_type: formData.output_type === 'vika' ? 'vika_datasheet' : formData.output_type,
        description: formData.description,
        status: formData.status,
        // Lift nested config fields to the top level for the backend
        vika_space_id: formData.config.spaceId,
        vika_datasheet_id: formData.config.datasheetId,
        vika_record_id: formData.config.recordId,
        field_mapping: formData.config.fieldMapping,
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchOutputConfigs();
        setShowForm(false);
        setEditingConfig(null);
        resetForm();
      } else {
        const errorData = await response.json();
        console.error('Failed to save output config:', errorData);
        alert(`保存失败: ${errorData.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to save output config:', error);
    }
  };

  const handleAddNewConfig = () => {
    setEditingConfig(null);
    resetForm();
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      config_name: '',
      output_type: 'vika',
      description: '',
      config: initialFormConfig,
      status: 'active'
    });
    setVikaDatasheets([]);
    setVikaFields([]);
  };

  const handleEdit = (config: OutputConfig) => {
    setEditingConfig(config);

    // Ensure a fallback for config to avoid errors if it's null/undefined
    const safeConfig = config.config || {};
    const mergedConfig = { ...initialFormConfig, ...safeConfig };

    setFormData({
      config_name: config.name || '',
      output_type: config.type,
      description: config.description || '',
      config: mergedConfig,
      status: config.status
    });
    
    if (config.type === 'vika' && mergedConfig.spaceId) {
      fetchVikaDatasheets(mergedConfig.spaceId);
      if (mergedConfig.datasheetId) {
        fetchVikaFields(mergedConfig.datasheetId);
      }
    }
    
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个输出配置吗？')) {
      try {
        await fetch(`/api/v1/output-configs/${id}`, { method: 'DELETE' });
        await fetchOutputConfigs();
      } catch (error) {
        console.error('Failed to delete output config:', error);
      }
    }
  };

  const testOutputConfig = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/output-configs/${id}/test`, { method: 'POST' });
      const result = await response.json();
      alert(result.success ? '测试成功' : `测试失败: ${result.error}`);
    } catch (error) {
      alert('测试失败');
    }
  };

  const updateConfig = (key: string, value: any) => {
    setFormData(prevData => ({
      ...prevData,
      config: {
        ...prevData.config,
        [key]: value
      }
    }));
  };

  const addFieldMapping = () => {
    const taskField = prompt('请输入任务字段名:');
    const vikaField = prompt('请输入维格表字段ID:');
    if (taskField && vikaField) {
      updateConfig('fieldMapping', {
        ...formData.config.fieldMapping,
        [taskField]: vikaField
      });
    }
  };

  const removeFieldMapping = (key: string) => {
    const newMapping = { ...formData.config.fieldMapping };
    delete newMapping[key];
    updateConfig('fieldMapping', newMapping);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'vika': return Database;
      case 'file': return FileText;
      case 'database': return Database;
      case 'api': return Download;
      default: return Download;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'vika': return '维格表';
      case 'file': return '文件';
      case 'database': return '数据库';
      case 'api': return 'API接口';
      default: return type;
    }
  };

  // --- Vika Datasheet Tree Selector Logic ---

  const handleDatasheetSelect = (datasheetId: string) => {
    updateConfig('datasheetId', datasheetId);
    updateConfig('fieldMapping', {});
    fetchVikaFields(datasheetId);
    setPopoverOpen(false);
    setSearchValue('');
  };

  const findNodeName = (nodes: VikaNode[], id: string): string | undefined => {
    for (const node of nodes) {
      if (node.id === id) {
        return node.name;
      }
      if (node.type === 'Folder') {
        const found = findNodeName(node.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const filterTree = (nodes: VikaNode[], term: string): VikaNode[] => {
    if (!term.trim()) {
      return nodes;
    }
    const lowercasedTerm = term.toLowerCase();

    function filter(allNodes: VikaNode[]): VikaNode[] {
      const result: VikaNode[] = [];
      for (const node of allNodes) {
        if (node.type === 'Datasheet') {
          if (node.name.toLowerCase().includes(lowercasedTerm)) {
            result.push(node);
          }
        } else { // Folder
          const children = filter(node.children);
          if (children.length > 0 || node.name.toLowerCase().includes(lowercasedTerm)) {
            result.push({ ...node, children });
          }
        }
      }
      return result;
    }
    return filter(nodes);
  };
  
  const TreeNode = ({ node, level = 0 }: { node: VikaNode; level?: number }) => {
    if (node.type === 'Folder') {
      // When searching, if a folder doesn't match and has no matching children, hide it.
      if (searchValue && node.children.length === 0 && !node.name.toLowerCase().includes(searchValue.toLowerCase())) {
        return null;
      }
      return (
        <Collapsible defaultOpen={true} className="space-y-1 group">
          <CollapsibleTrigger asChild>
            <div
              style={{ paddingLeft: `${level * 1.2}rem` }}
              className="flex items-center cursor-pointer hover:bg-accent p-1 rounded-sm text-sm w-full"
              role="button"
            >
              <Folder className="h-4 w-4 mr-2 text-sky-500 flex-shrink-0 group-data-[state=open]:hidden" />
              <FolderOpen className="h-4 w-4 mr-2 text-sky-500 flex-shrink-0 group-data-[state=closed]:hidden" />
              <span className="font-medium truncate">{node.name}</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1">
            {node.children.map(child => <TreeNode key={child.id} node={child} level={level + 1} />)}
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <CommandItem
        key={node.id}
        value={node.name}
        onSelect={() => handleDatasheetSelect(node.id)}
        style={{ paddingLeft: `${level * 1.2}rem` }}
        className="cursor-pointer w-full"
      >
        <FileIcon className="h-4 w-4 mr-2 text-gray-500 flex-shrink-0" />
        <span className="truncate">{node.name}</span>
      </CommandItem>
    );
  };

  const renderConfigFields = () => {
    switch (formData.output_type) {
      case 'vika':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">空间</label>
              <select
                value={formData.config.spaceId || ''}
                onChange={(e) => {
                  updateConfig('spaceId', e.target.value);
                  updateConfig('datasheetId', '');
                  updateConfig('fieldMapping', {});
                  if (e.target.value) {
                    fetchVikaDatasheets(e.target.value);
                  } else {
                    setVikaDatasheets([]);
                    setVikaFields([]);
                  }
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">选择空间</option>
                {(vikaSpaces || []).map((space) => (
                  <option key={space.id} value={space.id}>{space.name}</option>
                ))}
              </select>
            </div>
            
            {formData.config.spaceId && (
              <div>
                <label className="block text-sm font-medium text-gray-700">数据表</label>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={popoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {formData.config.datasheetId
                          ? findNodeName(vikaDatasheets, formData.config.datasheetId)
                          : "选择一个数据表..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
                    <Command>
                      <CommandInput
                        placeholder="搜索文件夹或数据表..."
                        value={searchValue}
                        onValueChange={setSearchValue}
                      />
                      <CommandList>
                        <CommandEmpty>未找到匹配项。</CommandEmpty>
                        <CommandGroup>
                          <div className="space-y-1 py-1">
                            {filterTree(vikaDatasheets, searchValue).map(node => (
                              <TreeNode key={node.id} node={node} />
                            ))}
                          </div>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {formData.config.datasheetId && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">操作类型</label>
                  <select
                    value={formData.config.operation || 'create'}
                    onChange={(e) => updateConfig('operation', e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="create">创建新记录</option>
                    <option value="update">更新指定记录</option>
                    <option value="append">追加到表末尾</option>
                    <option value="upsert">存在则更新，不存在则创建</option>
                  </select>
                </div>

                {(formData.config.operation === 'update' || formData.config.operation === 'upsert') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">目标记录ID</label>
                    <input
                      type="text"
                      value={formData.config.recordId || ''}
                      onChange={(e) => updateConfig('recordId', e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      placeholder="可以使用变量如 ${recordId} 或指定固定ID"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      支持动态变量：${'{recordId}'}, ${'{taskId}'}, ${'{timestamp}'}
                    </p>
                  </div>
                )}

                {formData.config.operation === 'upsert' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">匹配条件</label>
                    <div className="mt-2 space-y-2">
                      {Object.entries(formData.config.conditions || {}).map(([field, value]) => (
                        <div key={field} className="flex items-center space-x-2">
                          <select
                            value={field}
                            onChange={(e) => {
                              const newConditions = { ...formData.config.conditions };
                              delete newConditions[field];
                              newConditions[e.target.value] = value;
                              updateConfig('conditions', newConditions);
                            }}
                            className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">选择字段</option>
                            {vikaFields.map((field) => (
                              <option key={field.id} value={field.id}>{field.name}</option>
                            ))}
                          </select>
                          <span className="text-sm text-gray-400">=</span>
                          <input
                            type="text"
                            value={String(value)}
                            onChange={(e) => {
                              const newConditions = { ...formData.config.conditions };
                              newConditions[field] = e.target.value;
                              updateConfig('conditions', newConditions);
                            }}
                            className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="匹配值"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newConditions = { ...formData.config.conditions };
                              delete newConditions[field];
                              updateConfig('conditions', newConditions);
                            }}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const newConditions = { ...formData.config.conditions, '': '' };
                          updateConfig('conditions', newConditions);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        + 添加匹配条件
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">字段映射</label>
                  <div className="mt-2 space-y-2">
                    {Object.entries(formData.config.fieldMapping || {}).map(([taskField, vikaFieldId]) => (
                      <div key={taskField} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={taskField}
                          onChange={(e) => {
                            const newMapping = { ...formData.config.fieldMapping };
                            delete newMapping[taskField];
                            newMapping[e.target.value] = vikaFieldId;
                            updateConfig('fieldMapping', newMapping);
                          }}
                          className="w-1/3 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder="智能体输出字段名"
                        />
                        <span className="text-sm text-gray-400">→</span>
                        <select
                          value={String(vikaFieldId)}
                          onChange={(e) => {
                            const newMapping = { ...formData.config.fieldMapping };
                            newMapping[taskField] = e.target.value;
                            updateConfig('fieldMapping', newMapping);
                          }}
                          className="w-1/3 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">选择维格表字段</option>
                          {vikaFields.map((field) => (
                            <option key={field.id} value={field.id}>{field.name} ({field.type})</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeFieldMapping(taskField)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addFieldMapping}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      + 添加字段映射
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                      字段映射用于指定智能体输出的数据如何对应到维格表的字段中
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      
      case 'file':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">文件路径</label>
              <input
                type="text"
                value={formData.config.filePath || ''}
                onChange={(e) => updateConfig('filePath', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="/path/to/output/file.json"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">文件格式</label>
              <select
                value={formData.config.format || 'json'}
                onChange={(e) => updateConfig('format', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="xml">XML</option>
                <option value="txt">文本</option>
              </select>
            </div>
          </div>
        );
      
      case 'database':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">数据库类型</label>
              <select
                value={formData.config.dbType || 'mysql'}
                onChange={(e) => updateConfig('dbType', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="mysql">MySQL</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="mongodb">MongoDB</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">连接字符串</label>
              <input
                type="text"
                value={formData.config.connectionString || ''}
                onChange={(e) => updateConfig('connectionString', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="数据库连接字符串"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">表名</label>
              <input
                type="text"
                value={formData.config.tableName || ''}
                onChange={(e) => updateConfig('tableName', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="output_table"
              />
            </div>
          </div>
        );
      
      case 'api':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">API端点</label>
              <input
                type="text"
                value={formData.config.endpoint || ''}
                onChange={(e) => updateConfig('endpoint', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://api.example.com/receive"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">HTTP方法</label>
              <select
                value={formData.config.method || 'POST'}
                onChange={(e) => updateConfig('method', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">认证头</label>
              <input
                type="text"
                value={formData.config.authHeader || ''}
                onChange={(e) => updateConfig('authHeader', e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Bearer token..."
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
          <h1 className="text-2xl font-bold text-gray-900">输出配置</h1>
          <p className="mt-1 text-sm text-gray-600">
            配置任务结果的输出目标和格式
          </p>
        </div>
        <button
          onClick={handleAddNewConfig}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          添加输出配置
        </button>
      </div>

      {/* Output config form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingConfig ? '编辑输出配置' : '添加输出配置'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">配置名称</label>
                  <input
                    type="text"
                    required
                    value={formData.config_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, config_name: e.target.value }))}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">输出类型</label>
                  <select
                    value={formData.output_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, output_type: e.target.value as any, config: initialFormConfig }))}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="vika">维格表</option>
                    <option value="file">文件</option>
                    <option value="database">数据库</option>
                    <option value="api">API接口</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>

              {renderConfigFields()}

              <div>
                <label className="block text-sm font-medium text-gray-700">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
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
                    setEditingConfig(null);
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
                  {editingConfig ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Output configs grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full text-center py-8 text-gray-500">加载中...</div>
        ) : outputConfigs.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">暂无输出配置</div>
        ) : (
          outputConfigs.map((config) => {
            const Icon = getTypeIcon(config.type);
            return (
              <div key={config.id} className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Icon className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900">{config.name}</h3>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          config.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {config.status === 'active' ? '激活' : '停用'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{getTypeText(config.type)}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <p className="text-sm text-gray-600">{config.description}</p>
                    
                    {config.type === 'vika' && config.config.spaceId && (
                      <div className="mt-2 text-xs text-gray-500">
                        <p>空间ID: {config.config.spaceId}</p>
                        {config.config.datasheetId && (
                          <p>数据表ID: {config.config.datasheetId}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">使用次数: {config.usageCount}</span>
                      {config.lastUsed && (
                        <span className="text-xs text-gray-500">
                          最后使用: {new Date(config.lastUsed).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => testOutputConfig(config.id)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <TestTube className="h-3 w-3 mr-1" />
                      测试
                    </button>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(config)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(config.id)}
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