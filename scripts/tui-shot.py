#!/usr/bin/env python3
"""Zrzut prawdziwego ekranu Claude Code z modem: pty + emulator terminala (pyte).

`claude plugin test` sprawdza drzewo, nie farbę silnika (ramki, kolory, układ).
Ten skrypt odpala `claude` w pseudoterminalu, gra kroki i wypisuje ekran tekstem.

  python3 -m venv .venv && .venv/bin/pip install pyte
  .venv/bin/python scripts/tui-shot.py --cols 180 --rows 45 \
      --cmd 'claude --model haiku' \
      'until:Try:30' 'type:Powiedz jedno słowo.' 'key:enter' 'until:⚒ Krux:90' 'wait:3' 'shot'

Kroki: `wait:S`, `type:tekst`, `key:enter|esc|tab|up|down|ctrl-c`,
`until:regex:S` (czeka, aż ekran pasuje), `shot` (tekst ekranu),
`fg:regex` (kolory znaków w liniach, które pasują). Nieudane `until` kończy kodem 1.
"""

import argparse
import fcntl
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time

import pyte

KEYS = {'enter': '\r', 'esc': '\x1b', 'tab': '\t', 'up': '\x1b[A', 'down': '\x1b[B', 'ctrl-c': '\x03'}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--cols', type=int, default=160)
    parser.add_argument('--rows', type=int, default=45)
    parser.add_argument('--cmd', default='claude')
    parser.add_argument('steps', nargs='*')
    args = parser.parse_args()

    screen = pyte.Screen(args.cols, args.rows)
    stream = pyte.ByteStream(screen)
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(TERM='xterm-256color', COLORTERM='truecolor', LINES=str(args.rows), COLUMNS=str(args.cols))
        os.execvp('/bin/sh', ['/bin/sh', '-c', args.cmd])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', args.rows, args.cols, 0, 0))

    def pump(seconds: float) -> None:
        end = time.time() + seconds
        while True:
            left = end - time.time()
            if left <= 0:
                return
            ready, _, _ = select.select([fd], [], [], min(left, 0.1))
            if ready:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    return
                if not data:
                    return
                stream.feed(data)

    def text() -> str:
        return '\n'.join(line.rstrip() for line in screen.display).rstrip()

    code = 0
    pump(0.5)
    for step in args.steps:
        kind, _, rest = step.partition(':')
        if kind == 'wait':
            pump(float(rest))
        elif kind == 'type':
            os.write(fd, rest.encode())
            pump(0.3)
        elif kind == 'key':
            os.write(fd, KEYS[rest].encode())
            pump(0.3)
        elif kind == 'until':
            pattern, _, timeout = rest.rpartition(':')
            end = time.time() + float(timeout)
            while not re.search(pattern, text(), re.M) and time.time() < end:
                pump(0.3)
            if not re.search(pattern, text(), re.M):
                print(f'--- until {pattern!r}: nie doczekał się ---')
                print(text())
                code = 1
                break
        elif kind == 'shot':
            print(f'--- shot {args.cols}x{args.rows} ---')
            print(text())
        elif kind == 'fg':
            for row, line in enumerate(screen.display):
                if re.search(rest, line):
                    cells = screen.buffer[row]
                    spans, last = [], None
                    for col in range(args.cols):
                        cell = cells[col]
                        if cell.fg != last:
                            spans.append(f'[{col}:{cell.fg}]')
                            last = cell.fg
                        spans.append(cell.data)
                    print(f'{row:3} ' + ''.join(spans).rstrip())
        else:
            print(f'nieznany krok: {step}', file=sys.stderr)
            code = 2
            break
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    return code


if __name__ == '__main__':
    sys.exit(main())
