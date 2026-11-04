# Zoho CRM – Sandbox Mockup

A clickable mockup of a Zoho CRM–style setup for the Ensign College case study: one shared Contact record for both Employer Relations (Career Center) and Alumni Services, with education and employment history kept as linked records and a reviewed import process.

All data is synthetic test data from the case-study workbook (26 source rows merged into 18 people). Not affiliated with Zoho.

## Run it
Open `index.html` in any browser. No install or server is needed. Changes are saved in your browser only; use **Setup → Data Administration → Reset all demo data** to start over.

## What it includes
- **Modules:** Contacts, Accounts, Education History, Employment History, Match & Merge Log, EC - Internships, EC - Projects, EC - Employer Visits, Activities
- **Roles** (switch with "Viewing as" in the top bar): Administrator, Employer Relations, Alumni Services, Data Steward. Each role gets its own page layout, field permissions and saved views.
- **List views:** saved and custom views (criteria, columns, sharing, favorites), filters, sorting, Kanban, mass update, CSV export, global search
- **Records:** related lists, timeline, notes, tasks, inline editing, System Information fields
- **Classification:** Is Alumnus is set from Ensign education evidence; Contact Type is a formula
- **Accounts:** Alumni at this Company, alumni counts, Alumni Champion, Priority Tier 1–3
- **Import & Review:** import wizard (upload, map fields, duplicate handling, preview), scored matching, Review Queue with steward approval, field-by-field merge, Match & Merge Log, Import History with undo
- **Reports, Home dashboard and Setup:** schema map, layouts, permissions, workflow rules, duplicate rules, and a live sandbox test plan

## Match scoring
| Evidence | Points |
|---|---|
| Ensign Student ID | 40 |
| Other-institution student ID | 30 |
| Phone (normalized) | 25 |
| Personal email | 20 |
| School email | 20 |
| Name compatible (weak) | 10 |

Two or more strong matches (score ≥ 50) become a suggested merge. One strong match goes to the review queue. A name-only match is never merged.
