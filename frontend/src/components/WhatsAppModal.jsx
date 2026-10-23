import React, { useState, useEffect } from 'react'
import { X, MessageCircle, Send, Copy, Check, Bell, ExternalLink, Sparkles } from 'lucide-react'

export default function WhatsAppModal({ isOpen, onClose, onShowToast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const [config, setConfig] = useState({
    phone_number: '',
    provider: 'direct',
    auto_send_on_scan: false,
    include_ath: true,
    include_near_52w: true,
    volume_confirmed_only: true,
    fno_only: false,
    max_stocks_per_section: 8,
    callmebot_api_key: '',
    meta_phone_number_id: '',
    meta_access_token: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_from_number: 'whatsapp:+14155238886',
  })

  const [previewText, setPreviewText] = useState('')
  const [waMeUrl, setWaMeUrl] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch('/api/whatsapp/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.config) setConfig((prev) => ({ ...prev, ...data.config }))
        if (data.whatsapp_text) setPreviewText(data.whatsapp_text)
        if (data.wa_me_url) setWaMeUrl(data.wa_me_url)
      })
      .catch((err) => console.error('Failed to load WhatsApp config:', err))
      .finally(() => setLoading(false))
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!isOpen) return null

  const handleSaveConfig = async (nextConfig = config) => {
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
      })
      const data = await res.json()
      if (data.config) setConfig((prev) => ({ ...prev, ...data.config }))
      if (data.whatsapp_text) setPreviewText(data.whatsapp_text)
      if (data.wa_me_url) setWaMeUrl(data.wa_me_url)
      if (onShowToast) {
        onShowToast({ type: 'success', message: 'WhatsApp alert preferences saved!' }, 4000)
      }
    } catch (err) {
      console.error('Failed to save WhatsApp config:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleOption = (key) => {
    const updated = { ...config, [key]: !config[key] }
    setConfig(updated)
    handleSaveConfig(updated)
  }

  const handleSendDigest = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      const data = await res.json()
      if (data.whatsapp_text) setPreviewText(data.whatsapp_text)
      if (data.wa_me_url) setWaMeUrl(data.wa_me_url)

      if (data.status === 'direct_link' && data.wa_me_url) {
        window.open(data.wa_me_url, '_blank', 'noopener,noreferrer')
        if (onShowToast) {
          onShowToast({ type: 'success', message: 'Opened WhatsApp with formatted NSE breakout digest!' }, 5000)
        }
      } else if (data.status === 'sent') {
        if (onShowToast) {
          onShowToast({ type: 'success', message: data.message }, 6000)
        }
      } else {
        if (onShowToast) {
          onShowToast({ type: 'info', message: data.message || 'Could not dispatch WhatsApp message.' }, 6000)
        }
      }
    } catch (err) {
      console.error('Failed to send WhatsApp alert:', err)
    } finally {
      setSending(false)
    }
  }

  const handleCopyPreview = async () => {
    if (!previewText) return
    try {
      await navigator.clipboard.writeText(previewText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Clipboard copy failed:', err)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E5E7EB] dark:border-[#1F2937] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#16A34A]/15 text-[#16A34A] dark:text-[#22C55E] flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#111827] dark:text-[#F9FAFB]">
                WhatsApp Breakout Digest & Alerts
              </h2>
              <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">
                Send formatted 52W High & ATH setups directly to WhatsApp or configure automated post-scan alerts
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB] rounded-xl hover:bg-[#F9FAFB] dark:hover:bg-[#1F2937] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#6B7280] dark:text-[#9CA3AF]">
              Loading WhatsApp digest preview...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Left Column: Configuration */}
              <div className="md:col-span-6 space-y-4">
                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-medium text-[#111827] dark:text-[#F9FAFB] mb-1.5">
                    Recipient WhatsApp Number (with country code)
                  </label>
                  <input
                    type="tel"
                    value={config.phone_number}
                    onChange={(e) => setConfig({ ...config, phone_number: e.target.value })}
                    placeholder="e.g. 919876543210"
                    className="w-full px-3.5 py-2 text-xs bg-[#F9FAFB] dark:bg-[#161D27] border border-[#E5E7EB] dark:border-[#1F2937] rounded-xl focus:outline-none focus:border-[#8069BF] text-[#111827] dark:text-[#F9FAFB]"
                  />
                  <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
                    10-digit Indian numbers automatically prefix with +91.
                  </p>
                </div>

                {/* Digest Content Filters */}
                <div className="space-y-2">
                  <span className="block text-xs font-medium text-[#111827] dark:text-[#F9FAFB]">
                    Digest Filter Rules
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleOption('include_ath')}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-medium transition-all ${
                        config.include_ath
                          ? 'bg-[#8069BF]/10 border-[#8069BF]/40 text-[#8069BF] dark:text-[#A78BFA]'
                          : 'bg-[#F9FAFB] dark:bg-[#161D27] border-[#E5E7EB] dark:border-[#1F2937] text-[#6B7280] dark:text-[#9CA3AF]'
                      }`}
                    >
                      👑 Include ATH Setups
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleOption('include_near_52w')}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-medium transition-all ${
                        config.include_near_52w
                          ? 'bg-[#8069BF]/10 border-[#8069BF]/40 text-[#8069BF] dark:text-[#A78BFA]'
                          : 'bg-[#F9FAFB] dark:bg-[#161D27] border-[#E5E7EB] dark:border-[#1F2937] text-[#6B7280] dark:text-[#9CA3AF]'
                      }`}
                    >
                      🎯 Include Near 52W
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleOption('volume_confirmed_only')}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-medium transition-all ${
                        config.volume_confirmed_only
                          ? 'bg-[#16A34A]/10 border-[#16A34A]/40 text-[#16A34A] dark:text-[#22C55E]'
                          : 'bg-[#F9FAFB] dark:bg-[#161D27] border-[#E5E7EB] dark:border-[#1F2937] text-[#6B7280] dark:text-[#9CA3AF]'
                      }`}
                    >
                      🔥 Vol Confirmed (≥1.4x)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleOption('fno_only')}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-medium transition-all ${
                        config.fno_only
                          ? 'bg-[#8069BF]/10 border-[#8069BF]/40 text-[#8069BF] dark:text-[#A78BFA]'
                          : 'bg-[#F9FAFB] dark:bg-[#161D27] border-[#E5E7EB] dark:border-[#1F2937] text-[#6B7280] dark:text-[#9CA3AF]'
                      }`}
                    >
                      ⚡ F&O Stocks Only
                    </button>
                  </div>
                </div>

                {/* Delivery Mode */}
                <div>
                  <label className="block text-xs font-medium text-[#111827] dark:text-[#F9FAFB] mb-1.5">
                    Delivery Channel
                  </label>
                  <select
                    value={config.provider}
                    onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs bg-[#F9FAFB] dark:bg-[#161D27] border border-[#E5E7EB] dark:border-[#1F2937] rounded-xl focus:outline-none focus:border-[#8069BF] text-[#111827] dark:text-[#F9FAFB]"
                  >
                    <option value="direct">Instant WhatsApp Web / App Launch (No API Key Needed)</option>
                    <option value="callmebot">CallMeBot Free Personal WhatsApp API</option>
                    <option value="meta">Official Meta WhatsApp Cloud API</option>
                    <option value="twilio">Twilio WhatsApp API</option>
                  </select>
                </div>

                {/* Provider-Specific Credentials */}
                {config.provider === 'callmebot' && (
                  <div className="p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#161D27] border border-[#E5E7EB] dark:border-[#1F2937] space-y-2">
                    <label className="block text-[11px] font-medium text-[#111827] dark:text-[#F9FAFB]">
                      CallMeBot API Key
                    </label>
                    <input
                      type="password"
                      value={config.callmebot_api_key}
                      onChange={(e) => setConfig({ ...config, callmebot_api_key: e.target.value })}
                      placeholder="Enter CallMeBot apikey"
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-lg"
                    />
                  </div>
                )}

                {config.provider === 'meta' && (
                  <div className="p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#161D27] border border-[#E5E7EB] dark:border-[#1F2937] space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-[#111827] dark:text-[#F9FAFB] mb-1">
                        Meta Phone Number ID
                      </label>
                      <input
                        type="text"
                        value={config.meta_phone_number_id}
                        onChange={(e) => setConfig({ ...config, meta_phone_number_id: e.target.value })}
                        placeholder="e.g. 10592837465..."
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#111827] dark:text-[#F9FAFB] mb-1">
                        Meta Permanent / System User Access Token
                      </label>
                      <input
                        type="password"
                        value={config.meta_access_token}
                        onChange={(e) => setConfig({ ...config, meta_access_token: e.target.value })}
                        placeholder="EAAG..."
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {config.provider === 'twilio' && (
                  <div className="p-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#161D27] border border-[#E5E7EB] dark:border-[#1F2937] space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-[#111827] dark:text-[#F9FAFB] mb-1">
                        Twilio Account SID
                      </label>
                      <input
                        type="text"
                        value={config.twilio_account_sid}
                        onChange={(e) => setConfig({ ...config, twilio_account_sid: e.target.value })}
                        placeholder="AC..."
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#111827] dark:text-[#F9FAFB] mb-1">
                        Twilio Auth Token
                      </label>
                      <input
                        type="password"
                        value={config.twilio_auth_token}
                        onChange={(e) => setConfig({ ...config, twilio_auth_token: e.target.value })}
                        placeholder="Auth Token"
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* Auto-send on Scan Toggle */}
                {config.provider !== 'direct' && (
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F9FAFB] dark:bg-[#161D27] border border-[#E5E7EB] dark:border-[#1F2937] cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={config.auto_send_on_scan}
                      onChange={(e) => setConfig({ ...config, auto_send_on_scan: e.target.checked })}
                      className="rounded border-gray-300 text-[#8069BF] focus:ring-[#8069BF]"
                    />
                    <span className="text-[#111827] dark:text-[#F9FAFB] font-medium">
                      Auto-send WhatsApp digest when daily NSE scan updates
                    </span>
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => handleSaveConfig(config)}
                  disabled={saving}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold border border-[#E5E7EB] dark:border-[#1F2937] hover:bg-[#F9FAFB] dark:hover:bg-[#161D27] text-[#111827] dark:text-[#F9FAFB] transition-colors"
                >
                  {saving ? 'Updating Preview & Saving...' : 'Save Settings & Refresh Preview'}
                </button>
              </div>

              {/* Right Column: Live WhatsApp Message Preview */}
              <div className="md:col-span-6 flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[#111827] dark:text-[#F9FAFB]">
                    Live WhatsApp Digest Preview
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPreview}
                    className="flex items-center gap-1 text-[11px] font-medium text-[#8069BF] hover:underline"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                  </button>
                </div>

                <div className="flex-1 bg-[#F9FAFB] dark:bg-[#161D27] border border-[#E5E7EB] dark:border-[#1F2937] rounded-2xl p-3.5 font-mono text-[11px] leading-relaxed text-[#111827] dark:text-[#F9FAFB] whitespace-pre-wrap overflow-y-auto max-h-[290px]">
                  {previewText || 'No digest preview available.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#E5E7EB] dark:border-[#1F2937] bg-[#F9FAFB] dark:bg-[#161D27] flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">
            Tip: You can also share any individual stock chart directly from its Chart Modal.
          </div>

          <div className="flex items-center gap-2.5">
            {waMeUrl && config.provider !== 'direct' && (
              <a
                href={waMeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-[#E5E7EB] dark:border-[#374151] text-[#111827] dark:text-[#F9FAFB] hover:bg-white dark:hover:bg-[#1F2937] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in WhatsApp Web</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleSendDigest}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white shadow-xs transition-all active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {sending
                  ? 'Sending...'
                  : config.provider === 'direct'
                  ? 'Send via WhatsApp Now'
                  : 'Dispatch WhatsApp Alert'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
