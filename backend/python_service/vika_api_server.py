#!/usr/bin/env python3
"""
维格表API微服务
使用FastAPI创建一个独立的Python服务，提供RESTful API接口
解决子进程调用的性能问题
"""

import asyncio
import json
import os
import time
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from astral_vika import Vika
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="维格表API服务",
    description="为SimpleA2A系统提供维格表操作的微服务",
    version="1.0.0"
)

# 添加CORS支持
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量
vika_client: Optional[Vika] = None
config: Dict[str, Any] = {}
cache: Dict[str, Dict[str, Any]] = {}
rate_limiter: Dict[str, List[float]] = {}

# Pydantic模型
class VikaConfig(BaseModel):
    user_token: str
    api_base: str = "https://api.vika.cn/fusion/v1"
    rate_limit_qps: int = 2

class RecordData(BaseModel):
    fields: Dict[str, Any]

class RecordCreate(BaseModel):
    datasheet_id: str
    records: List[RecordData]

class RecordUpdate(BaseModel):
    datasheet_id: str
    record_id: str
    fields: Dict[str, Any]

class RecordQuery(BaseModel):
    datasheet_id: str
    view_id: Optional[str] = None
    page_size: Optional[int] = 100
    page_token: Optional[str] = None
    filter_formula: Optional[str] = None

class BatchOperation(BaseModel):
    operations: List[Dict[str, Any]]

# 依赖注入
async def get_vika_client() -> Vika:
    """获取维格表客户端实例"""
    global vika_client
    if vika_client is None:
        raise HTTPException(status_code=500, detail="维格表客户端未初始化")
    return vika_client

async def rate_limit_check(operation: str = "default"):
    """QPS限制检查"""
    global rate_limiter, config
    
    current_time = time.time()
    qps_limit = config.get('rate_limit_qps', 2)
    
    if operation not in rate_limiter:
        rate_limiter[operation] = []
    
    # 清理1秒前的记录
    rate_limiter[operation] = [
        t for t in rate_limiter[operation] 
        if current_time - t < 1.0
    ]
    
    # 检查是否超过QPS限制
    if len(rate_limiter[operation]) >= qps_limit:
        raise HTTPException(
            status_code=429, 
            detail=f"请求频率超限，当前限制: {qps_limit} QPS"
        )
    
    # 记录当前请求时间
    rate_limiter[operation].append(current_time)

def get_cache_key(operation: str, **kwargs) -> str:
    """生成缓存键"""
    key_parts = [operation]
    for k, v in sorted(kwargs.items()):
        key_parts.append(f"{k}={v}")
    return ":".join(key_parts)

def get_from_cache(key: str, max_age: int = 3600) -> Optional[Any]:
    """从缓存获取数据"""
    if key in cache:
        entry = cache[key]
        if time.time() - entry['timestamp'] < max_age:
            return entry['data']
        else:
            del cache[key]
    return None

def set_cache(key: str, data: Any):
    """设置缓存"""
    cache[key] = {
        'data': data,
        'timestamp': time.time()
    }

def clear_cache_pattern(pattern: str):
    """根据模式清除缓存"""
    keys_to_delete = [key for key in cache.keys() if pattern in key]
    for key in keys_to_delete:
        del cache[key]
    logger.info(f"清除缓存: {len(keys_to_delete)} 条记录, 模式: {pattern}")

# API端点

@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "cache_size": len(cache),
        "config_loaded": bool(config)
    }

