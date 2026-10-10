# Setup and run (Windows, macOS, Linux)

Requirements: **Python 3.11 or newer** (3.12 tested). Nothing else is needed - no database, no Node.js, no API keys.

## Windows (PowerShell)
```powershell
cd skillnova-sentinel\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # if blocked: Set-ExecutionPolicy -Scope Process Bypass
pip install -r requirements.txt
python -m pytest -q                 # expect: 53 passed
uvicorn app.api.main:app --reload   # API on http://127.0.0.1:8000  (docs: /docs)
```

## macOS / Linux
```bash
cd skillnova-sentinel/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q
uvicorn app.api.main:app --reload
```

## Try it
Open http://127.0.0.1:8000/docs, choose `POST /api/v1/analyze`, click "Try it out", and paste a body such as one of the
hex strings in `tests/fixtures/*.hex`:
```json
{"bytecode": "0x<contents of tests/fixtures/VulnerableBank.opt1.hex>"}
```
Or from PowerShell:
```powershell
$hex = (Get-Content ..\tests\fixtures\VulnerableBank.opt1.hex -Raw).Trim()
$body = @{ bytecode = "0x$hex" } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/v1/analyze -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
```

## Notes
- Only the backend exists. The React/3D frontend, database, auth, RPC retrieval and PDF reports are not built yet.
- The `.sol` samples in `contracts/samples/` are intentionally vulnerable test fixtures; their compiled bytecode is already
  in `tests/fixtures/`. You do not need `solc` to run the tests.
- If `pip install z3-solver` fails, make sure you are on 64-bit Python 3.11+.
