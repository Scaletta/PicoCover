# Git Hooks Setup

This project uses git hooks to maintain code quality. To enable them:

**On Windows (PowerShell):**
```powershell
git config core.hooksPath .githooks
```

**On macOS/Linux (Bash):**
```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

After setup, the pre-commit hook will automatically:
- ✅ Format code with `cargo fmt`
- ✅ Check with `cargo clippy`
- ✅ Prevent commits if checks fail

**To bypass the hook** (not recommended):
```bash
git commit --no-verify
```
