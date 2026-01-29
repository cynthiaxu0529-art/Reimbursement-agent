'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// 数据库角色到前端角色的映射
const DB_TO_FRONTEND_ROLE: Record<string, string> = {
  employee: 'employee',
  manager: 'approver',
  finance: 'finance',
  admin: 'admin',
  super_admin: 'super_admin',
};

interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  categories?: string[];
  limit?: {
    type: 'per_item' | 'per_day' | 'per_month';
    amount: number;
    currency: string;
  };
  condition?: {
    type: string;
    operator: string;
    value: string[];
  };
  requiresReceipt?: boolean;
  requiresApproval?: boolean;
  message?: string;
}

interface Policy {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number;
  rules: PolicyRule[];
  createdAt: string;
  updatedAt: string;
}

const allTabs = [
  { id: 'profile', label: '个人信息', icon: '👤', adminOnly: false },
  { id: 'company', label: '公司设置', icon: '🏢', adminOnly: true },
  { id: 'policies', label: '报销政策', icon: '📋', adminOnly: true },
];

const categoryLabels: Record<string, string> = {
  flight: '机票',
  train: '火车票',
  hotel: '酒店住宿',
  meal: '餐饮',
  taxi: '交通',
  ai_token: 'AI服务',
  software: '软件订阅',
  cloud_resource: '云资源',
  office_supplies: '办公用品',
  client_entertainment: '客户招待',
  other: '其他',
};

