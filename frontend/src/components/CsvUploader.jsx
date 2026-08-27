import React, { useState } from 'react'
import { Upload, X, CheckCircle2, FileText, Database, RefreshCw, AlertCircle } from 'lucide-react'

export default function CsvUploader({ isOpen, onClose, onUploadSuccess, stats }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected && selected.name.endsWith('.csv')) {
      setFile(selected)
      setError(null)
    } else {
      setError('Please select a valid .csv file containing NSE tickers.')
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please choose a CSV file first.')
      return
    }

    setUploading(true)
    setError(null)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Failed to upload CSV')
      }

      const data = await res.json()
      setMessage(`Successfully updated! ${data.total_stocks} stocks stored permanently.`)
      setUploading(false)
      if (onUploadSuccess) onUploadSuccess()
    } catch (err) {
      setError(err.message)
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
      <div className="bg-white dark:bg-[#161a20] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-xl text-slate-400 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#272d36] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-[#1E3A8A] dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">
              Persistent NSE Stock Universe
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Uploaded once and permanently saved to screener storage.
            </p>
          </div>
        </div>

        {/* Universe Health & Status */}
        <div className="bg-slate-50 dark:bg-[#1d2229] p-3.5 rounded-2xl mb-4 text-xs space-y-1.5 border border-slate-200/60 dark:border-slate-800">
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Currently Active Stocks:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{stats?.total_stocks || 0} stocks</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Cached Price History:</span>
            <span className="font-mono font-semibold text-[#15803D] dark:text-[#22C55E]">{stats?.cached_stocks || 0} downloaded (SQLite)</span>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-[#1E3A8A] dark:hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer transition-colors mb-4 relative bg-slate-50/50 dark:bg-[#13171d]/50">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#15803D] dark:text-[#22C55E]">
              <FileText className="w-4 h-4" />
              {file.name}
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Click or drag & drop custom NSE CSV here
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Columns: SYMBOL, NAME OF COMPANY, SERIES, etc.
              </div>
            </div>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-[#DC2626] dark:text-[#EF4444] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 p-3 rounded-xl mb-4 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {message && (
          <div className="flex items-center gap-2 text-xs text-[#15803D] dark:text-[#22C55E] bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/40 p-3 rounded-xl mb-4 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {message}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1d2229] rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`px-5 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
              !file || uploading
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-[#1E3A8A] hover:bg-[#1E40AF] dark:bg-blue-600 dark:hover:bg-blue-500 text-white shadow-sm active:scale-95'
            }`}
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Saving Universe...
              </>
            ) : (
              'Save & Scan Universe'
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
