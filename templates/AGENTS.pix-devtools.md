## Pix DevTools Targets
- Fixed DevTools targets: `chrome` owns `127.0.0.1:9333` for browser work and the `chrome-devtools` MCP server; `tauri-pix` owns `127.0.0.1:9334` for Pix desktop work and the `tauri-devtools` MCP server.
- If browser or Pix desktop diagnosis needs MCP, launch the matching helper first so the fixed port is up before using the corresponding DevTools server.
- If the user asks to debug Pix Tauri with Chrome DevTools MCP, prefer `tauri-devtools` plus `tauri-pix`; do not repoint the browser `chrome-devtools` target at the Pix port.