const limitTypeLabels: Record<string, string> = {
  per_item: '每次',
  per_day: '每天',
  per_month: '每月',
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingCompany, setIsEditingCompany] = useState(false);

  // Profile data
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    department: '',
    phone: '',
    walletAddress: '',
  });

  // Company data
  const [company, setCompany] = useState({
    name: '',
    currency: 'CNY',
    autoApproveLimit: 0,
    departments: ['技术部', '产品部', '运营部', '财务部', '人力资源部', '市场部'],
  });

  // Policies data
  const [policiesList, setPoliciesList] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);

  // 从 API 获取用户角色
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await fetch('/api/settings/role');
        const result = await response.json();
        if (result.success && result.roles) {
          // 转换数据库角色到前端角色
          const frontendRoles = result.roles.map((r: string) => DB_TO_FRONTEND_ROLE[r] || r);
          const uniqueRoles = [...new Set(frontendRoles)] as string[];
          setUserRoles(uniqueRoles);
        }
      } catch (error) {
        console.error('Failed to fetch roles:', error);
        setUserRoles(['employee']);
      } finally {
        setRolesLoading(false);
      }
    };
    fetchRoles();
  }, []);

  // 检查是否有管理员权限（admin 或 super_admin 都可以管理公司设置）
  const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');

  // 根据角色过滤可见的 tabs
  const tabs = allTabs.filter(tab => !tab.adminOnly || isAdmin);

  // 获取用户资料和公司设置
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/settings/profile');
        const result = await response.json();
        if (result.success) {
          setProfile({
            name: result.data.name || '',
            email: result.data.email || '',
            department: result.data.department || '',
            phone: result.data.phone || '',
            walletAddress: result.data.walletAddress || '',
          });
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    };

    const fetchCompany = async () => {
      try {
        const response = await fetch('/api/settings/company');
        const result = await response.json();
        if (result.success) {
          setCompany({
            name: result.data.name || '',
            currency: result.data.currency || 'CNY',
            autoApproveLimit: result.data.autoApproveLimit || 0,
            departments: result.data.departments || [],
          });
        }
      } catch (error) {
        console.error('Failed to fetch company:', error);
      }
    };

    Promise.all([fetchProfile(), fetchCompany()]).finally(() => {
      setLoading(false);
    });
  }, []);

  // 获取政策列表
  useEffect(() => {
    if (activeTab === 'policies' && isAdmin) {
      fetchPolicies();
    }
  }, [activeTab, isAdmin]);

  const fetchPolicies = async () => {
    setPoliciesLoading(true);
    try {
      const response = await fetch('/api/settings/policies');
      const result = await response.json();
      if (result.success) {
        setPoliciesList(result.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch policies:', error);
    } finally {
      setPoliciesLoading(false);
    }
  };

  const showMessage = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    } else {
      setMessage(msg);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          department: profile.department,
          phone: profile.phone,
          walletAddress: profile.walletAddress,
        }),
      });
      const result = await response.json();
      if (result.success) {
        showMessage('个人信息已保存');
        setIsEditingProfile(false);
      } else {
        showMessage(result.error || '保存失败', true);
      }
    } catch (error) {
      showMessage('保存失败', true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: company.name,
          currency: company.currency,
          autoApproveLimit: company.autoApproveLimit,
          departments: company.departments,
        }),
      });
      const result = await response.json();
      if (result.success) {
        showMessage('公司设置已保存');
        setIsEditingCompany(false);
      } else {
        showMessage(result.error || '保存失败', true);
      }
    } catch (error) {
      showMessage('保存失败', true);
    } finally {
      setSaving(false);
    }
  };

  const togglePolicyActive = async (policyId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/settings/policies/${policyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const result = await response.json();
      if (result.success) {
        setPoliciesList(policiesList.map(p =>
          p.id === policyId ? { ...p, isActive } : p
        ));
        showMessage(isActive ? '政策已启用' : '政策已停用');
      } else {
        showMessage(result.error || '操作失败', true);
      }
    } catch (error) {
      showMessage('操作失败', true);
    }
  };

  if (loading || rolesLoading) {
    return (
      <div className="p-8 text-center text-gray-500">加载中...</div>
    );
  }

  return (
    <div>
      {/* Success Message */}
      {message && (
        <div className="fixed top-4 right-4 bg-green-100 text-green-800 px-4 py-3 rounded-lg shadow-lg z-50">
          ✅ {message}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-100 text-red-600 px-4 py-3 rounded-lg shadow-lg z-50">
          ❌ {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="max-w-[600px]">
          <Card>
            <div className="p-5 border-b flex justify-between items-start">
              <div>
                <h3 className="text-base font-semibold text-gray-900">个人信息</h3>
                <p className="text-sm text-gray-500 mt-1">更新您的个人资料和钱包地址</p>
              </div>
              {!isEditingProfile && (
                <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)}>
                  ✏️ 编辑
                </Button>
              )}
            </div>
            <div className="p-5">
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">姓名</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    disabled={!isEditingProfile}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm ${
                      isEditingProfile
                        ? 'border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        : 'bg-gray-50 text-gray-700 cursor-not-allowed'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">部门</label>
                  <select
                    value={profile.department}
                    onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                    disabled={!isEditingProfile}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm ${
                      isEditingProfile
                        ? 'border-gray-300'
                        : 'bg-gray-50 cursor-not-allowed'
                    }`}
                  >
                    <option value="">请选择部门</option>
                    {company.departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">手机号</label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="例如：13800138000"
                    disabled={!isEditingProfile}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm ${
                      isEditingProfile
                        ? 'border-gray-300'
                        : 'bg-gray-50 cursor-not-allowed'
                    }`}
                  />
                </div>

                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">💰 钱包地址（FluxPay 打款）</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Base 链钱包地址
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        Base Chain
                      </span>
                    </label>
                    <input
                      type="text"
                      value={profile.walletAddress}
                      onChange={(e) => setProfile({ ...profile, walletAddress: e.target.value })}
                      placeholder="0x..."
                      disabled={!isEditingProfile}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm font-mono ${
                        isEditingProfile
                          ? 'border-gray-300'
                          : 'bg-gray-50 cursor-not-allowed'
                      }`}
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      请填写您在 <span className="font-semibold text-blue-600">Base 链</span> 上的钱包地址（以 0x 开头的 42 位地址），用于接收报销款项
                    </p>
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <span>⚠️</span> 请确保使用 Base 链钱包，否则可能无法收到款项
                    </p>
                  </div>
                </div>

                {isEditingProfile && (
                  <div className="mt-4 flex gap-3">
                    <Button onClick={handleSaveProfile} disabled={saving}>
                      {saving ? '保存中...' : '保存更改'}
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditingProfile(false)}>
                      取消
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div className="max-w-[600px]">
          <Card>
            <div className="p-5 border-b flex justify-between items-start">
              <div>
                <h3 className="text-base font-semibold text-gray-900">公司设置</h3>
                <p className="text-sm text-gray-500 mt-1">管理公司的基本信息和报销规则</p>
              </div>
              {!isEditingCompany && (
                <Button variant="outline" size="sm" onClick={() => setIsEditingCompany(true)}>
                  ✏️ 编辑
                </Button>
              )}
            </div>
            <div className="p-5">
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">公司名称</label>
                  <input
                    type="text"
                    value={company.name}
                    onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    disabled={!isEditingCompany}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm ${
                      isEditingCompany
                        ? 'border-gray-300'
                        : 'bg-gray-50 cursor-not-allowed'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">记账本位币</label>
                  <select
                    value={company.currency}
                    onChange={(e) => setCompany({ ...company, currency: e.target.value })}
                    disabled={!isEditingCompany}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm ${
                      isEditingCompany
                        ? 'border-gray-300'
                        : 'bg-gray-50 cursor-not-allowed'
                    }`}
                  >
                    <option value="CNY">人民币 (CNY)</option>
                    <option value="USD">美元 (USD)</option>
                    <option value="EUR">欧元 (EUR)</option>
                    <option value="JPY">日元 (JPY)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">自动审批金额上限</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={company.autoApproveLimit}
                      onChange={(e) => setCompany({ ...company, autoApproveLimit: parseInt(e.target.value) || 0 })}
                      disabled={!isEditingCompany}
                      className={`w-32 px-3 py-2.5 border rounded-lg text-sm ${
                        isEditingCompany
                          ? 'border-gray-300'
                          : 'bg-gray-50 cursor-not-allowed'
                      }`}
                    />
                    <span className="text-sm text-gray-500">元以下自动批准</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">设为 0 表示关闭自动审批</p>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">🏢 部门列表</h4>
                  <p className="text-xs text-gray-500 mb-4">管理公司的部门结构，员工可以从中选择所属部门</p>
                  <div className="flex flex-wrap gap-2">
                    {company.departments.map((dept, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700"
                      >
                        {dept}
                        {isEditingCompany && (
                          <button
                            onClick={() => {
                              const newDepts = company.departments.filter((_, i) => i !== index);
                              setCompany({ ...company, departments: newDepts });
                            }}
                            className="text-gray-400 hover:text-gray-600 ml-1"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {isEditingCompany && (
                      <button
                        onClick={() => {
                          const newDept = prompt('请输入新部门名称');
                          if (newDept && !company.departments.includes(newDept)) {
                            setCompany({ ...company, departments: [...company.departments, newDept] });
                          }
                        }}
                        className="px-3 py-1 bg-blue-50 text-blue-600 border border-dashed border-blue-300 rounded-full text-sm hover:bg-blue-100"
                      >
                        + 添加部门
                      </button>
                    )}
                  </div>
                </div>

                {isEditingCompany && (
                  <div className="mt-4 flex gap-3">
                    <Button onClick={handleSaveCompany} disabled={saving}>
                      {saving ? '保存中...' : '保存更改'}
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditingCompany(false)}>
                      取消
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div>
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">报销政策</h3>
                <p className="text-sm text-gray-500">定义费用限额和审批规则，约束员工报销行为</p>
              </div>
            </div>

            {policiesLoading ? (
              <div className="p-8 text-center text-gray-500">加载中...</div>
            ) : policiesList.length === 0 ? (
              <div className="p-8 text-center text-gray-500">暂无政策配置</div>
            ) : (
              <div>
                {policiesList.map((policy) => {
                  const isExpanded = expandedPolicyId === policy.id;

                  return (
                    <div key={policy.id} className="border-b last:border-b-0">
                      {/* Policy Header */}
                      <div
                        className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${
                          isExpanded ? 'bg-purple-50' : ''
                        }`}
                        onClick={() => setExpandedPolicyId(isExpanded ? null : policy.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{policy.name}</p>
                              <Badge variant={policy.isActive ? 'success' : 'default'}>
                                {policy.isActive ? '启用' : '停用'}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">
                              {policy.description || `${policy.rules.length} 条规则`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePolicyActive(policy.id, !policy.isActive);
                            }}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                              policy.isActive
                                ? 'text-gray-600 border-gray-300 hover:bg-gray-100'
                                : 'text-green-600 border-green-300 hover:bg-green-50'
                            }`}
                          >
                            {policy.isActive ? '停用' : '启用'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Rules */}
                      {isExpanded && (
                        <div className="px-4 pb-4 bg-purple-50">
                          <div className="pl-6 space-y-3">
                            <h4 className="text-sm font-semibold text-gray-700 pt-2">
                              规则明细 ({policy.rules.length} 条)
                            </h4>

                            {policy.rules.map((rule, index) => (
                              <div
                                key={rule.id || index}
                                className="bg-white rounded-lg border p-4"
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-medium text-gray-900">{rule.name}</p>
                                    {rule.description && (
                                      <p className="text-sm text-gray-500 mt-1">{rule.description}</p>
                                    )}
                                  </div>
                                  {rule.limit && (
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-violet-600">
                                        ${rule.limit.amount}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {limitTypeLabels[rule.limit.type] || rule.limit.type}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {rule.categories?.map((cat) => (
                                    <span
                                      key={cat}
                                      className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
                                    >
                                      {categoryLabels[cat] || cat}
                                    </span>
                                  ))}
                                  {rule.condition && (
                                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">
                                      {rule.condition.operator === 'in' ? '仅限：' : '不含：'}
                                      {rule.condition.value?.slice(0, 2).join('、')}
                                      {(rule.condition.value?.length || 0) > 2 && '等'}
                                    </span>
                                  )}
                                  {rule.requiresReceipt && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                      需要发票
                                    </span>
                                  )}
                                  {rule.requiresApproval && (
                                    <span className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs">
                                      需要审批
                                    </span>
                                  )}
                                </div>

                                {rule.message && (
                                  <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded px-3 py-2">
                                    💡 {rule.message}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Policy Summary */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">📊 当前政策概要</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">中国大陆出差（住宿+餐饮）</span>
                  <span className="font-medium text-gray-900">$100/天</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">海外出差（住宿+餐饮）</span>
                  <span className="font-medium text-gray-900">$200/天</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">AI工具订阅</span>
                  <span className="font-medium text-gray-900">$100/月</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">⚠️ 政策约束说明</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• 超出限额的报销将标记为风险项</li>
                <li>• 审批人可在审批时查看违规详情</li>
                <li>• 建议提交前检查是否符合政策</li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
