"""Semrush API client — wraps the analytics endpoints we use for weekly monitoring.

Docs: https://developer.semrush.com/api/

All Semrush analytics endpoints return CSV with semicolon delimiters.
Auth: pass the API key as ?key= query param.
"""
import csv
import io
import os
import re
import subprocess
import time
from typing import Dict, List, Optional

UA = "Mozilla/5.0 (Adnika SEO Monitor)"
BASE_ANALYTICS = "https://api.semrush.com/"
BASE_BACKLINKS = "https://api.semrush.com/analytics/v1/"


class SemrushError(Exception):
    pass


class SemrushClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("SEMRUSH_API_KEY")
        if not self.api_key:
            raise ValueError("SEMRUSH_API_KEY not set (env var or constructor arg)")

    def _request(self, params: Dict[str, str], base: str = BASE_ANALYTICS) -> str:
        """GET to Semrush, return raw CSV string."""
        params = {**params, "key": self.api_key}
        qs = "&".join(f"{k}={self._encode(v)}" for k, v in params.items())
        url = f"{base}?{qs}"
        r = subprocess.run(
            ["curl", "-s", "-A", UA, "--max-time", "30", url],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=40,
        )
        body = r.stdout.strip()
        if body.startswith("ERROR") or body.startswith("NOTHING FOUND") or body == "query type not found":
            if body.startswith("NOTHING FOUND") or body == "query type not found":
                return ""
            raise SemrushError(body[:300])
        return body

    @staticmethod
    def _encode(v: str) -> str:
        # Semrush is tolerant of unencoded values for most cases
        return str(v).replace(" ", "%20").replace(",", "%2C")

    def _parse_csv(self, body: str) -> List[Dict]:
        if not body:
            return []
        # Semrush uses ; as delimiter
        rdr = csv.DictReader(io.StringIO(body), delimiter=";")
        return list(rdr)

    # ---- Domain analytics ----

    def domain_overview(self, domain: str, database: str = "ae") -> Dict:
        """Authority, rank, organic keywords, traffic. ~10 API units."""
        rows = self._parse_csv(self._request({
            "type": "domain_ranks",
            "domain": domain,
            "database": database,
            "export_columns": "Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac,Sh,Sv,Hs",
        }))
        return rows[0] if rows else {}

    def domain_organic_keywords(self, domain: str, database: str = "ae", limit: int = 100) -> List[Dict]:
        """Top organic ranking keywords with positions, traffic, CPC.
        ~10 API units per row.
        """
        return self._parse_csv(self._request({
            "type": "domain_organic",
            "domain": domain,
            "database": database,
            "display_limit": str(limit),
            "display_sort": "tr_desc",   # sort by traffic descending
            "export_columns": "Ph,Po,Pp,Pd,Nq,Cp,Tr,Tc,Co,Nr,Td,Ur",
        }))

    def keyword_overview(self, phrase: str, database: str = "ae") -> Dict:
        """Volume, difficulty, CPC for a keyword. ~10 units."""
        rows = self._parse_csv(self._request({
            "type": "phrase_this",
            "phrase": phrase,
            "database": database,
            "export_columns": "Ph,Nq,Cp,Co,Nr,Td",
        }))
        return rows[0] if rows else {}

    # ---- Backlinks ----

    def backlinks_overview(self, target: str) -> Dict:
        """Total backlinks, referring domains, IPs, etc. ~40 units.
        Uses the v1 analytics endpoint.
        """
        rows = self._parse_csv(self._request({
            "type": "backlinks_overview",
            "target": target,
            "target_type": "root_domain",
            "export_columns": "ascore,total,domains_num,urls_num,ips_num,ipclassc_num,follows_num,nofollows_num,sponsored_num,ugc_num,texts_num,images_num,forms_num,frames_num",
        }, base=BASE_BACKLINKS))
        return rows[0] if rows else {}

    def backlinks_referring_domains(self, target: str, limit: int = 100) -> List[Dict]:
        """List of referring domains with authority, link counts. ~40 units per row."""
        return self._parse_csv(self._request({
            "type": "backlinks_refdomains",
            "target": target,
            "target_type": "root_domain",
            "display_limit": str(limit),
            "display_sort": "domain_ascore_desc",
            "export_columns": "domain_ascore,domain,backlinks_num,ip,country,first_seen,last_seen",
        }, base=BASE_BACKLINKS))

    def backlinks(self, target: str, limit: int = 500) -> List[Dict]:
        """Individual backlinks. ~40 units per row.
        Returns up to `limit` most recent backlinks.
        """
        return self._parse_csv(self._request({
            "type": "backlinks",
            "target": target,
            "target_type": "root_domain",
            "display_limit": str(limit),
            "display_sort": "last_seen_desc",
            "export_columns": "page_ascore,response_code,source_url,source_title,target_url,anchor,external_num,internal_num,first_seen,last_seen,nofollow",
        }, base=BASE_BACKLINKS))

    # ---- Utility ----

    def api_units_remaining(self) -> int:
        """Get the remaining API unit balance."""
        url = f"https://www.semrush.com/users/countapiunits.html?key={self.api_key}"
        r = subprocess.run(["curl", "-s", url], capture_output=True, text=True, timeout=15)
        try:
            return int(r.stdout.strip())
        except Exception:
            return -1


if __name__ == "__main__":
    # Smoke test (uses env var or hardcoded test key)
    from pathlib import Path
    env = Path(__file__).with_name(".env")
    # also walk up to find .env
    for parent in [Path(__file__).parent, Path(__file__).parent.parent]:
        f = parent / ".env"
        if f.exists():
            for line in f.read_text().splitlines():
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

    c = SemrushClient()
    print(f"Units remaining: {c.api_units_remaining()}")
    print(f"\nDomain overview (ae):")
    ov = c.domain_overview("cmsprime.com", "ae")
    for k, v in ov.items():
        print(f"  {k}: {v}")

    print(f"\nTop 5 organic keywords (ae):")
    kw = c.domain_organic_keywords("cmsprime.com", "ae", limit=5)
    for row in kw:
        print(f"  pos {row.get('Position')}: {row.get('Keyword')[:50]} (vol {row.get('Search Volume')})")

    print(f"\nBacklinks overview:")
    bl = c.backlinks_overview("cmsprime.com")
    for k, v in bl.items():
        print(f"  {k}: {v}")
