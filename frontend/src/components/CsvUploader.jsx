import React, { useState } from 'react'
import { Upload, X, CheckCircle2, FileText, Database, RefreshCw, AlertCircle, Zap } from 'lucide-react'

export default function CsvUploader({ isOpen, onClose, onUploadSuccess, stats }) {
  const [activeTab, setActiveTab] = useState('bhavcopy') // 'bhavcopy' | 'universe'
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      setFile(selected)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please choose a file first.')
      return
    }

    setUploading(true)
    setError(null)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const endpoint = activeTab === 'bhavcopy' ? '/api/upload-bhavcopy' : '/api/upload-csv'
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Failed to process file')
      }

      const data = await res.json()
      setMessage(data.message || 'Successfully updated data!')
      setUploading(false)
      if (onUploadSuccess) onUploadSuccess()
    } catch (err) {
      setError(err.message)
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
      <div className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-3xl w-full max-w-lg shadow-2xl p-6 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB] hover:bg-[#F9FAFB] dark:hover:bg-[#1F2937] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#8069BF]/10 dark:bg-[#8069BF]/20 flex items-center justify-center text-[#8069BF] border border-[#8069BF]/30">
            {activeTab === 'bhavcopy' ? <Zap className="w-5 h-5" /> : <Database className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="font-semibold text-lg text-[#111827] dark:text-[#F9FAFB]">
              {activeTab === 'bhavcopy' ? 'Official NSE Bhavcopy Ingestion' : 'Stock Universe Management'}
            </h2>
            <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] font-normal">
              {activeTab === 'bhavcopy' 
                ? 'Instant 0.3s sync across all 2,500+ NSE stocks (Zero Rate Limits).'
                : 'Upload custom stock list or universe tickers.'}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#F3F4F6] dark:bg-[#1F2937] p-1 rounded-xl mb-4">
          <button
            onClick={() => { setActiveTab('bhavcopy'); setFile(null); setError(null); setMessage(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'bhavcopy'
                ? 'bg-white dark:bg-[#111827] text-[#8069BF] shadow-xs'
                : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Daily Bhavcopy (PR Report)
          </button>
          <button
            onClick={() => { setActiveTab('universe'); setFile(null); setError(null); setMessage(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'universe'
                ? 'bg-white dark:bg-[#111827] text-[#8069BF] shadow-xs'
                : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Universe CSV
          </button>
        </div>

        {/* Drag and Drop Zone */}
        <div className="border-2 border-dashed border-[#E5E7EB] dark:border-[#374151] hover:border-[#8069BF] dark:hover:border-[#8069BF] rounded-2xl p-6 text-center cursor-pointer transition-colors mb-4 relative bg-[#F9FAFB]/50 dark:bg-[#161D27]/50">
          <input
            type="file"
            accept={activeTab === 'bhavcopy' ? '.csv,.zip' : '.csv'}
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <Upload className="w-8 h-8 mx-auto text-[#9CA3AF] mb-2" />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#16A34A] dark:text-[#22C55E]">
              <FileText className="w-4 h-4 text-[#9CA3AF]" />
              {file.name}
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold text-[#111827] dark:text-[#F9FAFB]">
                {activeTab === 'bhavcopy' 
                  ? 'Click or drag & drop pd<date>.csv, PR<date>.zip, or sec_bhavdata*.csv'
                  : 'Click or drag & drop custom NSE CSV here'}
              </div>
              <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] mt-1 font-normal">
                {activeTab === 'bhavcopy'
                  ? 'Official NSE daily closing archive — updates all stocks in 0.3s'
                  : 'Columns: SYMBOL, NAME OF COMPANY, SERIES, etc.'}
              </div>
            </div>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-[#DC2626] dark:text-[#EF4444] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 p-3 rounded-xl mb-4 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
            {error}
          </div>
        )}

        {message && (
          <div className="flex items-center gap-2 text-xs text-[#16A34A] dark:text-[#22C55E] bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/40 p-3 rounded-xl mb-4 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#16A34A]" />
            {message}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F9FAFB] dark:hover:bg-[#1F2937] rounded-xl transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`px-5 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
              !file || uploading
                ? 'bg-[#E5E7EB] dark:bg-[#1F2937] text-[#9CA3AF] cursor-not-allowed'
                : 'bg-[#8069BF] hover:bg-[#7259B4] text-white shadow-xs active:scale-95'
            }`}
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Ingesting Bhavcopy...
              </>
            ) : (
              activeTab === 'bhavcopy' ? 'Ingest & Refresh Screener' : 'Save & Scan Universe'
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
