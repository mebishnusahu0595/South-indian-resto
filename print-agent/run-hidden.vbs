Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
' Doubled outer quotes: cmd /c strips one pair, so folders like "kea-print-agent (1)" still work.
WshShell.Run "cmd.exe /c """"" & scriptDir & "\watchdog.bat""""", 0, False
