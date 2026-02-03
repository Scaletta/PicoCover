
type WizardStep = 'welcome' | 'select' | 'scan' | 'process' | 'complete'

type WizardStepsProps = {
  currentStep: WizardStep
}

const steps = [
  { id: 'welcome', icon: '👋', label: 'Welcome' },
  { id: 'select', icon: '💾', label: 'Select USB' },
  { id: 'scan', icon: '🔍', label: 'Scan ROMs' },
  { id: 'process', icon: '🚀', label: 'Process' },
  { id: 'complete', icon: '🎮', label: 'Complete' }
] as const

export default function WizardSteps({ currentStep }: WizardStepsProps) {
  return (
    <div className="mb-8">
      <div className="flex justify-between items-center max-w-2xl mx-auto">
        {steps.map((step, idx) => {
          const isActive = currentStep === step.id
          const isPast = steps.map(s => s.id).indexOf(currentStep) > idx
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
          style={{ backgroundColor: '#D2025E', width: `${(steps.map(s => s.id).indexOf(currentStep) + 1) * 20}%` }}
        />
      </div>
    </div>
  )
}
