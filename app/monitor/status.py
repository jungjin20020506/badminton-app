"""
Parsers for the TinyUK3 status/query replies used by the I/O test tab.

Formats below were captured from the real machine (COM5, FW V1.1, 2026-07-20):

    DI Status : 1111 1111 1111 1110
    DO Status : 1111 1101 1111 1111 [1111 1100 1010 0100 ]
    GPIO A IDR : 1000 0111 1101 1111       ODR : 0000 0010 0001 0000
    External Power Currnet #1 [mA] =    0.000        ("Currnet" is FW's typo)
    Gender 0.  Chip Select  PIN : 0  SET : 0
    Current System Count : OK = 4, NG = 6, TOTAL = 10, SUPPLIES = 0, LIFETIME = 0
    Current Date Time : 2026/07/20 17:18:58
"""

import re

# Front-panel key names, in the order the FW's "I/O Block Test" LCD screen
# lists the DI column: CH01-08 first, then the eight keys.
DI_LABELS = ["CH%02d" % i for i in range(1, 9)] + \
            ["KESC", "K-UP", "K-DN", "K-LF", "K-RT", "KENT", "KSTA", "KRST"]
DO_LABELS = ["CH%02d" % i for i in range(1, 17)]
GPIO_PORTS = "ABCDEFG"

RX_DI = re.compile(r"DI Status\s*:\s*([01 ]{16,})")
RX_DO = re.compile(r"DO Status\s*:\s*([01 ]{16,})(?:\[\s*([01 ]{16,})\])?")
RX_GPIO = re.compile(r"GPIO\s+([A-G])\s+IDR\s*:\s*([01 ]{16,})\s+ODR\s*:\s*([01 ]{16,})")
RX_CURRENT = re.compile(
    r"External Power Currne?t\s*#(\d)\s*\[(mA|uA)\]\s*=\s*([-\d.]+)")
RX_GCS = re.compile(
    r"Gender\s*(\d+)\.\s*Chip Select\s*PIN\s*:\s*(\d+)\s*SET\s*:\s*(\d+)")
RX_COUNTER = re.compile(
    r"OK\s*=\s*(\d+),\s*NG\s*=\s*(\d+),\s*TOTAL\s*=\s*(\d+)"
    r"(?:,\s*SUPPLIES\s*=\s*(\d+))?(?:,\s*LIFETIME\s*=\s*(\d+))?")
RX_TIME = re.compile(r"Current Date Time\s*:\s*([\d/: ]+)")


def _bits(group):
    """'1111 1101 ...' -> [True, True, ...] (16 entries, printed order)."""
    return [c == "1" for c in group.replace(" ", "")][:16]


def _bits_ch(group):
    """Like _bits but in channel order (CH01 first).

    The FW prints DI/DO status MSB-first, i.e. the LAST printed bit is CH01.
    Verified 2026-07-20 by pressing front keys: KESC/K-UP/K-DN/K-LF/K-RT all
    lit the mirror-image lamp until this reversal was added.
    """
    return _bits(group)[::-1]


def parse_status_line(line):
    """Classify one received line.

    Returns (kind, payload) or None:
        ("di",      [bool]*16)
        ("do",      ([bool]*16, [bool]*16 or None))
        ("gpio",    (port, [bool]*16 idr, [bool]*16 odr))
        ("current", (channel, unit, value))
        ("gcs",     (gender, pin, set))
        ("counter", (ok, ng, total))
        ("time",    "YYYY/MM/DD HH:MM:SS")
    """
    m = RX_DI.search(line)
    if m and "DO" not in line:
        return "di", _bits_ch(m.group(1))
    m = RX_DO.search(line)
    if m:
        aux = _bits_ch(m.group(2)) if m.group(2) else None
        return "do", (_bits_ch(m.group(1)), aux)
    m = RX_GPIO.search(line)
    if m:
        return "gpio", (m.group(1), _bits(m.group(2)), _bits(m.group(3)))
    m = RX_CURRENT.search(line)
    if m:
        return "current", (int(m.group(1)), m.group(2), float(m.group(3)))
    m = RX_GCS.search(line)
    if m:
        return "gcs", tuple(int(g) for g in m.groups())
    m = RX_COUNTER.search(line)
    if m:
        return "counter", tuple(int(g) for g in m.groups()[:3])
    m = RX_TIME.search(line)
    if m:
        return "time", m.group(1).strip()
    return None
