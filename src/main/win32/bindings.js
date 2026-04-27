const koffi = require('koffi');

const user32   = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

// --- Types ---
const HWND  = koffi.pointer('HWND',  koffi.opaque());
const BOOL  = koffi.alias('BOOL',  'int');
const DWORD = koffi.alias('DWORD', 'uint32');
const LONG  = koffi.alias('LONG',  'int32');
const UINT  = koffi.alias('UINT',  'uint32');

const RECT = koffi.struct('RECT', {
  left: LONG, top: LONG, right: LONG, bottom: LONG,
});

const POINT = koffi.struct('POINT', { x: LONG, y: LONG });

const EnumWindowsProc = koffi.proto('EnumWindowsProc', BOOL, [HWND, 'intptr']);

// --- Constants ---
const SWP_NOZORDER      = 0x0004;
const SWP_NOACTIVATE    = 0x0010;
const SWP_ASYNCWINDOWPOS = 0x4000;
const HWND_TOP          = 0;

// --- Functions ---
const EnumWindows = user32.func('__stdcall', 'EnumWindows', BOOL, [
  koffi.pointer(EnumWindowsProc), 'intptr',
]);
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', DWORD, [
  HWND, koffi.out(koffi.pointer(DWORD)),
]);
// Buffer passed as raw memory region — koffi accepts Buffer for out pointer(uint16).
// If koffi version changes and this breaks, switch to koffi.array('uint16', 260).
const GetClassName = user32.func('__stdcall', 'GetClassNameW', 'int', [
  HWND, koffi.out(koffi.pointer('uint16')), 'int',
]);
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', BOOL, [
  HWND, koffi.out(koffi.pointer(RECT)),
]);
const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', BOOL, [
  HWND, HWND, 'int', 'int', 'int', 'int', UINT,
]);
const IsWindowVisible     = user32.func('__stdcall', 'IsWindowVisible',     BOOL, [HWND]);
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', HWND, []);
const SetForegroundWindow = user32.func('__stdcall', 'SetForegroundWindow', BOOL, [HWND]);
const BringWindowToTop    = user32.func('__stdcall', 'BringWindowToTop',    BOOL, [HWND]);
const AttachThreadInput   = user32.func('__stdcall', 'AttachThreadInput',   BOOL, [DWORD, DWORD, BOOL]);
const GetCurrentThreadId  = kernel32.func('__stdcall', 'GetCurrentThreadId', DWORD, []);
const GetCursorPos        = user32.func('__stdcall', 'GetCursorPos',        BOOL, [koffi.out(koffi.pointer(POINT))]);

// Deliberately NOT bound: SendInput, keybd_event, mouse_event, PostMessage,
// ReadProcessMemory, SetWindowsHookEx(keyboard), BitBlt, CreateRemoteThread.
// Adding any of these is a compliance boundary crossing — flag in PR review.

module.exports = {
  HWND, RECT, POINT, EnumWindowsProc,
  SWP_NOZORDER, SWP_NOACTIVATE, SWP_ASYNCWINDOWPOS, HWND_TOP,
  EnumWindows, GetWindowThreadProcessId, GetClassName, GetWindowRect,
  SetWindowPos, IsWindowVisible,
  GetForegroundWindow, SetForegroundWindow, BringWindowToTop,
  AttachThreadInput, GetCurrentThreadId, GetCursorPos,
};