@app.post("/config")
async def set_config(vika_config: VikaConfig):
    """设置维格表配置"""
    global vika_client, config
    
    try:
        config.update(vika_config.dict())
        
        # 创建维格表客户端实例
        vika_client = Vika(
            token=vika_config.user_token,
            api_base=vika_config.api_base
        )
        
        logger.info("维格表客户端配置成功")
        return {"success": True, "message": "配置成功"}
        
    except Exception as e:
        logger.error(f"配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"配置失败: {str(e)}")

@app.get("/config")
async def get_config():
    """获取当前配置"""
    return {
        "success": True,
        "data": {
            "api_base": config.get("api_base"),
            "rate_limit_qps": config.get("rate_limit_qps"),
            "client_initialized": vika_client is not None
        }
    }

@app.post("/records")
async def create_records(
    request: RecordCreate,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """创建记录"""
    try:
        datasheet = vika.datasheet(request.datasheet_id)
        
        # 准备记录数据
        records_data = [record.fields for record in request.records]
        
        # --- 诊断代码开始 ---
        logger.info(f"--- 运行时 dir(datasheet.records) ---: {dir(datasheet.records)}")
        # --- 诊断代码结束 ---

        # 调用astral_vika的正确API
        result = await datasheet.records.acreate(records=records_data)
        
        # 清除相关缓存
        clear_cache_pattern(f"records:{request.datasheet_id}")
        
        logger.info(f"创建记录成功: {request.datasheet_id}, 数量: {len(records_data)}")
        
        return {
            "success": True,
            "data": [r.to_dict() for r in result]
        }
        
    except Exception as e:
        logger.error(f"创建记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建记录失败: {str(e)}")

@app.get("/records/{datasheet_id}")
async def get_records(
    datasheet_id: str,
    view_id: Optional[str] = None,
    page_size: Optional[int] = 100,
    page_token: Optional[str] = None,
    filter_formula: Optional[str] = None,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取记录列表"""
    try:
        # 生成缓存键
        cache_key = get_cache_key(
            "records",
            datasheet_id=datasheet_id,
            view_id=view_id,
            page_size=page_size,
            page_token=page_token,
            filter_formula=filter_formula
        )
        
        # 检查缓存
        cached_result = get_from_cache(cache_key, max_age=300)  # 5分钟缓存
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        datasheet = vika.datasheet(datasheet_id)
        
        # 构建查询参数
        query_params = {}
        if view_id:
            query_params['view_id'] = view_id
        if page_size:
            query_params['page_size'] = page_size
        if page_token:
            query_params['page_token'] = page_token
        if filter_formula:
            query_params['filter_by_formula'] = filter_formula
        
        # 调用astral_vika的正确API
        records = await datasheet.records.all().filter(**query_params).aall()
        result = [record.to_dict() for record in records]
        
        # 设置缓存
        set_cache(cache_key, result)
        
        logger.info(f"获取记录成功: {datasheet_id}")
        
        return {
            "success": True,
            "data": result,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取记录失败: {str(e)}")

@app.get("/records/{datasheet_id}/{record_id}")
async def get_record(
    datasheet_id: str,
    record_id: str,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取单个记录"""
    try:
        # 检查缓存
        cache_key = get_cache_key("record", datasheet_id=datasheet_id, record_id=record_id)
        cached_result = get_from_cache(cache_key, max_age=300)
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        datasheet = vika.datasheet(datasheet_id)
        result = await datasheet.records.aget(record_id)
        
        # 设置缓存
        result_dict = result.to_dict()
        set_cache(cache_key, result_dict)
        
        return {
            "success": True,
            "data": result_dict,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取记录失败: {str(e)}")

@app.put("/records")
async def update_record(
    request: RecordUpdate,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """更新记录"""
    try:
        datasheet = vika.datasheet(request.datasheet_id)
        
        # 调用astral_vika的正确API
        result = await datasheet.records.aupdate(
            records=[{
                "record_id": request.record_id,
                "fields": request.fields
            }]
        )
        
        # 清除相关缓存
        clear_cache_pattern(f"record:{request.datasheet_id}:{request.record_id}")
        clear_cache_pattern(f"records:{request.datasheet_id}")
        
        logger.info(f"更新记录成功: {request.datasheet_id}/{request.record_id}")
        
        return {
            "success": True,
            "data": [r.to_dict() for r in result]
        }
        
    except Exception as e:
        logger.error(f"更新记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新记录失败: {str(e)}")

@app.delete("/records/{datasheet_id}/{record_id}")
async def delete_record(
    datasheet_id: str,
    record_id: str,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """删除记录"""
    try:
        datasheet = vika.datasheet(datasheet_id)
        
        # 调用astral_vika的正确API
        result = await datasheet.records.adelete(records=[record_id])
        
        # 清除相关缓存
        clear_cache_pattern(f"record:{datasheet_id}:{record_id}")
        clear_cache_pattern(f"records:{datasheet_id}")
        
        logger.info(f"删除记录成功: {datasheet_id}/{record_id}")
        
        return {
            "success": True,
            "data": result
        }
        
    except Exception as e:
        logger.error(f"删除记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除记录失败: {str(e)}")

@app.get("/spaces/{space_id}")
async def get_space_info(
    space_id: str,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取空间站信息"""
    try:
        cache_key = get_cache_key("space", space_id=space_id)
        cached_result = get_from_cache(cache_key, max_age=3600)  # 1小时缓存
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        # 调用astral_vika的正确API
        space = vika.space(space_id)
        result = await space.aget_space_info()
        
        set_cache(cache_key, result)
        
        return {
            "success": True,
            "data": result,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取空间站信息失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取空间站信息失败: {str(e)}")

@app.get("/spaces")
async def get_spaces(
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取空间站列表"""
    try:
        cache_key = get_cache_key("spaces")
        cached_result = get_from_cache(cache_key, max_age=3600)
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        # 调用astral_vika的正确API
        result = await vika.spaces.alist()
        
        set_cache(cache_key, result)
        
        return {
            "success": True,
            "data": result,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取空间站列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取空间站列表失败: {str(e)}")

async def _fetch_children_recursively(space, nodes: List[Any]) -> List[Dict[str, Any]]:
    """
    递归获取子节点并构建字典树。
    :param space: Vika space对象
    :param nodes: Node对象列表
    :return: 节点字典列表，包含嵌套的子节点
    """
    result_list = []
    for node in nodes:
        node_dict = {
            "id": node.id,
            "name": node.name,
            "type": node.type,
            "icon": node.icon,
            "children": []  # 预先添加children键，确保结构一致性
        }
        logger.info(f"Processing node: {node.id}, type: {node.type}")

        if node.type == 'Folder':
            qps_limit = config.get('rate_limit_qps', 2)
            if qps_limit > 0:
                delay = 1.0 / qps_limit
                await asyncio.sleep(delay)
            
            logger.info(f"Node {node.id} is a folder. Fetching details...")
            folder_details = await space.nodes.aget(node.id)
            logger.info(f"Found {len(folder_details.children)} children for folder {node.id}.")

            if hasattr(folder_details, 'children') and folder_details.children:
                # 递归调用，获取子节点的字典列表
                children_dicts = await _fetch_children_recursively(space, folder_details.children)
                node_dict['children'] = children_dicts
        
        result_list.append(node_dict)
        
    return result_list

@app.get("/spaces/{space_id}/datasheets")
async def get_datasheets(
    space_id: str,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取空间站中的数据表列表（支持文件夹递归）"""
    try:
        logger.info("Entering get_datasheets function.")
        # 使用正确的缓存键
        cache_key = get_cache_key("full_nodes_tree", space_id=space_id)
        cached_result = get_from_cache(cache_key, max_age=3600)
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        space = vika.space(space_id)
        # 1. 获取顶层节点
        top_level_nodes = await space.nodes.aall()
        logger.info(f"Found {len(top_level_nodes)} top-level nodes.")
        
        # 2. 使用新的、正确的递归函数来填充整个节点树
        logger.info("Starting recursive fetch of children.")
        result_data = await _fetch_children_recursively(space, top_level_nodes)
        
        # 3. 序列化并缓存结果
        # _fetch_children_recursively 现在直接返回字典列表
        set_cache(cache_key, result_data)
        
        logger.info(f"Returning full tree with {len(result_data)} root nodes.")
        return {
            "success": True,
            "data": result_data,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取数据表列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取数据表列表失败: {str(e)}")

@app.get("/datasheets/{datasheet_id}/views")
async def get_views(
    datasheet_id: str,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取数据表的视图列表"""
    try:
        cache_key = get_cache_key("views", datasheet_id=datasheet_id)
        cached_result = get_from_cache(cache_key, max_age=3600)
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        datasheet = vika.datasheet(datasheet_id)
        result = await datasheet.views.aall()
        
        set_cache(cache_key, result)
        
        return {
            "success": True,
            "data": result,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取视图列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取视图列表失败: {str(e)}")

@app.get("/datasheets/{datasheet_id}/fields")
async def get_fields(
    datasheet_id: str,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取数据表的字段列表"""
    try:
        cache_key = get_cache_key("fields", datasheet_id=datasheet_id)
        cached_result = get_from_cache(cache_key, max_age=3600)
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        datasheet = vika.datasheet(datasheet_id)
        result = await datasheet.fields.aall()
        
        set_cache(cache_key, result)
        
        return {
            "success": True,
            "data": result,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取字段列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取字段列表失败: {str(e)}")

@app.get("/spaces/{space_id}/configuration")
async def get_space_configuration(
    space_id: str,
    background_tasks: BackgroundTasks,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """获取空间站完整配置（解决N+1查询问题）"""
    try:
        cache_key = get_cache_key("space_config", space_id=space_id)
        cached_result = get_from_cache(cache_key, max_age=1800)  # 30分钟缓存
        if cached_result is not None:
            return {"success": True, "data": cached_result, "from_cache": True}
        
        # 并行获取空间站信息和数据表列表
        space = vika.space(space_id)
        space_info_task = space.aget_space_info()
        datasheets_task = space.datasheets.alist()
        
        space_info, datasheets_list = await asyncio.gather(
            space_info_task,
            datasheets_task
        )
        
        # 为每个数据表并行获取详细信息
        datasheet_tasks = []
        for ds in datasheets_list:
            datasheet = vika.datasheet(ds['id'])
            views_task = datasheet.views.aall()
            fields_task = datasheet.fields.aall()
            datasheet_tasks.append((ds, views_task, fields_task))
        
        # 等待所有任务完成
        datasheet_details = []
        for ds, views_task, fields_task in datasheet_tasks:
            try:
                views, fields = await asyncio.gather(views_task, fields_task)
                datasheet_details.append({
                    **ds,
                    'views': views.get('views', []),
                    'fields': fields.get('fields', [])
                })
            except Exception as e:
                logger.warning(f"获取数据表详情失败 {ds['id']}: {e}")
                datasheet_details.append({
                    **ds,
                    'views': [],
                    'fields': []
                })
        
        result = {
            'space': space_info,
            'datasheets': datasheet_details
        }
        
        # 设置缓存
        set_cache(cache_key, result)
        
        logger.info(f"获取空间站配置成功: {space_id}, 数据表数量: {len(datasheet_details)}")
        
        return {
            "success": True,
            "data": result,
            "from_cache": False
        }
        
    except Exception as e:
        logger.error(f"获取空间站配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取空间站配置失败: {str(e)}")

@app.post("/batch")
async def batch_operations(
    request: BatchOperation,
    vika: Vika = Depends(get_vika_client),
    _: None = Depends(rate_limit_check)
):
    """批量操作"""
    try:
        results = []
        
        for operation in request.operations:
            op_type = operation.get('type')
            op_data = operation.get('data', {})
            
            try:
                if op_type == 'create_record':
                    datasheet = vika.datasheet(op_data['datasheet_id'])
                    result = await datasheet.records.acreate(records=op_data['records'])
                    results.append({'success': True, 'data': [r.to_dict() for r in result]})
                    
                elif op_type == 'update_record':
                    datasheet = vika.datasheet(op_data['datasheet_id'])
                    result = await datasheet.records.aupdate(records=op_data['records'])
                    results.append({'success': True, 'data': [r.to_dict() for r in result]})
                    
                elif op_type == 'delete_record':
                    datasheet = vika.datasheet(op_data['datasheet_id'])
                    result = await datasheet.records.adelete(records=op_data['record_ids'])
                    results.append({'success': True, 'data': result})
                    
                else:
                    results.append({'success': False, 'error': f'不支持的操作类型: {op_type}'})
                    
            except Exception as e:
                results.append({'success': False, 'error': str(e)})
        
        # 清除所有相关缓存
        cache.clear()
        
        return {
            "success": True,
            "data": results
        }
        
    except Exception as e:
        logger.error(f"批量操作失败: {e}")
        raise HTTPException(status_code=500, detail=f"批量操作失败: {str(e)}")

@app.delete("/cache")
async def clear_cache(pattern: Optional[str] = None):
    """清除缓存"""
    try:
        if pattern:
            clear_cache_pattern(pattern)
            return {"success": True, "message": f"已清除匹配模式 '{pattern}' 的缓存"}
        else:
            cache.clear()
            return {"success": True, "message": "已清除所有缓存"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除缓存失败: {str(e)}")

@app.get("/cache/stats")
async def cache_stats():
    """缓存统计"""
    total_size = len(cache)
    size_by_type = {}
    
    for key in cache.keys():
        cache_type = key.split(':')[0]
        size_by_type[cache_type] = size_by_type.get(cache_type, 0) + 1
    
    return {
        "success": True,
        "data": {
            "total_size": total_size,
            "size_by_type": size_by_type,
            "rate_limiter_stats": {k: len(v) for k, v in rate_limiter.items()}
        }
    }

if __name__ == "__main__":
    # 从环境变量或配置文件读取设置
    port = int(os.environ.get("VIKA_SERVICE_PORT", 5001))
    host = os.environ.get("VIKA_SERVICE_HOST", "127.0.0.1")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        reload=False
    )