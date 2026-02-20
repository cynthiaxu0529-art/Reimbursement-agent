/**
 * Dynamic Skill to LLM Tool Converter
 *
 * This module converts Skill definitions to LLM-compatible tool definitions.
 * It allows the AI assistant to dynamically discover and use available skills.
 */

import { Tool } from './openrouter-client';

/**
 * Skill definition from the API
 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  isBuiltIn?: boolean;
  triggers?: string[];
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  outputSchema?: any;
}

/**
 * Convert a Skill's inputSchema to LLM tool parameters
 */
function convertInputSchemaToToolParameters(
  inputSchema?: SkillDefinition['inputSchema']
): any {
  if (!inputSchema || !inputSchema.properties) {
    // Default parameters for skills without explicit input schema
    return {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['personal', 'team', 'company'],
          description: '分析范围',
          default: 'company',
        },
      },
    };
  }

  // Convert skill input schema to tool parameters format
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, prop] of Object.entries(inputSchema.properties)) {
    properties[key] = {
      type: prop.type || 'string',
      description: prop.description || key,
    };

    if (prop.enum) {
      properties[key].enum = prop.enum;
    }
    if (prop.default !== undefined) {
      properties[key].default = prop.default;
    }
    if (prop.required) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Convert a Skill definition to an LLM Tool
 */
export function skillToTool(skill: SkillDefinition): Tool {
  // Generate a tool-friendly name from skill ID
  const toolName = skill.id.startsWith('builtin_')
    ? skill.id.replace('builtin_', '')
    : skill.id;

  // Build description with usage hints
  let description = skill.description;

  // Add category hint
  if (skill.category) {
    const categoryHints: Record<string, string> = {
      validation: '用于数据验证和检测',
      notification: '用于预警和通知',
      report: '用于报告和分析',
      calculation: '用于计算和处理',
      ai_enhancement: 'AI 增强功能',
      analysis: '用于综合分析',
    };
    if (categoryHints[skill.category]) {
      description += `\n\n类型: ${categoryHints[skill.category]}`;
    }
  }

  return {
    type: 'function',
    function: {
      name: `skill_${toolName}`,
      description,
      parameters: convertInputSchemaToToolParameters(skill.inputSchema),
    },
  };
}

/**
 * Convert multiple Skills to LLM Tools
 */
export function skillsToTools(skills: SkillDefinition[]): Tool[] {
  // Filter to skills that support chat command trigger
  const chatSkills = skills.filter(skill => {
    if (!skill.triggers || skill.triggers.length === 0) return true;
    return skill.triggers.some(
      t => t === 'on_chat_command' || t.includes('chat')
    );
  });

  return chatSkills.map(skillToTool);
}

/**
 * Execute a skill via the API
 */
export async function executeSkill(
  skillId: string,
  params: any,
  context: { userId: string; tenantId: string; baseUrl?: string }
): Promise<any> {
  const baseUrl = context.baseUrl || '';

  const response = await fetch(`${baseUrl}/api/skills/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      skillId,
      params,
      context: {
        userId: context.userId,
        tenantId: context.tenantId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Skill execution failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch available skills from the API
 */
export async function fetchAvailableSkills(
  baseUrl: string = ''
): Promise<SkillDefinition[]> {
  try {
    const response = await fetch(`${baseUrl}/api/skills/execute`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[Skill Tools] Failed to fetch skills:', response.status);
      return [];
    }

    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('[Skill Tools] Error fetching skills:', error);
    return [];
  }
}

/**
 * Generate dynamic tools from available skills
 */
export async function generateDynamicTools(
  baseUrl: string = ''
): Promise<Tool[]> {
  const skills = await fetchAvailableSkills(baseUrl);

  if (skills.length === 0) {
    console.warn('[Skill Tools] No skills available');
    return [];
  }

  console.log(`[Skill Tools] Converting ${skills.length} skills to tools`);
  return skillsToTools(skills);
}

/**
 * Map of skill tool names to their original skill IDs
 */
export function getSkillIdFromToolName(toolName: string): string | null {
  if (!toolName.startsWith('skill_')) {
    return null;
  }

  const shortName = toolName.replace('skill_', '');

  // Check if it's a built-in skill
  const builtInSkills = [
    'budget_alert',
    'anomaly_detector',
    'timeliness_analysis',
    'mileage_calculator',
    'duplicate_detector',
    'smart_categorizer',
    'invoice_learner',
  ];

  if (builtInSkills.includes(shortName)) {
    return `builtin_${shortName}`;
  }

  // For composite skills
  if (shortName === 'all_tech_analysis' || shortName === 'all_analysis') {
    return shortName;
  }

  // For custom skills, return as-is
  return shortName;
}

/**
 * Check if a tool name is a skill tool
 */
export function isSkillTool(toolName: string): boolean {
  return toolName.startsWith('skill_');
}

export default {
  skillToTool,
  skillsToTools,
  executeSkill,
  fetchAvailableSkills,
  generateDynamicTools,
  getSkillIdFromToolName,
  isSkillTool,
};
