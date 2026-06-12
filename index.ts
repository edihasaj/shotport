#!/usr/bin/env bun
import { main } from "./src/cli";

const code = await main(Bun.argv.slice(2));
process.exit(code);
