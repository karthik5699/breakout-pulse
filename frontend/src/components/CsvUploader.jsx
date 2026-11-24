import React, { useState, useEffect, useRef, useId } from 'react'
import { Upload, X, CheckCircle2, FileText, RefreshCw, AlertCircle } from 'lucide-react'

export default function CsvUploader({ isOpen, onClose, onUploadSuccess }) {
  const [activeTab, setActiveTab] = useState('bhavcopy')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const dialogRef = useRef(null)
  const fileInputRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else if (dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !isOpen) return
    if ('closedBy' in HTMLDialogElement.prototype) return

    const outside = (e) => {
      const r = dialog.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }
    let pressedOutside = false
    const onPointerDown = (e) => {
      pressedOutside = outside(e)
    }
    const onPointerUp = (e) => {
      if (pressedOutside && outside(e)) {
        dialog.close()
      }
      pressedOutside = false
    }
    dialog.addEventListener('pointerdown', onPointerDown)
    dialog.addEventListener('pointerup', onPointerUp)
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown)
      dialog.removeEventListener('pointerup', onPointerUp)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleTabSwitch = (nextTab) => {
    setActiveTab(nextTab)
    setFile(null)
    setError(null)
    setMessage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      setFile(selected)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Choose a CSV or ZIP file first.')
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
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to process file (HTTP ${res.status})`)
      }

      const data = await res.json()
      setMessage(data.message || 'Data updated cleanly.')
      setUploading(false)
      if (onUploadSuccess) onUploadSuccess(data)
    } catch (err) {
      setError(err.message)
      setUploading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={onClose}
      className="bg-transparent p-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-[8px] border-0 overflow-visible font-sans animate-fade-in"
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[8px] w-full shadow-2xl p-6 relative">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close modal"
          className="absolute right-4 top-4 p-1.5 rounded-[6px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-subtle)] bp-transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4 pr-8">
          <h2 id={titleId} className="m-0 font-display font-bold text-[18px] tracking-[-0.02em] text-[var(--ink)]">
            {activeTab === 'bhavcopy' ? 'Import NSE Bhavcopy' : 'Update stock universe'}
          </h2>
          <p className="m-0 mt-1 text-[13px] text-[var(--ink-muted)]">
            {activeTab === 'bhavcopy'
              ? 'Ingest daily PR report or equity Bhavcopy across all NSE listings.'
              : 'Replace the tracked NSE equity list from an official CSV.'}
          </p>
        </div>

        {/* Connected Segmented Switcher */}
        <div className="bp-segmented w-full mb-4" role="tablist" aria-label="Import type">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bhavcopy'}
            onClick={() => handleTabSwitch('bhavcopy')}
            className={`bp-seg-btn flex-1 py-1.5 text-center ${activeTab === 'bhavcopy' ? 'is-active' : ''}`}
          >
            Daily Bhavcopy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'universe'}
            onClick={() => handleTabSwitch('universe')}
            className={`bp-seg-btn flex-1 py-1.5 text-center ${activeTab === 'universe' ? 'is-active' : ''}`}
          >
            Universe CSV
          </button>
        </div>

        {/* File Drop Zone */}
        <div className="border border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] rounded-[6px] p-6 text-center cursor-pointer bp-transition mb-4 relative bg-[var(--surface-subtle)]">
          <input
            ref={fileInputRef}
            type="file"
            accept={activeTab === 'bhavcopy' ? '.csv,.zip' : '.csv'}
            onChange={handleFileChange}
            aria-label={activeTab === 'bhavcopy' ? 'Choose Bhavcopy file' : 'Choose Universe CSV file'}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <Upload className="w-7 h-7 mx-auto text-[var(--ink-muted)] mb-2" />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-[14px] font-semibold text-[var(--up)]">
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-xs">{file.name}</span>
            </div>
          ) : (
            <div>
              <div className="text-[14px] font-medium text-[var(--ink)]">
                {activeTab === 'bhavcopy'
                  ? 'Drop pd*.csv, PR*.zip, or sec_bhavdata*.csv'
                  : 'Drop custom NSE equity list CSV'}
              </div>
              <div className="text-[13px] text-[var(--ink-muted)] mt-1">
                {activeTab === 'bhavcopy'
                  ? 'Updates closing prices and recalculates setups across the universe'
                  : 'Requires a SYMBOL column header'}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[13px] text-[var(--down)] bg-[var(--down-soft)] p-3 rounded-[6px] mb-4 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="flex items-center gap-2 text-[13px] text-[var(--up)] bg-[var(--up-soft)] p-3 rounded-[6px] mb-4 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="px-3.5 py-2 text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-subtle)] rounded-[6px] bp-transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`px-4 py-2 text-[14px] font-semibold rounded-[6px] inline-flex items-center gap-2 bp-transition ${
              !file || uploading
                ? 'bg-[var(--surface-subtle)] text-[var(--ink-muted)] border border-[var(--border)] cursor-not-allowed'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white cursor-pointer'
            }`}
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {activeTab === 'bhavcopy' ? 'Ingesting...' : 'Uploading...'}
              </>
            ) : activeTab === 'bhavcopy' ? (
              'Ingest Bhavcopy'
            ) : (
              'Import CSV'
            )}
          </button>
        </div>
      </div>
    </dialog>
  )
}
