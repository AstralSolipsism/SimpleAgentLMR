import { clsx, ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 定义步骤接口以提供类型安全
interface ParsedAction {
  type: string;
  tool_name?: string;
  tool_input?: any;
  targetAgent?: string;
  thought?: string;
}

interface Step {
  id: number;
  response?: {
    thought?: string;
  };
  parsed_actions?: ParsedAction[];
  action_results?: any;
  result?: any;
}

export function generateStepSummary(step: Step, isLastStep?: boolean, overallStatus?: string): string {
  if (isLastStep) {
    if (overallStatus === 'completed') return '任务完成';
    if (overallStatus === 'failed') return '任务失败';
  }
  // 1. 检查 parsed_actions 以确定是工具调用还是委托
  if (step.parsed_actions && step.parsed_actions.length > 0) {
    const action = step.parsed_actions[0];
    if (action.type === 'tool_call' && action.tool_name) {
      return `正在调用工具: ${action.tool_name}`;
    }
    if (action.type === 'delegate' && action.targetAgent) {
      return `已委托子任务: ${action.targetAgent}`;
    }
    // 有些 thought 也可能被包裹在 parsed_actions 中
    if (action.thought) {
        return `正在思考...`;
    }
  }

  // 2. 检查 action_results，表示收到了工具的响应
  if (step.action_results) {
    // 检查 action_results 是否为非空数组或有意义的对象
    if (Array.isArray(step.action_results) && step.action_results.length > 0) {
        return `收到工具响应`;
    }
    if (typeof step.action_results === 'object' && step.action_results !== null && Object.keys(step.action_results).length > 0) {
        return `收到工具响应`;
    }
  }

  // 3. 检查独立的 thought
  if (step.response?.thought) {
    return `正在思考...`;
  }

  // 4. 检查最终结果
  if (step.result) {
    return `任务完成`;
  }

  // 5. 默认回退状态
  return '正在处理...';
}
