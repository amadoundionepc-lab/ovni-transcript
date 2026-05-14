Set WshShell = CreateObject("WScript.Shell")

' Démarrer le backend Python (fenêtre cachée)
WshShell.Run "cmd /c cd /d """ & Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\")) & "backend"" && python main.py", 0, False

' Démarrer le frontend Next.js (fenêtre cachée)
WshShell.Run "cmd /c set PATH=%PATH%;C:\Program Files\nodejs && cd /d """ & Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\")) & "frontend"" && npm run dev", 0, False

' Attendre que les serveurs démarrent
WScript.Sleep 6000

' Ouvrir le navigateur
WshShell.Run "http://localhost:3000"
