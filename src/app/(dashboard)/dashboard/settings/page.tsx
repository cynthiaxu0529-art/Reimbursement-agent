'use client';

import { useState, useEffect } from 'react';

const tabs = [
  { id: 'profile', label: '👤 个人信息', icon: '👤' },
  { id: 'company', label: '🏢 公司设置', icon: '🏢' },
  { id: 'team', label: '👥 团队管理', icon: '👥' },
  { id: 'policies', label: '📋 报销政策', icon: '📋' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('employee');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  // Mock team members
  const [members] = useState([
    { id: '1', name: '张三', email: 'zhangsan@example.com', role: 'admin', department: '技术部', status: 'active' },
    { id: '2', name: '李四', email: 'lisi@example.com', role: 'manager', department: '产品部', status: 'active' },
  ]);

  const [pendingInvites] = useState([
    { email: 'newuser@example.com', role: 'employee', sentAt: '2024-01-20' },
  ]);

  // 获取用户资料
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
      } else {
        showMessage(result.error || '保存失败', true);
      }
    } catch (error) {
      showMessage('保存失败', true);
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setSaving(true);
    // TODO: Call API to send invite
    await new Promise(resolve => setTimeout(resolve, 1000));
    showMessage(`邀请已发送至 ${inviteEmail}`);
    setShowInviteModal(false);
    setInviteEmail('');
    setSaving(false);
  };

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

  const roleLabels: Record<string, string> = {
    admin: '管理员',
    manager: '经理',
    finance: '财务',
    employee: '员工',
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      {/* Success Message */}
      {message && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          backgroundColor: '#dcfce7',
          color: '#166534',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 50,
        }}>
          ✅ {message}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 50,
        }}>
          ❌ {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '0.5rem',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: activeTab === tab.id ? '#eff6ff' : 'transparent',
              color: activeTab === tab.id ? '#2563eb' : '#6b7280',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div style={{ maxWidth: '600px' }}>
          <div style={cardStyle}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>个人信息</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                更新您的个人资料和钱包地址
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>姓名</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>邮箱</label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    style={{ ...inputStyle, backgroundColor: '#f3f4f6' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>部门</label>
                  <select
                    value={profile.department}
                    onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">请选择部门</option>
                    {company.departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>手机号</label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="例如：13800138000"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>
                    💰 钱包地址（用于报销打款）
                  </h4>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>钱包地址</label>
                      <input
                        type="text"
                        value={profile.walletAddress}
                        onChange={(e) => setProfile({ ...profile, walletAddress: e.target.value })}
                        placeholder="例如：0x1234...abcd"
                        style={inputStyle}
                      />
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        请填写您的加密货币钱包地址，用于接收报销款项
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  style={{
                    marginTop: '1rem',
                    padding: '0.625rem 1.25rem',
                    backgroundColor: saving ? '#9ca3af' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '保存中...' : '保存更改'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div style={{ maxWidth: '600px' }}>
          <div style={cardStyle}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>公司设置</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                管理公司的基本信息和报销规则
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>公司名称</label>
                  <input
                    type="text"
                    value={company.name}
                    onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>记账本位币</label>
                  <select
                    value={company.currency}
                    onChange={(e) => setCompany({ ...company, currency: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="CNY">人民币 (CNY)</option>
                    <option value="USD">美元 (USD)</option>
                    <option value="EUR">欧元 (EUR)</option>
                    <option value="JPY">日元 (JPY)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>自动审批金额上限</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      value={company.autoApproveLimit}
                      onChange={(e) => setCompany({ ...company, autoApproveLimit: parseInt(e.target.value) || 0 })}
                      style={{ ...inputStyle, width: '120px' }}
                    />
                    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>元以下自动批准</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    设为 0 表示关闭自动审批
                  </p>
                </div>

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                    🏢 部门列表
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem' }}>
                    管理公司的部门结构，员工可以从中选择所属部门
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {company.departments.map((dept, index) => (
                      <span
                        key={index}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '9999px',
                          fontSize: '0.875rem',
                          color: '#374151',
                        }}
                      >
                        {dept}
                        <button
                          onClick={() => {
                            const newDepts = company.departments.filter((_, i) => i !== index);
                            setCompany({ ...company, departments: newDepts });
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            padding: '0',
                            marginLeft: '0.25rem',
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => {
                        const newDept = prompt('请输入新部门名称');
                        if (newDept && !company.departments.includes(newDept)) {
                          setCompany({ ...company, departments: [...company.departments, newDept] });
                        }
                      }}
                      style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        border: '1px dashed #93c5fd',
                        borderRadius: '9999px',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      + 添加部门
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveCompany}
                  disabled={saving}
                  style={{
                    marginTop: '1rem',
                    padding: '0.625rem 1.25rem',
                    backgroundColor: saving ? '#9ca3af' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '保存中...' : '保存更改'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div>
          {/* Invite Button */}
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
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
            <div style={{ ...cardStyle, marginBottom: '1rem' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fef3c7' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>
                  ⏳ 待接受邀请 ({pendingInvites.length})
                </h3>
              </div>
              <div>
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.email}
                    style={{
                      padding: '0.875rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 500, color: '#111827' }}>{invite.email}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        邀请于 {invite.sentAt} · {roleLabels[invite.role]}
                      </p>
                    </div>
                    <button
                      style={{
                        padding: '0.375rem 0.75rem',
                        backgroundColor: 'white',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      取消邀请
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Members */}
          <div style={cardStyle}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                团队成员 ({members.length})
              </h3>
            </div>
            <div>
              {members.map((member) => (
                <div
                  key={member.id}
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#2563eb',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ color: 'white', fontWeight: 600 }}>{member.name[0]}</span>
                    </div>
                    <div>
                      <p style={{ fontWeight: 500, color: '#111827' }}>{member.name}</p>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{member.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      color: '#4b5563',
                    }}>
                      {member.department}
                    </span>
                    <select
                      defaultValue={member.role}
                      style={{
                        padding: '0.375rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        backgroundColor: 'white',
                      }}
                    >
                      <option value="employee">员工</option>
                      <option value="manager">经理</option>
                      <option value="finance">财务</option>
                      <option value="admin">管理员</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div>
          <div style={cardStyle}>
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>报销政策</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>定义费用限额和审批规则</p>
              </div>
              <button
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                ➕ 新建政策
              </button>
            </div>
            <div>
              {[
                { name: '差旅费报销政策', rules: 5, active: true },
                { name: '日常办公费用政策', rules: 3, active: true },
                { name: '客户招待费用政策', rules: 4, active: false },
              ].map((policy, index) => (
                <div
                  key={index}
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <p style={{ fontWeight: 500, color: '#111827' }}>{policy.name}</p>
                      <span style={{
                        padding: '0.125rem 0.5rem',
                        backgroundColor: policy.active ? '#dcfce7' : '#f3f4f6',
                        color: policy.active ? '#166534' : '#6b7280',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                      }}>
                        {policy.active ? '启用' : '停用'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{policy.rules} 条规则</p>
                  </div>
                  <button
                    style={{
                      padding: '0.375rem 0.75rem',
                      backgroundColor: 'white',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    编辑
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            width: '100%',
            maxWidth: '400px',
            margin: '1rem',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>
              邀请团队成员
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>邮箱地址</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>角色</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                style={inputStyle}
              >
                <option value="employee">员工 - 可以提交报销</option>
                <option value="manager">经理 - 可以审批下属报销</option>
                <option value="finance">财务 - 可以处理打款</option>
                <option value="admin">管理员 - 所有权限</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowInviteModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleInvite}
                disabled={saving || !inviteEmail}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: saving || !inviteEmail ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: saving || !inviteEmail ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '发送中...' : '发送邀请'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
