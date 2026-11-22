import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_OUTPUT = 65536;
const encoder = new TextEncoder();

type Answer = { bytes: Uint8Array; code: number };

// One deterministic run of a tiny stack program. Bounds, traps and 32-bit
// wrapping follow the competition ISA; the house baseline deliberately skips
// the hard cases, so covering them is what earns points here.
function execute(program: Uint8Array, input: Uint8Array): Answer {
  const size = program.length;
  const data = new Int32Array(256);
  const calls = new Int32Array(64);
  const memory = new Int32Array(256);
  const output = new Uint8Array(MAX_OUTPUT);
  let sp = 0;
  let csp = 0;
  let olen = 0;
  let ip = 0;
  let pc = 0;
  let steps = 0;

  const stop = (code: number): Answer => ({ bytes: output.slice(0, olen), code });

  // opcode -> [immediate bytes, values popped, values pushed]
  const shape: Record<number, [number, number, number]> = {
    0x00: [0, 0, 0], 0x01: [1, 0, 1], 0x02: [4, 0, 1], 0x03: [0, 1, 0],
    0x04: [0, 1, 2], 0x05: [0, 2, 2], 0x06: [0, 2, 3], 0x07: [0, 3, 3],
    0x10: [0, 2, 1], 0x11: [0, 2, 1], 0x12: [0, 2, 1], 0x13: [0, 2, 1],
    0x14: [0, 2, 1], 0x15: [0, 2, 1], 0x16: [0, 2, 1], 0x17: [0, 1, 1],
    0x18: [0, 2, 1], 0x19: [0, 2, 1], 0x1a: [0, 2, 1], 0x1b: [0, 1, 1],
    0x1c: [0, 2, 1], 0x1d: [0, 2, 1], 0x1e: [0, 2, 1], 0x20: [0, 2, 1],
    0x21: [0, 2, 1], 0x22: [0, 2, 1], 0x30: [2, 0, 0], 0x31: [2, 1, 0],
    0x32: [2, 1, 0], 0x33: [2, 0, 0], 0x34: [0, 0, 0], 0x40: [0, 1, 1],
    0x41: [0, 2, 0], 0x50: [0, 1, 0], 0x51: [0, 1, 0], 0x52: [0, 0, 1],
    0x53: [0, 1, 0],
  };

  for (;;) {
    if (steps === 1000000) return stop(10);
    if (pc < 0 || pc >= size) return stop(9);
    const op = program[pc];
    const info = shape[op];
    if (!info) return stop(5);
    const [imm, pops, pushes] = info;
    if (pc + imm >= size) return stop(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return stop(2);
    if (sp - pops + pushes > 256) return stop(3);
    pc = next;

    switch (op) {
      case 0x00:
        return stop(0);
      case 0x01:
        data[sp++] = (program[next - 1] << 24) >> 24;
        break;
      case 0x02:
        data[sp++] = program[next - 4] | (program[next - 3] << 8) |
          (program[next - 2] << 16) | (program[next - 1] << 24);
        break;
      case 0x03:
        sp--;
        break;
      case 0x04:
        data[sp] = data[sp - 1];
        sp++;
        break;
      case 0x05: {
        const top = data[sp - 1];
        data[sp - 1] = data[sp - 2];
        data[sp - 2] = top;
        break;
      }
      case 0x06:
        data[sp] = data[sp - 2];
        sp++;
        break;
      case 0x07: {
        const first = data[sp - 3];
        data[sp - 3] = data[sp - 2];
        data[sp - 2] = data[sp - 1];
        data[sp - 1] = first;
        break;
      }
      case 0x17:
        data[sp - 1] = -data[sp - 1] | 0;
        break;
      case 0x1b:
        data[sp - 1] = ~data[sp - 1];
        break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14:
      case 0x15: case 0x16: case 0x18: case 0x19: case 0x1a:
      case 0x1c: case 0x1d: case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = data[sp - 1];
        const a = data[sp - 2];
        let value = 0;
        if (op === 0x10) value = (a + b) | 0;
        else if (op === 0x11) value = (a - b) | 0;
        else if (op === 0x12) value = Math.imul(a, b);
        else if (op === 0x13) {
          if (b === 0) return stop(4);
          value = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 0x14) {
          if (b === 0) return stop(4);
          value = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 0x15) {
          if (b === 0) return stop(4);
          value = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 0x16) {
          if (b === 0) return stop(4);
          value = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) value = a & b;
        else if (op === 0x19) value = a | b;
        else if (op === 0x1a) value = a ^ b;
        else if (op === 0x1c) value = a << (b & 31);
        else if (op === 0x1d) value = a >> (b & 31);
        else if (op === 0x1e) value = (a >>> (b & 31)) | 0;
        else if (op === 0x20) value = a === b ? 1 : 0;
        else if (op === 0x21) value = a < b ? 1 : 0;
        else value = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp--;
        data[sp] = value;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const offset = ((program[next - 2] | (program[next - 1] << 8)) << 16) >> 16;
        let take = op === 0x30;
        if (op !== 0x30) {
          const condition = data[--sp];
          take = op === 0x31 ? condition === 0 : condition !== 0;
        }
        if (take) pc = next + offset;
        break;
      }
      case 0x33:
        if (csp === 64) return stop(7);
        calls[csp++] = next;
        pc = program[next - 2] | (program[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return stop(8);
        pc = calls[--csp];
        break;
      case 0x40: {
        const address = data[sp - 1];
        if (address < 0 || address > 255) return stop(6);
        data[sp - 1] = memory[address];
        break;
      }
      case 0x41: {
        const address = data[sp - 1];
        if (address < 0 || address > 255) return stop(6);
        memory[address] = data[sp - 2];
        sp -= 2;
        break;
      }
      case 0x50: {
        const text = encoder.encode(String(data[sp - 1]));
        if (olen + text.length > MAX_OUTPUT) return stop(11);
        output.set(text, olen);
        olen += text.length;
        sp--;
        break;
      }
      case 0x51:
        if (olen === MAX_OUTPUT) return stop(11);
        output[olen++] = data[--sp] & 255;
        break;
      case 0x52:
        data[sp++] = ip < input.length ? input[ip++] : -1;
        break;
      case 0x53:
        return stop(data[--sp] & 255);
    }
  }
}

for (const id of readdirSync(INPUT_DIR).sort()) {
  const program = new Uint8Array(readFileSync(join(INPUT_DIR, id, 'program.bin')));
  const input = new Uint8Array(readFileSync(join(INPUT_DIR, id, 'input.bin')));
  const answer = execute(program, input);
  mkdirSync(join(OUTPUT_DIR, id), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, id, 'stdout.bin'), answer.bytes);
  writeFileSync(join(OUTPUT_DIR, id, 'exit.txt'), `${answer.code}\n`);
}
