import { Button, Card, CardBody, CardHeader } from '@heroui/react'

type LogPanelProps = {
  logs: string[]
  showLogs: boolean
  onClose: () => void
}

export default function LogPanel({ logs, showLogs, onClose }: LogPanelProps) {
  if (!showLogs) return null

  return (
    <div className="fixed inset-x-4 bottom-20 max-w-4xl mx-auto z-40">
      <Card className="bg-gray-900 border border-gray-700 shadow-2xl">
        <CardHeader className="border-b border-gray-700 flex justify-between items-center">
          <p className="text-sm font-mono text-gray-300">📋 Activity Log</p>
          <Button
            size="sm"
            isIconOnly
            variant="light"
            onClick={onClose}
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
  )
}
