import { Button, Card, CardBody, Divider } from '@heroui/react'

type ProcessingStatus = {
  total: number
  processed: number
  saved: number
  skipped: number
  errors: number
}

type CompleteStepProps = {
  status: ProcessingStatus
  rootDirName?: string
  onRestart: () => void
}

export default function CompleteStep({ status, rootDirName, onRestart }: CompleteStepProps) {
  return (
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
          {rootDirName}/_pico/covers/nds/
        </code>
      </div>

      <Button 
        size="lg"
        color="primary"
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
        onClick={onRestart}
      >
        Process Another Folder
      </Button>
    </div>
  )
}
