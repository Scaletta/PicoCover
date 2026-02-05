import { Button, Card, CardBody } from "@heroui/react";

type SelectStepProps = {
  isSupported: boolean;
  onSelectDirectory: () => void;
  onSelectFiles: (files: FileList | null) => void;
  onContinue: () => void;
  onRemoveFile: (key: string) => void;
  onBack: () => void;
  selectedCount?: number;
  selectedFiles?: Array<{ key: string; name: string; path: string }>;
  includeGba?: boolean;
};

export default function SelectStep({
  isSupported,
  onSelectDirectory,
  onSelectFiles,
  onContinue,
  onRemoveFile,
  onBack,
  selectedCount = 0,
  selectedFiles = [],
  includeGba = true,
}: SelectStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="text-6xl mb-4">💾</div>
      <h2 className="text-2xl font-bold">Select Your USB Drive</h2>
      <p className="text-gray-600 dark:text-gray-300">
        Choose the root directory on your USB drive containing your Nintendo DS
        and Game Boy Advance ROM files (.nds, .gba)
      </p>
      {isSupported ? (
        <>
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
              color="primary"
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
              onClick={onSelectDirectory}
            >
              Browse for USB
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Your browser doesn't support folder access. Select your .nds and
            .gba files and we'll export a ZIP.
          </p>
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p className="font-semibold">
              Supported browsers for folder access:
            </p>
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
              event.preventDefault();
              onSelectFiles(event.dataTransfer.files);
            }}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Drag & drop .nds and .gba files here
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              or use the button below
            </p>
          </div>
          <div className="space-x-3">
            <label className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold cursor-pointer">
              {selectedCount > 0 ? "Add More ROMs" : "Select ROM Files"}
              <input
                type="file"
                accept=".nds,.gba"
                multiple
                className="hidden"
                onChange={(event) => onSelectFiles(event.target.files)}
              />
            </label>
          </div>
          {selectedCount > 0 && (
            <div className="space-y-2">
              {!includeGba && (
                <Card className="bg-orange-50 border-2 border-orange-200">
                  <CardBody className="text-center py-3">
                    <p className="text-orange-700 text-sm font-semibold">
                      ℹ️ GBA files will be skipped
                    </p>
                    <p className="text-orange-600 text-xs">
                      Only NDS files will be processed
                    </p>
                  </CardBody>
                </Card>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Selected: {selectedCount} ROMs
              </p>
              <div className="max-h-48 overflow-auto text-left rounded-lg border border-gray-200/60 dark:border-gray-700/60 bg-white/60 dark:bg-gray-900/40">
                <ul className="divide-y divide-gray-200/60 dark:divide-gray-700/60">
                  {selectedFiles.map((file) => (
                    <li
                      key={file.key}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 dark:text-gray-200 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {file.path}
                        </p>
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
                  color="primary"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold px-8"
                  onClick={onContinue}
                >
                  Continue →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
