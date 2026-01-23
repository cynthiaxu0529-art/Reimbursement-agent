'use client';

import { useState, useEffect } from 'react';

type UserRole = 'employee' | 'approver' | 'admin';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  roles: string[];
  department: string;
  phone?: string;
  walletAddress?: string;
  status: 'active' | 'pending';
  isExample?: boolean;
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
  approver: '审批人',
  finance: '财务',
  employee: '员工',
};

const roleColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: '#fef2f2', text: '#dc2626' },
  approver: { bg: '#f3e8ff', text: '#7c3aed' },
  finance: { bg: '#ecfdf5', text: '#059669' },
  employee: { bg: '#eff6ff', text: '#2563eb' },
};

export default function TeamPage() {
  const [userRole, setUserRole] = useState<UserRole>('employee');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [inviteData, setInviteData] = useState({
    name: '',
    email: '',
    department: '',
    roles: [] as string[],
  });

  // 公司部门
  const [departments] = useState(['技术部', '产品部', '运营部', '财务部', '人力资源部', '市场部']);

  // 示例团队成员
  const [members, setMembers] = useState<TeamMember[]>([
    { id: 'example-1', name: '张总', email: 'ceo@demo.com', roles: ['admin'], department: '管理层', status: 'active', isExample: true },
    { id: 'example-2', name: '李经理', email: 'tech_manager@demo.com', roles: ['approver', 'employee'], department: '技术部', status: 'active', isExample: true },
    { id: 'example-3', name: '王经理', email: 'product_manager@demo.com', roles: ['approver', 'employee'], department: '产品部', status: 'active', isExample: true },
    { id: 'example-4', name: '赵会计', email: 'finance@demo.com', roles: ['finance', 'employee'], department: '财务部', status: 'active', isExample: true },
    { id: 'example-5', name: '刘工', email: 'dev1@demo.com', roles: ['employee'], department: '技术部', status: 'active', isExample: true },
    { id: 'example-6', name: '陈工', email: 'dev2@demo.com', roles: ['employee'], department: '技术部', status: 'active', isExample: true },
  ]);

  // 待接受邀请
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  useEffect(() => {
    const savedRole = localStorage.getItem('userRole') as UserRole;
    if (savedRole && (savedRole === 'employee' || savedRole === 'approver' || savedRole === 'admin')) {
      setUserRole(savedRole);
    }
  }, []);

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const handleInvite = async () => {
    if (!inviteData.email || !inviteData.name || inviteData.roles.length === 0) return;
    setSaving(true);

    try {
      // 调用邮件发送 API
      const response = await fetch('/api/invites/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteData.email,
          name: inviteData.name,
          department: inviteData.department,
          roles: inviteData.roles,
          companyName: '您的公司', // 可从设置中读取
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 添加到待处理邀请列表
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
        setInviteData({ name: '', email: '', department: '', roles: [] });
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

  const handleCancelInvite = async (inviteId: string) => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setPendingInvites(pendingInvites.filter(inv => inv.id !== inviteId));
    showMessage('邀请已取消');
    setSaving(false);
  };

  // 按部门分组成员
  const groupedMembers = members.reduce((acc, member) => {
    const dept = member.department;
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(member);
    return acc;
  }, {} as Record<string, TeamMember[]>);

  // 获取所有部门（包括管理层）
  const allDepartments = ['管理层', ...departments];

  // 过滤显示的成员
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

  if (userRole !== 'admin') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: '#6b7280'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
          无权限访问
        </h2>
        <p style={{ fontSize: '0.875rem' }}>
          只有管理员可以访问团队管理页面
        </p>
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
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>组织架构</h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
            管理公司团队成员和组织结构
          </p>
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

      {/* Department Filter */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
        {allDepartments.map(dept => {
          const count = members.filter(m => m.department === dept).length;
          if (count === 0) return null;
          return (
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
              {dept} ({count})
            </button>
          );
        })}
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>
              ⏳ 待接受邀请 ({pendingInvites.length})
            </h3>
          </div>
          <div style={{ display: 'grid', gap: '0' }}>
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
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
                    backgroundColor: '#fbbf24',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{ color: 'white', fontWeight: 600 }}>{invite.name[0]}</span>
                  </div>
                  <div>
                    <p style={{ fontWeight: 500, color: '#111827' }}>{invite.name}</p>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {invite.email} · {invite.department || '未分配部门'}
                    </p>
                    <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                      {invite.roles.map(role => (
                        <span
                          key={role}
                          style={{
                            padding: '0.125rem 0.375rem',
                            backgroundColor: roleColors[role]?.bg || '#f3f4f6',
                            color: roleColors[role]?.text || '#4b5563',
                            borderRadius: '0.25rem',
                            fontSize: '0.625rem',
                          }}
                        >
                          {roleLabels[role]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {invite.sentAt}
                  </span>
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
                    }}
                  >
                    取消邀请
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Organization Chart */}
      {selectedDepartment === 'all' ? (
        // 组织架构视图
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {allDepartments.map(dept => {
            const deptMembers = groupedMembers[dept];
            if (!deptMembers || deptMembers.length === 0) return null;

            return (
              <div key={dept} style={cardStyle}>
                <div style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid #e5e7eb',
                  backgroundColor: dept === '管理层' ? '#fef3c7' : '#f8fafc'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>
                      {dept === '管理层' ? '👑' : dept === '技术部' ? '💻' : dept === '产品部' ? '📱' : dept === '财务部' ? '💰' : dept === '运营部' ? '📈' : dept === '市场部' ? '📣' : dept === '人力资源部' ? '👥' : '🏢'}
                    </span>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                      {dept}
                    </h3>
                    <span style={{
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      backgroundColor: '#e5e7eb',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      {deptMembers.length} 人
                    </span>
                  </div>
                </div>
                <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {deptMembers.map(member => (
                    <div
                      key={member.id}
                      style={{
                        padding: '1rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        backgroundColor: member.isExample ? '#fafafa' : 'white',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          backgroundColor: member.roles.includes('admin') ? '#dc2626' :
                                           member.roles.includes('approver') ? '#7c3aed' :
                                           member.roles.includes('finance') ? '#059669' : '#2563eb',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <span style={{ color: 'white', fontWeight: 600, fontSize: '1.125rem' }}>
                            {member.name[0]}
                          </span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <p style={{ fontWeight: 600, color: '#111827' }}>{member.name}</p>
                            {member.isExample && (
                              <span style={{
                                padding: '0.125rem 0.375rem',
                                backgroundColor: '#f3f4f6',
                                borderRadius: '0.25rem',
                                fontSize: '0.625rem',
                                color: '#6b7280',
                              }}>
                                示例
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{member.email}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        {member.roles.map(role => (
                          <span
                            key={role}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: roleColors[role]?.bg || '#f3f4f6',
                              color: roleColors[role]?.text || '#4b5563',
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
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // 部门列表视图
        <div style={cardStyle}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f8fafc'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
              {selectedDepartment} ({filteredMembers.length} 人)
            </h3>
          </div>
          <div>
            {filteredMembers.map(member => (
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
                    backgroundColor: member.roles.includes('admin') ? '#dc2626' :
                                     member.roles.includes('approver') ? '#7c3aed' :
                                     member.roles.includes('finance') ? '#059669' : '#2563eb',
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
                          padding: '0.125rem 0.375rem',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '0.25rem',
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
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {member.roles.map(role => (
                    <span
                      key={role}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: roleColors[role]?.bg || '#f3f4f6',
                        color: roleColors[role]?.text || '#4b5563',
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
            ))}
          </div>
        </div>
      )}

      {/* Example Data Notice */}
      <div style={{
        marginTop: '1.5rem',
        padding: '0.75rem 1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span style={{ fontSize: '1rem' }}>💡</span>
        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          以上为示例数据，实际团队成员将通过邀请功能添加
        </p>
      </div>

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
            maxHeight: '90vh',
            overflowY: 'auto',
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
                  {departments.map((dept) => (
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
