"""Google Sheets writer for the CMS Prime SEO tracker.

Handles:
- ensure_tab(name, headers) — creates an "Auto - " tab with header row if it doesn't exist
- append_row(tab, values_dict) — appends a single row, matching dict keys to header columns
- replace_tab(tab, headers, rows) — wipes the tab and writes fresh data (for snapshots)
- get_tab_values(tab, range_) — reads back values

The service account credentials path is read from env or defaulted.
"""
import os
from pathlib import Path
from typing import Dict, List, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


class SheetsWriter:
    def __init__(self, sheet_id: str, creds_path: Optional[str] = None):
        self.sheet_id = sheet_id
        self.creds_path = creds_path or os.environ.get(
            "GSC_CREDS_PATH",
            str(Path(__file__).parent.parent / "cmsprime-gsc-creds.json"),
        )
        creds = service_account.Credentials.from_service_account_file(self.creds_path, scopes=SHEETS_SCOPES)
        self.svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
        self._meta_cache = None

    # ---- internal helpers ----

    def _meta(self, refresh: bool = False) -> Dict:
        if refresh or self._meta_cache is None:
            self._meta_cache = self.svc.spreadsheets().get(spreadsheetId=self.sheet_id).execute()
        return self._meta_cache

    def _tab_id(self, name: str) -> Optional[int]:
        for s in self._meta().get("sheets", []):
            if s["properties"]["title"] == name:
                return s["properties"]["sheetId"]
        return None

    # ---- public API ----

    def list_tabs(self) -> List[str]:
        return [s["properties"]["title"] for s in self._meta().get("sheets", [])]

    def ensure_tab(self, name: str, headers: List[str]) -> int:
        """Make sure a tab exists with the given header row. Returns the sheet ID."""
        existing_id = self._tab_id(name)
        if existing_id is not None:
            # ensure headers match (only update if first row is empty or different length)
            current = self.svc.spreadsheets().values().get(
                spreadsheetId=self.sheet_id, range=f"'{name}'!1:1"
            ).execute().get("values", [])
            if not current or current[0] != headers:
                self.svc.spreadsheets().values().update(
                    spreadsheetId=self.sheet_id,
                    range=f"'{name}'!A1",
                    valueInputOption="RAW",
                    body={"values": [headers]},
                ).execute()
            return existing_id

        # create new tab
        resp = self.svc.spreadsheets().batchUpdate(
            spreadsheetId=self.sheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": name}}}]}
        ).execute()
        new_id = resp["replies"][0]["addSheet"]["properties"]["sheetId"]
        self._meta_cache = None  # bust cache

        # write headers
        self.svc.spreadsheets().values().update(
            spreadsheetId=self.sheet_id,
            range=f"'{name}'!A1",
            valueInputOption="RAW",
            body={"values": [headers]},
        ).execute()

        # bold the header row
        self.svc.spreadsheets().batchUpdate(
            spreadsheetId=self.sheet_id,
            body={"requests": [{
                "repeatCell": {
                    "range": {"sheetId": new_id, "startRowIndex": 0, "endRowIndex": 1},
                    "cell": {"userEnteredFormat": {
                        "textFormat": {"bold": True},
                        "backgroundColor": {"red": 0.9, "green": 0.95, "blue": 1.0},
                    }},
                    "fields": "userEnteredFormat(textFormat,backgroundColor)"
                }
            }, {
                "updateSheetProperties": {
                    "properties": {"sheetId": new_id, "gridProperties": {"frozenRowCount": 1}},
                    "fields": "gridProperties.frozenRowCount"
                }
            }]}
        ).execute()
        return new_id

    def append_row(self, tab: str, headers: List[str], row_dict: Dict) -> None:
        """Append a row, mapping dict values to headers (missing keys → empty)."""
        values = [row_dict.get(h, "") for h in headers]
        self.svc.spreadsheets().values().append(
            spreadsheetId=self.sheet_id,
            range=f"'{tab}'!A1",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [values]},
        ).execute()

    def replace_tab(self, tab: str, headers: List[str], rows: List[Dict]) -> None:
        """Wipe tab data (keeping the headers) and write fresh rows."""
        self.ensure_tab(tab, headers)
        # clear everything below row 1
        self.svc.spreadsheets().values().clear(
            spreadsheetId=self.sheet_id,
            range=f"'{tab}'!A2:ZZ",
            body={},
        ).execute()
        if not rows:
            return
        values = [[r.get(h, "") for h in headers] for r in rows]
        self.svc.spreadsheets().values().update(
            spreadsheetId=self.sheet_id,
            range=f"'{tab}'!A2",
            valueInputOption="USER_ENTERED",
            body={"values": values},
        ).execute()

    def get_tab_values(self, tab: str, a1_range: str = "A:Z") -> List[List]:
        return self.svc.spreadsheets().values().get(
            spreadsheetId=self.sheet_id, range=f"'{tab}'!{a1_range}"
        ).execute().get("values", [])


if __name__ == "__main__":
    # Smoke test — load .env, write a test row, read it back
    env = Path(__file__).parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

    sheet_id = os.environ["SHEET_ID"]
    w = SheetsWriter(sheet_id)
    print("Tabs in sheet:")
    for t in w.list_tabs():
        print(f"  - {t}")
