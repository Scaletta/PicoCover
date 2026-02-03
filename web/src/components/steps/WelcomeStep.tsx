import { Button, Card, CardBody } from '@heroui/react'

type WelcomeStepProps = {
  isSupported: boolean
  onStart: () => void
}

export default function WelcomeStep({ isSupported, onStart }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="text-6xl mb-4">🎮</div>
      <h2 className="text-2xl font-bold">Welcome to PicoCover!</h2>
      <div className="space-y-2 max-w-2xl mx-auto">
        <p className="text-gray-700 dark:text-gray-200 text-lg font-medium">
          Instantly transform your Nintendo DS collection
        </p>
        <p className="text-gray-600 dark:text-gray-400 text-base">
          Automatically discover, fetch, and convert cover art from our curated database. Get perfectly formatted covers for Pico Launcher in seconds.
        </p>
      </div>

      {!isSupported && (
        <Card className="bg-yellow-50 border-2 border-yellow-200">
          <CardBody className="text-center py-4">
            <p className="text-yellow-800 font-semibold mb-2">⚠️ Limited Browser Support</p>
            <p className="text-yellow-700 text-sm">
              Your browser doesn't support folder access. You can still continue and export a ZIP.
            </p>
          </CardBody>
        </Card>
      )}

      <Button 
        size="lg"
        color="primary"
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
        onClick={onStart}
      >
        Get Started →
      </Button>
    </div>
  )
}
