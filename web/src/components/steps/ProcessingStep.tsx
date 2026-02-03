import { Card, CardBody, CardHeader, Progress } from '@heroui/react'

type ProcessingStatus = {
  total: number
  processed: number
  saved: number
  skipped: number
  errors: number
}

type ProcessingStepProps = {
  status: ProcessingStatus
  progressPercentage: number
  logs: string[]
}

export default function ProcessingStep({ status, progressPercentage, logs }: ProcessingStepProps) {
  return (
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
  )
}
