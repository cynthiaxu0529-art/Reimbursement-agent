'use client';

import { useState } from 'react';

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
  const [message, setMessage] = useState('');

  // Mock user data
  const [profile, setProfile] = useState({
    name: '用户',
    email: 'user@example.com',
    department: '',
    phone: '',
    bankName: '',
    bankAccount: '',
  });

  // Mock company data
  const [company, setCompany] = useState({
    name: '我的公司',
    currency: 'CNY',
    autoApproveLimit: 100,
  });

  // Mock team members
  const [members] = useState([
    { id: '1', name: '张三', email: 'zhangsan@example.com', role: 'admin', department: '技术部', status: 'active' },
    { id: '2', name: '李四', email: 'lisi@example.com', role: 'manager', department: '产品部', status: 'active' },
  ]);

  const [pendingInvites] = useState([
    { email: 'newuser@example.com', role: 'employee', sentAt: '2024-01-20' },
  ]);

  const handleSaveProfile = async () => {
    setSaving(true);
    // TODO: Call API to save profile
    await new Promise(resolve => setTimeout(resolve, 1000));
    setMessage('个人信息已保存');
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSaveCompany = async () => {
    setSaving(true);
    // TODO: Call API to save company settings
    await new Promise(resolve => setTimeout(resolve, 1000));
    setMessage('公司设置已保存');
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setSaving(true);
    // TODO: Call API to send invite
    await new Promise(resolve => setTimeout(resolve, 1000));
    setMessage(`邀请已发送至 ${inviteEmail}`);
    setShowInviteModal(false);
    setInviteEmail('');
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
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
                更新您的个人资料和银行账户信息
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
                  <input
                    type="text"
                    value={profile.department}
                    onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                    placeholder="例如：技术部"
                    style={inputStyle}
                  />
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
                    💳 银行账户（用于报销打款）
                  </h4>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>开户银行</label>
                      <input
                        type="text"
                        value={profile.bankName}
                        onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                        placeholder="例如：中国工商银行"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>银行账号</label>
                      <input
                        type="text"
                        value={profile.bankAccount}
                        onChange={(e) => setProfile({ ...profile, bankAccount: e.target.value })}
                        placeholder="例如：6222021234567890123"
                        style={inputStyle}
                      />
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
