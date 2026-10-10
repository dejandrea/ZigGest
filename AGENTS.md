# Text encoding

Keep source, SQL, scripts and documentation in UTF-8. Preserve Portuguese accents.

On Windows PowerShell, always read text explicitly as UTF-8:

```powershell
Get-Content -LiteralPath path/to/file.sql -Raw -Encoding UTF8
```

Never send SQL read with the default PowerShell encoding to Supabase or another database. Prefer `readFile(path, 'utf8')` in Node or `read_text(encoding='utf-8')` in Python. Write files explicitly as UTF-8 too; do not use PowerShell's default `Out-File`/redirection encoding for source files.

Run `npm.cmd run check:encoding` in `frontend` before builds or after changing text. Repair any corrupt stored data at its source; do not hide incorrect database encoding with display-time replacements. XML decoding must continue respecting each document's declared encoding.
