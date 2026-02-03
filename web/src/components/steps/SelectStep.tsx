import { Button } from '@heroui/react'

type SelectStepProps = {
  isSupported: boolean
  onSelectDirectory: () => void
  onSelectFiles: (files: FileList | null) => void
  onContinue: () => void
  onRemoveFile: (key: string) => void
  selectedCount?: number
  selectedFiles?: Array<{ key: string; name: string; path: string }>
}

export default function SelectStep({
  isSupported,
  onSelectDirectory,
  onSelectFiles,
  onContinue,
  onRemoveFile,
  selectedCount = 0,
  selectedFiles = []
}: SelectStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="text-6xl mb-4">💾</div>
      <h2 className="text-2xl font-bold">Select Your USB Drive</h2>
      <p className="text-gray-600 dark:text-gray-300">
        Choose the root directory on your USB drive containing your Nintendo DS ROM files (.nds)
      </p>
      {isSupported ? (
        <Button 
          size="lg"
          color="primary"
          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
          onClick={onSelectDirectory}
        >
          Browse for USB
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Your browser doesn't support folder access. Select your .nds files and we'll export a ZIP.
          </p>
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p className="font-semibold">Supported browsers for folder access:</p>
            <ul className="list-disc list-inside">
              <li>Chrome 86+</li>
              <li>Edge 86+</li>
              <li>Opera 72+</li>
            </ul>
          </div>
          <div
            className="border-2 border-dashed border-blue-300 dark:border-blue-500/50 rounded-xl p-6 bg-white/40 dark:bg-gray-800/40"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              onSelectFiles(event.dataTransfer.files)
            }}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300">Drag & drop .nds files here</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">or use the button below</p>
          </div>
          <div className="space-x-3">
            <label className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold cursor-pointer">
              {selectedCount > 0 ? 'Add More ROMs' : 'Select ROM Files'}
              <input
                type="file"
                accept=".nds"
                multiple
                className="hidden"
                onChange={(event) => onSelectFiles(event.target.files)}
              />
            </label>
          </div>
          {selectedCount > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Selected: {selectedCount} ROMs</p>
              <div className="max-h-48 overflow-auto text-left rounded-lg border border-gray-200/60 dark:border-gray-700/60 bg-white/60 dark:bg-gray-900/40">
                <ul className="divide-y divide-gray-200/60 dark:divide-gray-700/60">
                  {selectedFiles.map(file => (
                    <li key={file.key} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{file.path}</p>
                      </div>
                      <button
                        className="text-xs text-red-600 dark:text-red-400 hover:underline ml-3"
                        onClick={() => onRemoveFile(file.key)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                size="lg"
                color="primary"
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
                onClick={onContinue}
              >
                Continue →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
