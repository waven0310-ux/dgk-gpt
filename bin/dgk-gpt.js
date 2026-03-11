#!/usr/bin/env node

import { main } from "../lib/install.js";

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[dgk-gpt] ${message}`);
  process.exit(1);
});
