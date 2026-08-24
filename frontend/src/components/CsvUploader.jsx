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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#161a20] border border-surface-border dark:border-surface-dark-border rounded-3xl w-full max-w-lg shadow-2xl p-6 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-xl text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#272d36] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-banana-soft dark:bg-[#3a2f0d] flex items-center justify-center text-banana-ink dark:text-banana">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-[#1a1a17] dark:text-[#e8eaed]">
              Persistent NSE Stock Universe
            </h2>
            <p className="text-xs text-gray-500">
              Uploaded once and permanently saved to the screener storage.
            </p>
          </div>
        </div>

        {/* Universe Health & Status */}
        <div className="bg-gray-50 dark:bg-[#1d2229] p-3.5 rounded-2xl mb-4 text-xs space-y-1.5 num">
          <div className="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Currently Active Stocks:</span>
            <span className="font-bold text-[#1a1a17] dark:text-[#e8eaed]">{stats?.total_stocks || 0} stocks</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Cached Price History:</span>
            <span className="font-semibold text-trade-green dark:text-[#3ecf7d]">{stats?.cached_stocks || 0} downloaded (SQLite)</span>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div className="border-2 border-dashed border-surface-border dark:border-surface-dark-border hover:border-banana dark:hover:border-banana rounded-2xl p-6 text-center cursor-pointer transition-colors mb-4 relative">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-trade-green">
              <FileText className="w-4 h-4" />
              {file.name}
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Click or drag & drop custom NSE CSV here
              </div>
              <div className="text-[11px] text-gray-400 mt-1">
                Columns: SYMBOL, NAME OF COMPANY, SERIES, etc.
              </div>
            </div>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-trade-red bg-trade-red-soft p-3 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {message && (
          <div className="flex items-center gap-2 text-xs text-trade-green bg-trade-green-soft p-3 rounded-xl mb-4">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {message}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1d2229] rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`px-5 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
              !file || uploading
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                : 'bg-banana hover:bg-banana-dark text-black shadow-sm active:scale-95'
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
