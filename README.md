# TKR Attendance

Attendance register for TKR Operations at Tharisa Mine, built from the TKR timesheet (cycle 14th to 13th).
Shared online through Firebase (same project as the TKR Operations app). Captures made with no signal are kept on the phone and sent when the signal is back.

## Sections
- **Daily report** – attendance %, at work, leave, sick, AWOP, off and not captured for the day, by department, with the list of absentees. Copy the report or send it straight to WhatsApp.
- **Capture** – pick the date and department; people are grouped by shift with the day's DAY/NIGHT. Tap P, OFF or More (leave types, sick, AWOP, training, site office, clock-in time).
- **Timesheet** – the month grid like the Excel, colour-coded, with totals per employee. Tap a cell to change it.
- **Employees** – attendance % per employee for the cycle to date.
- **Users** (admins) – add or remove people who capture or view.

Attendance % = days at work or on training ÷ scheduled days. OFF and RESIGNED days are not scheduled days.

## Access
- Admins: muneer@tkroperations.com, amogelang@tkroperations.com – import the timesheet, add users, capture.
- Capturers – capture attendance and see all reports.
- Viewers – see the reports only.

## New cycle
Admin taps **Import timesheet** and picks the new TKR TIMESHEET Excel file. **Export to Excel** downloads the register with one sheet per department.

## One-time setup
1. Firebase console → project tkr-operations-app → Firestore Database → Rules: add the lines in `firestore-rules.txt` and Publish.
2. GitHub → Settings → Pages → Source: Deploy from a branch → `main` / root → Save.

## Install
Android: open the link in Chrome, tap Install app (or ⋮ → Install app).
iPhone: open it in Safari, tap Share → Add to Home Screen.
Windows PC: open it in Chrome or Edge, click the install icon in the address bar.
