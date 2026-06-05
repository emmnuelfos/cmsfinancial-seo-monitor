"""Strip Overview / Rankings / Backlinks / Technical Health from sidebar nav
on all 5 Monthly Report pages. Replace mobile bottom-nav with the 4 sub-page links."""
import re
from pathlib import Path

DOCS = Path(r"D:\Claude Code Project\cmsprime-audit\reporting\docs")

PAGES = [
    ("monthly.html",            "Monthly Report",   "Overview"),   # the index of the report
    ("monthly-domain.html",     "Domain Overview",  "01"),
    ("monthly-rankings.html",   "Organic Rankings", "02"),
    ("monthly-tracking.html",   "Position Tracking","03"),
    ("monthly-backlinks.html",  "Backlinks",        "04"),
]

SUB_PAGES = [
    ("monthly-domain.html",   "01", "Domain Overview"),
    ("monthly-rankings.html", "02", "Organic Rankings"),
    ("monthly-tracking.html", "03", "Position Tracking"),
    ("monthly-backlinks.html","04", "Backlinks"),
]

REPORT_ICON_SVG = '<svg class="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
LOGOUT_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'

def make_sidebar(current_slug):
    sub_links = []
    for slug, num, name in SUB_PAGES:
        active = " is-active" if slug == current_slug else ""
        sub_links.append(f'          <a class="nav__sub-link{active}" href="./{slug}"><span class="nav__sub-link__num">{num}</span>{name}</a>')
    report_active = " is-active" if current_slug == "monthly.html" else ""
    return f'''<aside class="sidebar">
      <div class="sidebar__brand">
        <img src="./assets/cms-logo-light.svg" alt="CMS Prime" class="brand-logo">
        <div class="sidebar__brand-sub">Performance Console</div>
      </div>
      <nav class="nav">
        <div class="nav__group-label">Monthly Report</div>
        <a class="nav__link{report_active}" href="./monthly.html">
          {REPORT_ICON_SVG}
          Overview
        </a>
        <div class="nav__sublist">
{chr(10).join(sub_links)}
        </div>
      </nav>
      <div class="sidebar__footer">
        <div class="sidebar__status"><span class="status-dot"></span><span>Live data · auto-refresh Mondays</span></div>
        <button class="sidebar__logout" onclick="window.CMSAuth.logout()">{LOGOUT_SVG}Sign out</button>
      </div>
    </aside>'''

def make_bottom_nav(current_slug):
    items = []
    for slug, num, name in SUB_PAGES:
        active = " is-active" if slug == current_slug else ""
        items.append(f'      <a class="bottom-nav__item{active}" href="./{slug}"><span class="bottom-nav__num">{num}</span>{name}</a>')
    return f'''<nav class="bottom-nav" aria-label="Mobile">
    <div class="bottom-nav__inner">
{chr(10).join(items)}
    </div>
  </nav>'''

# Aside-block regex: from `<aside class="sidebar">` to its matching `</aside>`
ASIDE_RE = re.compile(r'<aside class="sidebar">[\s\S]*?</aside>')
# Bottom-nav regex
BOTTOM_NAV_RE = re.compile(r'<nav class="bottom-nav"[\s\S]*?</nav>')

for slug, name, _ in PAGES:
    path = DOCS / slug
    if not path.exists():
        print(f"  SKIP missing: {slug}")
        continue
    content = path.read_text(encoding="utf-8")

    new_sidebar = make_sidebar(slug)
    new_bottom = make_bottom_nav(slug)

    new_content, n_aside = ASIDE_RE.subn(new_sidebar, content, count=1)
    new_content, n_bot = BOTTOM_NAV_RE.subn(new_bottom, new_content, count=1)

    path.write_text(new_content, encoding="utf-8")
    print(f"  {slug}: aside_replaced={n_aside}, bottom_replaced={n_bot}")

print("\nDone.")
