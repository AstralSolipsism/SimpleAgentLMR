import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface TableContent {
  items: any[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const DbViewer: React.FC = () => {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableContent, setTableContent] = useState<TableContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // 获取所有表名
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoading(true);
        const response = await api.get('/db-viewer/tables');
        if (response.success) {
          setTables(response.data);
        } else {
          setError(response.message || '获取数据表列表失败');
        }
      } catch (err) {
        setError('网络错误或服务器无响应');
      } finally {
        setLoading(false);
      }
    };
    fetchTables();
  }, []);

  // 获取选定表的内容
  useEffect(() => {
    if (!selectedTable) return;

    const fetchTableContent = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get(`/db-viewer/tables/${selectedTable}?page=${currentPage}&pageSize=15`);
        if (response.success) {
          setTableContent(response.data);
        } else {
          setError(response.message || `获取表 ${selectedTable} 内容失败`);
          setTableContent(null);
        }
      } catch (err) {
        setError('网络错误或服务器无响应');
        setTableContent(null);
      } finally {
        setLoading(false);
      }
    };
    fetchTableContent();
  }, [selectedTable, currentPage]);

  const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName);
    setCurrentPage(1); // 切换表时重置到第一页
  };

  const renderTable = () => {
    if (!tableContent || tableContent.items.length === 0) {
      return <p className="text-gray-500 mt-4">没有数据或未选择数据表。</p>;
    }

    const headers = Object.keys(tableContent.items[0]);

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 mt-4">
          <thead className="bg-gray-50">
            <tr>
              {headers.map(header => (
                <th key={header} className="px-4 py-2 border-b text-left text-sm font-semibold text-gray-600">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableContent.items.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {headers.map(header => (
                  <td key={`${rowIndex}-${header}`} className="px-4 py-2 border-b text-sm text-gray-700 whitespace-nowrap">
                    {typeof row[header] === 'object' && row[header] !== null ? JSON.stringify(row[header]) : String(row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPagination = () => {
    if (!tableContent || tableContent.pagination.totalPages <= 1) {
      return null;
    }

    const { page, totalPages } = tableContent.pagination;

    return (
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={() => setCurrentPage(p => p - 1)}
          disabled={page === 1}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
        >
          上一页
        </button>
        <span className="text-sm text-gray-600">
          第 {page} 页 / 共 {totalPages} 页
        </span>
        <button
          onClick={() => setCurrentPage(p => p + 1)}
          disabled={page === totalPages}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">数据库速览</h1>
      <div className="flex flex-wrap gap-2">
        {tables.map(table => (
          <button
            key={table}
            onClick={() => handleTableSelect(table)}
            className={`px-3 py-1 text-sm font-medium rounded-full ${
              selectedTable === table
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {table}
          </button>
        ))}
      </div>

      {loading && <p className="text-blue-500 mt-4">加载中...</p>}
      {error && <p className="text-red-500 mt-4">错误: {error}</p>}
      
      <div className="mt-6">
        <h2 className="text-xl font-semibold">{selectedTable || '请选择一个数据表'}</h2>
        {renderTable()}
        {renderPagination()}
      </div>
    </div>
  );
};

export default DbViewer;