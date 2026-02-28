'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';

// ============================================================================
// Types
// ============================================================================

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  agentType: string | null;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  maxAmountPerRequest: number | null;
  maxAmountPerDay: number | null;
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  revokedAt: string | null;
  createdAt: string;
}

// ============================================================================
// Scope definitions for UI
// ============================================================================

const SCOPE_GROUPS = [
  {
    label: { zh: '报销管理', en: 'Reimbursements' },
    scopes: [
      { value: 'reimbursement:read', label: { zh: '查看报销单', en: 'View reimbursements' } },
      { value: 'reimbursement:create', label: { zh: '创建报销单', en: 'Create reimbursements' } },
      { value: 'reimbursement:update', label: { zh: '修改报销单', en: 'Update reimbursements' } },
      { value: 'reimbursement:submit', label: { zh: '提交报销单', en: 'Submit reimbursements' } },
      { value: 'reimbursement:cancel', label: { zh: '取消报销单', en: 'Cancel reimbursements' } },
    ],
  },
  {
    label: { zh: '票据与发票', en: 'Receipts' },
    scopes: [
      { value: 'receipt:read', label: { zh: '查看票据', en: 'View receipts' } },
      { value: 'receipt:upload', label: { zh: '上传票据', en: 'Upload receipts' } },
    ],
  },
  {
    label: { zh: '其他', en: 'Other' },
    scopes: [
      { value: 'policy:read', label: { zh: '查看政策', en: 'View policies' } },
      { value: 'trip:read', label: { zh: '查看行程', en: 'View trips' } },
      { value: 'trip:create', label: { zh: '创建行程', en: 'Create trips' } },
      { value: 'analytics:read', label: { zh: '查看分析', en: 'View analytics' } },
      { value: 'profile:read', label: { zh: '查看个人信息', en: 'View profile' } },
      { value: 'settings:read', label: { zh: '查看设置', en: 'View settings' } },
    ],
  },
];

const SCOPE_PRESETS = {
  basic: {
    label: { zh: '员工基础（推荐）', en: 'Employee Basic (Recommended)' },
    scopes: [
      'reimbursement:read', 'reimbursement:create', 'reimbursement:update',
      'reimbursement:submit', 'reimbursement:cancel',
      'receipt:read', 'receipt:upload',
      'policy:read', 'trip:read', 'trip:create', 'profile:read',
    ],
  },
  readonly: {
    label: { zh: '只读', en: 'Read Only' },
    scopes: [
      'reimbursement:read', 'receipt:read', 'policy:read',
      'trip:read', 'profile:read',
    ],
  },
};

// ============================================================================
// Component
// ============================================================================

