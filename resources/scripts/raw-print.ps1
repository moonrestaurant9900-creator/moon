<#
  Direct RAW printing helper for the Moon Restaurant POS.

  Sends a byte buffer straight to a Windows printer's spooler as a RAW datatype
  job via the winspool.drv Win32 API (OpenPrinter/StartDocPrinter/WritePrinter).
  This bypasses GDI rendering and the print dialog entirely - the printer driver
  (or the printer itself, for "Generic / Text Only" / ESC-POS raw-passthrough
  drivers) receives the exact ESC/POS byte sequence built by the app, unmodified.

  Usage:
    raw-print.ps1 -PrinterName "Sonic SNC-105" -DataFile "C:\path\to\job.bin"
    raw-print.ps1 -PrinterName "Sonic SNC-105" -CheckStatus

  Exit code 0 = success. Non-zero = failure; a one-line message is written to
  stderr describing what went wrong (printer not found, offline, spooler error).
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,

  [string]$DataFile,

  [switch]$CheckStatus
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace RawPrint -Name Spooler -MemberDefinition @'
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool OpenPrinterA(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool StartDocPrinterA(IntPtr hPrinter, int level, ref DOCINFOA pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
'@

function Write-JsonResult($obj) {
  $obj | ConvertTo-Json -Compress
}

if ($CheckStatus) {
  try {
    $printer = Get-Printer -Name $PrinterName -ErrorAction Stop
    Write-JsonResult @{
      ok          = $true
      exists      = $true
      status      = [string]$printer.PrinterStatus
      workOffline = [bool]$printer.WorkOffline
    }
    exit 0
  } catch {
    Write-JsonResult @{
      ok     = $false
      exists = $false
      error  = $_.Exception.Message
    }
    exit 0
  }
}

if (-not $DataFile) {
  Write-Error "DataFile is required unless -CheckStatus is passed"
  exit 2
}
if (-not (Test-Path -LiteralPath $DataFile)) {
  Write-Error "Data file not found: $DataFile"
  exit 2
}

[byte[]]$bytes = [System.IO.File]::ReadAllBytes($DataFile)

[IntPtr]$hPrinter = [IntPtr]::Zero
$opened = [RawPrint.Spooler]::OpenPrinterA($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)
if (-not $opened) {
  $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Write-Error "OpenPrinter failed for '$PrinterName' (Win32 error $code) - check the printer name and that it is installed"
  exit 3
}

try {
  $docInfo = New-Object RawPrint.Spooler+DOCINFOA
  $docInfo.pDocName = "Moon Restaurant POS"
  $docInfo.pOutputFile = $null
  $docInfo.pDataType = "RAW"

  $started = [RawPrint.Spooler]::StartDocPrinterA($hPrinter, 1, [ref]$docInfo)
  if (-not $started) {
    $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Error "StartDocPrinter failed (Win32 error $code) - printer may be offline, paused, or out of paper"
    exit 4
  }

  try {
    if (-not [RawPrint.Spooler]::StartPagePrinter($hPrinter)) {
      $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      Write-Error "StartPagePrinter failed (Win32 error $code)"
      exit 5
    }

    try {
      [int]$written = 0
      $ok = [RawPrint.Spooler]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)
      if (-not $ok -or $written -ne $bytes.Length) {
        $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Error "WritePrinter failed or incomplete (wrote $written of $($bytes.Length) bytes, Win32 error $code)"
        exit 6
      }
    } finally {
      [RawPrint.Spooler]::EndPagePrinter($hPrinter) | Out-Null
    }
  } finally {
    [RawPrint.Spooler]::EndDocPrinter($hPrinter) | Out-Null
  }
} finally {
  [RawPrint.Spooler]::ClosePrinter($hPrinter) | Out-Null
}

exit 0
