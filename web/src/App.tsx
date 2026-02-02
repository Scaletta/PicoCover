import { useState, useEffect } from 'react'
import type * as PicoWasm from '../pkg/pico_cover_wasm.js'
import { Button, Card, CardBody, CardHeader, Progress, Divider } from '@heroui/react'
import './App.css'
import logo from '../../assets/github-banner.png'

// WASM types
type WasmModule = typeof PicoWasm

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

type WizardStep = 'welcome' | 'select' | 'scan' | 'process' | 'complete'

function App() {
  const [wasm, setWasm] = useState<WasmModule | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome')
  const [processing, setProcessing] = useState(false)
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [romFiles, setRomFiles] = useState<RomFile[]>([])
  const [status, setStatus] = useState<ProcessingStatus>({ total: 0, processed: 0, saved: 0, skipped: 0, errors: 0 })
  const [dimensions] = useState({ width: 128, height: 96 })
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${type.toUpperCase()}: ${message}`])
  }

  useEffect(() => {
    let mounted = true
    const loadWasm = async () => {
      try {
        const wasmModule = await import('../pkg/pico_cover_wasm.js')
        await wasmModule.default()
        
        if (mounted) {
          setWasm(wasmModule)
          setLoading(false)
          addLog('WASM module loaded successfully', 'info')
        }
      } catch (error) {
        console.error('Failed to load WASM:', error)
        if (mounted) {
          addLog(`Failed to load WASM module: ${error}`, 'error')
          setLoading(false)
        }
      }
    }
    loadWasm()
    return () => { mounted = false }
  }, [])

  const selectDirectory = async () => {
    if (!('showDirectoryPicker' in window)) {
      addLog('Browser does not support File System Access API', 'error')
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
      setCurrentStep('scan')
      addLog(`Selected directory: ${dirHandle.name}`, 'success')
      await scanForRoms(dirHandle)
    } catch (error) {
      console.error('Failed to select directory:', error)
      if ((error as Error).name !== 'AbortError') {
        addLog(`Failed to select directory: ${error}`, 'error')
      }
    }
  }

  const scanForRoms = async (dirHandle: FileSystemDirectoryHandle) => {
    if (!wasm) {
      addLog('WASM module not loaded', 'error')
      return
    }
    
    setRomFiles([])
    addLog('Scanning for NDS ROM files...', 'info')

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
            
            // Call WASM and handle both success and error cases
            let id = ''
            if (wasm) {
              try {
                const result = wasm.extract_game_code(fileBytes)
                id = result || ''
              } catch (wasmError) {
                console.error(`WASM error for ${entry.name}:`, wasmError)
                addLog(`Failed to read ${entry.name}: ${wasmError}`, 'error')
                continue
              }
            }
            
            roms.push({
              name: entry.name,
              path: path ? `${path}/${entry.name}` : entry.name,
              id: id,
              handle: entry as FileSystemFileHandle
            })
          } catch (error) {
            // Skip files that can't be read
            addLog(`Failed to read ${entry.name}: ${error}`, 'error')
          }
        } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
          await scanDir(entry as FileSystemDirectoryHandle, path ? `${path}/${entry.name}` : entry.name)
        }
      }
    }

    await scanDir(dirHandle)
    setRomFiles(roms)
    setCurrentStep('process')
    addLog(`Found ${roms.length} NDS ROM files`, 'success')
  }

  const processAllCovers = async () => {
    if (!wasm || !rootDir || romFiles.length === 0) return

    setProcessing(true)
    setStatus({ total: romFiles.length, processed: 0, saved: 0, skipped: 0, errors: 0 })
    addLog('Starting batch processing...', 'info')

    // Get or create _pico/covers/nds directory
    let picoDir: FileSystemDirectoryHandle
    let coversDir: FileSystemDirectoryHandle
    let ndsDir: FileSystemDirectoryHandle

    try {
      picoDir = await rootDir.getDirectoryHandle('_pico', { create: true })
      coversDir = await picoDir.getDirectoryHandle('covers', { create: true })
      ndsDir = await coversDir.getDirectoryHandle('nds', { create: true })
    } catch (error) {
      addLog(`Error creating directories: ${error}`, 'error')
      setProcessing(false)
      return
    }

    for (const rom of romFiles) {
      const bmpFilename = rom.name.replace(/\.nds$/i, '.bmp')
      
      try {
        // Check if BMP already exists
        try {
          await ndsDir.getFileHandle(bmpFilename)
          addLog(`Skipped: ${rom.name} (already exists)`, 'info')
          setStatus(prev => ({ ...prev, processed: prev.processed + 1, skipped: prev.skipped + 1 }))
          continue
        } catch {
          // File doesn't exist, continue processing
        }

        // Download cover using WASM
        let imageData: Uint8Array | null = null
        try {
          imageData = await wasm.download_cover(rom.id)
          addLog(`Downloaded: ${rom.name} (${rom.id})`, 'success')
        } catch (error) {
          addLog(`Failed: ${rom.name} (no cover found)`, 'error')
          setStatus(prev => ({ ...prev, processed: prev.processed + 1, errors: prev.errors + 1 }))
          continue
        }

        if (!imageData) {
          addLog(`Failed: ${rom.name} (no cover found)`, 'error')
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

        addLog(`Saved: ${bmpFilename}`, 'success')
        setStatus(prev => ({ ...prev, processed: prev.processed + 1, saved: prev.saved + 1 }))
      } catch (error) {
        addLog(`Error processing ${rom.name}: ${error}`, 'error')
        setStatus(prev => ({ ...prev, processed: prev.processed + 1, errors: prev.errors + 1 }))
      }
    }

    setProcessing(false)
    setCurrentStep('complete')
    addLog('Batch processing complete!', 'success')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-indigo-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardBody className="text-center py-8">
            <img src={logo} alt="PicoCover Logo" className="mx-auto mb-1" />
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="text-xl font-semibold dark:text-white">Loading PicoCover...</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Initializing WASM module</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  if (!wasm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 dark:from-gray-900 dark:to-red-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardBody className="text-center py-8">
            <img src={logo} alt="PicoCover Logo" className="mx-auto mb-1" />
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-xl font-semibold text-red-600">Failed to Load</h2>
            <p className="text-gray-600 dark:text-gray-300 mt-2">WASM module could not be initialized</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Check browser console for details</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  const isSupported = 'showDirectoryPicker' in window
  const progressPercentage = status.total > 0 ? (status.processed / status.total) * 100 : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-indigo-950 dark:to-purple-950 p-4 md:p-2">
      <div className="max-w-4xl mx-auto">
        {/* Log Viewer Toggle */}
        {logs.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              onClick={() => setShowLogs(!showLogs)}
              className="bg-gray-800 hover:bg-gray-700 text-white font-semibold shadow-lg"
              startContent={<span>📋</span>}
            >
              {showLogs ? 'Hide' : 'Show'} Logs ({logs.length})
            </Button>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <img src={logo} alt="PicoCover Logo" className="mx-auto mb-1" />
          <p className="text-gray-600 dark:text-gray-300 text-lg">Nintendo DS Cover Art Downloader</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">for Pico Launcher</p>
        </div>

        {/* Wizard Steps */}
        <div className="mb-8">
          <div className="flex justify-between items-center max-w-2xl mx-auto">
            {[
              { id: 'welcome', icon: '👋', label: 'Welcome' },
              { id: 'select', icon: '📁', label: 'Select Folder' },
              { id: 'scan', icon: '🔍', label: 'Scan ROMs' },
              { id: 'process', icon: '🚀', label: 'Process' },
              { id: 'complete', icon: '✅', label: 'Complete' }
            ].map((step, idx) => {
              const isActive = currentStep === step.id
              const isPast = ['welcome', 'select', 'scan', 'process', 'complete'].indexOf(currentStep) > idx
              const isComplete = isPast || (currentStep === 'complete' && step.id === 'complete')

              return (
                <div key={step.id} className="flex flex-col items-center flex-1">
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2 transition-all
                    ${isActive ? 'bg-blue-600 text-white scale-110 shadow-lg' : ''}
                    ${isComplete ? 'bg-green-500 text-white' : ''}
                    ${!isActive && !isComplete ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 dark:text-gray-400' : ''}
                  `}>
                    {step.icon}
                  </div>
                  <p className={`text-xs font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : isComplete ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500 dark:text-gray-400'}`}>
                    {step.label}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-4 max-w-2xl mx-auto overflow-hidden">
            <div 
              className="h-full transition-all duration-500 ease-out"
              style={{ backgroundColor: '#D2025E', width: `${(['welcome', 'select', 'scan', 'process', 'complete'].indexOf(currentStep) + 1) * 20}%` }}
            />
          </div>
        </div>

        {/* Content Card */}
        <Card className="shadow-2xl backdrop-blur-sm border border-white/10 dark:border-gray-700/50">
          <CardBody className="p-6 md:p-8 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
            {/* Welcome Step */}
            {currentStep === 'welcome' && (
              <div className="text-center space-y-6">
                <div className="text-6xl mb-4">🎮</div>
                <h2 className="text-2xl font-bold">Welcome to PicoCover!</h2>
                <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                  Download and convert Nintendo DS cover art automatically. This tool will scan your ROM collection,
                  fetch covers from our proxy server, and save them in the correct format for Pico Launcher.
                </p>
                
                {!isSupported ? (
                  <Card className="bg-red-50 border-2 border-red-200">
                    <CardBody className="text-center py-4">
                      <p className="text-red-700 font-semibold mb-2">⚠️ Browser Not Supported</p>
                      <p className="text-red-600 text-sm">
                        Please use Chrome 86+, Edge 86+, or Opera 72+
                      </p>
                    </CardBody>
                  </Card>
                ) : (
                  <Button 
                    size="lg"
                    color="primary"
                    className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
                    onClick={() => setCurrentStep('select')}
                  >
                    Get Started →
                  </Button>
                )}
              </div>
            )}

            {/* Select Directory Step */}
            {currentStep === 'select' && (
              <div className="text-center space-y-6">
                <div className="text-6xl mb-4">📁</div>
                <h2 className="text-2xl font-bold">Select Your ROM Folder</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Choose the folder containing your Nintendo DS ROM files (.nds)
                </p>
                <Button 
                  size="lg"
                  color="primary"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
                  onClick={selectDirectory}
                  isDisabled={!isSupported}
                >
                  Browse for Folder
                </Button>
              </div>
            )}

            {/* Scanning Step */}
            {currentStep === 'scan' && (
              <div className="text-center space-y-6">
                <div className="text-6xl mb-4 animate-pulse">🔍</div>
                <h2 className="text-2xl font-bold">Scanning ROMs...</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Looking for Nintendo DS ROM files in <strong>{rootDir?.name}</strong>
                </p>
                <Progress
                  size="lg"
                  isIndeterminate
                  aria-label="Scanning..."
                  className="max-w-md mx-auto"
                />
              </div>
            )}

            {/* Process Step */}
            {currentStep === 'process' && !processing && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-6xl mb-4">🎮</div>
                  <h2 className="text-2xl font-bold mb-2">Ready to Process</h2>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Found <strong className="text-blue-600">{romFiles.length}</strong> ROM files in <strong>{rootDir?.name}</strong>
                  </p>
                </div>

                <Card className="bg-blue-50 dark:bg-blue-950/30 border-0 dark:border dark:border-blue-900/50">
                  <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{romFiles.length}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Total ROMs</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">0</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">To Process</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">0</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Skipped</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">0</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Errors</p>
                    </div>
                  </CardBody>
                </Card>

                <div className="flex gap-3 justify-center">
                  <Button 
                    size="lg"
                    color="default"
                    variant="bordered"
                    className="px-8"
                    onClick={() => {
                      setCurrentStep('select')
                      setRomFiles([])
                      setRootDir(null)
                    }}
                  >
                    ← Back
                  </Button>
                  <Button 
                    size="lg"
                    color="success"
                    className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold px-8"
                    onClick={processAllCovers}
                  >
                    Start Processing →
                  </Button>
                </div>
              </div>
            )}

            {/* Processing Step */}
            {processing && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-6xl mb-4 animate-bounce">⚡</div>
                  <h2 className="text-2xl font-bold mb-2">Processing Covers...</h2>
                  <p className="text-gray-600 dark:text-gray-300">
                    {status.processed} / {status.total} ROM files processed
                  </p>
                </div>

                <Progress
                  size="lg"
                  value={progressPercentage}
                  showValueLabel
                  className="max-w-full"
                  classNames={{
                    indicator: "bg-[#D2025E]"
                  }}
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-gray-50 dark:bg-gray-800/50 border-0 dark:border dark:border-gray-700 hover:shadow-lg transition-shadow">
                    <CardBody className="text-center py-3">
                      <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{status.processed}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Processed</p>
                    </CardBody>
                  </Card>
                  <Card className="bg-green-50 dark:bg-green-950/30 border-0 dark:border dark:border-green-900/50 hover:shadow-lg transition-shadow hover:shadow-green-500/20">
                    <CardBody className="text-center py-3">
                      <p className="text-xl font-bold text-green-600 dark:text-green-400">{status.saved}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Saved</p>
                    </CardBody>
                  </Card>
                  <Card className="bg-yellow-50 dark:bg-yellow-950/30 border-0 dark:border dark:border-yellow-900/50 hover:shadow-lg transition-shadow hover:shadow-yellow-500/20">
                    <CardBody className="text-center py-3">
                      <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{status.skipped}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p>
                    </CardBody>
                  </Card>
                  <Card className="bg-red-50 dark:bg-red-950/30 border-0 dark:border dark:border-red-900/50 hover:shadow-lg transition-shadow hover:shadow-red-500/20">
                    <CardBody className="text-center py-3">
                      <p className="text-xl font-bold text-red-600 dark:text-red-400">{status.errors}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Errors</p>
                    </CardBody>
                  </Card>
                </div>

                {/* Live Log */}
                <Card className="bg-gray-900">
                  <CardHeader>
                    <p className="text-sm font-mono text-gray-300">Live Log</p>
                  </CardHeader>
                  <CardBody className="max-h-48 overflow-y-auto">
                    {logs.slice(-10).map((log, idx) => (
                      <p key={idx} className={`text-xs font-mono ${
                        log.includes('SUCCESS') ? 'text-green-400' : 
                        log.includes('ERROR') ? 'text-red-400' : 
                        'text-gray-400'
                      }`}>
                        {log}
                      </p>
                    ))}
                  </CardBody>
                </Card>
              </div>
            )}

            {/* Complete Step */}
            {currentStep === 'complete' && (
              <div className="text-center space-y-6">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-2xl font-bold">Processing Complete!</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Successfully processed your ROM collection
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                  <Card className="bg-gray-50 dark:bg-gray-800/50 border-0 dark:border dark:border-gray-700 hover:shadow-lg transition-shadow">
                    <CardBody className="text-center py-4">
                      <p className="text-3xl font-bold text-gray-700 dark:text-gray-300">{status.total}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                    </CardBody>
                  </Card>
                  <Card className="bg-green-50 dark:bg-green-950/30 border-0 dark:border dark:border-green-900/50 hover:shadow-lg transition-shadow hover:shadow-green-500/20">
                    <CardBody className="text-center py-4">
                      <p className="text-3xl font-bold text-green-600 dark:text-green-400">{status.saved}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Saved</p>
                    </CardBody>
                  </Card>
                  <Card className="bg-yellow-50 dark:bg-yellow-950/30 border-0 dark:border dark:border-yellow-900/50 hover:shadow-lg transition-shadow hover:shadow-yellow-500/20">
                    <CardBody className="text-center py-4">
                      <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{status.skipped}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p>
                    </CardBody>
                  </Card>
                  <Card className="bg-red-50 dark:bg-red-950/30 border-0 dark:border dark:border-red-900/50 hover:shadow-lg transition-shadow hover:shadow-red-500/20">
                    <CardBody className="text-center py-4">
                      <p className="text-3xl font-bold text-red-600 dark:text-red-400">{status.errors}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Errors</p>
                    </CardBody>
                  </Card>
                </div>

                <Divider className="my-4" />

                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">Covers saved to:</p>
                  <code className="block bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm text-gray-800 dark:text-gray-200">
                    {rootDir?.name}/_pico/covers/nds/
                  </code>
                </div>

                <Button 
                  size="lg"
                  color="primary"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
                  onClick={() => {
                    setCurrentStep('welcome')
                    setRomFiles([])
                    setRootDir(null)
                    setStatus({ total: 0, processed: 0, saved: 0, skipped: 0, errors: 0 })
                    setLogs([])
                  }}
                >
                  Process Another Folder
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
          <p>Made with ❤️ for the Retro Gaming Community</p>
          <p className="mt-1">
            <a href="https://github.com/Scaletta/PicoCover" className="text-blue-600 hover:underline">
              GitHub
            </a>
            {' • '}
            <a href="https://github.com/LNH-team/pico-launcher" className="text-blue-600 hover:underline">
              Pico Launcher
            </a>
          </p>
        </div>

        {/* Floating Log Panel */}
        {showLogs && (
          <div className="fixed inset-x-4 bottom-20 max-w-4xl mx-auto z-40">
            <Card className="bg-gray-900 border border-gray-700 shadow-2xl">
              <CardHeader className="border-b border-gray-700 flex justify-between items-center">
                <p className="text-sm font-mono text-gray-300">📋 Activity Log</p>
                <Button
                  size="sm"
                  isIconOnly
                  variant="light"
                  onClick={() => setShowLogs(false)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  ✕
                </Button>
              </CardHeader>
              <CardBody className="max-h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No activity yet</p>
                ) : (
                  logs.map((log, idx) => (
                    <p key={idx} className={`text-xs font-mono mb-1 ${
                      log.includes('SUCCESS') ? 'text-green-400' : 
                      log.includes('ERROR') ? 'text-red-400' : 
                      'text-gray-400'
                    }`}>
                      {log}
                    </p>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
