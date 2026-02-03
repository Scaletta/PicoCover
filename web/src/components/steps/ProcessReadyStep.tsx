import { Button, Card, CardBody } from '@heroui/react'

type ProcessReadyStepProps = {
  romCount: number
  romFiles: Array<{ name: string; path: string }>
  rootDirName?: string
  onBack: () => void
  onStart: () => void
}

export default function ProcessReadyStep({ romCount, romFiles, rootDirName, onBack, onStart }: ProcessReadyStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-6xl mb-4">🎮</div>
        <h2 className="text-2xl font-bold mb-2">Ready to Process</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Found <strong className="text-blue-600">{romCount}</strong> ROM files{rootDirName ? (
            <> in <strong>{rootDirName}</strong></>
          ) : (
            <> in your selection</>
          )}
        </p>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/30 border-0 dark:border dark:border-blue-900/50">
        <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{romCount}</p>
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

      {romFiles.length > 0 && (
        <div className="rounded-lg border border-gray-200/60 dark:border-gray-700/60 bg-white/60 dark:bg-gray-900/40">
          <div className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200/60 dark:border-gray-700/60">
            ROM Files
          </div>
          <div className="max-h-64 overflow-auto">
            <ul className="divide-y divide-gray-200/60 dark:divide-gray-700/60">
              {romFiles.map((rom, index) => (
                <li key={`${rom.path}-${index}`} className="px-4 py-2">
                  <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{rom.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{rom.path}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-center">
        <Button 
          size="lg"
          color="default"
          variant="bordered"
          className="px-8"
          onClick={onBack}
        >
          ← Back
        </Button>
        <Button 
          size="lg"
          color="success"
          className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold px-8"
          onClick={onStart}
        >
          Start Processing →
        </Button>
      </div>
    </div>
  )
}
