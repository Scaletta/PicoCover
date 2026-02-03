import { Progress } from '@heroui/react'

type ScanStepProps = {
  rootDirName?: string
}

export default function ScanStep({ rootDirName }: ScanStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="text-6xl mb-4 animate-pulse">🔍</div>
      <h2 className="text-2xl font-bold">Scanning ROMs...</h2>
      <p className="text-gray-600 dark:text-gray-300">
        Looking for Nintendo DS ROM files in <strong>{rootDirName}</strong>
      </p>
      <Progress
        size="lg"
        isIndeterminate
        aria-label="Scanning..."
        className="max-w-md mx-auto"
      />
    </div>
  )
}
