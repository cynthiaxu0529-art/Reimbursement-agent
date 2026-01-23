'use client';

import { useState, useEffect } from 'react';

type UserRole = 'employee' | 'approver' | 'admin';

const allTabs = [
  { id: 'profile', label: '👤 个人信息', icon: '👤', adminOnly: false },
  { id: 'company', label: '🏢 公司设置', icon: '🏢', adminOnly: true },
  { id: 'team', label: '👥 团队管理', icon: '👥', adminOnly: true },
  { id: 'policies', label: '📋 报销政策', icon: '📋', adminOnly: true },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({
    name: '',
    email: '',
    department: '',
    roles: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('employee');
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

  // Example team members (示例数据)
  const [members, setMembers] = useState([
    { id: 'example-1', name: '示例员工A', email: 'example_a@demo.com', roles: ['admin'], department: '技术部', status: 'active', isExample: true },
    { id: 'example-2', name: '示例员工B', email: 'example_b@demo.com', roles: ['approver'], department: '产品部', status: 'active', isExample: true },
  ]);

  // 待接受邀请列表
  const [pendingInvites, setPendingInvites] = useState<Array<{
    id: string;
    name: string;
    email: string;
    roles: string[];
    department: string;
    sentAt: string;
  }>>([]);

  // 从 localStorage 读取角色
  useEffect(() => {
    const savedRole = localStorage.getItem('userRole') as UserRole;
    if (savedRole && (savedRole === 'employee' || savedRole === 'approver' || savedRole === 'admin')) {
      setUserRole(savedRole);
    }
  }, []);

  // 根据角色过滤可见的 tabs
  const tabs = allTabs.filter(tab => !tab.adminOnly || userRole === 'admin');

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

  const handleInvite = async () => {
    if (!inviteData.email || !inviteData.name || inviteData.roles.length === 0) return;
    setSaving(true);
    // TODO: Call API to send invite
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 添加到待接受邀请列表
    const newInvite = {
      id: `invite-${Date.now()}`,
      name: inviteData.name,
      email: inviteData.email,
      roles: inviteData.roles,
      department: inviteData.department,
      sentAt: new Date().toISOString().split('T')[0],
    };
    setPendingInvites([...pendingInvites, newInvite]);

    showMessage(`邀请已发送至 ${inviteData.email}`);
    setShowInviteModal(false);
    setInviteData({ name: '', email: '', department: '', roles: [] });
    setSaving(false);
  };

  const handleCancelInvite = async (inviteId: string) => {
    setSaving(true);
    // TODO: Call API to cancel invite
    await new Promise(resolve => setTimeout(resolve, 500));
    setPendingInvites(pendingInvites.filter(inv => inv.id !== inviteId));
    showMessage('邀请已取消');
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

  const disabledInputStyle = {
    ...inputStyle,
    backgroundColor: '#f9fafb',
    color: '#374151',
    cursor: 'not-allowed',
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
            <div style={{ padding: '1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>个人信息</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  更新您的个人资料和钱包地址
                </p>
              </div>
              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: 'white',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    borderRadius: '0.5rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  ✏️ 编辑
                </button>
              )}
            </div>
            <div style={{ padding: '1.25rem' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>姓名</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    disabled={!isEditingProfile}
                    style={isEditingProfile ? inputStyle : disabledInputStyle}
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
                    disabled={!isEditingProfile}
                    style={isEditingProfile ? inputStyle : disabledInputStyle}
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
                    disabled={!isEditingProfile}
                    style={isEditingProfile ? inputStyle : disabledInputStyle}
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
                        disabled={!isEditingProfile}
                        style={isEditingProfile ? inputStyle : disabledInputStyle}
                      />
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        请填写您的加密货币钱包地址，用于接收报销款项
                      </p>
                    </div>
                  </div>
                </div>

                {isEditingProfile && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      style={{
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
                    <button
                      onClick={() => setIsEditingProfile(false)}
                      style={{
                        padding: '0.625rem 1.25rem',
                        backgroundColor: 'white',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div style={{ maxWidth: '600px' }}>
          <div style={cardStyle}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>公司设置</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  管理公司的基本信息和报销规则
                </p>
              </div>
              {!isEditingCompany && (
                <button
                  onClick={() => setIsEditingCompany(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: 'white',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    borderRadius: '0.5rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  ✏️ 编辑
                </button>
              )}
            </div>
            <div style={{ padding: '1.25rem' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>公司名称</label>
                  <input
                    type="text"
                    value={company.name}
                    onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    disabled={!isEditingCompany}
                    style={isEditingCompany ? inputStyle : disabledInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>记账本位币</label>
                  <select
                    value={company.currency}
                    onChange={(e) => setCompany({ ...company, currency: e.target.value })}
                    disabled={!isEditingCompany}
                    style={isEditingCompany ? inputStyle : disabledInputStyle}
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
                      disabled={!isEditingCompany}
                      style={{ ...(isEditingCompany ? inputStyle : disabledInputStyle), width: '120px' }}
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
                        {isEditingCompany && (
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
                    )}
                  </div>
                </div>

                {isEditingCompany && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={handleSaveCompany}
                      disabled={saving}
                      style={{
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
                    <button
                      onClick={() => setIsEditingCompany(false)}
                      style={{
                        padding: '0.625rem 1.25rem',
                        backgroundColor: 'white',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                  </div>
                )}
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
                    key={invite.id}
                    style={{
                      padding: '0.875rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 500, color: '#111827' }}>{invite.name}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {invite.email} · {invite.department || '未分配部门'}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        邀请于 {invite.sentAt} · {invite.roles.map(r => roleLabels[r]).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      disabled={saving}
                      style={{
                        padding: '0.375rem 0.75rem',
                        backgroundColor: 'white',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.5 : 1,
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
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                团队成员 ({members.length})
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                以下为示例数据
              </span>
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
                    backgroundColor: member.isExample ? '#fafafa' : 'white',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: member.isExample ? '#9ca3af' : '#2563eb',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ color: 'white', fontWeight: 600 }}>{member.name[0]}</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <p style={{ fontWeight: 500, color: '#111827' }}>{member.name}</p>
                        {member.isExample && (
                          <span style={{
                            padding: '0.125rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '9999px',
                            fontSize: '0.625rem',
                            color: '#6b7280',
                          }}>
                            示例
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{member.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      color: '#4b5563',
                    }}>
                      {member.department}
                    </span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {member.roles.map((role) => (
                        <span
                          key={role}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: role === 'admin' ? '#fef2f2' : role === 'approver' ? '#f3e8ff' : role === 'finance' ? '#ecfdf5' : '#eff6ff',
                            color: role === 'admin' ? '#dc2626' : role === 'approver' ? '#7c3aed' : role === 'finance' ? '#059669' : '#2563eb',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}
                        >
                          {roleLabels[role]}
                        </span>
                      ))}
                    </div>
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
            maxWidth: '480px',
            margin: '1rem',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
              邀请团队成员
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>
              填写员工基本信息，发送邀请后员工可自行补充电话和钱包地址
            </p>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>
                  员工姓名 <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={inviteData.name}
                  onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                  placeholder="请输入员工姓名"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  邮箱地址 <span style={{ color: '#dc2626' }}>*</span>
                </label>
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
                  value={inviteData.department}
                  onChange={(e) => setInviteData({ ...inviteData, department: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">请选择部门</option>
                  {company.departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>
                  角色权限 <span style={{ color: '#dc2626' }}>*</span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 400, marginLeft: '0.5rem' }}>
                    (可多选)
                  </span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {[
                    { value: 'employee', label: '员工', desc: '提交报销' },
                    { value: 'approver', label: '审批人', desc: '审批报销' },
                    { value: 'finance', label: '财务', desc: '处理打款' },
                    { value: 'admin', label: '管理员', desc: '所有权限' },
                  ].map((roleOption) => (
                    <label
                      key={roleOption.value}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        border: inviteData.roles.includes(roleOption.value) ? '2px solid #2563eb' : '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        backgroundColor: inviteData.roles.includes(roleOption.value) ? '#eff6ff' : 'white',
                      }}
                    >
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

            <div style={{
              marginTop: '1.25rem',
              padding: '0.75rem',
              backgroundColor: '#f0f9ff',
              borderRadius: '0.5rem',
              border: '1px solid #bae6fd'
            }}>
              <p style={{ fontSize: '0.75rem', color: '#0369a1' }}>
                💡 邀请发送后，员工将收到邀请链接。员工登录后需要自行填写：
              </p>
              <ul style={{ fontSize: '0.75rem', color: '#0369a1', margin: '0.5rem 0 0 1rem', padding: 0 }}>
                <li>手机号码</li>
                <li>钱包地址（用于接收报销款项）</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteData({ name: '', email: '', department: '', roles: [] });
                }}
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
                {saving ? '发送中...' : '发送邀请链接'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
