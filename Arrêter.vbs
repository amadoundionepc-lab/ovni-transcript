Set WshShell = CreateObject("WScript.Shell")

' Arrêter le backend Python
WshShell.Run "cmd /c taskkill /F /IM python.exe /T", 0, True

' Arrêter le frontend Next.js
WshShell.Run "cmd /c taskkill /F /IM node.exe /T", 0, True

MsgBox "Transcripteur arrêté.", 64, "Transcripteur"
