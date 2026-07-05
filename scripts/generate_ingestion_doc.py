#!/usr/bin/env python3
"""Generate Outsy Ingestion System documentation PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import Flowable
from datetime import datetime
import os

# ── Color palette (Outsy dark blue-grey system) ──────────────────────────────
C_BG        = HexColor("#0F1923")   # deep navy
C_CARD      = HexColor("#1C2B3A")   # card background
C_ACCENT    = HexColor("#2D8EFF")   # primary blue
C_ACCENT2   = HexColor("#1A6FCC")   # darker blue
C_TEXT      = HexColor("#E8EEF4")   # light text
C_MUTED     = HexColor("#7A92A8")   # muted text
C_BORDER    = HexColor("#2A3F54")   # border
C_CODE_BG   = HexColor("#162130")   # code block bg
C_GREEN     = HexColor("#2ECC71")   # success
C_ORANGE    = HexColor("#F39C12")   # warning
C_RED       = HexColor("#E74C3C")   # error

PAGE_W, PAGE_H = A4
MARGIN = 1.8 * cm
CONTENT_W = PAGE_W - 2 * MARGIN

OUTPUT = "/Users/fredbuffaras/Desktop/Outsy/Outsy_Ingestion_Documentation.pdf"

# ── Custom Flowables ─────────────────────────────────────────────────────────

class ColorRect(Flowable):
    """Solid colored rectangle."""
    def __init__(self, w, h, color, radius=0):
        self.w, self.h, self.color, self.radius = w, h, color, radius
    def draw(self):
        self.canv.setFillColor(self.color)
        if self.radius:
            self.canv.roundRect(0, 0, self.w, self.h, self.radius, fill=1, stroke=0)
        else:
            self.canv.rect(0, 0, self.w, self.h, fill=1, stroke=0)
    def wrap(self, aw, ah):
        return self.w, self.h

class SectionTag(Flowable):
    """Colored pill tag."""
    def __init__(self, text, color=None):
        self.text = text
        self.color = color or C_ACCENT
        self._width = len(text) * 6.5 + 16
        self._height = 16
    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.roundRect(0, 0, self._width, self._height, 4, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(self._width / 2, 4, self.text)
    def wrap(self, aw, ah):
        return self._width, self._height

# ── Document & page template ─────────────────────────────────────────────────

def on_page(canvas, doc):
    """Draw background + footer on every page."""
    canvas.saveState()
    canvas.setFillColor(C_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Left accent bar
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, 0, 4, PAGE_H, fill=1, stroke=0)

    # Footer
    if doc.page > 1:
        canvas.setFillColor(C_BORDER)
        canvas.rect(MARGIN, 1.0 * cm, CONTENT_W, 0.5, fill=1, stroke=0)
        canvas.setFillColor(C_MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(MARGIN, 0.65 * cm, "Outsy — Ingestion System Documentation")
        canvas.drawRightString(PAGE_W - MARGIN, 0.65 * cm, f"Page {doc.page}")

    canvas.restoreState()

# ── Style sheet ──────────────────────────────────────────────────────────────

def make_styles():
    s = {}

    def ps(name, **kw):
        defaults = dict(fontName="Helvetica", fontSize=10, textColor=C_TEXT,
                        leading=14, spaceAfter=4, spaceBefore=0, leftIndent=0,
                        rightIndent=0, alignment=TA_LEFT)
        defaults.update(kw)
        s[name] = ParagraphStyle(name, **defaults)

    ps("body",       fontSize=9.5, leading=15, spaceAfter=8, alignment=TA_JUSTIFY)
    ps("body_sm",    fontSize=8.5, leading=13, spaceAfter=6, textColor=C_MUTED)
    ps("h1",         fontName="Helvetica-Bold", fontSize=26, textColor=white,
                     leading=32, spaceAfter=6, spaceBefore=0, alignment=TA_CENTER)
    ps("h1_sub",     fontName="Helvetica", fontSize=13, textColor=C_MUTED,
                     leading=18, spaceAfter=0, alignment=TA_CENTER)
    ps("h2",         fontName="Helvetica-Bold", fontSize=17, textColor=C_ACCENT,
                     leading=22, spaceAfter=4, spaceBefore=14)
    ps("h3",         fontName="Helvetica-Bold", fontSize=12.5, textColor=white,
                     leading=17, spaceAfter=3, spaceBefore=10)
    ps("h4",         fontName="Helvetica-Bold", fontSize=10.5, textColor=C_ACCENT,
                     leading=14, spaceAfter=2, spaceBefore=6)
    ps("code",       fontName="Courier", fontSize=8, textColor=C_ACCENT2,
                     leading=12, spaceAfter=2, leftIndent=8,
                     backColor=C_CODE_BG)
    ps("code_block", fontName="Courier", fontSize=7.5, textColor=HexColor("#A8C8E8"),
                     leading=11, spaceAfter=0, leftIndent=10, backColor=C_CODE_BG)
    ps("bullet",     fontSize=9.5, leading=14, spaceAfter=3, leftIndent=14,
                     bulletIndent=4, textColor=C_TEXT)
    ps("table_h",    fontName="Helvetica-Bold", fontSize=8.5, textColor=white,
                     leading=11, alignment=TA_CENTER)
    ps("table_c",    fontSize=8, textColor=C_TEXT, leading=11, alignment=TA_LEFT)
    ps("table_c_sm", fontSize=7.5, textColor=C_MUTED, leading=10, alignment=TA_LEFT)
    ps("label",      fontName="Helvetica-Bold", fontSize=8, textColor=C_MUTED,
                     leading=10, spaceAfter=2, spaceBefore=4)
    ps("toc",        fontSize=10, textColor=C_TEXT, leading=16, leftIndent=8)
    ps("toc_sub",    fontSize=9, textColor=C_MUTED, leading=14, leftIndent=22)
    ps("note",       fontSize=8.5, textColor=C_ORANGE, leading=13, leftIndent=10)
    return s

# ── Table helpers ────────────────────────────────────────────────────────────

def info_table(rows, s, col_widths=None):
    """Two-column key/value info table."""
    if col_widths is None:
        col_widths = [4.5 * cm, CONTENT_W - 4.5 * cm]
    data = [[Paragraph(k, s["label"]), Paragraph(v, s["body"])] for k, v in rows]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (0, -1), C_CODE_BG),
        ("BACKGROUND",  (1, 0), (1, -1), C_CARD),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0,0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0,0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [C_CODE_BG, C_CARD]),
        ("LINEBELOW",   (0, 0), (-1, -2), 0.4, C_BORDER),
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
        ("ROUNDEDCORNERS", [4]),
    ]))
    return t

def data_table(headers, rows, s, col_widths=None):
    """Standard data table with header row."""
    header_row = [Paragraph(h, s["table_h"]) for h in headers]
    body_rows = [[Paragraph(str(c), s["table_c"]) for c in row] for row in rows]
    data = [header_row] + body_rows
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, 0),  C_ACCENT),
        ("BACKGROUND",  (0, 1), (-1, -1), C_CARD),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_CARD, C_CODE_BG]),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0,0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0,0), (-1, -1), 7),
        ("LINEBELOW",   (0, 0), (-1, -2), 0.4, C_BORDER),
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
        ("GRID",        (0, 0), (-1, -1), 0.3, C_BORDER),
        ("TEXTCOLOR",   (0, 0), (-1, 0),  white),
    ]))
    return t

def hr(story):
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5, color=C_BORDER))
    story.append(Spacer(1, 6))

def sp(story, h=8):
    story.append(Spacer(1, h))

# ── Cover page ───────────────────────────────────────────────────────────────

def cover_page(story, s):
    story.append(Spacer(1, 3.5 * cm))

    # Big accent circle decoration
    class Circle(Flowable):
        def draw(self):
            self.canv.setFillColor(HexColor("#1A2E42"))
            self.canv.circle(CONTENT_W - 2 * cm, 1.5 * cm, 3.8 * cm, fill=1, stroke=0)
            self.canv.setFillColor(HexColor("#0F2035"))
            self.canv.circle(CONTENT_W - 2 * cm, 1.5 * cm, 2.6 * cm, fill=1, stroke=0)
        def wrap(self, aw, ah): return 0, 0

    story.append(Circle())
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("OUTSY", ParagraphStyle("brand",
        fontName="Helvetica-Bold", fontSize=11, textColor=C_ACCENT,
        alignment=TA_CENTER, letterSpacing=5, spaceAfter=8)))

    story.append(Paragraph("Ingestion System", s["h1"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("Technical Documentation", s["h1_sub"]))
    story.append(Spacer(1, 2.5 * cm))

    # Metadata pills
    meta = [
        ("Version",  "1.0"),
        ("Prepared", datetime.now().strftime("%B %d, %Y")),
        ("Audience", "Data Scientists & Engineers"),
        ("Sources",  "Ticketmaster · Eventbrite · SAT · New City Gas"),
    ]
    pill_data = [[Paragraph(k, s["label"]), Paragraph(v, s["body"])] for k, v in meta]
    pill_t = Table(pill_data, colWidths=[3 * cm, CONTENT_W - 3 * cm],
                   hAlign="CENTER")
    pill_t.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), C_CARD),
        ("TOPPADDING",  (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0,0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("LINEBELOW",   (0, 0), (-1, -2), 0.4, C_BORDER),
    ]))
    story.append(pill_t)
    story.append(PageBreak())

# ── Table of Contents ────────────────────────────────────────────────────────

def toc_page(story, s):
    story.append(Paragraph("Table of Contents", s["h2"]))
    hr(story)
    toc = [
        ("1.", "Architecture Overview"),
        ("2.", "Shared Utilities  (ingestion-shared.ts)"),
        ("3.", "Ticketmaster Ingestion"),
        ("   3.1", "Data source & scope"),
        ("   3.2", "Ingestion logic"),
        ("   3.3", "Categorisation & nightlife scoring"),
        ("   3.4", "Description sanitisation"),
        ("   3.5", "Error handling"),
        ("4.", "Eventbrite Ingestion"),
        ("   4.1", "Data source & scope"),
        ("   4.2", "Multi-strategy HTML parsing"),
        ("   4.3", "Time-zone handling"),
        ("   4.4", "Error handling"),
        ("5.", "SAT (Espace SAT) Ingestion"),
        ("   5.1", "Data source & scope"),
        ("   5.2", "Schedule parsing"),
        ("   5.3", "Status detection"),
        ("   5.4", "Error handling"),
        ("6.", "New City Gas Ingestion"),
        ("   6.1", "Data source & scope"),
        ("   6.2", "Ingestion logic"),
        ("7.", "Cron Schedule"),
        ("   7.1", "Schedule table"),
        ("   7.2", "Ticketmaster rolling-window strategy"),
        ("8.", "Deduplication Policy"),
        ("9.", "Database Schema"),
        ("10.", "Security & Secrets"),
        ("11.", "API Endpoints"),
    ]
    for num, title in toc:
        indent = 22 if num.startswith(" ") else 0
        style = s["toc_sub"] if num.startswith(" ") else s["toc"]
        story.append(Paragraph(
            f'<font color="#2D8EFF">{num.strip()}</font>&nbsp;&nbsp;{title}', style))
    story.append(PageBreak())

# ── Section 1: Architecture ──────────────────────────────────────────────────

def section_architecture(story, s):
    story.append(Paragraph("1. Architecture Overview", s["h2"]))
    hr(story)

    story.append(Paragraph(
        "Outsy's ingestion pipeline collects events from four independent external sources "
        "and normalises them into a single <b>events</b> table in Supabase (PostgreSQL). "
        "All ingestion jobs run as serverless functions on Vercel, triggered by scheduled cron "
        "jobs defined in <code>vercel.json</code>. Each source has a dedicated ingestion module "
        "in <code>outsy/src/lib/</code>.", s["body"]))
    sp(story)

    # Source overview table
    headers = ["Source", "Method", "Auth", "Scope", "Category"]
    rows = [
        ["Ticketmaster", "REST API v2", "API Key", "35 km radius · Montreal", "concerts, nightlife, arts, comedy, sports, family"],
        ["Eventbrite", "HTML scraping", "None (browser headers)", "montreal/ listing pages", "concerts, nightlife, arts_culture"],
        ["SAT", "Sitemap + HTML scraping", "None (public)", "sat.qc.ca", "nightlife, arts_culture"],
        ["New City Gas", "WordPress REST API", "None (public)", "newcitygas.com", "nightlife"],
    ]
    story.append(data_table(headers, rows, s,
        col_widths=[3.2*cm, 3*cm, 3.3*cm, 3.8*cm, CONTENT_W-13.3*cm]))
    sp(story, 10)

    story.append(Paragraph(
        "All sources share a common venue normalisation layer (<b>ingestion-shared.ts</b>) that "
        "handles deduplication, alias resolution, and organiser attachment.", s["body"]))
    story.append(PageBreak())

# ── Section 2: Shared Utilities ──────────────────────────────────────────────

def section_shared(story, s):
    story.append(Paragraph("2. Shared Utilities — ingestion-shared.ts", s["h2"]))
    hr(story)

    story.append(Paragraph(
        "This module provides functions used by every ingestion source to ensure "
        "consistent normalisation and deduplication across all data streams.", s["body"]))
    sp(story)

    funcs = [
        ("normalizeText()", "Unicode NFD normalisation → diacritic stripping → lowercase. "
            "Used to build title_normalized and name_normalized fields for deduplication keys."),
        ("decodeHtmlEntities()", "Decodes HTML entities in description strings (e.g. &amp;, "
            "&eacute;). Handles French accents and special characters from scraped sources."),
        ("findDuplicateEvent()", "Cross-source deduplication query. Searches for an existing event "
            "with the same normalised title on the same local calendar date (midnight-to-midnight "
            "window) at the same venue or city. Accepts an excludeSource param to avoid "
            "matching the same source. Returns the matching event's ID if found."),
        ("upsertVenue()", "Creates or updates a venue record. Resolution order:\n"
            "1. Check venue_aliases by (alias_normalized, city_normalized)\n"
            "2. Check venues by (name_normalized, city_normalized)\n"
            "3. Insert new venue if not found\n"
            "4. Backfill missing fields (address, lat/lng, postal_code) if current row is incomplete"),
        ("attachVenueOrganizer()", "Ensures a venue-type organiser row exists for the venue and "
            "links it to the event via event_organizers with role='venue', sort_order=0."),
    ]

    for fname, desc in funcs:
        story.append(Paragraph(fname, s["h4"]))
        story.append(Paragraph(desc.replace("\n", "<br/>"), s["body"]))
        sp(story, 4)

    story.append(PageBreak())

# ── Section 3: Ticketmaster ──────────────────────────────────────────────────

def section_ticketmaster(story, s):
    story.append(Paragraph("3. Ticketmaster Ingestion", s["h2"]))
    hr(story)

    story.append(Paragraph("3.1  Data Source &amp; Scope", s["h3"]))
    story.append(info_table([
        ("File",       "outsy/src/lib/ingestion-ticketmaster.ts"),
        ("API",        "Ticketmaster Discovery V2 — https://app.ticketmaster.com/discovery/v2/events.json"),
        ("Auth",       "Query param apikey=${TICKETMASTER_API_KEY}"),
        ("Geography",  "35 km radius centred on Montreal (lat: 45.5019, lng: -73.5674)"),
        ("Window",     "Rolling 9-month window from current date (configurable startOffset / endOffset in days)"),
        ("Page size",  "Default 50 events/page, max 200. Paginates until all pages consumed or maxPages reached."),
        ("Conflict key","(source='ticketmaster', source_event_id)"),
    ], s))
    sp(story, 10)

    story.append(Paragraph("3.2  Ingestion Logic", s["h3"]))
    steps = [
        "Build query with geoPoint, radius, dates, classificationName filters and page/size params.",
        "Fetch page → parse JSON → extract events array. On HTTP / parse error: log and break pagination.",
        "Pre-fetch existing source_event_ids for this run to distinguish inserts vs updates in logs.",
        "For each event: resolve venue via upsertVenue(), determine category, extract price range, "
            "select highest-resolution image, sanitise description.",
        "Upsert into events table using (source, source_event_id) conflict key — updates all "
            "mutable fields (title, dates, status, image, price, …) on conflict.",
        "Record run summary in ingest_runs table (status, ingested_count, skipped_count).",
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f"<b>{i}.</b>  {step}", s["bullet"]))
    sp(story, 8)

    story.append(Paragraph("3.3  Categorisation &amp; Nightlife Scoring", s["h3"]))
    story.append(Paragraph(
        "Primary category is determined in two passes:", s["body"]))

    story.append(Paragraph(
        "<b>Pass 1 — Ticketmaster segment/genre mapping:</b> Segment IDs are mapped to Outsy "
        "categories (KZFzniwnSyZfZ7v7nJ → sports, KZFzniwnSyZfZ7v7nE → family, "
        "KZFzniwnSyZfZ7v7na → arts_culture, KZFzniwnSyZfZ7v7nn → concerts). "
        "Comedy is detected via genre keyword match.", s["body"]))

    story.append(Paragraph(
        "<b>Pass 2 — Nightlife scoring algorithm</b> (overrides concerts):", s["body"]))

    scoring = [
        ("+2 pts", "Event title contains nightlife keyword (party, dj, rave, techno, house, trance, edm, club night, …)"),
        ("+2 pts", "Venue name contains club indicator (club, bar, lounge, discothèque, …)"),
        ("+2 pts", "Genre is 'Electronic', 'Dance' or contains 'Club'"),
        ("+1 pt",  "Event starts at or after 22:00 local time"),
        ("-1 pt",  "Event is classified as 'family' (prevents mis-classification)"),
        ("≥ 3 pts","Category overridden to nightlife"),
    ]
    story.append(data_table(["Score", "Condition"], scoring, s,
        col_widths=[2.5*cm, CONTENT_W-2.5*cm]))
    sp(story, 8)

    story.append(Paragraph("3.4  Description Sanitisation", s["h3"]))
    story.append(Paragraph(
        "Ticketmaster descriptions often contain legal boilerplate about ticket resale "
        "policies. The ingestion strips these patterns before storing:", s["body"]))
    patterns = [
        "English: 'Do not buy tickets from…', 'Ticket Limit', 'Purchase Limit', 'Resale Policy', "
            "'Resale Restriction', 'ticket(s) per', 'per person', 'per order', 'per credit card', "
            "'100% Guarantee', 'StubHub', 'SeatGeek', 'TickPick', 'Vivid Seats'",
        "French: 'Limite de billets', 'Politique de revente', 'billet(s) par', 'par personne', "
            "'par commande', 'par carte', 'N'achetez pas vos billets', plus ticket platform names",
        "Stripping is line-by-line: any line matching a pattern (case-insensitive) is removed. "
            "Empty lines after stripping are collapsed.",
    ]
    for p in patterns:
        story.append(Paragraph(f"• {p}", s["bullet"]))
    sp(story, 8)

    story.append(Paragraph("3.5  Event Status", s["h3"]))
    status_rows = [
        ["scheduled",  "Default status for published events on sale"],
        ["announced",  "Tickets not yet on sale (onsale date in future, presale or no-sale)"],
        ["postponed",  "Ticketmaster eventStatus = postponed"],
        ["cancelled",  "Ticketmaster eventStatus = cancelled"],
    ]
    story.append(data_table(["Status", "Condition"], status_rows, s,
        col_widths=[3*cm, CONTENT_W-3*cm]))
    sp(story, 8)

    story.append(Paragraph("3.6  Error Handling", s["h3"]))
    story.append(Paragraph(
        "Page-level fetch failures are caught, logged, and non-fatal — pagination "
        "continues to the next page. Database upsert errors are thrown and abort the run, "
        "which is recorded as 'error' in ingest_runs. No explicit retry logic; Vercel "
        "cron will re-attempt the job on the next scheduled trigger.", s["body"]))
    story.append(PageBreak())

# ── Section 4: Eventbrite ────────────────────────────────────────────────────

def section_eventbrite(story, s):
    story.append(Paragraph("4. Eventbrite Ingestion", s["h2"]))
    hr(story)

    story.append(Paragraph("4.1  Data Source &amp; Scope", s["h3"]))
    story.append(info_table([
        ("File",       "outsy/src/lib/ingestion-eventbrite.ts"),
        ("Method",     "HTML scraping (no API key required)"),
        ("Base URL",   "https://www.eventbrite.ca/d/canada--montreal/"),
        ("Categories", "music--events  ·  nightlife--events  ·  performing-arts--events"),
        ("Auth",       "None — realistic browser User-Agent + Accept headers to avoid bot detection"),
        ("Politeness", "300 ms delay between page fetches"),
        ("Conflict key","(source='eventbrite', source_event_id)"),
    ], s))
    sp(story, 10)

    story.append(Paragraph("4.2  Multi-Strategy HTML Parsing", s["h3"]))
    story.append(Paragraph(
        "Eventbrite's markup changes frequently. The ingestion uses four strategies in "
        "priority order, falling through to the next if the current one yields no events:", s["body"]))

    strategies = [
        ("1 — JSON-LD", "Most stable. Parses <code>&lt;script type=&quot;application/ld+json&quot;&gt;</code> blocks "
            "embedded in the page. Extracts name, url, startDate, endDate, location, image, "
            "and offers (price) from schema.org/Event objects."),
        ("2 — window.__SERVER_DATA__", "Extracts Eventbrite's internal SSR JSON payload from a "
            "<code>&lt;script&gt;</code> tag. Parses the full event listing objects, including "
            "event_id, title, start_time (UTC), venue data, and ticket availability."),
        ("3 — Card &lt;time&gt; elements", "Fallback using machine-readable "
            "<code>&lt;time datetime=&quot;…&quot;&gt;</code> attributes on event cards. "
            "Extracts ISO datetime strings directly from the DOM."),
        ("4 — Visible card text", "Last resort plain-text parser. Handles human-readable strings "
            "like 'Fri, Mar 27, 9:00 PM', 'Tomorrow at 10:00 PM', 'Today at 8:30 PM'. "
            "Uses relative-date resolution against the fetch timestamp."),
    ]

    for title, desc in strategies:
        story.append(Paragraph(title, s["h4"]))
        story.append(Paragraph(desc, s["body"]))

    sp(story, 8)

    story.append(Paragraph("4.3  Time-Zone Handling", s["h3"]))
    story.append(Paragraph(
        "Eventbrite listing pages display times in Montreal local time without any "
        "timezone indicator. The ingestion converts to UTC using the <b>noon-UTC anchor "
        "method</b>:", s["body"]))
    tz_steps = [
        "Determine the UTC offset for Montreal on the target date by computing the offset "
            "at noon local time (UTC−5 EST or UTC−4 EDT depending on DST).",
        "Apply the offset to convert the local time string to a UTC timestamp.",
        "This method correctly handles the DST boundary twice a year without relying on "
            "fragile timezone library heuristics.",
    ]
    for i, step in enumerate(tz_steps, 1):
        story.append(Paragraph(f"<b>{i}.</b>  {step}", s["bullet"]))
    sp(story, 8)

    story.append(Paragraph("4.4  Error Handling", s["h3"]))
    story.append(Paragraph(
        "A single page fetch failure is logged with a skip reason and is non-fatal; "
        "the crawler continues to the next page. Skip reasons are collected per category "
        "and included in the run summary log. All events found within a single run are "
        "tracked to suppress intra-run duplicates across the three categories.", s["body"]))
    story.append(PageBreak())

# ── Section 5: SAT ───────────────────────────────────────────────────────────

def section_sat(story, s):
    story.append(Paragraph("5. SAT (Espace SAT) Ingestion", s["h2"]))
    hr(story)

    story.append(Paragraph("5.1  Data Source &amp; Scope", s["h3"]))
    story.append(info_table([
        ("File",       "outsy/src/lib/ingestion-venue-sat.ts"),
        ("Method",     "XML sitemap + individual HTML page scraping"),
        ("Sitemap",    "https://sat.qc.ca/event-sitemap4.xml"),
        ("Per-event",  "Individual event pages parsed for schema.org/Event JSON-LD + Horaire sidebar"),
        ("Venue",      "All events linked to Espace SAT (fixed; resolved via upsertVenue)"),
        ("Politeness", "150 ms delay between event page fetches"),
        ("Conflict key","(source='venue_sat', source_event_id) — source_event_id = URL slug"),
    ], s))
    sp(story, 10)

    story.append(Paragraph("5.2  Schedule Parsing", s["h3"]))
    story.append(Paragraph(
        "SAT event pages contain a Horaire (schedule) sidebar with time information. "
        "The parser applies multiple extraction formats in order:", s["body"]))

    formats = [
        ("Direct inline", "<code>&lt;br&gt;22h-3h</code>", "Most common format on SAT pages"),
        ("Labeled spectacle", "<code>Spectacle: 22h</code>", "Named schedule entry"),
        ("Concert label", "<code>Concert à 19h30</code>", "French preposition with time"),
        ("Doors fallback", "<code>Portes: 22h</code>", "Used only when no show time found"),
    ]
    story.append(data_table(["Format", "Pattern", "Notes"], formats, s,
        col_widths=[3.5*cm, 4.5*cm, CONTENT_W-8*cm]))
    sp(story)

    story.append(Paragraph(
        "<b>Rejection rules:</b> Midnight times (00:00) are rejected as unreliable "
        "parser fallbacks. Multi-day events (span &gt; 1 calendar day) are skipped.", s["body"]))
    sp(story, 8)

    story.append(Paragraph("5.3  Status Detection", s["h3"]))
    story.append(Paragraph(
        "Status is inferred from French text markers in the event title:", s["body"]))
    status = [
        ["cancelled",  "Title contains ANNULÉ or CANCELLED (case-insensitive)"],
        ["postponed",  "Title contains REPORTÉ or POSTPONED (case-insensitive)"],
        ["scheduled",  "Default — no cancellation/postponement marker found"],
    ]
    story.append(data_table(["Status", "Detection Rule"], status, s,
        col_widths=[3*cm, CONTENT_W-3*cm]))
    sp(story, 8)

    story.append(Paragraph("5.4  Cross-Source Deduplication", s["h3"]))
    story.append(Paragraph(
        "SAT calls <b>findDuplicateEvent()</b> before upserting each event. If another "
        "source already has an event with the same normalised title on the same local "
        "calendar date at the same venue, the SAT event is skipped. This prevents "
        "Ticketmaster and SAT from creating duplicate rows for the same concert.", s["body"]))
    sp(story, 8)

    story.append(Paragraph("5.5  Error Handling", s["h3"]))
    story.append(Paragraph(
        "Individual event page fetch failures return null and the event is silently "
        "skipped with debug logging. Upsert errors are caught, logged, and skipped "
        "(non-fatal). The sitemap fetch is fatal; failure aborts the run.", s["body"]))
    story.append(PageBreak())

# ── Section 6: New City Gas ──────────────────────────────────────────────────

def section_newcitygas(story, s):
    story.append(Paragraph("6. New City Gas Ingestion", s["h2"]))
    hr(story)

    story.append(Paragraph("6.1  Data Source &amp; Scope", s["h3"]))
    story.append(info_table([
        ("File",       "outsy/src/lib/ingestion-venue-newcitygas.ts"),
        ("Method",     "WordPress REST API (WP JSON + ACF custom fields)"),
        ("API URL",    "https://www.newcitygas.com/wp-json/wp/v2/ncgevent"),
        ("Auth",       "None (public endpoint)"),
        ("Pagination", "100 events per page; loops until all pages consumed"),
        ("Venue",      "All events linked to New City Gas (fixed; resolved via upsertVenue)"),
        ("Conflict key","(source='venue_newcitygas', source_event_id) — source_event_id = ncgev_id (Tixr event ID)"),
    ], s))
    sp(story, 10)

    story.append(Paragraph("6.2  Ingestion Logic", s["h3"]))
    fields = [
        ("ncgev_id",             "Tixr event ID → source_event_id"),
        ("ncgev_datestart",      "Date + time in YYYY-MM-DD HH:MM:SS format → combined with doors time for start_at (UTC)"),
        ("ncgev_timedoors",      "Door opening time HH:MM:SS — used as the event start time"),
        ("ncgev_status",         "Only events with status = 'public' are ingested; all others skipped"),
        ("ncgev_img_websquare",  "Preferred image (square web-optimised)"),
        ("ncgev_img_flyersq",    "Fallback image if websquare is absent"),
    ]
    story.append(info_table(fields, s, col_widths=[5*cm, CONTENT_W-5*cm]))
    sp(story, 8)

    story.append(Paragraph("6.3  Error Handling", s["h3"]))
    story.append(Paragraph(
        "WordPress API fetch errors are thrown and propagate, aborting the run. "
        "Individual event upsert errors are also thrown. There is no per-event "
        "error isolation; a single bad record will abort the entire run. "
        "Vercel cron will retry on the next scheduled trigger.", s["body"]))
    story.append(PageBreak())

# ── Section 7: Cron Schedule ─────────────────────────────────────────────────

def section_cron(story, s):
    story.append(Paragraph("7. Cron Schedule", s["h2"]))
    hr(story)

    story.append(Paragraph("7.1  Schedule Table  (defined in vercel.json)", s["h3"]))
    cron_rows = [
        ["TM — Window 1", "/api/cron/ingest-ticketmaster\n?maxPages=3&startOffset=0&endOffset=30",   "0 10 * * *",      "Daily 10:00 UTC",     "Days 0-30",    "~176 events"],
        ["TM — Window 2", "/api/cron/ingest-ticketmaster\n?maxPages=4&startOffset=31&endOffset=90",  "30 11 * * *",     "Daily 11:30 UTC",     "Days 31-90",   "~262 events"],
        ["TM — Window 3", "/api/cron/ingest-ticketmaster\n?maxPages=3&startOffset=91&endOffset=180", "0 12 * * 1,4",    "Mon+Thu 12:00 UTC",   "Days 91-180",  "~280 events"],
        ["TM — Window 4", "/api/cron/ingest-ticketmaster\n?maxPages=3&startOffset=181&endOffset=270","0 13 * * 1",      "Monday 13:00 UTC",    "Days 181-270", "~133 events"],
        ["Eventbrite",    "/api/cron/ingest-eventbrite\n?maxPages=2",                                 "0 11 * * *",      "Daily 11:00 UTC",     "—",            "—"],
        ["New City Gas",  "/api/cron/ingest-venue-newcitygas",                                         "0 12 * * *",      "Daily 12:00 UTC",     "—",            "—"],
        ["SAT",           "/api/cron/ingest-venue-sat\n?maxEvents=60",                                 "30 12 * * *",     "Daily 12:30 UTC",     "—",            "~60 events"],
    ]
    story.append(data_table(
        ["Job", "Path / Params", "Cron Expr.", "Human Time", "Date Window", "~Events"],
        cron_rows, s,
        col_widths=[2.8*cm, 5.5*cm, 2.5*cm, 3*cm, 2.2*cm, CONTENT_W-16*cm]
    ))
    sp(story, 12)

    story.append(Paragraph("7.2  Ticketmaster Rolling-Window Strategy", s["h3"]))
    story.append(Paragraph(
        "The Vercel Hobby plan enforces two constraints: <b>max 100 cron jobs</b> and "
        "<b>max 1 execution per job per day</b>. Fetching all ~850 Montreal events "
        "(9-month window, 10 pages at size=100) in a single function invocation risks "
        "hitting the 60-second serverless timeout.", s["body"]))

    story.append(Paragraph(
        "<b>Solution:</b> Split the 9-month window into four date-range slices. "
        "Each cron job fetches only its slice (2-4 pages). The near-term window "
        "(days 0-90) runs daily because new events are added and prices/statuses "
        "change frequently. The far-future window (days 181-270) runs only on Mondays "
        "because event data stabilises far in advance.", s["body"]))

    story.append(Paragraph(
        "The <code>startOffset</code> and <code>endOffset</code> parameters are integer days "
        "from <i>now</i>. They are converted to absolute ISO datetimes at runtime, so the "
        "windows automatically roll forward with the calendar — no re-deployment needed.", s["body"]))

    story.append(Paragraph(
        "<b>Re-run probe:</b> To re-measure event counts per window, run "
        "<code>scripts/probe-ticketmaster-windows.ts</code> with <code>dryRun=true</code>. "
        "Adjust <code>maxPages</code> in vercel.json if event density changes significantly.", s["body"]))

    story.append(PageBreak())

# ── Section 8: Deduplication ─────────────────────────────────────────────────

def section_dedup(story, s):
    story.append(Paragraph("8. Deduplication Policy", s["h2"]))
    hr(story)

    story.append(Paragraph(
        "Events are deduplicated at two levels:", s["body"]))

    story.append(Paragraph("Same-source deduplication (primary)", s["h3"]))
    story.append(Paragraph(
        "Every source upserts on the composite key <b>(source, source_event_id)</b>. "
        "If a record with the same external ID already exists, the upsert updates all "
        "mutable fields (title, dates, status, image, price) rather than inserting a "
        "duplicate. This ensures repeat cron runs are idempotent.", s["body"]))

    story.append(Paragraph("Cross-source deduplication (secondary)", s["h3"]))
    story.append(Paragraph(
        "Currently applied only by the SAT ingestion, via <b>findDuplicateEvent()</b>. "
        "The function checks for an existing event where:", s["body"]))
    conditions = [
        "title_normalized matches (Unicode-normalised, diacritics stripped, lowercase)",
        "The event overlaps the same local calendar day (midnight–midnight Montreal)",
        "venue_id matches OR city_normalized matches (when venue is unknown)",
        "source ≠ 'venue_sat' (excludes the source doing the check)",
    ]
    for c in conditions:
        story.append(Paragraph(f"• {c}", s["bullet"]))

    sp(story, 6)
    story.append(Paragraph(
        "If a match is found, the SAT event is skipped. This prevents duplicate rows "
        "when a concert is listed on both Ticketmaster and the SAT venue website.", s["body"]))

    story.append(Paragraph("Venue deduplication", s["h3"]))
    story.append(Paragraph(
        "<b>upsertVenue()</b> uses a two-step lookup before inserting. First it queries "
        "<b>venue_aliases</b> by (alias_normalized, city_normalized) to catch name variants "
        "across sources (e.g. 'Espace SAT' vs 'SAT Montreal'). If no alias match, it "
        "queries <b>venues</b> by (name_normalized, city_normalized). Only if neither "
        "matches is a new venue row created.", s["body"]))

    story.append(PageBreak())

# ── Section 9: DB Schema ─────────────────────────────────────────────────────

def section_schema(story, s):
    story.append(Paragraph("9. Database Schema", s["h2"]))
    hr(story)

    story.append(Paragraph("events  (key ingestion columns)", s["h3"]))
    events_cols = [
        ["id",               "uuid",         "PK — auto-generated"],
        ["title",            "text",         "Raw event title from source"],
        ["title_normalized", "text",         "Lowercase, diacritics stripped — used for dedup"],
        ["description",      "text",         "Sanitised description (boilerplate stripped)"],
        ["start_at",         "timestamptz",  "Event start in UTC"],
        ["end_at",           "timestamptz",  "Event end in UTC (nullable)"],
        ["timezone",         "text",         "IANA tz (e.g. America/Toronto)"],
        ["status",           "text",         "scheduled | announced | postponed | cancelled"],
        ["category_primary", "text",         "concerts | nightlife | arts_culture | comedy | sports | family"],
        ["tags",             "text[]",       "Additional classification tags"],
        ["min_price",        "numeric",      "Lowest available ticket price"],
        ["max_price",        "numeric",      "Highest available ticket price"],
        ["currency",         "text",         "ISO-4217 currency code (e.g. CAD)"],
        ["image_url",        "text",         "Highest-resolution image URL"],
        ["source",           "text",         "ticketmaster | eventbrite | venue_sat | venue_newcitygas"],
        ["source_event_id",  "text",         "External ID from the source system"],
        ["source_url",       "text",         "Canonical event URL at the source"],
        ["venue_id",         "uuid",         "FK → venues.id"],
        ["city_normalized",  "text",         "Always 'montreal' for current scope"],
        ["is_approved",      "boolean",      "Manual curation flag"],
    ]
    story.append(data_table(["Column", "Type", "Notes"], events_cols, s,
        col_widths=[4*cm, 2.8*cm, CONTENT_W-6.8*cm]))
    sp(story, 8)

    story.append(Paragraph(
        "<b>Conflict key:</b> UNIQUE (source, source_event_id)", s["body"]))
    sp(story, 10)

    story.append(Paragraph("venues", s["h3"]))
    venue_cols = [
        ["id",              "uuid",  "PK"],
        ["name",            "text",  "Display name"],
        ["name_normalized", "text",  "Normalised — conflict key component"],
        ["address_line1",   "text",  "Street address"],
        ["city",            "text",  "Display city"],
        ["city_normalized", "text",  "Normalised — conflict key component"],
        ["region",          "text",  "Province / state"],
        ["postal_code",     "text",  "Postal/ZIP code"],
        ["country",         "text",  "ISO-2 country code"],
        ["lat / lng",       "float", "Coordinates"],
        ["timezone",        "text",  "IANA timezone"],
    ]
    story.append(data_table(["Column", "Type", "Notes"], venue_cols, s,
        col_widths=[3.5*cm, 2*cm, CONTENT_W-5.5*cm]))
    sp(story, 8)

    story.append(Paragraph(
        "<b>Conflict key:</b> UNIQUE (name_normalized, city_normalized)", s["body"]))
    sp(story, 10)

    story.append(Paragraph("ingest_runs  (migration: 20260312_ingest_runs.sql)", s["h3"]))
    run_cols = [
        ["id",               "uuid",        "PK"],
        ["source",           "text",        "ticketmaster | eventbrite | venue_sat | venue_newcitygas"],
        ["started_at",       "timestamptz", "Job start timestamp"],
        ["finished_at",      "timestamptz", "Job completion timestamp"],
        ["status",           "text",        "running | success | error"],
        ["ingested_count",   "int",         "Events successfully upserted"],
        ["skipped_count",    "int",         "Events skipped (duplicate / filter)"],
        ["venues_upserted",  "int",         "Venue rows created or updated"],
        ["error_message",    "text",        "Error details if status = error"],
        ["created_at",       "timestamptz", "Row creation timestamp"],
    ]
    story.append(data_table(["Column", "Type", "Notes"], run_cols, s,
        col_widths=[3.5*cm, 2.8*cm, CONTENT_W-6.3*cm]))
    story.append(PageBreak())

# ── Section 10: Security ─────────────────────────────────────────────────────

def section_security(story, s):
    story.append(Paragraph("10. Security &amp; Secrets", s["h2"]))
    hr(story)

    secrets = [
        ("TICKETMASTER_API_KEY", "Ticketmaster Discovery API key. Passed as query parameter to all TM API requests.",
         "Ticketmaster Developer Portal"),
        ("INGEST_SECRET",        "Bearer token required by all /api/admin/ingest-* endpoints. "
            "Authorization: Bearer ${INGEST_SECRET}. Protects manual trigger endpoints.",
         "Set in Vercel environment variables"),
        ("CRON_SECRET",          "Bearer token required by all /api/cron/ingest-* endpoints. "
            "Vercel injects this automatically when calling cron routes.",
         "Set in Vercel environment variables"),
    ]

    for name, desc, source in secrets:
        story.append(Paragraph(name, s["h4"]))
        story.append(info_table([
            ("Purpose", desc),
            ("Source",  source),
        ], s))
        sp(story, 6)

    story.append(Paragraph(
        "<b>Scraping sources</b> (Eventbrite, SAT) use no API keys. They send realistic "
        "browser User-Agent and Accept headers to avoid bot detection, and respect "
        "politeness delays (150-300 ms between requests).", s["body"]))

    story.append(PageBreak())

# ── Section 11: API Endpoints ────────────────────────────────────────────────

def section_api(story, s):
    story.append(Paragraph("11. API Endpoints", s["h2"]))
    hr(story)

    story.append(Paragraph("Admin routes  (POST, requires INGEST_SECRET)", s["h3"]))
    admin = [
        ["/api/admin/ingest-ticketmaster", "maxPages, size, startPage, startDateTime, endDateTime, dryRun"],
        ["/api/admin/ingest-eventbrite",    "maxPages, categories (comma-separated slugs)"],
        ["/api/admin/ingest-venue-sat",     "maxEvents (1-200, default 60)"],
        ["/api/admin/ingest-venue-newcitygas", "—"],
    ]
    story.append(data_table(["Endpoint", "Query Params"], admin, s,
        col_widths=[6.5*cm, CONTENT_W-6.5*cm]))
    sp(story, 10)

    story.append(Paragraph("Cron routes  (GET, requires CRON_SECRET)", s["h3"]))
    cron = [
        ["/api/cron/ingest-ticketmaster", "maxPages (1-10), size (10-200), startOffset (days), endOffset (days)"],
        ["/api/cron/ingest-eventbrite",   "maxPages (1-10, default 2) — hard-coded to music--events"],
        ["/api/cron/ingest-venue-sat",    "maxEvents (1-200, default 60)"],
        ["/api/cron/ingest-venue-newcitygas", "—"],
    ]
    story.append(data_table(["Endpoint", "Query Params"], cron, s,
        col_widths=[6.5*cm, CONTENT_W-6.5*cm]))
    sp(story, 10)

    story.append(Paragraph(
        "All cron routes are GET endpoints because Vercel Cron makes GET requests. "
        "All admin routes are POST endpoints and are intended for manual triggering "
        "by engineering team members during debugging or backfill operations.", s["body"]))

# ── Build PDF ────────────────────────────────────────────────────────────────

def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=1.8 * cm,
    )

    s = make_styles()
    story = []

    cover_page(story, s)
    toc_page(story, s)
    section_architecture(story, s)
    section_shared(story, s)
    section_ticketmaster(story, s)
    section_eventbrite(story, s)
    section_sat(story, s)
    section_newcitygas(story, s)
    section_cron(story, s)
    section_dedup(story, s)
    section_schema(story, s)
    section_security(story, s)
    section_api(story, s)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"PDF written to {OUTPUT}")

if __name__ == "__main__":
    build()
