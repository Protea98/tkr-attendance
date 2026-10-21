# TKR Attendance

Attendance register for TKR Operations at Tharisa Mine. Installs on any phone, tablet or laptop and works with no signal (marks are sent when the signal is back). Data is shared through Firebase (project tkr-operations-app).

## Tabs
- **Mark** – tap a person to enter a clock-in time, a code (P, AWOP, SICK, leave types, OFF, ABSCONDED and more) or overtime hours. Each shift group shows that day's DAY/NIGHT rota. "Unmarked → P" and "Unmarked → OFF" fill a whole group.
- **Daily report** – present, AWOP, leave, off, not marked, overtime and attendance % per sheet, with names. Copy the report for WhatsApp or download Excel.
- **Cycle report** – each person's days and attendance % for the cycle so far.
- **Flags** – every AWOP, sick and family responsibility day in any date range. 3 or more AWOP or 3 or more family responsibility days are flagged; counts of 3 or more show in red. Choose the flag type.
- **Excel export** – daily, weekly, cycle, calendar month or any dates: a Summary tab, one tab per sheet and an Overtime tab.
- **Employees** – add, edit, remove (resigned or absconded, with the last working day) and put back.
- **Users** (admins) – give people capture or view access; load or download the data file.

Attendance % = present days ÷ (present days + exception days). Exceptions are AWOP, sick and all leave. Medical counts as present. OFF, resigned, absconded and suspended days are not counted.

Cycles run from the 14th to the 13th. Tap the cycle in the header to set any cycle's start and end dates.

## Access
- Admins: muneer@tkroperations.com, amogelang@tkroperations.com, amogelangmabilu56@gmail.com
- Capturers – mark attendance, manage employees and cycles, see all reports.
- Viewers – see the reports only.

## One-time setup
1. Firebase console → project tkr-operations-app → Firestore Database → Rules: add the lines in `firestore-rules.txt` and Publish.
2. GitHub → Settings → Pages → Source: Deploy from a branch → `main` / root → Save.
3. Sign in as admin → Users → Load data file → pick the TKR Attendance data file.

## Install
Android: open the link in Chrome, tap Install app (or ⋮ → Install app / Add to Home screen).
iPhone and iPad: open it in Safari, tap Share → Add to Home Screen.
Windows or Mac laptop: open it in Chrome or Edge, click the install icon in the address bar (or the Install app button).
