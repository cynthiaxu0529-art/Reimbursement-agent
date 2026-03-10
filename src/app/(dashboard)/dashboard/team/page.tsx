'use client';

import { useState, useEffect } from 'react';

type TabType = 'members' | 'departments' | 'approval-rules';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  roles: string[];
  department: string;
  departmentId?: string;
  managerId?: string;
  phone?: string;
  walletAddress?: string;
  status: 'active' | 'pending';
  isExample?: boolean;
}

interface Department {
  id: string;
  name: string;
  code?: string;
  description?: string;
  costCenter?: string | null;
  parentId?: string;
  managerId?: string;
  approverIds: string[];
  level: number;
  sortOrder: number;
  isActive: boolean;
  memberCount?: number;
  manager?: { id: string; name: string; email: string };
  children?: Department[];
}

const COST_CENTER_OPTIONS = [
  { value: '', label: '未设置', color: '#9ca3af' },
  { value: 'rd', label: 'R&D 研发费用', color: '#2563eb' },
  { value: 'sm', label: 'S&M 销售费用', color: '#059669' },
  { value: 'ga', label: 'G&A 管理费用', color: '#7c3aed' },
] as const;

/** 前端推断部门的费用性质（当 costCenter 未设置时给建议） */
function guessCostCenter(deptName: string): 'rd' | 'sm' | 'ga' {
  const lower = deptName.toLowerCase();
  const rdKeywords = ['研发', '技术', '工程', '开发', '算法', '架构', '测试', 'qa', '产品', 'cto', 'r&d', 'engineering', 'tech', 'data', 'ai', 'ml', 'devops', 'sre', 'platform'];
  const smKeywords = ['销售', '市场', '营销', '商务', '品牌', '增长', '获客', '客户成功', 'cmo', 'cso', 'sales', 'marketing', 'growth', 'bd', 'revenue'];
  for (const kw of rdKeywords) { if (lower.includes(kw)) return 'rd'; }
  for (const kw of smKeywords) { if (lower.includes(kw)) return 'sm'; }
  return 'ga';
}

interface ApprovalRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  conditions: {
    minAmount?: number;
    maxAmount?: number;
    categories?: string[];
    departments?: string[];
  };
  approvalSteps: {
    order: number;
    type: string;
    name: string;
    role?: string;
  }[];
  isActive: boolean;
  isDefault: boolean;
}

interface PendingInvite {
  id: string;
  name: string;
  email: string;
  roles: string[];
  department: string;
  sentAt: string;
}

const roleLabels: Record<string, string> = {
  admin: '管理员',
  super_admin: '超级管理员',
  manager: '经理',
  approver: '审批人',
  finance: '财务',
  employee: '员工',
};

const roleColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: '#fef2f2', text: '#dc2626' },
  super_admin: { bg: '#fef2f2', text: '#dc2626' },
  manager: { bg: '#f3e8ff', text: '#7c3aed' },
  approver: { bg: '#f3e8ff', text: '#7c3aed' },
  finance: { bg: '#ecfdf5', text: '#059669' },
  employee: { bg: '#eff6ff', text: '#2563eb' },
};

const stepTypeLabels: Record<string, string> = {
  manager: '直属上级',
  department: '部门负责人',
  parent_department: '上级部门负责人',
  role: '指定角色',
  amount_threshold: '金额阈值',
  specific_user: '指定审批人',
};

// 数据库角色到前端角色的映射
// 注意：super_admin 需要保持独立，因为它有所有权限
const DB_TO_FRONTEND_ROLE: Record<string, string> = {
  employee: 'employee',
  manager: 'approver',
  finance: 'finance',
  admin: 'admin',
  super_admin: 'super_admin',  // 保持独立
};

