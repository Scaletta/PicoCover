export default function Footer() {
  return (
    <div className="text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
      <p>Made with ❤️ for the Retro Gaming Community</p>
      <p className="mt-1">
        <a href="https://github.com/Scaletta/PicoCover" className="text-blue-600 hover:underline">
          GitHub
        </a>
        {' • '}
        <a href="https://github.com/LNH-team/pico-launcher" className="text-blue-600 hover:underline">
          Pico Launcher
        </a>
      </p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        v{__APP_VERSION__} • {__GIT_COMMIT__}
      </p>
    </div>
  )
}