export default function ApiKeysPage() {
  const { language } = useLanguage();
  const t = language === 'zh' ? TEXT_ZH : TEXT_EN;

  // State
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyAgentType, setNewKeyAgentType] = useState('openclaw');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(SCOPE_PRESETS.basic.scopes);
  const [maxAmountPerRequest, setMaxAmountPerRequest] = useState('5000');
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [creating, setCreating] = useState(false);

  // Newly created key (shown once)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit state
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [editMaxAmount, setEditMaxAmount] = useState('');
  const [editRateLimitPerMinute, setEditRateLimitPerMinute] = useState('');
  const [editRateLimitPerDay, setEditRateLimitPerDay] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch keys
  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      if (data.success) {
        setKeys(data.data);
      }
    } catch {
      setError(t.fetchError);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setMessage(msg); setTimeout(() => setMessage(''), 4000); }
  };

  // Create key
  const handleCreate = async () => {
    if (!newKeyName.trim()) { showMsg(t.nameRequired, true); return; }
    if (selectedScopes.length === 0) { showMsg(t.scopeRequired, true); return; }

    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          agentType: newKeyAgentType || 'openclaw',
          scopes: selectedScopes,
          maxAmountPerRequest: maxAmountPerRequest ? parseFloat(maxAmountPerRequest) : undefined,
          expiresInDays: expiresInDays ? parseInt(expiresInDays) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewlyCreatedKey(data.data.key);
        setShowCreateForm(false);
        setNewKeyName('');
        setSelectedScopes(SCOPE_PRESETS.basic.scopes);
        fetchKeys();
        showMsg(t.createSuccess);
      } else {
        showMsg(data.error || t.createFailed, true);
      }
    } catch {
      showMsg(t.createFailed, true);
    } finally {
      setCreating(false);
    }
  };

  // Revoke key
  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(t.revokeConfirm.replace('{name}', name))) return;

    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg(t.revokeSuccess);
        fetchKeys();
      } else {
        showMsg(data.error || t.revokeFailed, true);
      }
    } catch {
      showMsg(t.revokeFailed, true);
    }
  };

  // Start editing a key
  const startEdit = (key: ApiKeyItem) => {
    setEditingKeyId(key.id);
    setEditName(key.name);
    setEditScopes([...key.scopes]);
    setEditMaxAmount(key.maxAmountPerRequest?.toString() || '');
    setEditRateLimitPerMinute(key.rateLimitPerMinute.toString());
    setEditRateLimitPerDay(key.rateLimitPerDay.toString());
  };

  const cancelEdit = () => {
    setEditingKeyId(null);
  };

  // Save edited key
  const handleSave = async () => {
    if (!editingKeyId) return;
    if (!editName.trim()) { showMsg(t.nameRequired, true); return; }
    if (editScopes.length === 0) { showMsg(t.scopeRequired, true); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/api-keys/${editingKeyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          scopes: editScopes,
          maxAmountPerRequest: editMaxAmount ? parseFloat(editMaxAmount) : 0,
          rateLimitPerMinute: editRateLimitPerMinute ? parseInt(editRateLimitPerMinute) : 60,
          rateLimitPerDay: editRateLimitPerDay ? parseInt(editRateLimitPerDay) : 1000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg(t.editSuccess);
        setEditingKeyId(null);
        fetchKeys();
      } else {
        showMsg(data.error || t.editFailed, true);
      }
    } catch {
      showMsg(t.editFailed, true);
    } finally {
      setSaving(false);
    }
  };

  // Toggle edit scope
  const toggleEditScope = (scope: string) => {
    setEditScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  // Scope toggle (for create form)
  const toggleScope = (scope: string) => {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  // Copy to clipboard
  const copyKey = () => {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format date
  const fmtDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const fmtDateTime = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) return <div className="p-8 text-center text-gray-500">{t.loading}</div>;

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Notifications */}
      {message && (
        <div className="fixed top-4 right-4 bg-green-100 text-green-800 px-4 py-3 rounded-lg shadow-lg z-50">
          {message}
        </div>
      )}
      {error && (
        <div className="fixed top-4 right-4 bg-red-100 text-red-600 px-4 py-3 rounded-lg shadow-lg z-50">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? t.cancelCreate : t.createKey}
        </Button>
      </div>

      {/* Newly Created Key Banner */}
      {newlyCreatedKey && (
        <Card className="border-amber-300 bg-amber-50">
          <div className="p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">&#x26A0;&#xFE0F;</span>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900">{t.newKeyWarning}</h3>
                <p className="text-sm text-amber-700 mt-1">{t.newKeyHint}</p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 text-sm font-mono text-gray-900 break-all select-all">
                    {newlyCreatedKey}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyKey}>
                    {copied ? t.copied : t.copy}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-amber-700"
                  onClick={() => setNewlyCreatedKey(null)}
                >
                  {t.dismiss}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <div className="p-5 border-b">
            <h3 className="text-base font-semibold">{t.createTitle}</h3>
            <p className="text-sm text-gray-500 mt-1">{t.createDesc}</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.keyName}</label>
              <Input
                placeholder={t.keyNamePlaceholder}
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
              />
            </div>

            {/* Agent Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.agentType}</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={newKeyAgentType}
                onChange={e => setNewKeyAgentType(e.target.value)}
              >
                <option value="openclaw">OpenClaw</option>
                <option value="custom">{t.customAgent}</option>
              </select>
            </div>

            {/* Scope Presets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.scopePreset}</label>
              <div className="flex gap-2">
                {Object.entries(SCOPE_PRESETS).map(([key, preset]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedScopes([...preset.scopes])}
                    className={selectedScopes.length === preset.scopes.length &&
                      preset.scopes.every(s => selectedScopes.includes(s))
                      ? 'border-blue-500 bg-blue-50 text-blue-700' : ''}
                  >
                    {preset.label[language]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Scope Checkboxes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.scopes}</label>
              <div className="space-y-3">
                {SCOPE_GROUPS.map(group => (
                  <div key={group.label.en}>
                    <div className="text-xs font-medium text-gray-500 uppercase mb-1.5">
                      {group.label[language]}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.scopes.map(scope => (
                        <label
                          key={scope.value}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                            selectedScopes.includes(scope.value)
                              ? 'bg-blue-50 border-blue-300 text-blue-800'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedScopes.includes(scope.value)}
                            onChange={() => toggleScope(scope.value)}
                            className="sr-only"
                          />
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                            selectedScopes.includes(scope.value)
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-gray-300'
                          }`}>
                            {selectedScopes.includes(scope.value) && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          {scope.label[language]}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Safety Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.maxAmount}</label>
                <Input
                  type="number"
                  placeholder="5000"
                  value={maxAmountPerRequest}
                  onChange={e => setMaxAmountPerRequest(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">{t.maxAmountHint}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.expiry}</label>
                <Input
                  type="number"
                  placeholder="90"
                  value={expiresInDays}
                  onChange={e => setExpiresInDays(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">{t.expiryHint}</p>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>{t.cancelCreate}</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? t.creating : t.confirmCreate}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* OpenClaw Setup Guide */}
      <Card className="border-blue-200 bg-blue-50/50">
        <div className="p-5">
          <h3 className="font-semibold text-blue-900 mb-2">{t.guideTitle}</h3>
          <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
            <li>{t.guideStep1}</li>
            <li>{t.guideStep2} <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">REIMBURSEMENT_API_KEY</code></li>
            <li>{t.guideStep3} <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">{typeof window !== 'undefined' ? window.location.origin : ''}/api/openclaw/skill</code></li>
          </ol>
          <p className="text-xs text-blue-600 mt-3">
            {t.guideSkillUrl}{' '}
            <a
              href="/api/openclaw/skill"
              target="_blank"
              className="underline font-medium"
            >
              /api/openclaw/skill
            </a>
          </p>
        </div>
      </Card>

      {/* Key List */}
      {keys.length === 0 ? (
        <Card>
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3">&#x1F511;</div>
            <p className="text-base">{t.noKeys}</p>
            <p className="text-sm mt-1">{t.noKeysHint}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <Card key={key.id}>
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{key.name}</h3>
                      {key.revokedAt ? (
                        <Badge variant="danger">{t.revoked}</Badge>
                      ) : key.isActive ? (
                        <Badge variant="success">{t.active}</Badge>
                      ) : (
                        <Badge variant="warning">{t.disabled}</Badge>
                      )}
                      {key.agentType && (
                        <Badge variant="info">{key.agentType}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {key.keyPrefix}
                      </span>
                      <span>{t.created} {fmtDate(key.createdAt)}</span>
                      <span>{t.lastUsed} {fmtDateTime(key.lastUsedAt)}</span>
                      <span>{t.usage} {key.usageCount}</span>
                    </div>
                    {/* Scopes */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {key.scopes.slice(0, 5).map(scope => (
                        <span key={scope} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {scope}
                        </span>
                      ))}
                      {key.scopes.length > 5 && (
                        <span className="text-xs text-gray-400">+{key.scopes.length - 5}</span>
                      )}
                    </div>
                    {/* Limits */}
                    {(key.maxAmountPerRequest || key.expiresAt) && (
                      <div className="flex gap-4 mt-2 text-xs text-gray-400">
                        {key.maxAmountPerRequest && <span>{t.amountLimit} {key.maxAmountPerRequest}</span>}
                        {key.expiresAt && <span>{t.expiresAt} {fmtDate(key.expiresAt)}</span>}
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  {!key.revokedAt && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editingKeyId === key.id ? cancelEdit() : startEdit(key)}
                      >
                        {editingKeyId === key.id ? t.cancelCreate : t.edit}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleRevoke(key.id, key.name)}
                      >
                        {t.revoke}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Inline Edit Form */}
                {editingKeyId === key.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                    {/* Edit Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t.keyName}</label>
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                      />
                    </div>

                    {/* Edit Scope Presets */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t.scopePreset}</label>
                      <div className="flex gap-2">
                        {Object.entries(SCOPE_PRESETS).map(([presetKey, preset]) => (
                          <Button
                            key={presetKey}
                            variant="outline"
                            size="sm"
                            onClick={() => setEditScopes([...preset.scopes])}
                            className={editScopes.length === preset.scopes.length &&
                              preset.scopes.every(s => editScopes.includes(s))
                              ? 'border-blue-500 bg-blue-50 text-blue-700' : ''}
                          >
                            {preset.label[language]}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Edit Scope Checkboxes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t.scopes}</label>
                      <div className="space-y-3">
                        {SCOPE_GROUPS.map(group => (
                          <div key={group.label.en}>
                            <div className="text-xs font-medium text-gray-500 uppercase mb-1.5">
                              {group.label[language]}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.scopes.map(scope => (
                                <label
                                  key={scope.value}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                                    editScopes.includes(scope.value)
                                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={editScopes.includes(scope.value)}
                                    onChange={() => toggleEditScope(scope.value)}
                                    className="sr-only"
                                  />
                                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                    editScopes.includes(scope.value)
                                      ? 'bg-blue-600 border-blue-600'
                                      : 'border-gray-300'
                                  }`}>
                                    {editScopes.includes(scope.value) && (
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </span>
                                  {scope.label[language]}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Edit Limits */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.maxAmount}</label>
                        <Input
                          type="number"
                          placeholder="5000"
                          value={editMaxAmount}
                          onChange={e => setEditMaxAmount(e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">{t.maxAmountHint}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.rateLimitMinute}</label>
                        <Input
                          type="number"
                          placeholder="60"
                          value={editRateLimitPerMinute}
                          onChange={e => setEditRateLimitPerMinute(e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">{t.rateLimitMinuteHint}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.rateLimitDay}</label>
                        <Input
                          type="number"
                          placeholder="1000"
                          value={editRateLimitPerDay}
                          onChange={e => setEditRateLimitPerDay(e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">{t.rateLimitDayHint}</p>
                      </div>
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={cancelEdit}>{t.cancelCreate}</Button>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? t.saving : t.save}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Translations
// ============================================================================

const TEXT_ZH = {
  loading: '加载中...',
  title: 'API Key 管理',
  subtitle: '创建和管理 API Key，让 OpenClaw 等 AI Agent 代你操作报销系统',
  createKey: '+ 创建 API Key',
  cancelCreate: '取消',
  fetchError: '获取 API Key 列表失败',
  createTitle: '创建新的 API Key',
  createDesc: '创建后，你可以把 Key 配置到 OpenClaw 中，让它帮你报销',
  keyName: 'Key 名称',
  keyNamePlaceholder: '例如：我的 OpenClaw Agent',
  agentType: 'Agent 类型',
  customAgent: '自定义 Agent',
  scopePreset: '权限预设',
  scopes: '权限范围',
  maxAmount: '单次金额上限',
  maxAmountHint: '为空则不限制',
  expiry: '有效期（天）',
  expiryHint: '为空则永不过期',
  confirmCreate: '创建 API Key',
  creating: '创建中...',
  nameRequired: '请输入 Key 名称',
  scopeRequired: '请至少选择一个权限',
  createSuccess: 'API Key 创建成功',
  createFailed: '创建失败',
  newKeyWarning: '请立即保存你的 API Key',
  newKeyHint: '这是唯一一次显示完整 Key 的机会，关闭后将无法再查看。',
  copy: '复制',
  copied: '已复制',
  dismiss: '我已保存，关闭提示',
  noKeys: '还没有 API Key',
  noKeysHint: '创建一个，让 AI Agent 帮你管理报销',
  active: '有效',
  disabled: '已禁用',
  revoked: '已撤销',
  created: '创建于',
  lastUsed: '最近使用',
  usage: '调用次数',
  amountLimit: '单次上限',
  expiresAt: '过期时间',
  revoke: '撤销',
  revokeConfirm: '确定要撤销 "{name}" 吗？撤销后该 Key 立即失效，无法恢复。',
  revokeSuccess: 'API Key 已撤销',
  revokeFailed: '撤销失败',
  edit: '编辑',
  editSuccess: '修改已保存',
  editFailed: '保存失败',
  save: '保存修改',
  saving: '保存中...',
  rateLimitMinute: '每分钟调用上限',
  rateLimitMinuteHint: '默认 60 次/分钟',
  rateLimitDay: '每日调用上限',
  rateLimitDayHint: '默认 1000 次/天',
  guideTitle: '如何配置 OpenClaw',
  guideStep1: '点击上方「创建 API Key」按钮',
  guideStep2: '复制生成的 Key，配置到 OpenClaw 环境变量',
  guideStep3: 'OpenClaw 会自动从以下地址获取使用说明：',
  guideSkillUrl: 'OpenClaw Skill 文档（公开访问）：',
};

const TEXT_EN = {
  loading: 'Loading...',
  title: 'API Key Management',
  subtitle: 'Create and manage API Keys for AI agents like OpenClaw to operate on your behalf',
  createKey: '+ Create API Key',
  cancelCreate: 'Cancel',
  fetchError: 'Failed to fetch API keys',
  createTitle: 'Create New API Key',
  createDesc: 'After creation, configure the key in OpenClaw to automate your reimbursements',
  keyName: 'Key Name',
  keyNamePlaceholder: 'e.g., My OpenClaw Agent',
  agentType: 'Agent Type',
  customAgent: 'Custom Agent',
  scopePreset: 'Permission Presets',
  scopes: 'Permissions',
  maxAmount: 'Max Amount Per Request',
  maxAmountHint: 'Leave empty for no limit',
  expiry: 'Expires In (days)',
  expiryHint: 'Leave empty for no expiry',
  confirmCreate: 'Create API Key',
  creating: 'Creating...',
  nameRequired: 'Please enter a key name',
  scopeRequired: 'Please select at least one permission',
  createSuccess: 'API Key created successfully',
  createFailed: 'Failed to create API Key',
  newKeyWarning: 'Save your API Key now',
  newKeyHint: 'This is the only time the full key will be shown. You won\'t be able to see it again.',
  copy: 'Copy',
  copied: 'Copied!',
  dismiss: 'I\'ve saved it, dismiss',
  noKeys: 'No API Keys yet',
  noKeysHint: 'Create one to let AI agents manage your reimbursements',
  active: 'Active',
  disabled: 'Disabled',
  revoked: 'Revoked',
  created: 'Created',
  lastUsed: 'Last used',
  usage: 'Usage',
  amountLimit: 'Amount limit',
  expiresAt: 'Expires',
  revoke: 'Revoke',
  revokeConfirm: 'Are you sure you want to revoke "{name}"? This is irreversible.',
  revokeSuccess: 'API Key revoked',
  revokeFailed: 'Failed to revoke',
  edit: 'Edit',
  editSuccess: 'Changes saved',
  editFailed: 'Failed to save changes',
  save: 'Save Changes',
  saving: 'Saving...',
  rateLimitMinute: 'Rate Limit (per minute)',
  rateLimitMinuteHint: 'Default 60 req/min',
  rateLimitDay: 'Rate Limit (per day)',
  rateLimitDayHint: 'Default 1000 req/day',
  guideTitle: 'How to set up OpenClaw',
  guideStep1: 'Click "Create API Key" above',
  guideStep2: 'Copy the generated key and set it as OpenClaw environment variable',
  guideStep3: 'OpenClaw will auto-fetch usage instructions from:',
  guideSkillUrl: 'OpenClaw Skill docs (public access):',
};