export default function TeamPage() {
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('members');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // 邀请数据
  const [inviteData, setInviteData] = useState({
    name: '',
    email: '',
    department: '',
    departmentId: '',
    roles: [] as string[],
    setAsDeptManager: false,
  });

  // 部门数据
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFormData, setDeptFormData] = useState({
    id: '',
    name: '',
    code: '',
    description: '',
    costCenter: '',
    parentId: '',
    managerId: '',
    approverIds: [] as string[],
  });
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // 审批规则数据
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [ruleFormData, setRuleFormData] = useState({
    id: '',
    name: '',
    description: '',
    priority: 0,
    conditions: {
      minAmount: undefined as number | undefined,
      maxAmount: undefined as number | undefined,
      categories: undefined as string[] | undefined,
      departments: undefined as string[] | undefined,
    },
    approvalSteps: [
      { order: 1, type: 'manager', name: '直属上级审批' },
      { order: 2, type: 'department', name: '部门负责人审批' },
      { order: 3, type: 'role', name: '财务审核', role: 'finance' },
    ],
    isActive: true,
    isDefault: false,
  });

  // 团队成员
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberFormData, setMemberFormData] = useState({ departmentId: '', role: '' });

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

  // 检查是否有管理员权限（admin 或 super_admin 都可以管理团队）
  const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');

  // 加载数据
  useEffect(() => {
    if (rolesLoading) return; // 等待角色加载完成
    if (isAdmin) {
      fetchMembers();
      fetchDepartments();
      fetchApprovalRules();
    } else {
      setLoading(false);
    }
  }, [isAdmin, rolesLoading]);

  const fetchMembers = async () => {
    try {
      const response = await fetch('/api/team/members');
      const result = await response.json();
      if (result.success && result.data) {
        const realMembers = result.data.map((m: TeamMember) => ({
          ...m,
          isExample: false,
        }));
        if (realMembers.length === 0) {
          setMembers([
            { id: 'example-1', name: '张总', email: 'ceo@demo.com', roles: ['admin'], department: '管理层', status: 'active', isExample: true },
            { id: 'example-2', name: '李经理', email: 'tech_manager@demo.com', roles: ['approver', 'employee'], department: '技术部', status: 'active', isExample: true },
          ]);
        } else {
          setMembers(realMembers);
        }
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments?flat=true');
      const result = await response.json();
      if (result.success && result.data) {
        setDepartments(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const fetchApprovalRules = async () => {
    try {
      const response = await fetch('/api/approval-rules?activeOnly=false');
      const result = await response.json();
      if (result.success && result.data) {
        setApprovalRules(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch approval rules:', error);
    }
  };

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  // 邀请成员
  const handleInvite = async () => {
    if (!inviteData.email || !inviteData.name || inviteData.roles.length === 0) return;
    setSaving(true);
    try {
      const response = await fetch('/api/invites/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteData.email,
          name: inviteData.name,
          department: inviteData.department,
          departmentId: inviteData.departmentId,
          roles: inviteData.roles,
          setAsDeptManager: inviteData.setAsDeptManager,
          companyName: '您的公司',
        }),
      });
      const result = await response.json();
      if (result.success) {
        const newInvite: PendingInvite = {
          id: `invite-${Date.now()}`,
          name: inviteData.name,
          email: inviteData.email,
          roles: inviteData.roles,
          department: inviteData.department,
          sentAt: new Date().toISOString().split('T')[0],
        };
        setPendingInvites([...pendingInvites, newInvite]);
        showMessage(`邀请邮件已成功发送至 ${inviteData.email}`, 'success');
        setShowInviteModal(false);
        setInviteData({ name: '', email: '', department: '', departmentId: '', roles: [], setAsDeptManager: false });
      } else {
        showMessage(result.error || '发送邀请失败，请重试', 'error');
      }
    } catch (error) {
      console.error('Invite error:', error);
      showMessage('网络错误，请检查网络连接后重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 保存部门
  const handleSaveDept = async () => {
    if (!deptFormData.name.trim()) {
      showMessage('部门名称不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      const url = editingDept ? `/api/departments/${editingDept.id}` : '/api/departments';
      const method = editingDept ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deptFormData.name,
          code: deptFormData.code || null,
          description: deptFormData.description || null,
          costCenter: deptFormData.costCenter || null,
          parentId: deptFormData.parentId || null,
          managerId: deptFormData.managerId || null,
          approverIds: deptFormData.approverIds,
        }),
      });
      const result = await response.json();
      if (result.success) {
        showMessage(editingDept ? '部门更新成功' : '部门创建成功', 'success');
        setShowDeptModal(false);
        setEditingDept(null);
        setDeptFormData({ id: '', name: '', code: '', description: '', costCenter: '', parentId: '', managerId: '', approverIds: [] });
        fetchDepartments();
      } else {
        showMessage(result.error || '操作失败', 'error');
      }
    } catch (error) {
      console.error('Save dept error:', error);
      showMessage('网络错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 删除部门
  const handleDeleteDept = async (deptId: string) => {
    if (!confirm('确定要删除此部门吗？')) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/departments/${deptId}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        showMessage('部门已删除', 'success');
        fetchDepartments();
      } else {
        showMessage(result.error || '删除失败', 'error');
      }
    } catch (error) {
      showMessage('网络错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 更新成员信息
  const handleUpdateMember = async () => {
    if (!editingMember) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/team/members/${editingMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: memberFormData.departmentId || null,
          role: memberFormData.role || undefined,
        }),
      });
      const result = await response.json();
      if (result.success) {
        showMessage('成员信息更新成功', 'success');
        setEditingMember(null);
        fetchMembers();
      } else {
        showMessage(result.error || '更新失败', 'error');
      }
    } catch (error) {
      console.error('Update member error:', error);
      showMessage('网络错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 保存审批规则
  const handleSaveRule = async () => {
    if (!ruleFormData.name.trim()) {
      showMessage('规则名称不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      const url = ruleFormData.id ? `/api/approval-rules/${ruleFormData.id}` : '/api/approval-rules';
      const method = ruleFormData.id ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleFormData.name,
          description: ruleFormData.description || null,
          priority: ruleFormData.priority,
          conditions: ruleFormData.conditions,
          approvalSteps: ruleFormData.approvalSteps,
          isActive: ruleFormData.isActive,
          isDefault: ruleFormData.isDefault,
        }),
      });
      const result = await response.json();
      if (result.success) {
        showMessage(ruleFormData.id ? '规则更新成功' : '规则创建成功', 'success');
        setShowRuleModal(false);
        setRuleFormData({
          id: '',
          name: '',
          description: '',
          priority: 0,
          conditions: { minAmount: undefined, maxAmount: undefined, categories: undefined, departments: undefined },
          approvalSteps: [
            { order: 1, type: 'manager', name: '直属上级审批' },
            { order: 2, type: 'department', name: '部门负责人审批' },
            { order: 3, type: 'role', name: '财务审核', role: 'finance' },
          ],
          isActive: true,
          isDefault: false,
        });
        fetchApprovalRules();
      } else {
        showMessage(result.error || '操作失败', 'error');
      }
    } catch (error) {
      showMessage('网络错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 获取部门名称列表（用于下拉选择）
  const getDeptOptions = (): { id: string; name: string }[] => {
    const flatDepts: { id: string; name: string }[] = [];
    const flatten = (depts: Department[], prefix = '') => {
      depts.forEach(d => {
        flatDepts.push({ id: d.id, name: prefix + d.name });
        if (d.children?.length) {
          flatten(d.children, prefix + '  ');
        }
      });
    };
    flatten(departments);
    return flatDepts;
  };

  // 获取扁平化的部门列表用于邀请成员的下拉选择
  const flatDeptList = (() => {
    const result: { id: string; name: string }[] = [];
    const flatten = (depts: Department[], prefix = '') => {
      depts.forEach(d => {
        result.push({ id: d.id, name: prefix + d.name });
        if (d.children?.length) {
          flatten(d.children, prefix + '  ');
        }
      });
    };
    flatten(departments);
    return result;
  })();

  // 按部门分组成员
  const groupedMembers = members.reduce((acc, member) => {
    const dept = member.department || '未分配';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(member);
    return acc;
  }, {} as Record<string, TeamMember[]>);

  const filteredMembers = selectedDepartment === 'all'
    ? members
    : members.filter(m => m.department === selectedDepartment);

  const inputStyle = {
    width: '100%',
    padding: '0.625rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.375rem',
  };

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  };

  const tabStyle = (isActive: boolean) => ({
    padding: '0.75rem 1.25rem',
    backgroundColor: isActive ? '#2563eb' : 'transparent',
    color: isActive ? 'white' : '#4b5563',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '0.875rem',
  });

  // 等待角色加载
  if (rolesLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#6b7280' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p>加载中...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#6b7280' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>无权限访问</h2>
        <p style={{ fontSize: '0.875rem' }}>只有管理员可以访问团队管理页面</p>
      </div>
    );
  }

  return (
    <div>
      {/* Message Toast */}
      {message && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          backgroundColor: messageType === 'success' ? '#dcfce7' : '#fee2e2',
          color: messageType === 'success' ? '#166534' : '#dc2626',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 50,
          maxWidth: '360px',
        }}>
          {messageType === 'success' ? '✅' : '❌'} {message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>组织架构与审批流</h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
            管理公司团队成员、部门结构和审批流程
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', backgroundColor: '#f3f4f6', padding: '0.25rem', borderRadius: '0.625rem', width: 'fit-content' }}>
        <button onClick={() => setActiveTab('members')} style={tabStyle(activeTab === 'members')}>
          👥 团队成员
        </button>
        <button onClick={() => setActiveTab('departments')} style={tabStyle(activeTab === 'departments')}>
          🏢 部门管理
        </button>
        <button onClick={() => setActiveTab('approval-rules')} style={tabStyle(activeTab === 'approval-rules')}>
          ✅ 审批规则
        </button>
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedDepartment('all')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: selectedDepartment === 'all' ? '#2563eb' : '#f3f4f6',
                  color: selectedDepartment === 'all' ? 'white' : '#4b5563',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                全部 ({members.length})
              </button>
              {Object.keys(groupedMembers).map(dept => (
                <button
                  key={dept}
                  onClick={() => setSelectedDepartment(dept)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: selectedDepartment === dept ? '#2563eb' : '#f3f4f6',
                    color: selectedDepartment === dept ? 'white' : '#4b5563',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  {dept} ({groupedMembers[dept].length})
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ➕ 邀请成员
            </button>
          </div>

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fef3c7' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>
                  ⏳ 待接受邀请 ({pendingInvites.length})
                </h3>
              </div>
              <div>
                {pendingInvites.map((invite) => (
                  <div key={invite.id} style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '40px', height: '40px', backgroundColor: '#fbbf24', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'white', fontWeight: 600 }}>{invite.name[0]}</span>
                      </div>
                      <div>
                        <p style={{ fontWeight: 500, color: '#111827' }}>{invite.name}</p>
                        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{invite.email} · {invite.department || '未分配部门'}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{invite.sentAt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p>加载团队成员...</p>
            </div>
          )}

          {/* Members List */}
          {!loading && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {selectedDepartment === 'all' ? (
                // 全部视图：按部门分组显示
                Object.entries(groupedMembers).map(([dept, deptMembers]) => (
                  <div key={dept} style={cardStyle}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{dept === '未分配' ? '📋' : '🏢'}</span>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                        {dept}
                      </h3>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>
                        {deptMembers.length} 人
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', padding: '1rem 1.25rem' }}>
                      {deptMembers.map(member => (
                        <div
                          key={member.id}
                          onClick={() => {
                            if (!member.isExample) {
                              setEditingMember(member);
                              setMemberFormData({ departmentId: member.departmentId || '', role: member.roles[0] || 'employee' });
                            }
                          }}
                          style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: member.isExample ? 'default' : 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={(e) => { if (!member.isExample) e.currentTarget.style.borderColor = '#93c5fd'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                        >
                          <div style={{
                            width: '44px',
                            height: '44px',
                            backgroundColor: member.roles.includes('admin') ? '#dc2626' : member.roles.includes('finance') ? '#059669' : '#2563eb',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <span style={{ color: 'white', fontWeight: 600, fontSize: '1rem' }}>{member.name[0]}</span>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <p style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</p>
                              {member.isExample && (
                                <span style={{ padding: '0.125rem 0.375rem', backgroundColor: '#f3f4f6', borderRadius: '0.25rem', fontSize: '0.625rem', color: '#6b7280' }}>示例</span>
                              )}
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</p>
                            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                              {member.roles.map(role => (
                                <span key={role} style={{ padding: '0.125rem 0.375rem', backgroundColor: roleColors[role]?.bg || '#f3f4f6', color: roleColors[role]?.text || '#4b5563', borderRadius: '0.25rem', fontSize: '0.625rem', fontWeight: 500 }}>
                                  {roleLabels[role] || role}
                                </span>
                              ))}
                            </div>
                          </div>
                          {!member.isExample && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>✎</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                // 单部门视图
                <div style={cardStyle}>
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f8fafc' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                      {selectedDepartment} ({filteredMembers.length} 人)
                    </h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', padding: '1rem 1.25rem' }}>
                    {filteredMembers.map(member => (
                      <div
                        key={member.id}
                        onClick={() => {
                          if (!member.isExample) {
                            setEditingMember(member);
                            setMemberFormData({ departmentId: member.departmentId || '', role: member.roles[0] || 'employee' });
                          }
                        }}
                        style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: member.isExample ? 'default' : 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={(e) => { if (!member.isExample) e.currentTarget.style.borderColor = '#93c5fd'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                      >
                        <div style={{
                          width: '44px',
                          height: '44px',
                          backgroundColor: member.roles.includes('admin') ? '#dc2626' : member.roles.includes('finance') ? '#059669' : '#2563eb',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span style={{ color: 'white', fontWeight: 600, fontSize: '1rem' }}>{member.name[0]}</span>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <p style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</p>
                            {member.isExample && (
                              <span style={{ padding: '0.125rem 0.375rem', backgroundColor: '#f3f4f6', borderRadius: '0.25rem', fontSize: '0.625rem', color: '#6b7280' }}>示例</span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</p>
                          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                            {member.roles.map(role => (
                              <span key={role} style={{ padding: '0.125rem 0.375rem', backgroundColor: roleColors[role]?.bg || '#f3f4f6', color: roleColors[role]?.text || '#4b5563', borderRadius: '0.25rem', fontSize: '0.625rem', fontWeight: 500 }}>
                                {roleLabels[role] || role}
                              </span>
                            ))}
                          </div>
                        </div>
                        {!member.isExample && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>✎</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              管理公司部门结构，设置部门负责人和审批人
            </p>
            <button
              onClick={() => {
                setEditingDept(null);
                setDeptFormData({ id: '', name: '', code: '', description: '', costCenter: '', parentId: '', managerId: '', approverIds: [] });
                setShowDeptModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ➕ 新建部门
            </button>
          </div>

          {departments.length === 0 ? (
            <div style={{ ...cardStyle, padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏢</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>暂无部门</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>创建第一个部门来开始组织架构管理</p>
              <button
                onClick={() => setShowDeptModal(true)}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                创建部门
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {departments.map(dept => (
                <div key={dept.id} style={cardStyle}>
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        backgroundColor: '#eff6ff',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                      }}>
                        🏢
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{dept.name}</h3>
                          {dept.code && <span style={{ fontSize: '0.75rem', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>{dept.code}</span>}
                          {(() => {
                            const effectiveCC = dept.costCenter || guessCostCenter(dept.name);
                            const cc = COST_CENTER_OPTIONS.find(o => o.value === effectiveCC);
                            const isGuess = !dept.costCenter;
                            return cc ? (
                              <span style={{
                                fontSize: '0.75rem',
                                color: cc.color,
                                backgroundColor: `${cc.color}10`,
                                padding: '0.125rem 0.5rem',
                                borderRadius: '0.25rem',
                                border: `1px ${isGuess ? 'dashed' : 'solid'} ${cc.color}40`,
                                fontWeight: 500,
                                opacity: isGuess ? 0.7 : 1,
                              }}>
                                {isGuess ? `${cc.label}?` : cc.label}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {dept.memberCount || 0} 名成员
                          {dept.manager && ` · 负责人: ${dept.manager.name}`}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setEditingDept(dept);
                          setDeptFormData({
                            id: dept.id,
                            name: dept.name,
                            code: dept.code || '',
                            description: dept.description || '',
                            costCenter: dept.costCenter || guessCostCenter(dept.name),
                            parentId: dept.parentId || '',
                            managerId: dept.managerId || '',
                            approverIds: dept.approverIds || [],
                          });
                          setShowDeptModal(true);
                        }}
                        style={{ padding: '0.5rem 0.75rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteDept(dept.id)}
                        disabled={saving}
                        style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '0.375rem', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  {dept.description && (
                    <div style={{ padding: '0 1.25rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {dept.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Approval Rules Tab */}
      {activeTab === 'approval-rules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              配置报销单的多级审批流程规则
            </p>
            <button
              onClick={() => {
                setRuleFormData({
                  id: '',
                  name: '',
                  description: '',
                  priority: 0,
                  conditions: { minAmount: undefined, maxAmount: undefined, categories: undefined, departments: undefined },
                  approvalSteps: [
                    { order: 1, type: 'manager', name: '直属上级审批' },
                    { order: 2, type: 'department', name: '部门负责人审批' },
                    { order: 3, type: 'role', name: '财务审核', role: 'finance' },
                  ],
                  isActive: true,
                  isDefault: false,
                });
                setShowRuleModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ➕ 新建规则
            </button>
          </div>

          {approvalRules.length === 0 ? (
            <div style={{ ...cardStyle, padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>暂无审批规则</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>创建审批规则来定义报销单的审批流程</p>
              <button
                onClick={() => setShowRuleModal(true)}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                创建规则
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {approvalRules.map(rule => (
                <div key={rule.id} style={cardStyle}>
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{rule.name}</h3>
                        {rule.isDefault && (
                          <span style={{ fontSize: '0.75rem', backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>默认</span>
                        )}
                        <span style={{
                          fontSize: '0.75rem',
                          backgroundColor: rule.isActive ? '#dcfce7' : '#f3f4f6',
                          color: rule.isActive ? '#166534' : '#6b7280',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '0.25rem',
                        }}>
                          {rule.isActive ? '启用' : '禁用'}
                        </span>
                      </div>
                      {rule.description && <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>{rule.description}</p>}

                      {/* Conditions */}
                      {(rule.conditions.minAmount || rule.conditions.maxAmount) && (
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                          触发条件:
                          {rule.conditions.minAmount && ` 金额 ≥ ¥${rule.conditions.minAmount}`}
                          {rule.conditions.minAmount && rule.conditions.maxAmount && ' 且'}
                          {rule.conditions.maxAmount && ` 金额 ≤ ¥${rule.conditions.maxAmount}`}
                        </p>
                      )}

                      {/* Approval Steps */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {rule.approvalSteps.map((step, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{
                              fontSize: '0.75rem',
                              backgroundColor: '#f3f4f6',
                              color: '#374151',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.375rem',
                            }}>
                              {step.order}. {step.name}
                            </span>
                            {idx < rule.approvalSteps.length - 1 && <span style={{ color: '#9ca3af' }}>→</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setRuleFormData({
                            id: rule.id,
                            name: rule.name,
                            description: rule.description || '',
                            priority: rule.priority,
                            conditions: {
                              minAmount: rule.conditions.minAmount,
                              maxAmount: rule.conditions.maxAmount,
                              categories: rule.conditions.categories,
                              departments: rule.conditions.departments,
                            },
                            approvalSteps: rule.approvalSteps,
                            isActive: rule.isActive,
                            isDefault: rule.isDefault,
                          });
                          setShowRuleModal(true);
                        }}
                        style={{ padding: '0.5rem 0.75rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
                      >
                        编辑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '480px', margin: '1rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>邀请团队成员</h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>发送邀请邮件，员工可自行注册并加入团队</p>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>员工姓名 <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="text"
                  value={inviteData.name}
                  onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                  placeholder="请输入员工姓名"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>邮箱地址 <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="email"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  placeholder="employee@company.com"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>所属部门</label>
                <select
                  value={inviteData.departmentId}
                  onChange={(e) => {
                    const selectedDept = flatDeptList.find(d => d.id === e.target.value);
                    setInviteData({
                      ...inviteData,
                      departmentId: e.target.value,
                      department: selectedDept?.name.trim() || '',
                      setAsDeptManager: e.target.value ? inviteData.setAsDeptManager : false,
                    });
                  }}
                  style={inputStyle}
                >
                  <option value="">请选择部门</option>
                  {flatDeptList.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
                {departments.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                    暂无部门，请先在「部门管理」中创建部门
                  </p>
                )}
              </div>

              {inviteData.departmentId && (
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    border: inviteData.setAsDeptManager ? '2px solid #2563eb' : '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    backgroundColor: inviteData.setAsDeptManager ? '#eff6ff' : 'white',
                  }}>
                    <input
                      type="checkbox"
                      checked={inviteData.setAsDeptManager}
                      onChange={(e) => setInviteData({ ...inviteData, setAsDeptManager: e.target.checked })}
                    />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>设为部门负责人</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        该成员将成为所选部门的负责人，负责审批该部门成员的报销单
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <div>
                <label style={labelStyle}>角色权限 <span style={{ color: '#dc2626' }}>*</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {[
                    { value: 'employee', label: '员工', desc: '提交报销' },
                    { value: 'approver', label: '审批人', desc: '审批报销' },
                    { value: 'finance', label: '财务', desc: '处理打款' },
                    { value: 'admin', label: '管理员', desc: '所有权限' },
                  ].map((roleOption) => (
                    <label key={roleOption.value} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      border: inviteData.roles.includes(roleOption.value) ? '2px solid #2563eb' : '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      backgroundColor: inviteData.roles.includes(roleOption.value) ? '#eff6ff' : 'white',
                    }}>
                      <input
                        type="checkbox"
                        checked={inviteData.roles.includes(roleOption.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setInviteData({ ...inviteData, roles: [...inviteData.roles, roleOption.value] });
                          } else {
                            setInviteData({ ...inviteData, roles: inviteData.roles.filter(r => r !== roleOption.value) });
                          }
                        }}
                        style={{ marginTop: '0.125rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>{roleOption.label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{roleOption.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => { setShowInviteModal(false); setInviteData({ name: '', email: '', department: '', departmentId: '', roles: [], setAsDeptManager: false }); }}
                style={{ padding: '0.5rem 1rem', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleInvite}
                disabled={saving || !inviteData.email || !inviteData.name || inviteData.roles.length === 0}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: saving || !inviteData.email || !inviteData.name || inviteData.roles.length === 0 ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: saving || !inviteData.email || !inviteData.name || inviteData.roles.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '发送中...' : '发送邀请'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Edit Modal */}
      {editingMember && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '440px', margin: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '1.25rem' }}>
              编辑成员
            </h3>

            {/* Member info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: '44px', height: '44px',
                backgroundColor: editingMember.roles.includes('admin') ? '#dc2626' : '#2563eb',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ color: 'white', fontWeight: 600 }}>{editingMember.name[0]}</span>
              </div>
              <div>
                <p style={{ fontWeight: 500, color: '#111827' }}>{editingMember.name}</p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{editingMember.email}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* Department */}
              <div>
                <label style={labelStyle}>所属部门</label>
                <select
                  value={memberFormData.departmentId}
                  onChange={(e) => setMemberFormData({ ...memberFormData, departmentId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">未分配</option>
                  {flatDeptList.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              {/* Role */}
              <div>
                <label style={labelStyle}>角色权限</label>
                <select
                  value={memberFormData.role}
                  onChange={(e) => setMemberFormData({ ...memberFormData, role: e.target.value })}
                  style={inputStyle}
                >
                  <option value="employee">员工 - 提交报销</option>
                  <option value="manager">经理 - 审批报销</option>
                  <option value="finance">财务 - 处理打款</option>
                  <option value="admin">管理员 - 所有权限</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => setEditingMember(null)}
                style={{ padding: '0.5rem 1rem', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleUpdateMember}
                disabled={saving}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: saving ? '#9ca3af' : '#2563eb',
                  color: 'white', border: 'none', borderRadius: '0.5rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Modal */}
      {showDeptModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '480px', margin: '1rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '1.25rem' }}>
              {editingDept ? '编辑部门' : '新建部门'}
            </h3>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>部门名称 <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="text"
                  value={deptFormData.name}
                  onChange={(e) => setDeptFormData({ ...deptFormData, name: e.target.value })}
                  placeholder="如：技术部"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>部门编码</label>
                <input
                  type="text"
                  value={deptFormData.code}
                  onChange={(e) => setDeptFormData({ ...deptFormData, code: e.target.value })}
                  placeholder="如：TECH-001"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>费用性质</label>
                <select
                  value={deptFormData.costCenter}
                  onChange={(e) => setDeptFormData({ ...deptFormData, costCenter: e.target.value })}
                  style={inputStyle}
                >
                  {COST_CENTER_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  决定该部门人员报销时的记账科目前缀（R&D/S&M/G&A）
                </p>
              </div>

              <div>
                <label style={labelStyle}>部门描述</label>
                <textarea
                  value={deptFormData.description}
                  onChange={(e) => setDeptFormData({ ...deptFormData, description: e.target.value })}
                  placeholder="部门职责描述..."
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={labelStyle}>上级部门</label>
                <select
                  value={deptFormData.parentId}
                  onChange={(e) => setDeptFormData({ ...deptFormData, parentId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">无（顶级部门）</option>
                  {getDeptOptions().filter(d => d.id !== deptFormData.id).map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>部门负责人</label>
                <select
                  value={deptFormData.managerId}
                  onChange={(e) => setDeptFormData({ ...deptFormData, managerId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">请选择负责人</option>
                  {members.filter(m => !m.isExample).map((member) => (
                    <option key={member.id} value={member.id}>{member.name} ({member.email})</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  部门负责人将作为该部门成员报销单的审批人
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => { setShowDeptModal(false); setEditingDept(null); }}
                style={{ padding: '0.5rem 1rem', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleSaveDept}
                disabled={saving || !deptFormData.name.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: saving || !deptFormData.name.trim() ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: saving || !deptFormData.name.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Rule Modal */}
      {showRuleModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '560px', margin: '1rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '1.25rem' }}>
              {ruleFormData.id ? '编辑审批规则' : '新建审批规则'}
            </h3>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>规则名称 <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="text"
                  value={ruleFormData.name}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, name: e.target.value })}
                  placeholder="如：默认审批流程"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>规则描述</label>
                <input
                  type="text"
                  value={ruleFormData.description}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, description: e.target.value })}
                  placeholder="适用场景说明..."
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>最小金额（元）</label>
                  <input
                    type="number"
                    value={ruleFormData.conditions.minAmount || ''}
                    onChange={(e) => setRuleFormData({
                      ...ruleFormData,
                      conditions: { ...ruleFormData.conditions, minAmount: e.target.value ? Number(e.target.value) : undefined }
                    })}
                    placeholder="不限"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>最大金额（元）</label>
                  <input
                    type="number"
                    value={ruleFormData.conditions.maxAmount || ''}
                    onChange={(e) => setRuleFormData({
                      ...ruleFormData,
                      conditions: { ...ruleFormData.conditions, maxAmount: e.target.value ? Number(e.target.value) : undefined }
                    })}
                    placeholder="不限"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>审批步骤</label>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                  {ruleFormData.approvalSteps.map((step, idx) => (
                    <div key={idx} style={{ padding: '0.75rem 1rem', borderBottom: idx < ruleFormData.approvalSteps.length - 1 ? '1px solid #e5e7eb' : 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ width: '24px', height: '24px', backgroundColor: '#2563eb', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                        {step.order}
                      </span>
                      <select
                        value={step.type}
                        onChange={(e) => {
                          const newSteps = [...ruleFormData.approvalSteps];
                          const newType = e.target.value;
                          newSteps[idx] = {
                            ...step,
                            type: newType,
                            name: stepTypeLabels[newType] || step.name,
                            role: newType === 'role' ? 'finance' : undefined,
                          };
                          setRuleFormData({ ...ruleFormData, approvalSteps: newSteps });
                        }}
                        style={{ ...inputStyle, flex: 1 }}
                      >
                        <option value="manager">直属上级</option>
                        <option value="department">部门负责人</option>
                        <option value="parent_department">上级部门负责人</option>
                        <option value="role">指定角色</option>
                      </select>
                      {step.type === 'role' && (
                        <select
                          value={step.role || 'finance'}
                          onChange={(e) => {
                            const newSteps = [...ruleFormData.approvalSteps];
                            newSteps[idx] = { ...step, role: e.target.value, name: `${roleLabels[e.target.value]}审核` };
                            setRuleFormData({ ...ruleFormData, approvalSteps: newSteps });
                          }}
                          style={{ ...inputStyle, width: '120px' }}
                        >
                          <option value="finance">财务</option>
                          <option value="admin">管理员</option>
                        </select>
                      )}
                      <button
                        onClick={() => {
                          const newSteps = ruleFormData.approvalSteps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
                          setRuleFormData({ ...ruleFormData, approvalSteps: newSteps });
                        }}
                        disabled={ruleFormData.approvalSteps.length <= 1}
                        style={{ padding: '0.25rem 0.5rem', backgroundColor: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '0.25rem', cursor: ruleFormData.approvalSteps.length <= 1 ? 'not-allowed' : 'pointer', opacity: ruleFormData.approvalSteps.length <= 1 ? 0.5 : 1 }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const newOrder = ruleFormData.approvalSteps.length + 1;
                    setRuleFormData({
                      ...ruleFormData,
                      approvalSteps: [
                        ...ruleFormData.approvalSteps,
                        { order: newOrder, type: 'role', name: '财务审核', role: 'finance' },
                      ],
                    });
                  }}
                  style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
                >
                  ➕ 添加步骤
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={ruleFormData.isActive}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, isActive: e.target.checked })}
                  />
                  <span style={{ fontSize: '0.875rem' }}>启用规则</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={ruleFormData.isDefault}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, isDefault: e.target.checked })}
                  />
                  <span style={{ fontSize: '0.875rem' }}>设为默认规则</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => setShowRuleModal(false)}
                style={{ padding: '0.5rem 1rem', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleSaveRule}
                disabled={saving || !ruleFormData.name.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: saving || !ruleFormData.name.trim() ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: saving || !ruleFormData.name.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
