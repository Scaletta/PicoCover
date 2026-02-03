import { useEffect, useState } from 'react'
import type * as PicoWasm from '../../pkg/pico_cover_wasm.js'
import { Button, Card, CardBody } from '@heroui/react'
import '../styles/App.css'
import logo from '../../../assets/github-banner.png'
import WizardSteps from '../components/WizardSteps'
import Footer from '../components/Footer'
import LogPanel from '../components/LogPanel'
import WelcomeStep from '../components/steps/WelcomeStep'
import SelectStep from '../components/steps/SelectStep'
import ScanStep from '../components/steps/ScanStep'
import ProcessReadyStep from '../components/steps/ProcessReadyStep'
import ProcessingStep from '../components/steps/ProcessingStep'
import CompleteStep from '../components/steps/CompleteStep'

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

export default function App() {
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
        const wasmModule = await import('../../pkg/pico_cover_wasm.js')
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
      
      // Check if _pico folder exists
      let picoFolderExists = false
      try {
        await dirHandle.getDirectoryHandle('_pico')
        picoFolderExists = true
      } catch (error) {
        // _pico folder doesn't exist
      }
      
      if (!picoFolderExists) {
        const proceed = confirm(
          '⚠️ PicoLauncher Installation Not Detected\n\n' +
          'The "_pico" folder was not found in this directory. ' +
          'PicoLauncher may not be installed here.\n\n' +
          'Would you like to continue anyway? ' +
          'Covers will be saved to "_pico/covers/nds" when processing.'
        )
        if (!proceed) return
        addLog('Warning: PicoLauncher installation not detected', 'error')
      } else {
        addLog('PicoLauncher installation detected', 'success')
      }
      
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
          <img src={logo} width={600} alt="PicoCover Logo" className="mx-auto mb-1" />
          <p className="text-gray-600 dark:text-gray-300 text-lg">Nintendo DS Cover Art Downloader</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">for Pico Launcher</p>
        </div>

        <WizardSteps currentStep={currentStep} />

        {/* Content Card */}
        <Card className="shadow-2xl backdrop-blur-sm border border-white/10 dark:border-gray-700/50">
          <CardBody className="p-6 md:p-8 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
            {currentStep === 'welcome' && (
              <WelcomeStep
                isSupported={isSupported}
                onStart={() => setCurrentStep('select')}
              />
            )}

            {currentStep === 'select' && (
              <SelectStep
                isSupported={isSupported}
                onSelectDirectory={selectDirectory}
              />
            )}

            {currentStep === 'scan' && (
              <ScanStep rootDirName={rootDir?.name} />
            )}

            {currentStep === 'process' && !processing && (
              <ProcessReadyStep
                romCount={romFiles.length}
                rootDirName={rootDir?.name}
                onBack={() => {
                  setCurrentStep('select')
                  setRomFiles([])
                  setRootDir(null)
                }}
                onStart={processAllCovers}
              />
            )}

            {processing && (
              <ProcessingStep
                status={status}
                progressPercentage={progressPercentage}
                logs={logs}
              />
            )}

            {currentStep === 'complete' && (
              <CompleteStep
                status={status}
                rootDirName={rootDir?.name}
                onRestart={() => {
                  setCurrentStep('welcome')
                  setRomFiles([])
                  setRootDir(null)
                  setStatus({ total: 0, processed: 0, saved: 0, skipped: 0, errors: 0 })
                  setLogs([])
                }}
              />
            )}
          </CardBody>
        </Card>

        <Footer />

        <LogPanel
          logs={logs}
          showLogs={showLogs}
          onClose={() => setShowLogs(false)}
        />
      </div>
    </div>
  )
}
