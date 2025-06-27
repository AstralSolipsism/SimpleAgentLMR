const API_BASE_URL = '/api/v1'; // 使用相对路径以适应代理

async function request(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const config = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, message: data.message || `HTTP error! status: ${response.status}` };
    }
    
    if (typeof data.success === 'boolean') {
        return data;
    } else {
        return { success: true, data };
    }

  } catch (error) {
    console.error('API request error:', error);
    return { success: false, message: '网络请求失败或服务器无响应' };
  }
}

export const api = {
  get: (endpoint: string) => request(endpoint),
  post: (endpoint: string, body: any) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint: string, body: any) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint: string) => request(endpoint, { method: 'DELETE' }),
};