import { useEffect, useState, useRef } from 'react';
import { RefreshCw, ZoomIn, ZoomOut, Download, Filter } from 'lucide-react';

interface NetworkNode {
  id: string;
  label: string;
  type: 'input' | 'agent' | 'output' | 'application';
  x: number;
  y: number;
  status: 'active' | 'inactive' | 'error';
  metadata: Record<string, any>;
}

interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: 'data' | 'task' | 'output';
  weight: number;
  metadata: Record<string, any>;
}

interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export function Visualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [networkData, setNetworkData] = useState<NetworkData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    showInputs: true,
    showAgents: true,
    showOutputs: true,
    showApplications: true,
    showInactive: true
  });

  useEffect(() => {
    fetchNetworkData();
  }, []);

  useEffect(() => {
    if (networkData.nodes.length > 0) {
      drawNetwork();
    }
  }, [networkData, zoom, offset, filters]);

  const fetchNetworkData = async () => {
    try {
      const response = await fetch('/api/v1/visualization/network');
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        const formattedData = {
          nodes: apiResponse.data.nodes || [],
          edges: apiResponse.data.links || [] // 将 'links' 映射到 'edges'
        };
        setNetworkData(formattedData);
      }
    } catch (error) {
      console.error('Failed to fetch network data:', error);
    } finally {
      setLoading(false);
    }
  };

  const drawNetwork = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply transformations
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Filter nodes and edges
    const visibleNodes = networkData.nodes.filter(node => {
      if (!filters.showInactive && node.status !== 'active') return false;
      switch (node.type) {
        case 'input': return filters.showInputs;
        case 'agent': return filters.showAgents;
        case 'output': return filters.showOutputs;
        case 'application': return filters.showApplications;
        default: return true;
      }
    });

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = networkData.edges.filter(edge => 
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    // Draw edges
    visibleEdges.forEach(edge => {
      const sourceNode = visibleNodes.find(n => n.id === edge.source);
      const targetNode = visibleNodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        
        // Set edge style based on type
        switch (edge.type) {
          case 'data':
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 2;
            break;
          case 'task':
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 3;
            break;
          case 'output':
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 2;
            break;
          default:
            ctx.strokeStyle = '#6B7280';
            ctx.lineWidth = 1;
        }
        
        // Adjust opacity based on weight
        ctx.globalAlpha = Math.max(0.3, edge.weight / 10);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Draw arrow
        const angle = Math.atan2(targetNode.y - sourceNode.y, targetNode.x - sourceNode.x);
        const arrowLength = 10;
        const arrowX = targetNode.x - Math.cos(angle) * 20; // Offset from node center
        const arrowY = targetNode.y - Math.sin(angle) * 20;
        
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    });

    // Draw nodes
    visibleNodes.forEach(node => {
      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, 20, 0, 2 * Math.PI);
      
      // Set node style based on type and status
      let fillColor = '#F3F4F6';
      let strokeColor = '#6B7280';
      
      switch (node.type) {
        case 'input':
          fillColor = node.status === 'active' ? '#DBEAFE' : '#F3F4F6';
          strokeColor = node.status === 'active' ? '#3B82F6' : '#9CA3AF';
          break;
        case 'agent':
          fillColor = node.status === 'active' ? '#D1FAE5' : 
                     node.status === 'error' ? '#FEE2E2' : '#F3F4F6';
          strokeColor = node.status === 'active' ? '#10B981' : 
                       node.status === 'error' ? '#EF4444' : '#9CA3AF';
          break;
        case 'output':
          fillColor = node.status === 'active' ? '#FEF3C7' : '#F3F4F6';
          strokeColor = node.status === 'active' ? '#F59E0B' : '#9CA3AF';
          break;
        case 'application':
          fillColor = node.status === 'active' ? '#E0E7FF' : '#F3F4F6';
          strokeColor = node.status === 'active' ? '#6366F1' : '#9CA3AF';
          break;
      }
      
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = selectedNode?.id === node.id ? 3 : 2;
      ctx.stroke();

      // Node icon (simplified)
      ctx.fillStyle = strokeColor;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let icon = '';
      switch (node.type) {
        case 'input': icon = '📥'; break;
        case 'agent': icon = '🤖'; break;
        case 'output': icon = '📤'; break;
        case 'application': icon = '📱'; break;
      }
      ctx.fillText(icon, node.x, node.y);

      // Node label
      ctx.fillStyle = '#374151';
      ctx.font = '10px sans-serif';
      ctx.fillText(node.label, node.x, node.y + 35);
    });

    ctx.restore();
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - offset.x) / zoom;
    const y = (event.clientY - rect.top - offset.y) / zoom;

    // Find clicked node
    const clickedNode = networkData.nodes.find(node => {
      const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
      return distance <= 20;
    });

    setSelectedNode(clickedNode || null);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({
      x: event.clientX - offset.x,
      y: event.clientY - offset.y
    });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    setOffset({
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.3));
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'agent-network.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'input': return '输入源';
      case 'agent': return '智能体';
      case 'output': return '输出配置';
      case 'application': return '应用';
      default: return type;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '运行中';
      case 'error': return '错误';
      case 'inactive': return '停用';
      default: return status;
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">网络可视化</h1>
          <p className="mt-1 text-sm text-gray-600">
            智能体网络拓扑和任务流向可视化
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-2" />
            过滤器
          </button>
          <button
            onClick={fetchNetworkData}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </button>
          <button
            onClick={exportImage}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            导出
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-900 mb-3">显示选项</h3>
          <div className="grid grid-cols-3 gap-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.showInputs}
                onChange={(e) => setFilters({ ...filters, showInputs: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">输入源</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.showAgents}
                onChange={(e) => setFilters({ ...filters, showAgents: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">智能体</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.showOutputs}
                onChange={(e) => setFilters({ ...filters, showOutputs: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">输出配置</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.showApplications}
                onChange={(e) => setFilters({ ...filters, showApplications: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">应用分组</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.showInactive}
                onChange={(e) => setFilters({ ...filters, showInactive: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">非活跃节点</span>
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main visualization area */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">网络拓扑图</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleZoomOut}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="text-sm text-gray-500">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={handleZoomIn}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                  >
                    重置
                  </button>
                </div>
              </div>
            </div>
            <div className="relative">
              {loading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-gray-500">加载中...</div>
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={600}
                  className="border-0 cursor-grab"
                  onClick={handleCanvasClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Node details panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">节点详情</h3>
            </div>
            <div className="p-4">
              {selectedNode ? (
                <div className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">名称</dt>
                    <dd className="text-sm text-gray-900">{selectedNode.label}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">类型</dt>
                    <dd className="text-sm text-gray-900">{getTypeText(selectedNode.type)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">状态</dt>
                    <dd className={`text-sm font-medium ${getStatusColorClass(selectedNode.status)}`}>
                      {getStatusText(selectedNode.status)}
                    </dd>
                  </div>
                  {Object.entries(selectedNode.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-sm font-medium text-gray-500">{key}</dt>
                      <dd className="text-sm text-gray-900">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </dd>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  点击节点查看详细信息
                </div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-white rounded-lg shadow mt-6">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">图例</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-100 border-2 border-blue-600 rounded-full"></div>
                <span className="text-sm text-gray-700">输入源</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-100 border-2 border-green-600 rounded-full"></div>
                <span className="text-sm text-gray-700">智能体</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-600 rounded-full"></div>
                <span className="text-sm text-gray-700">输出配置</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-indigo-100 border-2 border-indigo-600 rounded-full"></div>
                <span className="text-sm text-gray-700">应用分组</span>
              </div>
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-0.5 bg-blue-600"></div>
                  <span className="text-sm text-gray-700">数据流</span>
                </div>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 bg-green-600" style={{ height: '3px' }}></div>
                  <span className="text-sm text-gray-700">任务流</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-0.5 bg-yellow-600"></div>
                  <span className="text-sm text-gray-700">输出流</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}