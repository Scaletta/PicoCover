import { Button } from '@heroui/react'

type SelectStepProps = {
  isSupported: boolean
  onSelectDirectory: () => void
}

export default function SelectStep({ isSupported, onSelectDirectory }: SelectStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="text-6xl mb-4">💾</div>
      <h2 className="text-2xl font-bold">Select Your USB Drive</h2>
      <p className="text-gray-600 dark:text-gray-300">
        Choose the root directory on your USB drive containing your Nintendo DS ROM files (.nds)
      </p>
      <Button 
        size="lg"
        color="primary"
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
        onClick={onSelectDirectory}
        isDisabled={!isSupported}
      >
        Browse for USB
      </Button>
    </div>
  )
}
