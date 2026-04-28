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

// --- Constants ---
const SWP_NOZORDER      = 0x0004;
const SWP_NOACTIVATE    = 0x0010;
const SWP_ASYNCWINDOWPOS = 0x4000;
const HWND_TOP          = 0;

// --- Functions ---
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', DWORD, [
  HWND, koffi.out(koffi.pointer(DWORD)),
]);
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', BOOL, [
  HWND, koffi.out(koffi.pointer(RECT)),
]);
const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', BOOL, [
  HWND, HWND, 'int', 'int', 'int', 'int', UINT,
]);
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
  HWND,
  SWP_NOZORDER, SWP_NOACTIVATE, SWP_ASYNCWINDOWPOS, HWND_TOP,
  GetWindowThreadProcessId, GetWindowRect,
  SetWindowPos,
  GetForegroundWindow, SetForegroundWindow, BringWindowToTop,
  AttachThreadInput, GetCurrentThreadId, GetCursorPos,
};
