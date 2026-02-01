import { useState, useEffect } from 'react'
import './App.css'

// WASM types
type WasmModule = {
  process_cover_image: (imageData: Uint8Array, width: number, height: number) => Uint8Array
  download_cover: (gameId: string) => Promise<Uint8Array>
  extract_game_code: (fileBytes: Uint8Array) => string
}

type RomFile = {
  name: string
  path: string
  id: string
  handle: FileSystemFileHandle
}

type ProcessingStatus = {
  total: number
  processed: number
  saved: number
  skipped: number
  errors: number
}

function App() {
  const [wasm, setWasm] = useState<WasmModule | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [romFiles, setRomFiles] = useState<RomFile[]>([])
  const [status, setStatus] = useState<ProcessingStatus>({ total: 0, processed: 0, saved: 0, skipped: 0, errors: 0 })
  const [dimensions] = useState({ width: 128, height: 96 })
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  useEffect(() => {
    const loadWasm = async () => {
      try {
        const wasmModule = await import('../pkg/pico_cover_wasm.js')
        setWasm(wasmModule)
        setLoading(false)
        console.log('WASM module loaded successfully')
      } catch (error) {
        console.error('Failed to load WASM:', error)
        setLoading(false)
      }
    }
    loadWasm()
  }, [])

  const selectDirectory = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert(
        'Your browser does not support the File System Access API.\n\n' +
        'Please use:\n' +
        '• Google Chrome (version 86+)\n' +
        '• Microsoft Edge (version 86+)\n' +
        '• Opera (version 72+)\n\n' +
        'Note: Firefox does not support this feature yet.'
      )
      return
    }

    try {
      // @ts-ignore - File System Access API
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      })
      setRootDir(dirHandle)
      addLog(`Selected directory: ${dirHandle.name}`)
      await scanForRoms(dirHandle)
    } catch (error) {
      console.error('Failed to select directory:', error)
      if ((error as Error).name !== 'AbortError') {
        alert('Failed to select directory: ' + error)
      }
    }
  }

  const scanForRoms = async (dirHandle: FileSystemDirectoryHandle) => {
    setScanning(true)
    setRomFiles([])
    addLog('Scanning for NDS ROM files...')

    const roms: RomFile[] = []
    
    async function scanDir(dir: FileSystemDirectoryHandle, path = '') {
      // @ts-ignore - FileSystemDirectoryHandle async iterator
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.nds')) {
          try {
            // Read file header and extract game code from NDS header using WASM
            const file = await (entry as FileSystemFileHandle).getFile()
            const headerBytes = await file.slice(0, 16).arrayBuffer()
            const fileBytes = new Uint8Array(headerBytes)
            const id = wasm?.extract_game_code(fileBytes) || ''
            
            roms.push({
              name: entry.name,
              path: path ? `${path}/${entry.name}` : entry.name,
              id: id,
              handle: entry as FileSystemFileHandle
            })
          } catch (error) {
            // Skip files that can't be read
            console.error(`Failed to read ${entry.name}:`, error)
          }
        } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
          await scanDir(entry as FileSystemDirectoryHandle, path ? `${path}/${entry.name}` : entry.name)
        }
      }
    }

    await scanDir(dirHandle)
    setRomFiles(roms)
    setScanning(false)
    addLog(`Found ${roms.length} NDS ROM files`)
  }

  const processAllCovers = async () => {
    if (!wasm || !rootDir || romFiles.length === 0) return

    setProcessing(true)
    setStatus({ total: romFiles.length, processed: 0, saved: 0, skipped: 0, errors: 0 })
    addLog('Starting batch processing...')

    // Get or create _pico/covers/nds directory
    let picoDir: FileSystemDirectoryHandle
    let coversDir: FileSystemDirectoryHandle
    let ndsDir: FileSystemDirectoryHandle

    try {
      picoDir = await rootDir.getDirectoryHandle('_pico', { create: true })
      coversDir = await picoDir.getDirectoryHandle('covers', { create: true })
      ndsDir = await coversDir.getDirectoryHandle('nds', { create: true })
    } catch (error) {
      addLog(`Error creating directories: ${error}`)
      setProcessing(false)
      return
    }

    for (const rom of romFiles) {
      const bmpFilename = rom.name.replace(/\.nds$/i, '.bmp')
      
      try {
        // Check if BMP already exists
        try {
          await ndsDir.getFileHandle(bmpFilename)
          addLog(`Skipped: ${rom.name} (already exists)`)
          setStatus(prev => ({ ...prev, processed: prev.processed + 1, skipped: prev.skipped + 1 }))
          continue
        } catch {
          // File doesn't exist, continue processing
        }

        // Download cover using WASM
        let imageData: Uint8Array | null = null
        try {
          imageData = await wasm.download_cover(rom.id)
          addLog(`Downloaded cover: ${rom.name} (${rom.id})`)
        } catch (error) {
          addLog(`Failed: ${rom.name} (no cover found)`)
          setStatus(prev => ({ ...prev, processed: prev.processed + 1, errors: prev.errors + 1 }))
          continue
        }

        if (!imageData) {
          addLog(`Failed: ${rom.name} (no cover found)`)
          setStatus(prev => ({ ...prev, processed: prev.processed + 1, errors: prev.errors + 1 }))
          continue
        }

        // Process with WASM
        const bmpData = wasm.process_cover_image(imageData, dimensions.width, dimensions.height)

        // Save BMP file
        const fileHandle = await ndsDir.getFileHandle(bmpFilename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(new Uint8Array(bmpData))
        await writable.close()

        addLog(`Saved: ${bmpFilename}`)
        setStatus(prev => ({ ...prev, processed: prev.processed + 1, saved: prev.saved + 1 }))
      } catch (error) {
        addLog(`Error processing ${rom.name}: ${error}`)
        setStatus(prev => ({ ...prev, processed: prev.processed + 1, errors: prev.errors + 1 }))
      }
    }

    setProcessing(false)
    addLog('Batch processing complete!')
  }

  if (loading) {
    return (
      <div className="app">
        <h1>Loading WASM module...</h1>
      </div>
    )
  }

  if (!wasm) {
    return (
      <div className="app">
        <h1>Failed to load WASM module</h1>
        <p>Check the console for errors</p>
      </div>
    )
  }

  const isSupported = 'showDirectoryPicker' in window

  return (
    <div className="app">
      <h1>PicoCover - NDS Cover Downloader</h1>
      <p>Automatically download and convert Nintendo DS cover art for Pico Launcher</p>

      {!isSupported && (
        <div className="warning">
          <p>⚠️ Your browser does not support the File System Access API</p>
          <p>Please use Chrome, Edge, or Opera (version 86+)</p>
        </div>
      )}

      <div className="controls">
        <button onClick={selectDirectory} disabled={scanning || processing || !isSupported}>
          📁 Select Thumb Drive / ROM Folder
        </button>

        {rootDir && (
          <div className="info">
            <p>Selected: <strong>{rootDir.name}</strong></p>
            <p>Found: <strong>{romFiles.length}</strong> ROM files</p>
          </div>
        )}

        {romFiles.length > 0 && (
          <button onClick={processAllCovers} disabled={processing || scanning}>
            {processing ? '⏳ Processing...' : '🚀 Download & Convert All Covers'}
          </button>
        )}

        {processing && (
          <div className="progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(status.processed / status.total) * 100}%` }}
              />
            </div>
            <p>
              Progress: {status.processed}/{status.total} | 
              Saved: {status.saved} | 
              Skipped: {status.skipped} | 
              Errors: {status.errors}
            </p>
          </div>
        )}
      </div>

      {romFiles.length > 0 && (
        <div className="rom-list">
          <h3>ROM Files:</h3>
          <ul>
            {romFiles.slice(0, 10).map((rom, idx) => (
              <li key={idx}>
                {rom.name} <span className="rom-id">({rom.id})</span>
              </li>
            ))}
            {romFiles.length > 10 && <li>...and {romFiles.length - 10} more</li>}
          </ul>
        </div>
      )}

      <div className="logs">
        <h3>Log:</h3>
        <div className="log-content">
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
