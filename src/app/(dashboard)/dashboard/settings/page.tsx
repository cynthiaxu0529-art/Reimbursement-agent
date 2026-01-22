'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const tabs = [
  { id: 'general', label: '基本设置' },
  { id: 'policies', label: '报销政策' },
  { id: 'skills', label: 'Skills 插件' },
  { id: 'integrations', label: '集成' },
  { id: 'team', label: '团队' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">设置</h2>
        <p className="text-gray-600">管理报销系统的配置和集成</p>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>公司信息</CardTitle>
              <CardDescription>设置公司的基本信息</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">公司名称</label>
                <Input defaultValue="我的公司" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">记账本位币</label>
                <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="CNY">人民币 (CNY)</option>
                  <option value="USD">美元 (USD)</option>
                  <option value="EUR">欧元 (EUR)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">财年开始月份</label>
                <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="1">1月</option>
                  <option value="4">4月</option>
                  <option value="7">7月</option>
                </select>
              </div>
              <Button>保存更改</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>审批流程</CardTitle>
              <CardDescription>配置报销审批的流程和规则</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">自动审批</p>
                  <p className="text-sm text-gray-500">金额低于阈值的报销自动批准</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" className="w-24" defaultValue="100" />
                  <span className="text-sm text-gray-500">元以下</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">多级审批</p>
                  <p className="text-sm text-gray-500">超过金额需要更高级别审批</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Policies */}
      {activeTab === 'policies' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>报销政策</CardTitle>
                <CardDescription>定义费用限额和审批规则</CardDescription>
              </div>
              <Button>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                新建政策
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { name: '差旅费报销政策', rules: 9, status: 'active' },
                { name: '技术费用报销政策', rules: 3, status: 'active' },
                { name: '业务费用报销政策', rules: 3, status: 'active' },
              ].map((policy) => (
                <div
                  key={policy.name}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{policy.name}</p>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                        启用中
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{policy.rules} 条规则</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">编辑</Button>
                    <Button variant="ghost" size="sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 mb-1">通过对话创建政策</h4>
                  <p className="text-sm text-blue-700 mb-3">
                    试试说："创建一个差旅政策，机票最高2000元，一线城市酒店800元/晚"
                  </p>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                    开始对话
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Skills */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Skills 插件</CardTitle>
                <CardDescription>扩展报销系统的能力</CardDescription>
              </div>
              <Button>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                创建 Skill
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  name: '里程补贴计算',
                  description: '根据行驶里程自动计算补贴金额',
                  category: 'calculation',
                  isBuiltIn: true,
                  isActive: true,
                },
                {
                  name: '重复报销检测',
                  description: '检测是否存在重复的报销项目',
                  category: 'validation',
                  isBuiltIn: true,
                  isActive: true,
                },
                {
                  name: '智能费用分类',
                  description: '使用 AI 自动识别费用类别',
                  category: 'ai_enhancement',
                  isBuiltIn: true,
                  isActive: true,
                },
                {
                  name: 'ERP 同步',
                  description: '将报销数据同步到 ERP 系统',
                  category: 'integration',
                  isBuiltIn: false,
                  isActive: false,
                },
              ].map((skill) => (
                <div
                  key={skill.name}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{skill.name}</p>
                        {skill.isBuiltIn && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                            内置
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{skill.description}</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      defaultChecked={skill.isActive}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Integrations */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>已集成服务</CardTitle>
              <CardDescription>管理第三方服务的连接</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  name: 'FluxPay',
                  description: '自动打款服务',
                  status: 'connected',
                  icon: '💳',
                },
                {
                  name: 'Gmail',
                  description: '邮件收集和票据提取',
                  status: 'connected',
                  icon: '📧',
                },
                {
                  name: 'Google Calendar',
                  description: '日历行程同步',
                  status: 'disconnected',
                  icon: '📅',
                },
                {
                  name: 'Slack',
                  description: '通知和提醒',
                  status: 'disconnected',
                  icon: '💬',
                },
              ].map((integration) => (
                <div
                  key={integration.name}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xl">
                      {integration.icon}
                    </div>
                    <div>
                      <p className="font-medium">{integration.name}</p>
                      <p className="text-sm text-gray-500">{integration.description}</p>
                    </div>
                  </div>
                  <Button
                    variant={integration.status === 'connected' ? 'outline' : 'default'}
                    size="sm"
                  >
                    {integration.status === 'connected' ? '已连接' : '连接'}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>团队成员</CardTitle>
                <CardDescription>管理团队成员和权限</CardDescription>
              </div>
              <Button>邀请成员</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: '张三', email: 'zhangsan@example.com', role: 'admin', department: '技术部' },
                  { name: '李四', email: 'lisi@example.com', role: 'manager', department: '技术部' },
                  { name: '王五', email: 'wangwu@example.com', role: 'finance', department: '财务部' },
                  { name: '赵六', email: 'zhaoliu@example.com', role: 'employee', department: '市场部' },
                ].map((member) => (
                  <div
                    key={member.email}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium">{member.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">{member.department}</span>
                      <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
                        <option value="employee" selected={member.role === 'employee'}>员工</option>
                        <option value="manager" selected={member.role === 'manager'}>经理</option>
                        <option value="finance" selected={member.role === 'finance'}>财务</option>
                        <option value="admin" selected={member.role === 'admin'}>管理员</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
